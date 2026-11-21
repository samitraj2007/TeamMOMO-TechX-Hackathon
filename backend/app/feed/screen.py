"""Code-only screening for live traffic. PURE CODE: no classifier, no investigator, no model call of any kind.

Every alert from the feed is screened here as it arrives. The screen gathers the same evidence as the full pipeline,
runs the deterministic regex quarantine over every free-text field, and asks the unchanged policy engine for a route.

Only escalations are honoured. The engine's rule is that a model can only tighten a route, never loosen it, so an
escalation found from code facts alone is already a floor on the final route and the case goes to a human now:
PENDING_APPROVAL to the officer gate, NEEDS_REVIEW to review. A case code would clear is NOT cleared here: the
classifier and investigator have not run, so it is queued for the AI lane, which runs the full pipeline.
"""

import sqlite3
import time
from typing import Literal

from pydantic import BaseModel

from backend.app import audit
from backend.app.pipeline import BAND_ORDER, _gather_evidence, free_text_fields, load_case
from backend.app.policy.engine import PolicyConfig, PolicyInput, decide
from backend.app.schemas import Route
from backend.app.security.regex_filter import scan_field

Lane = Literal["gate", "review", "ai"]
LANE_FOR_ROUTE: dict[Route, Lane] = {Route.PENDING_APPROVAL: "gate", Route.NEEDS_REVIEW: "review",
                                     Route.AUTO_CLEAR: "ai"}


class Screen(BaseModel):
    alert_id: str
    lane: Lane
    route: Route | None  # None for the AI lane: no route exists until the full pipeline has run
    reasons: list[str]
    record_ids: list[str]


def screen_case(conn: sqlite3.Connection, alert_id: str, threshold: float) -> Screen:
    """Writes one audit STEP (step `screen`, actor CODE). The caller commits."""
    t0 = time.perf_counter()
    _, txn = load_case(conn, alert_id)
    signals = sorted({f"{field}:{hit.code}" for field, text in free_text_fields(conn, txn).items() if text
                      for hit in scan_field(text, field)[0]})
    ev = _gather_evidence(conn, txn)
    bands = [s.band for s in (ev.sanctions_customer, ev.sanctions_payee) if s is not None]
    vel = ev.velocity
    decision = decide(PolicyInput(
        amount=txn["amount"], currency=txn["currency"],
        watchlist_band=max(bands, key=BAND_ORDER.__getitem__) if bands else "CLEAR",
        device_known_and_verified=bool(ev.kyc and ev.kyc.device_known_and_verified),
        txn_count_24h=vel.txn_count_24h if vel else 0, amount_24h=vel.amount_24h if vel else float("inf"),
        new_payees_24h=vel.new_payees_24h if vel else 0, injection_detected=bool(signals),
        # The classifier has not run. Passing "not degraded" can only matter if the result were AUTO_CLEAR, and an
        # AUTO_CLEAR result is discarded below: such a case waits for the full pipeline instead.
        classifier_degraded=False, evidence_complete=ev.complete,
    ), PolicyConfig(aed_block_threshold=threshold))

    lane = LANE_FOR_ROUTE[decision.route]
    reasons = [r.code for r in decision.reasons if r.route != Route.AUTO_CLEAR]
    route = None if lane == "ai" else decision.route
    summary = (f"Code screen: {decision.route.value} from code facts ({', '.join(reasons)})" if route
               else "Code screen: no escalation from code facts; queued for the full pipeline before any clear")
    audit.append(conn, alert_id, "STEP", "CODE", {
        "step": "screen", "status": "FLAGGED" if route else "DONE", "summary": summary,
        "duration_ms": round((time.perf_counter() - t0) * 1000, 3), "lane": lane, "reasons": reasons,
        "signals": signals, "txn_id": txn["record_id"], "record_ids": ev.record_ids})
    return Screen(alert_id=alert_id, lane=lane, route=route, reasons=reasons, record_ids=ev.record_ids)
