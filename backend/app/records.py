"""Case records, storage facts and notifications (CODE).

All three read the same database the pipeline writes: alerts and transactions, stored runs, approvals,
resolutions and the append-only audit log. Nothing here writes. Notification titles are built by code from IDs and
enums only, never from memo, payee or reason text.
"""

import json
import os
import sqlite3
from pathlib import Path
from typing import Literal

from pydantic import BaseModel

from backend.app.db import SCHEMA_VERSION

Origin = Literal["demo", "api", "feed", "drill", "manual", "dataset"]
Status = Literal["not_routed", "open", "resolved", "filed"]
ROUTES = ("AUTO_CLEAR", "NEEDS_REVIEW", "PENDING_APPROVAL")
SOURCE_ORIGIN = {"bank-feed-sim": "feed", "drill": "drill", "api": "api"}


class CaseRecord(BaseModel):
    alert_id: str
    txn_id: str
    origin: Origin
    demo_tag: str | None
    rule_id: str
    amount: float
    currency: str
    customer_id: str
    raised_at: str | None
    route: str | None
    status: Status
    has_run: bool
    audit_entries: int
    last_activity: str | None
    decided_by: str | None
    filed: bool


class CaseSearch(BaseModel):
    total: int
    counts: dict[str, int]
    items: list[CaseRecord]


_BASE = """
SELECT a.record_id AS alert_id, a.txn_id, a.rule_id, a.raised_at, t.amount, t.currency, t.customer_id, t.demo_tag,
  (SELECT json_extract(l.payload, '$.source') FROM audit_log l WHERE l.alert_id = a.record_id AND l.kind = 'INGEST'
     ORDER BY l.seq LIMIT 1) AS src,
  (SELECT COUNT(*) FROM audit_log l WHERE l.alert_id = a.record_id) AS entries,
  (SELECT MAX(l.ts) FROM audit_log l WHERE l.alert_id = a.record_id) AS last_activity,
  (SELECT json_extract(l.payload, '$.route') FROM audit_log l WHERE l.alert_id = a.record_id AND l.kind = 'STEP'
     AND json_extract(l.payload, '$.route') IS NOT NULL ORDER BY l.seq DESC LIMIT 1) AS step_route,
  (SELECT json_extract(l.payload, '$.summary') FROM audit_log l WHERE l.alert_id = a.record_id AND l.kind = 'STEP'
     AND json_extract(l.payload, '$.step') = 'screen' AND json_extract(l.payload, '$.lane') != 'ai'
     ORDER BY l.seq DESC LIMIT 1) AS screen_summary,
  (SELECT p.actor || ' (' || lower(replace(p.role, '_', ' ')) || ', ' || lower(p.decision) || ')' FROM approvals p WHERE p.alert_id = a.record_id
     ORDER BY p.record_id DESC LIMIT 1) AS decided_by,
  EXISTS(SELECT 1 FROM audit_log l WHERE l.alert_id = a.record_id AND l.kind = 'FILING') AS filed,
  EXISTS(SELECT 1 FROM resolutions r WHERE r.alert_id = a.record_id) AS resolved,
  cr.route AS run_route
FROM alerts a JOIN transactions t ON t.record_id = a.txn_id LEFT JOIN case_runs cr ON cr.alert_id = a.record_id
"""


def _record(r: sqlite3.Row) -> CaseRecord:
    origin: Origin = ("demo" if r["demo_tag"] else SOURCE_ORIGIN.get(r["src"] or "", "api") if r["src"]
                      else "manual" if r["rule_id"] == "MANUAL-RUN" else "dataset")
    route = r["run_route"] or r["step_route"]
    if route is None and r["screen_summary"]:  # screens recorded before the route key was added to the payload
        word = r["screen_summary"].removeprefix("Code screen: ").split(" ")[0]
        route = word if word in ROUTES else None
    status: Status = ("filed" if r["filed"] else "resolved" if r["resolved"] else "open" if route else "not_routed")
    return CaseRecord(alert_id=r["alert_id"], txn_id=r["txn_id"], origin=origin, demo_tag=r["demo_tag"],
                      rule_id=r["rule_id"], amount=r["amount"], currency=r["currency"], customer_id=r["customer_id"],
                      raised_at=r["raised_at"], route=route, status=status, has_run=r["run_route"] is not None,
                      audit_entries=r["entries"], last_activity=r["last_activity"], decided_by=r["decided_by"],
                      filed=bool(r["filed"]))


def all_records(conn: sqlite3.Connection) -> list[CaseRecord]:
    return [_record(r) for r in conn.execute(_BASE)]


def search(conn: sqlite3.Connection, q: str | None, origin: str | None, route: str | None, status: str | None,
           since: str | None, until: str | None, limit: int, offset: int) -> CaseSearch:
    rows = all_records(conn)
    if q:
        needle = q.strip().upper()
        rows = [r for r in rows if needle in r.alert_id or needle in r.txn_id or needle in r.customer_id.upper()]
    if since:
        rows = [r for r in rows if (r.last_activity or r.raised_at or "") >= since]
    if until:
        rows = [r for r in rows if (r.last_activity or r.raised_at or "") <= until]
    counts: dict[str, int] = {}
    for r in rows:
        counts[r.origin] = counts.get(r.origin, 0) + 1
    if origin:
        wanted = set(origin.split(","))
        rows = [r for r in rows if r.origin in wanted]
    if route:
        rows = [r for r in rows if r.route == route]
    if status:
        rows = [r for r in rows if r.status == status]
    rows.sort(key=lambda r: (r.last_activity is not None, r.last_activity or "", r.alert_id), reverse=True)
    return CaseSearch(total=len(rows), counts=counts, items=rows[offset: offset + limit])


class Storage(BaseModel):
    database: str
    bytes: int
    schema_version: int
    tables: dict[str, int]
    note: str


def storage(conn: sqlite3.Connection, db_file: Path) -> Storage:
    try:
        shown = os.path.relpath(db_file)
    except ValueError:  # another drive on Windows
        shown = db_file.name
    tables = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("transactions", "alerts", "case_runs", "approvals", "resolutions", "audit_log")}
    return Storage(database=shown, bytes=db_file.stat().st_size if db_file.exists() else 0,
                   schema_version=SCHEMA_VERSION, tables=tables,
                   note="One SQLite file holds the bank records, every case (demo, feed, drill and your own), "
                        "stored investigation runs, human decisions and the append-only, hash-chained audit log. "
                        "A demo reset rebuilds it; production would use a managed database with backups and "
                        "retention rules.")


# ---- notifications ----

Severity = Literal["high", "warn", "info"]


class Notification(BaseModel):
    seq: int
    record_id: str
    ts: str
    alert_id: str | None
    type: Literal["approval_needed", "failed_closed", "decision", "filed", "refused"]
    severity: Severity
    title: str


class Notifications(BaseModel):
    head_seq: int
    events: list[Notification]


def _notification(seq: int, record_id: str, ts: str, alert_id: str | None, kind: str, p: dict) -> Notification | None:
    case = alert_id or "a case"

    def n(type_, severity, title) -> Notification:
        return Notification(seq=seq, record_id=record_id, ts=ts, alert_id=alert_id, type=type_, severity=severity,
                            title=title)

    if kind == "STEP" and p.get("step") == "policy":
        reasons = [str(x) for x in p.get("reasons", [])]
        if "ALL_PROVIDERS_FAILED" in reasons:
            return n("failed_closed", "high", f"{case} failed closed: no model answered, sent to human review")
        if p.get("route") == "PENDING_APPROVAL":
            return n("approval_needed", "high", f"{case} needs compliance officer approval")
        return None
    if kind == "DECISION" and p.get("decision") == "ESCALATE":
        return n("approval_needed", "high", f"{case} escalated to a compliance officer by {p.get('user', 'unknown')}")
    if kind == "DECISION_REFUSED":
        return n("refused", "warn", f"{case}: decision refused by code ({p.get('refusal', 'not allowed')})")
    if kind == "DECISION":
        decision = str(p.get("decision", "")).replace("_", " ").lower()
        return n("decision", "info", f"{case}: {decision} by {p.get('user', 'unknown')} ({str(p.get('role', '')).lower()})")
    if kind == "FILING":
        return n("filed", "info", f"{case}: SAR draft filed by {p.get('filed_by', 'unknown')}")
    if kind in ("FILING_REFUSED", "COMMIT_REFUSED"):
        what = "Filing" if kind == "FILING_REFUSED" else "Commit"
        return n("refused", "warn", f"{case}: {what.lower()} refused by code ({p.get('refusal', 'approval required')})")
    return None


def notifications(conn: sqlite3.Connection, after: int, limit: int) -> Notifications:
    head = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM audit_log").fetchone()[0]
    rows = conn.execute(
        "SELECT seq, record_id, ts, alert_id, kind, payload FROM audit_log WHERE seq > ? AND (kind IN "
        "('DECISION','DECISION_REFUSED','FILING','FILING_REFUSED','COMMIT_REFUSED') OR (kind = 'STEP' AND "
        "json_extract(payload, '$.step') = 'policy')) ORDER BY seq DESC LIMIT ?", (after, limit * 4)).fetchall()
    events = [e for r in rows if (e := _notification(r["seq"], r["record_id"], r["ts"], r["alert_id"], r["kind"],
                                                     json.loads(r["payload"]))) is not None]
    return Notifications(head_seq=head, events=events[:limit])
