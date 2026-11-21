"""Background feed: the simulated bank streams alerts in, code screens every one, a budgeted AI lane runs the rest.

Two threads per run:
- ingest: paces `total` alerts over `duration_s`; each is stored exactly as the ingest API stores it, then screened
  by code (no model call). Escalations go straight to a human lane.
- AI lane: a fixed rate (`ai_per_min`) of full, unchanged pipeline runs on the cases code would not escalate.
  Free-tier model limits make this the bottleneck by design; a queued case is simply not cleared yet.

State is in memory (one process, one run at a time). Status carries counts, IDs, amounts and reason codes only,
never memo or payee text.
"""

import sqlite3
import threading
import time
from collections import OrderedDict, deque
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.config import Settings
from backend.app.feed.generator import BankFeedGenerator, Kind, load_roster, sim_llm_enabled
from backend.app.feed.screen import Lane, screen_case
from backend.app.ingest import store
from backend.app.pipeline import CaseRun, run_case
from backend.app.schemas import Route

FEED_SOURCE = "bank-feed-sim"
REFRESH_EVERY_S = 45.0
EVENTS_KEPT = 200
HISTORY_KEPT = 5

State = Literal["idle", "running", "draining", "finished", "stopped"]


class FeedConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    total: int = Field(ge=1, description="Alerts to stream; capped by FEED_MAX_TOTAL")
    duration_s: int = Field(default=240, ge=10, le=600)
    ai_per_min: float = Field(default=4.0, ge=0, le=30)
    mix: dict[Kind, int] | None = Field(default=None, description="Weight 0-100 per alert kind; default: a normal day")

    @field_validator("mix")
    @classmethod
    def _mix(cls, v: dict[str, int] | None) -> dict[str, int] | None:
        if v is None:
            return v
        if any(w < 0 or w > 100 for w in v.values()):
            raise ValueError("each mix weight must be 0 to 100")
        if sum(v.values()) <= 0:
            raise ValueError("the mix needs at least one kind with a positive weight")
        return v


class FeedEvent(BaseModel):
    alert_id: str
    txn_id: str
    ts: str
    amount: float
    currency: str
    lane: Lane
    route: Route | None = Field(description="Code-screen route for human lanes; the full pipeline's route once the "
                                            "AI lane has run; null while queued")
    reasons: list[str]
    ai_status: Literal["queued", "done", "failed"] | None = None


class FeedRunSummary(BaseModel):
    started_at: str
    state: State
    config: FeedConfig
    received: int
    elapsed_s: float
    lanes: dict[str, int]
    ai_done: dict[str, int]
    ai_left_queued: int


class FeedStatus(BaseModel):
    state: State
    config: FeedConfig | None
    max_total: int
    started_at: str | None
    elapsed_s: float
    received: int
    rate_per_s: float
    lanes: dict[str, int]
    ai_queue: int
    ai_done: dict[str, int]
    ai_failed: int
    dropped: int
    source: Literal["llm", "template"]
    sim_llm_enabled: bool
    sim_calls: int
    sim_max_calls: int
    sim_failures: int
    events: list[FeedEvent]
    history: list[FeedRunSummary] = Field(default=[], description="Last finished or stopped runs, newest first")


class FeedBusy(RuntimeError):
    pass


class FeedRunner:
    def __init__(self, connect: Callable[[], sqlite3.Connection], lock: threading.Lock, runs: dict[str, CaseRun],
                 guard: Callable[[], object], investigator: Callable[[], object],
                 sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic):
        self._connect, self._lock, self._runs = connect, lock, runs
        self._guard, self._investigator = guard, investigator
        self._sleep, self._clock = sleep, clock
        self._state_lock = threading.Lock()
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []
        self.history: deque[FeedRunSummary] = deque(maxlen=HISTORY_KEPT)
        self._reset_state(None, None)

    def _reset_state(self, cfg: FeedConfig | None, settings: Settings | None) -> None:
        self.state: State = "idle"
        self.cfg = cfg
        self.settings = settings
        self.started_at: str | None = None
        self._t0: float | None = None
        self._t_end: float | None = None
        self._t_ingest_end: float | None = None
        self.received = self.ai_failed = 0
        self.lanes = {"gate": 0, "review": 0, "ai": 0}
        self.ai_done = {r.value: 0 for r in Route}
        self.queue: deque[str] = deque()
        self.events: OrderedDict[str, FeedEvent] = OrderedDict()
        self.generator: BankFeedGenerator | None = None
        self._ingest_done = False

    # ---- control ----

    def start(self, cfg: FeedConfig, settings: Settings) -> None:
        with self._state_lock:
            if self.state in ("running", "draining"):
                raise FeedBusy("A feed is already running")
            self._join()
            self._reset_state(cfg, settings)
            conn = self._connect()
            try:
                roster = load_roster(conn)
            finally:
                conn.close()
            self.generator = BankFeedGenerator(settings, roster, seed=int(time.time()), mix=cfg.mix)
            self.state, self._stop = "running", threading.Event()
            self.started_at = datetime.now(timezone.utc).isoformat()
            self._t0 = self._clock()
            self._threads = [threading.Thread(target=self._ingest_loop, name="feed-ingest", daemon=True)]
            if cfg.ai_per_min > 0:
                self._threads.append(threading.Thread(target=self._ai_loop, name="feed-ai-lane", daemon=True))
            for t in self._threads:
                t.start()

    def stop(self) -> None:
        """Stops both threads. Queued AI-lane cases keep no route and are not cleared."""
        self._stop.set()
        self._join()
        with self._state_lock:
            if self.state in ("running", "draining"):
                self._close("stopped")

    def wait(self, timeout: float | None = None) -> None:
        for t in list(self._threads):
            t.join(timeout)

    def _join(self) -> None:
        for t in self._threads:
            if t is not threading.current_thread():
                t.join(timeout=30)

    # ---- threads ----

    def _ingest_loop(self) -> None:
        cfg, settings, gen = self.cfg, self.settings, self.generator
        interval = cfg.duration_s / cfg.total
        next_refresh = 0.0
        conn = self._connect()
        try:
            for i in range(cfg.total):
                if self._stop.is_set():
                    return
                if gen.llm_enabled and self._clock() >= next_refresh:
                    gen.refresh()  # outside the DB lock: a slow simulator model never blocks MOMO
                    next_refresh = self._clock() + REFRESH_EVERY_S
                payload = gen.next_payload()
                if payload is not None:
                    with self._lock:
                        alert_id, txn_id = store(conn, payload, source=FEED_SOURCE)
                        screen = screen_case(conn, alert_id, settings.aed_block_threshold)
                        conn.commit()
                    with self._state_lock:
                        self.received += 1
                        self.lanes[screen.lane] += 1
                        self._event(FeedEvent(
                            alert_id=alert_id, txn_id=txn_id, ts=datetime.now(timezone.utc).isoformat(),
                            amount=payload.amount, currency=payload.currency, lane=screen.lane, route=screen.route,
                            reasons=screen.reasons, ai_status="queued" if screen.lane == "ai" else None))
                        if screen.lane == "ai":
                            self.queue.append(alert_id)
                wait = self._t0 + (i + 1) * interval - self._clock()
                if wait > 0 and self._stop.wait(wait):
                    return
        finally:
            conn.close()
            with self._state_lock:
                self._ingest_done = True
                self._t_ingest_end = self._clock()
                if self.state == "running":
                    if self._stop.is_set():
                        self._close("stopped")
                    elif self.queue and self.cfg.ai_per_min > 0:
                        self.state = "draining"
                    else:
                        self._close("finished")

    def _ai_loop(self) -> None:
        period = 60.0 / self.cfg.ai_per_min
        conn = self._connect()
        try:
            while not self._stop.is_set():
                with self._state_lock:
                    alert_id = self.queue.popleft() if self.queue else None
                    finished = alert_id is None and self._ingest_done
                if finished:
                    with self._state_lock:
                        if self.state == "draining":
                            self._close("finished")
                    return
                if alert_id is None:
                    if self._stop.wait(0.5):
                        return
                    continue
                t0 = self._clock()
                self._run_one(conn, alert_id)
                if self._stop.wait(max(0.0, period - (self._clock() - t0))):
                    return
        finally:
            conn.close()

    def _run_one(self, conn: sqlite3.Connection, alert_id: str) -> None:
        try:
            with self._lock:
                result = run_case(conn, alert_id, self._guard(), self.settings.aed_block_threshold,
                                  self._investigator())
            self._runs[alert_id] = result
        except Exception:  # an unexpected pipeline error leaves the case unrouted (not cleared) and is counted
            with self._state_lock:
                self.ai_failed += 1
                if (ev := self.events.get(alert_id)) is not None:
                    ev.ai_status = "failed"
            return
        with self._state_lock:
            self.ai_done[result.decision.route.value] += 1
            if (ev := self.events.get(alert_id)) is not None:
                ev.route, ev.ai_status = result.decision.route, "done"
                ev.reasons = [r.code for r in result.decision.reasons if r.route != Route.AUTO_CLEAR] \
                    or [r.code for r in result.decision.reasons]

    def _close(self, state: State) -> None:
        """Terminal state plus a history entry. Caller holds _state_lock."""
        self.state, self._t_end = state, self._clock()
        if self.cfg is not None and self.started_at is not None:
            self.history.appendleft(FeedRunSummary(
                started_at=self.started_at, state=state, config=self.cfg, received=self.received,
                elapsed_s=round(self._t_end - self._t0, 1), lanes=dict(self.lanes), ai_done=dict(self.ai_done),
                ai_left_queued=len(self.queue)))

    def _event(self, ev: FeedEvent) -> None:
        self.events[ev.alert_id] = ev
        while len(self.events) > EVENTS_KEPT:
            self.events.popitem(last=False)

    # ---- read ----

    def status(self, settings: Settings) -> FeedStatus:
        with self._state_lock:
            now = self._t_end if self._t_end is not None else self._clock()
            elapsed = (now - self._t0) if self._t0 is not None else 0.0
            # Arrival rate over the streaming window only; the AI lane may keep draining after the last alert.
            window = ((self._t_ingest_end or now) - self._t0) if self._t0 is not None else 0.0
            gen = self.generator
            return FeedStatus(
                state=self.state, config=self.cfg, max_total=settings.feed_max_total, started_at=self.started_at,
                elapsed_s=round(elapsed, 1), received=self.received,
                rate_per_s=round(self.received / window, 2) if window > 0 else 0.0,
                lanes=dict(self.lanes), ai_queue=len(self.queue), ai_done=dict(self.ai_done),
                ai_failed=self.ai_failed, dropped=gen.dropped if gen else 0,
                source=gen.source if gen else "template",
                sim_llm_enabled=gen.llm_enabled if gen else sim_llm_enabled(settings),
                sim_calls=gen.calls if gen else 0, sim_max_calls=settings.sim_llm_max_calls,
                sim_failures=gen.failures if gen else 0,
                events=[e.model_copy() for e in reversed(self.events.values())],
                history=[h.model_copy() for h in self.history])
