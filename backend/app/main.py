import threading
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.config import get_settings
from backend.app.db import connect, ensure_seeded
from backend.app.pipeline import CaseRun, free_text_fields, load_case, run_case
from backend.app.schemas import Approval, Resolution, Route
from backend.app.security.classifier import Guard, build_guard
from backend.app.services.case_resolution import (ApprovalRequired, commit_case_resolution, latest_approval,
                                                  record_approval)
from backend.app.services.kyc_devices import RecordNotFound

settings = get_settings()

app = FastAPI(title="MOMO Sentinel", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_TITLES = {
    "A": "Benign supplier payment", "B": "Hostile memo (English)", "C": "Hostile memo (Arabic)",
    "D": "High-value transfer, watchlist alias", "E": "Common-name lookalike", "F": "Base64-encoded injection",
    "G": "Injection hidden in payee name", "H": "Direct override instruction", "T": "Benign memo with trigger words",
}
DEMO_ORDER = "ABDCEFGHT"

_runs: dict[str, CaseRun] = {}
_db_lock = threading.Lock()
_guard: Guard | None = None


def get_guard() -> Guard:
    global _guard
    if _guard is None:
        _guard = build_guard(settings)
    return _guard


def get_conn():
    ensure_seeded()
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


class CaseSummary(BaseModel):
    alert_id: str
    txn_id: str
    demo_tag: str | None
    title: str
    amount: float
    currency: str
    payee_name: str | None
    rule_id: str
    last_route: Route | None


class CaseDetail(BaseModel):
    summary: CaseSummary
    channel: str | None
    country: str | None
    ts: str | None
    raw_fields: dict[str, str | None] = Field(description="Display only. Never sent to any agent prompt.")
    run: CaseRun | None
    approval: Approval | None
    resolution: Resolution | None


class DecisionIn(BaseModel):
    decision: Literal["APPROVE", "REJECT", "MORE_INFO"]
    action: Literal["CLEAR", "HOLD_AND_BLOCK", "ESCALATE"] = "HOLD_AND_BLOCK"
    reason: str = Field(min_length=3, max_length=500)
    actor: str = Field(default="officer.demo", max_length=60)


class CommitIn(BaseModel):
    action: Literal["CLEAR", "HOLD_AND_BLOCK", "ESCALATE"] = "HOLD_AND_BLOCK"


class DecisionOut(BaseModel):
    approval: Approval
    resolution: Resolution | None


def _summary(alert: dict, txn: dict) -> CaseSummary:
    tag = txn["demo_tag"]
    run = _runs.get(alert["record_id"])
    return CaseSummary(alert_id=alert["record_id"], txn_id=txn["record_id"], demo_tag=tag,
                       title=DEMO_TITLES.get(tag or "", f"Flagged transaction {txn['record_id']}"),
                       amount=txn["amount"], currency=txn["currency"], payee_name=txn["payee_name"],
                       rule_id=alert["rule_id"], last_route=run.decision.route if run else None)


def _load(conn, alert_id: str) -> tuple[dict, dict]:
    try:
        return load_case(conn, alert_id)
    except RecordNotFound:
        raise HTTPException(404, f"Unknown case {alert_id}")


@app.get("/health")
def health() -> dict:
    guard = get_guard()
    return {"status": "ok", "demo_mode": settings.demo_mode, "guard_model": settings.groq_model_guard or None,
            "guard_live": guard.backend is not None, "cache_entries": len(guard.cache),
            "threshold_aed": settings.aed_block_threshold}


@app.get("/cases", response_model=list[CaseSummary])
def list_cases(all: bool = False, conn=Depends(get_conn)):
    where = "" if all else "WHERE t.demo_tag IS NOT NULL"
    rows = conn.execute(f"SELECT a.record_id AS alert_id FROM alerts a JOIN transactions t ON t.record_id = a.txn_id "
                        f"{where} ORDER BY a.record_id").fetchall()
    out = [_summary(*load_case(conn, r["alert_id"])) for r in rows]
    if not all:
        out.sort(key=lambda c: DEMO_ORDER.index(c.demo_tag))
    return out


@app.get("/cases/{alert_id}", response_model=CaseDetail)
def get_case(alert_id: str, conn=Depends(get_conn)):
    alert, txn = _load(conn, alert_id)
    res = conn.execute("SELECT * FROM resolutions WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                       (alert_id,)).fetchone()
    return CaseDetail(summary=_summary(alert, txn), channel=txn["channel"], country=txn["country"], ts=txn["ts"],
                      raw_fields=free_text_fields(conn, txn), run=_runs.get(alert_id),
                      approval=latest_approval(conn, alert_id), resolution=Resolution(**dict(res)) if res else None)


@app.post("/cases/{alert_id}/run", response_model=CaseRun)
def run(alert_id: str, conn=Depends(get_conn)):
    _load(conn, alert_id)
    with _db_lock:
        result = run_case(conn, alert_id, get_guard(), settings.aed_block_threshold)
    _runs[alert_id] = result
    return result


@app.post("/cases/{alert_id}/decision", response_model=DecisionOut)
def decide_case(alert_id: str, body: DecisionIn, conn=Depends(get_conn)):
    _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    if run_result is None:
        raise HTTPException(409, "Run the case before deciding")
    if run_result.decision.route == Route.AUTO_CLEAR:
        raise HTTPException(409, "Case was auto-cleared; no human decision needed")
    with _db_lock:
        approval = record_approval(conn, alert_id, body.actor, body.decision, body.reason)
        resolution = None
        if body.decision == "APPROVE":
            resolution = commit_case_resolution(conn, alert_id, run_result.decision.route, body.action)
    return DecisionOut(approval=approval, resolution=resolution)


@app.post("/cases/{alert_id}/commit", response_model=Resolution)
def commit(alert_id: str, body: CommitIn, conn=Depends(get_conn)):
    """Direct commit attempt. Refused (403) for gated cases without a recorded approval."""
    _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    if run_result is None:
        raise HTTPException(409, "Run the case before committing")
    try:
        with _db_lock:
            return commit_case_resolution(conn, alert_id, run_result.decision.route, body.action)
    except ApprovalRequired as e:
        raise HTTPException(403, str(e))


@app.post("/demo/reset")
def demo_reset() -> dict:
    from backend.data.generate import generate

    with _db_lock:
        _runs.clear()
        counts = generate(settings.db_file)
    return {"status": "reset", "counts": counts}
