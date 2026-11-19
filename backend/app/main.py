import hmac
import logging
import threading
from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.app.agents.cache import JsonCache
from backend.app.agents.investigator import Investigator, build_investigator
from backend.app.config import get_settings
from backend.app import audit
from backend.app.audit import AuditEntry, AuditVerify
from backend.app.db import connect, ensure_seeded
from backend.app.ingest import MAX_BODY_BYTES, IngestIn
from backend.app.ingest import store as store_ingested
from backend.app.pipeline import CaseRun, free_text_fields, load_case, run_case
from backend.app.reports.builder import Report, build_report
from backend.app.schemas import Action, Approval, Resolution, Route
from backend.app.security.classifier import Guard, build_guard
from backend.app.services.case_resolution import (AlreadyResolved, ApprovalRequired, commit_case_resolution,
                                                  gated_facts, is_override, latest_approval, latest_resolution,
                                                  proposed_action, record_approval)
from backend.app.services.filing import AlreadyFiled, FilingRefused, file_report
from backend.app.services.kyc_devices import RecordNotFound
from backend.app.timeline import CaseTimeline, build_timeline

settings = get_settings()
log = logging.getLogger("momo.audit")

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
MANUAL_RULE = "MANUAL-RUN"

_runs: dict[str, CaseRun] = {}
_db_lock = threading.Lock()
_cache: JsonCache | None = None
_guard: Guard | None = None
_investigator: Investigator | None = None


def get_cache() -> JsonCache:
    global _cache
    if _cache is None:
        _cache = JsonCache(settings.cache_file)
    return _cache


def get_guard() -> Guard:
    global _guard
    if _guard is None:
        _guard = build_guard(settings, get_cache())
    return _guard


def get_investigator() -> Investigator:
    global _investigator
    if _investigator is None:
        _investigator = build_investigator(settings, get_cache())
    return _investigator


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
    alerted: bool = Field(description="False when the alert was created only to run the pipeline on demand")
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
    model_config = ConfigDict(extra="forbid")
    decision: Literal["APPROVE", "REJECT", "MORE_INFO"]
    action: Action | None = Field(default=None, description="APPROVE only; defaults to the route's proposed action")
    reason: str = Field(min_length=3, max_length=500)
    actor: str = Field(default="officer.demo", min_length=1, max_length=60, pattern=r"^[A-Za-z0-9._-]+$")
    role: Literal["ANALYST", "COMPLIANCE_OFFICER"] = "COMPLIANCE_OFFICER"


class CommitIn(BaseModel):
    action: Action = "HOLD_AND_BLOCK"


class DecisionOut(BaseModel):
    approval: Approval
    resolution: Resolution | None
    status: Literal["COMMITTED", "REJECTED", "AWAITING_INFO"]
    override: bool


def _summary(alert: dict, txn: dict) -> CaseSummary:
    tag = txn["demo_tag"]
    run = _runs.get(alert["record_id"])
    alerted = alert["rule_id"] != MANUAL_RULE
    default = f"Flagged transaction {txn['record_id']}" if alerted else \
        f"Not alerted by rules - manual run of {txn['record_id']}"
    return CaseSummary(alert_id=alert["record_id"], txn_id=txn["record_id"], demo_tag=tag,
                       title=DEMO_TITLES.get(tag or "", default), amount=txn["amount"], currency=txn["currency"],
                       payee_name=txn["payee_name"], rule_id=alert["rule_id"], alerted=alerted,
                       last_route=run.decision.route if run else None)


def _load(conn, alert_id: str) -> tuple[dict, dict]:
    try:
        return load_case(conn, alert_id)
    except RecordNotFound:
        raise HTTPException(404, f"Unknown case {alert_id}")


@app.get("/health")
def health() -> dict:
    guard, inv = get_guard(), get_investigator()
    return {"status": "ok", "demo_mode": settings.demo_mode, "guard_model": settings.groq_model_guard or None,
            "guard_live": guard.backend is not None, "investigator_model": settings.groq_model_main or None,
            "investigator_live": inv.backend is not None,
            "backup_model": inv.backup.model if inv.backup else None, "cache_entries": len(guard.cache),
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
        result = run_case(conn, alert_id, get_guard(), settings.aed_block_threshold, get_investigator())
    _runs[alert_id] = result
    return result


class TransactionSummary(BaseModel):
    txn_id: str
    alert_id: str | None
    alerted: bool
    rule_id: str | None
    amount: float
    currency: str
    payee_name: str | None
    ts: str | None
    last_route: Route | None


@app.get("/transactions", response_model=list[TransactionSummary])
def list_transactions(alerted: bool | None = None, limit: int = Query(100, ge=1, le=1000),
                      offset: int = Query(0, ge=0), conn=Depends(get_conn)):
    """Every transaction, alerted or not. `alerted` filters on rule-raised alerts (manual runs do not count)."""
    rows = conn.execute(
        "SELECT t.record_id, t.amount, t.currency, t.payee_name, t.ts, a.record_id AS alert_id, a.rule_id "
        "FROM transactions t LEFT JOIN alerts a ON a.txn_id = t.record_id ORDER BY t.record_id").fetchall()
    out = []
    for r in rows:
        is_alerted = r["alert_id"] is not None and r["rule_id"] != MANUAL_RULE
        if alerted is not None and is_alerted != alerted:
            continue
        run = _runs.get(r["alert_id"]) if r["alert_id"] else None
        out.append(TransactionSummary(txn_id=r["record_id"], alert_id=r["alert_id"], alerted=is_alerted,
                                      rule_id=r["rule_id"], amount=r["amount"], currency=r["currency"],
                                      payee_name=r["payee_name"], ts=r["ts"],
                                      last_route=run.decision.route if run else None))
    return out[offset:offset + limit]


class TransactionRunOut(BaseModel):
    txn_id: str
    alert_id: str
    alerted: bool
    rule_id: str
    label: str
    run: CaseRun


@app.post("/transactions/{txn_id}/run", response_model=TransactionRunOut)
def run_transaction(txn_id: str = Path(pattern=r"^TXN-\d{5,6}$"), conn=Depends(get_conn)):
    """Full pipeline on any transaction. One without a rule-raised alert gets a MANUAL-RUN alert sharing its
    number and is labelled as not alerted."""
    if conn.execute("SELECT 1 FROM transactions WHERE record_id = ?", (txn_id,)).fetchone() is None:
        raise HTTPException(404, f"Unknown transaction {txn_id}")
    with _db_lock:
        alert = conn.execute("SELECT record_id, rule_id FROM alerts WHERE txn_id = ? ORDER BY record_id LIMIT 1",
                             (txn_id,)).fetchone()
        if alert is None:
            alert_id, rule_id = f"ALT-{int(txn_id.split('-')[1]):05d}", MANUAL_RULE
            conn.execute("INSERT INTO alerts VALUES (?,?,?,?)",
                         (alert_id, txn_id, rule_id, datetime.now(timezone.utc).isoformat()))
            audit.append(conn, alert_id, "MANUAL_RUN", "API", {"txn_id": txn_id, "alerted_by_rules": False})
            conn.commit()
        else:
            alert_id, rule_id = alert["record_id"], alert["rule_id"]
        result = run_case(conn, alert_id, get_guard(), settings.aed_block_threshold, get_investigator())
    _runs[alert_id] = result
    alerted = rule_id != MANUAL_RULE
    return TransactionRunOut(txn_id=txn_id, alert_id=alert_id, alerted=alerted, rule_id=rule_id,
                             label=f"Alerted by rules {rule_id}" if alerted else
                             "Not alerted by rules - manual pipeline run", run=result)


class IngestOut(BaseModel):
    alert_id: str
    txn_id: str
    run: CaseRun


def _ingest_sync(body: IngestIn) -> IngestOut:
    ensure_seeded()
    conn = connect()
    try:
        with _db_lock:
            alert_id, txn_id = store_ingested(conn, body)
            result = run_case(conn, alert_id, get_guard(), settings.aed_block_threshold, get_investigator())
        _runs[alert_id] = result
        return IngestOut(alert_id=alert_id, txn_id=txn_id, run=result)
    finally:
        conn.close()


@app.post("/cases/ingest", response_model=IngestOut, status_code=201)
async def ingest(request: Request):
    """Run the full pipeline on an unseen transaction. Malformed input: 413/422, nothing stored."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(413, f"Body over {MAX_BODY_BYTES} bytes")
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        raise HTTPException(413, f"Body over {MAX_BODY_BYTES} bytes")
    try:
        body = IngestIn.model_validate_json(raw)
    except ValidationError as e:
        errors = [{"loc": list(err["loc"]), "msg": err["msg"], "type": err["type"]} for err in e.errors()]
        raise HTTPException(422, errors)
    return await run_in_threadpool(_ingest_sync, body)


@app.post("/cases/{alert_id}/decision", response_model=DecisionOut)
def decide_case(alert_id: str, body: DecisionIn, conn=Depends(get_conn)):
    _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    if run_result is None:
        raise HTTPException(409, "Run the case before deciding")
    route = run_result.decision.route
    if route == Route.AUTO_CLEAR:
        raise HTTPException(409, "Case was auto-cleared; no human decision needed")
    if latest_resolution(conn, alert_id) is not None:
        raise HTTPException(409, "Case already resolved")
    action = (body.action or proposed_action(route)) if body.decision == "APPROVE" else None
    facts = gated_facts(conn, alert_id, settings.aed_block_threshold)
    officer_only = route == Route.PENDING_APPROVAL or facts["high_value"] or facts["watchlist_hit"] \
        or action == "HOLD_AND_BLOCK"
    if officer_only and body.role != "COMPLIANCE_OFFICER":
        with _db_lock:
            audit.append(conn, alert_id, "DECISION_REFUSED", "HUMAN", {
                "user": body.actor, "role": body.role, "decision": body.decision, "action": action,
                "refusal": "OFFICER_REQUIRED"})
            conn.commit()
        raise HTTPException(403, "High-value, watchlist and blocking decisions require a compliance officer")
    override = is_override(route, body.decision, action)
    with _db_lock:
        try:
            approval = record_approval(conn, alert_id, body.actor, body.decision, body.reason, role=body.role,
                                       action=action, override=override)
        except ValueError as e:
            raise HTTPException(422, str(e))
        resolution = None
        if body.decision == "APPROVE":
            try:
                resolution = commit_case_resolution(conn, alert_id, route, action, settings.aed_block_threshold)
            except ApprovalRequired as e:
                raise HTTPException(403, str(e))
    status = {"APPROVE": "COMMITTED", "REJECT": "REJECTED", "MORE_INFO": "AWAITING_INFO"}[body.decision]
    return DecisionOut(approval=approval, resolution=resolution, status=status, override=override)


@app.post("/cases/{alert_id}/commit", response_model=Resolution)
def commit(alert_id: str, body: CommitIn, conn=Depends(get_conn)):
    """Direct commit attempt. Refused (403) for gated cases without a recorded approval."""
    _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    if run_result is None:
        raise HTTPException(409, "Run the case before committing")
    try:
        with _db_lock:
            return commit_case_resolution(conn, alert_id, run_result.decision.route, body.action,
                                          settings.aed_block_threshold)
    except ApprovalRequired as e:
        raise HTTPException(403, str(e))
    except AlreadyResolved as e:
        raise HTTPException(409, str(e))


RECORD_TABLES = {"TXN": "transactions", "CUS": "customers", "DEV": "devices", "WL": "watchlist",
                 "VEL": "velocity_logs", "ALT": "alerts", "APR": "approvals", "RES": "resolutions",
                 "AUD": "audit_log"}
EVAL_LABEL_COLUMNS = ("is_fraud", "scenario", "expected_route", "injection_family", "demo_tag")


class RecordOut(BaseModel):
    record_id: str
    table: str
    row: dict
    withheld_columns: list[str] = Field(description="Synthetic ground-truth labels used only for evaluation")


@app.get("/records/{record_id}", response_model=RecordOut)
def get_record(record_id: str = Path(pattern=r"^[A-Z]{2,4}-\d{3,6}$"), conn=Depends(get_conn)):
    """The raw bank record behind any citation in a report. Display only; never sent to a model."""
    table = RECORD_TABLES.get(record_id.split("-")[0])
    row = conn.execute(f"SELECT * FROM {table} WHERE record_id = ?", (record_id,)).fetchone() if table else None
    if row is None:
        raise HTTPException(404, f"Unknown record {record_id}")
    data = dict(row)
    withheld = [c for c in EVAL_LABEL_COLUMNS if c in data]
    for c in withheld:
        data.pop(c)
    return RecordOut(record_id=record_id, table=table, row=data, withheld_columns=withheld)


@app.get("/cases/{alert_id}/report", response_model=Report)
def get_report(alert_id: str, conn=Depends(get_conn)):
    _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    if run_result is None:
        raise HTTPException(409, "Run the case before requesting its report")
    res = conn.execute("SELECT * FROM resolutions WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                       (alert_id,)).fetchone()
    return build_report(conn, run_result, latest_approval(conn, alert_id), Resolution(**dict(res)) if res else None,
                        audit.latest_for(conn, alert_id))


class FileReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    actor: str = Field(default="officer.demo", min_length=1, max_length=60, pattern=r"^[A-Za-z0-9._-]+$")
    role: Literal["ANALYST", "COMPLIANCE_OFFICER"] = "COMPLIANCE_OFFICER"


class FilingOut(BaseModel):
    filing_id: str = Field(description="The AUD record holding the filing")
    status: str
    report_sha256: str
    approval_id: str
    cited_record_ids: list[str]
    audit_hash: str


@app.post("/cases/{alert_id}/file-report", response_model=FilingOut)
def file_case_report(alert_id: str, body: FileReportIn, conn=Depends(get_conn)):
    """Simulated regulator submission. Refused (403) unless a compliance officer approval is recorded."""
    _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    if run_result is None:
        raise HTTPException(409, "Run the case before filing its report")
    with _db_lock:
        res = latest_resolution(conn, alert_id)
        report = build_report(conn, run_result, latest_approval(conn, alert_id), res, audit.latest_for(conn, alert_id))
        try:
            entry = file_report(conn, alert_id, report, body.actor, body.role)
        except FilingRefused as e:
            raise HTTPException(403, str(e))
        except AlreadyFiled as e:
            raise HTTPException(409, str(e))
    p = entry.payload
    return FilingOut(filing_id=entry.record_id, status=p["status"], report_sha256=p["report_sha256"],
                     approval_id=p["approval_id"], cited_record_ids=p["cited_record_ids"], audit_hash=entry.hash)


@app.get("/cases/{alert_id}/audit", response_model=list[AuditEntry])
def case_audit(alert_id: str, conn=Depends(get_conn)):
    _load(conn, alert_id)
    return audit.entries_for(conn, alert_id)


@app.get("/cases/{alert_id}/timeline", response_model=CaseTimeline)
def case_timeline(alert_id: str, conn=Depends(get_conn)):
    """Ordered steps from the audit log: actor type, service calls (name, record IDs, duration). No free text."""
    _load(conn, alert_id)
    return build_timeline(alert_id, audit.entries_for(conn, alert_id))


@app.get("/audit/verify", response_model=AuditVerify)
def audit_verify(anchor: str | None = Query(None, pattern=r"^[0-9a-f]{64}$"), conn=Depends(get_conn)):
    """Recompute the whole chain. `anchor` is a head hash recorded earlier; it must still be in the chain."""
    return audit.verify(conn, anchor)


@app.post("/demo/reset")
def demo_reset(x_admin_token: str | None = Header(None)) -> dict:
    """Wipes and re-seeds the database. DEMO_MODE must not be off and X-Admin-Token must match DEMO_ADMIN_TOKEN.
    The audit head is logged and returned first so the wiped chain can still be checked against it."""
    from backend.data.generate import generate

    if settings.demo_mode == "off":
        raise HTTPException(404, "Not Found")
    expected = settings.demo_admin_token
    if not expected or not x_admin_token or not hmac.compare_digest(x_admin_token.encode(), expected.encode()):
        raise HTTPException(403, "Admin token required")
    with _db_lock:
        ensure_seeded()
        conn = connect()
        try:
            head = audit.verify(conn)
        finally:
            conn.close()
        log.warning("demo reset: audit head before wipe %s (%s, %d entries, chain ok=%s)", head.head_hash,
                    head.head_record_id, head.entries, head.ok)
        _runs.clear()
        counts = generate(settings.db_file)
    return {"status": "reset", "counts": counts, "previous_audit_head": head}
