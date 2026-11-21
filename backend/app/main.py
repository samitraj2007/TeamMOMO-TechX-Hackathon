import hmac
import json
import logging
import threading
from datetime import datetime, timezone
from typing import Literal

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Path, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.app.agents.cache import JsonCache
from backend.app.agents.faults import FaultArmed, FaultConfig, FaultSwitch
from backend.app.agents.investigator import Investigator, build_investigator
from backend.app.config import get_settings
from backend.app import audit
from backend.app.audit import AuditEntry, AuditVerify
from backend.app.db import connect, ensure_seeded
from backend.app import exports, records
from backend.app.records import CaseRecord, CaseSearch, Notifications, Storage
from backend.app.runs import RunStore
from backend.app.lifecycle import Lifecycle, lifecycle, recorded_route
from backend.app.eval_scorecard import EvalScorecard, scorecard
from backend.app.feed.runner import FeedBusy, FeedConfig, FeedRunner, FeedStatus
from backend.app.ingest import MAX_BODY_BYTES, IngestIn
from backend.app.ingest import store as store_ingested
from backend.app.pipeline import CaseRun, free_text_fields, load_case, run_case
from backend.app.reports.builder import Report, build_report
from backend.app.schemas import Action, Approval, Resolution, Route
from backend.app.security.classifier import Guard, build_guard
from backend.app.services.case_resolution import (AlreadyResolved, ApprovalRequired, commit_case_resolution,
                                                  approvals_for, gated_facts, is_override, latest_approval, latest_resolution,
                                                  escalated_by, proposed_action, record_approval)
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

_db_lock = threading.Lock()
_runs: RunStore | dict[str, CaseRun] = RunStore(_db_lock, lambda: settings.db_file)  # survives restarts
_cache: JsonCache | None = None
_guard: Guard | None = None
_investigator: Investigator | None = None
_faults = FaultSwitch()  # demo resilience drills; only ever armed through POST /demo/fault


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
        _investigator = build_investigator(settings, get_cache(), faults=_faults)
    return _investigator


_feed: FeedRunner | None = None


def get_feed() -> FeedRunner:
    """One feed per process. Threads open their own connections; writes share _db_lock with the API."""
    global _feed
    if _feed is None:
        def feed_connect():
            ensure_seeded()
            return connect()
        _feed = FeedRunner(feed_connect, _db_lock, _runs, lambda: get_guard(), lambda: get_investigator())
    return _feed


def _require_admin(x_admin_token: str | None) -> None:
    """Demo controls: absent when DEMO_MODE is off, and only for the holder of DEMO_ADMIN_TOKEN."""
    if settings.demo_mode == "off":
        raise HTTPException(404, "Demo controls are off (DEMO_MODE=off)")
    expected = settings.demo_admin_token
    if not expected or not x_admin_token or not hmac.compare_digest(x_admin_token.encode(), expected.encode()):
        raise HTTPException(403, "Admin token required")


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
    approval: Approval | None = Field(description="The latest human decision")
    decisions: list[Approval] = Field(default_factory=list, description="Every human decision, oldest first")
    resolution: Resolution | None


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["APPROVE", "REJECT", "MORE_INFO", "ESCALATE"] = Field(
        description="ESCALATE hands the case to a compliance officer without committing anything")
    action: Action | None = Field(default=None, description="APPROVE only; defaults to the route's proposed action")
    reason: str = Field(min_length=3, max_length=500)
    actor: str = Field(default="officer.demo", min_length=1, max_length=60, pattern=r"^[A-Za-z0-9._-]+$")
    role: Literal["ANALYST", "COMPLIANCE_OFFICER"] = "COMPLIANCE_OFFICER"


class CommitIn(BaseModel):
    action: Action = "HOLD_AND_BLOCK"


class DecisionOut(BaseModel):
    approval: Approval
    resolution: Resolution | None
    status: Literal["COMMITTED", "REJECTED", "AWAITING_INFO", "ESCALATED"]
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
            "backup_model": inv.backup.model if inv.backup else None,
            "backup_name": inv.backup.name if inv.backup else None, "cache_entries": len(guard.cache),
            "threshold_aed": settings.aed_block_threshold, "llm_timeout_s": settings.llm_timeout_s,
            "fault_armed": f.model_dump() if (f := _faults.state()) else None}


@app.get("/audit", response_model=list[AuditEntry])
def global_audit(alert_id: str | None = Query(None, pattern=r"^ALT-\d{5}$"), kind: str | None = Query(None, max_length=20),
                 actor: str | None = Query(None, max_length=20), limit: int = Query(200, ge=1, le=1000),
                 offset: int = Query(0, ge=0), conn=Depends(get_conn)):
    """The whole audit log, newest first, optionally filtered. Read-only."""
    q, args = "SELECT * FROM audit_log WHERE 1=1", []
    for col, val in (("alert_id", alert_id), ("kind", kind), ("actor", actor)):
        if val:
            q, args = q + f" AND {col} = ?", [*args, val]
    rows = conn.execute(q + " ORDER BY seq DESC LIMIT ? OFFSET ?", [*args, limit, offset]).fetchall()
    return [AuditEntry(**{**dict(r), "payload": json.loads(r["payload"])}) for r in rows]


@app.get("/audit/entries/{record_id}", response_model=AuditEntry)
def audit_entry(record_id: str = Path(pattern=r"^AUD-\d{6}$"), conn=Depends(get_conn)):
    row = conn.execute("SELECT * FROM audit_log WHERE record_id = ?", (record_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"Unknown audit record {record_id}")
    return AuditEntry(**{**dict(row), "payload": json.loads(row["payload"])})


@app.get("/audit/export")
def audit_export(format: Literal["csv", "jsonl"] = "csv", since: str | None = Query(None, max_length=40),
                 until: str | None = Query(None, max_length=40)):
    """The audit log as a file (oldest first). Check it against GET /audit/verify."""
    ensure_seeded()
    conn = connect()
    chain = audit.verify(conn)

    def body():
        try:
            yield from exports.stream_audit(conn, format, since, until)
        finally:
            conn.close()
    media = "text/csv" if format == "csv" else "application/x-ndjson"
    return StreamingResponse(body(), media_type=media, headers={
        "Content-Disposition": f'attachment; filename="momo-audit-{exports.stamp()}.{format}"',
        "X-Audit-Head": chain.head_hash, "X-Audit-Chain-Ok": str(chain.ok).lower()})


@app.get("/cases/search", response_model=CaseSearch)
def case_search(q: str | None = Query(None, max_length=40), origin: str | None = Query(None, pattern=r"^[a-z,]{1,60}$"),
                route: Route | None = None, status: records.Status | None = None,
                since: str | None = Query(None, max_length=40), until: str | None = Query(None, max_length=40),
                limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0), conn=Depends(get_conn)):
    """Every case (demo, your own, feed, drill, seed data) with origin, route and status. Newest activity first."""
    return records.search(conn, q, origin, route.value if route else None, status, since, until, limit, offset)


@app.get("/storage", response_model=Storage)
def storage_info(conn=Depends(get_conn)):
    return records.storage(conn, settings.db_file)


@app.get("/notifications", response_model=Notifications)
def notifications(after: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200), conn=Depends(get_conn)):
    """Events worth a person's attention, derived from the append-only audit log (code-written titles only)."""
    return records.notifications(conn, after, limit)


def _case_pack(conn, alert_id: str) -> tuple[dict[str, bytes], CaseRecord | None]:
    alert, txn = _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    res = latest_resolution(conn, alert_id)
    report = None
    if run_result is not None:
        report = build_report(conn, run_result, latest_approval(conn, alert_id), res, audit.latest_for(conn, alert_id),
                              approvals_for(conn, alert_id))
    rec = next((r for r in records.all_records(conn) if r.alert_id == alert_id), None)
    summary = {**_summary(alert, txn).model_dump(mode="json"), **(rec.model_dump(mode="json") if rec else {})}
    files = exports.case_files(conn, alert_id, summary, run_result, report,
                               [a.model_dump(mode="json") for a in approvals_for(conn, alert_id)],
                               res.model_dump(mode="json") if res else None)
    return files, rec


def _zip_response(data: bytes, name: str) -> Response:
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/cases/{alert_id}/export.zip")
def case_export(alert_id: str = Path(pattern=r"^ALT-\d{5}$"), conn=Depends(get_conn)):
    """Evidence pack: SAR draft (.md and printable .html), audit (.csv, .jsonl), timeline, case data, manifest."""
    files, _ = _case_pack(conn, alert_id)
    files["manifest.json"] = exports.manifest(files, conn, {"alert_id": alert_id})
    return _zip_response(exports.zip_bytes(files), f"momo-{alert_id}-evidence-{exports.stamp()}.zip")


class BulkExportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    alert_ids: list[str] = Field(min_length=1, max_length=exports.MAX_BULK)


@app.post("/exports/cases")
def bulk_export(body: BulkExportIn, conn=Depends(get_conn)):
    """One ZIP with a folder per case, an index.csv and a manifest over every file."""
    bad = [a for a in body.alert_ids if not exports.ALERT_ID.match(a)]
    if bad:
        raise HTTPException(422, f"Not alert IDs: {', '.join(bad[:5])}")
    ids = list(dict.fromkeys(body.alert_ids))
    files: dict[str, bytes] = {}
    rows = []
    for alert_id in ids:
        pack, rec = _case_pack(conn, alert_id)
        files.update({f"{alert_id}/{name}": data for name, data in pack.items()})
        if rec:
            rows.append(rec.model_dump(mode="json"))
    files["index.csv"] = exports.index_csv(rows)
    files["manifest.json"] = exports.manifest(files, conn, {"alert_ids": ids})
    return _zip_response(exports.zip_bytes(files), f"momo-cases-{len(ids)}-{exports.stamp()}.zip")


@app.get("/cases/{alert_id}/report.md", response_class=PlainTextResponse)
def report_markdown(alert_id: str = Path(pattern=r"^ALT-\d{5}$"), conn=Depends(get_conn)):
    report = get_report(alert_id, conn)
    return PlainTextResponse(report.markdown, media_type="text/markdown; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{alert_id}-sar-draft.md"'})


@app.get("/cases/{alert_id}/report.html", response_class=HTMLResponse)
def report_printable(alert_id: str = Path(pattern=r"^ALT-\d{5}$"), conn=Depends(get_conn)):
    """Print-styled SAR draft: open it and use Print > Save as PDF."""
    report = get_report(alert_id, conn)
    head = audit.latest_for(conn, alert_id)
    return HTMLResponse(exports.report_html(report, head.hash if head else None))


@app.get("/cases/{alert_id}/audit.csv")
def case_audit_csv(alert_id: str = Path(pattern=r"^ALT-\d{5}$"), conn=Depends(get_conn)):
    _load(conn, alert_id)
    return Response(exports.audit_csv(audit.entries_for(conn, alert_id)), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{alert_id}-audit.csv"'})


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
    summary = _summary(alert, txn)
    if summary.last_route is None:  # decided before runs were stored: show the route code recorded
        summary.last_route = recorded_route(conn, alert_id)
    return CaseDetail(summary=summary, channel=txn["channel"], country=txn["country"], ts=txn["ts"],
                      raw_fields=free_text_fields(conn, txn), run=_runs.get(alert_id),
                      approval=latest_approval(conn, alert_id), decisions=approvals_for(conn, alert_id),
                      resolution=Resolution(**dict(res)) if res else None)


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


def _ingest_sync(body: IngestIn, source: str = "api") -> IngestOut:
    ensure_seeded()
    conn = connect()
    try:
        with _db_lock:
            alert_id, txn_id = store_ingested(conn, body, source=source)
            result = run_case(conn, alert_id, get_guard(), settings.aed_block_threshold, get_investigator())
        _runs[alert_id] = result
        return IngestOut(alert_id=alert_id, txn_id=txn_id, run=result)
    finally:
        conn.close()


@app.post("/cases/ingest", response_model=IngestOut, status_code=201)
async def ingest(request: Request, source: Literal["api", "drill"] = Query("api")):
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
    return await run_in_threadpool(_ingest_sync, body, source)


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
    escalators = escalated_by(conn, alert_id)
    gated = route == Route.PENDING_APPROVAL or facts["high_value"] or facts["watchlist_hit"] or bool(escalators)
    if body.decision == "ESCALATE":
        if gated:
            raise HTTPException(409, "Case already needs a compliance officer; escalation adds nothing")
        with _db_lock:
            approval = record_approval(conn, alert_id, body.actor, "ESCALATE", body.reason, role=body.role)
        return DecisionOut(approval=approval, resolution=None, status="ESCALATED", override=False)
    officer_only = gated or action == "HOLD_AND_BLOCK"
    if officer_only and body.role != "COMPLIANCE_OFFICER":
        with _db_lock:
            audit.append(conn, alert_id, "DECISION_REFUSED", "HUMAN", {
                "user": body.actor, "role": body.role, "decision": body.decision, "action": action,
                "refusal": "OFFICER_REQUIRED"})
            conn.commit()
        raise HTTPException(403, "High-value, watchlist, escalated and blocking decisions require a compliance officer")
    if body.decision in ("APPROVE", "REJECT") and body.actor.lower() in escalators:
        with _db_lock:
            audit.append(conn, alert_id, "DECISION_REFUSED", "HUMAN", {
                "user": body.actor, "role": body.role, "decision": body.decision, "action": action,
                "refusal": "SAME_PERSON"})
            conn.commit()
        raise HTTPException(403, "Four-eyes rule: the officer who decides must be a different person from the analyst "
                                 "who escalated this case")
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
                        audit.latest_for(conn, alert_id), approvals_for(conn, alert_id))


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
        report = build_report(conn, run_result, latest_approval(conn, alert_id), res, audit.latest_for(conn, alert_id),
                              approvals_for(conn, alert_id))
        try:
            entry = file_report(conn, alert_id, report, body.actor, body.role)
        except FilingRefused as e:
            raise HTTPException(403, str(e))
        except AlreadyFiled as e:
            raise HTTPException(409, str(e))
    p = entry.payload
    return FilingOut(filing_id=entry.record_id, status=p["status"], report_sha256=p["report_sha256"],
                     approval_id=p["approval_id"], cited_record_ids=p["cited_record_ids"], audit_hash=entry.hash)


@app.get("/cases/{alert_id}/lifecycle", response_model=Lifecycle)
def case_lifecycle(alert_id: str = Path(pattern=r"^ALT-\d{5}$"), conn=Depends(get_conn)):
    """Where the case stands (investigated, analyst review, officer approval, filed) and who may act next."""
    _load(conn, alert_id)
    run_result = _runs.get(alert_id)
    route = run_result.decision.route if run_result else recorded_route(conn, alert_id)
    return lifecycle(conn, alert_id, route, settings.aed_block_threshold, run_stored=run_result is not None)


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


@app.get("/eval", response_model=EvalScorecard)
def eval_scorecard(conn=Depends(get_conn)):
    """Aggregates only. Labels stay in the query; they are not part of this response or of any case response."""
    return scorecard(conn, settings.aed_block_threshold)


class KycTamperIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    occupation: str | None = Field(default=None, max_length=500)


@app.post("/demo/kyc/{customer_id}")
def demo_tamper_kyc(customer_id: str = Path(pattern=r"^CUS-\d{4,6}$"), body: KycTamperIn = Body(...),
                    x_admin_token: str | None = Header(None)) -> dict:
    """Curveball U-1.2 hook: simulates a compromised KYC record by writing its occupation field.
    Guarded exactly like /demo/reset. The text is not echoed or audited; only its length is returned."""
    if settings.demo_mode == "off":
        raise HTTPException(404, "Not Found")
    expected = settings.demo_admin_token
    if not expected or not x_admin_token or not hmac.compare_digest(x_admin_token.encode(), expected.encode()):
        raise HTTPException(403, "Admin token required")
    with _db_lock:
        ensure_seeded()
        conn = connect()
        try:
            cur = conn.execute("UPDATE customers SET occupation = ? WHERE record_id = ?", (body.occupation, customer_id))
            conn.commit()
        finally:
            conn.close()
    if cur.rowcount == 0:
        raise HTTPException(404, f"{customer_id} not found")
    return {"customer_id": customer_id, "occupation_chars": len(body.occupation or "")}


@app.post("/feed/start", response_model=FeedStatus)
def feed_start(body: FeedConfig, x_admin_token: str | None = Header(None)):
    """Start the simulated bank feed: `total` alerts over `duration_s`, with `ai_per_min` full pipeline runs."""
    _require_admin(x_admin_token)
    if body.total > settings.feed_max_total:
        raise HTTPException(422, f"total is capped at {settings.feed_max_total} (FEED_MAX_TOTAL)")
    try:
        get_feed().start(body, settings)
    except FeedBusy as e:
        raise HTTPException(409, str(e))
    return get_feed().status(settings)


@app.post("/feed/stop", response_model=FeedStatus)
def feed_stop(x_admin_token: str | None = Header(None)):
    _require_admin(x_admin_token)
    get_feed().stop()
    return get_feed().status(settings)


@app.get("/feed/status", response_model=FeedStatus)
def feed_status():
    """Read-only aggregates and recent events: IDs, amounts, lanes and reason codes. No free text."""
    return get_feed().status(settings)


@app.get("/demo/check")
def demo_check(x_admin_token: str | None = Header(None)) -> dict:
    """Validates the admin token for the console. Changes nothing."""
    _require_admin(x_admin_token)
    return {"ok": True}


@app.post("/demo/fault", response_model=FaultArmed | None)
def demo_fault(body: FaultConfig, x_admin_token: str | None = Header(None)):
    """Resilience drill: the next `count` MAIN-provider calls time out, get rate-limited or answer slowly.
    The failover then tries the backup, or fails closed to review. `mode: off` disarms."""
    _require_admin(x_admin_token)
    return _faults.arm(body)


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
    get_feed().stop()  # a running feed would write into the database being rebuilt
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
