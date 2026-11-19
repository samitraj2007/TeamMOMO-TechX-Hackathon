"""The ONLY place a case is committed. Called by deterministic code, never exposed to an LLM."""

import sqlite3
from datetime import datetime, timezone

from backend.app.schemas import Approval, Resolution, Route


class ApprovalRequired(PermissionError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _next_id(conn: sqlite3.Connection, table: str, prefix: str) -> str:
    n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    return f"{prefix}-{n + 1:05d}"


def record_approval(conn: sqlite3.Connection, alert_id: str, actor: str, decision: str, reason: str) -> Approval:
    approval = Approval(record_id=_next_id(conn, "approvals", "APR"), alert_id=alert_id, actor=actor,
                        role="COMPLIANCE_OFFICER", decision=decision, reason=reason.strip(), ts=_now())
    conn.execute("INSERT INTO approvals VALUES (?,?,?,?,?,?,?)", tuple(approval.model_dump().values()))
    conn.commit()
    return approval


def latest_approval(conn: sqlite3.Connection, alert_id: str) -> Approval | None:
    row = conn.execute("SELECT * FROM approvals WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                       (alert_id,)).fetchone()
    return Approval(**dict(row)) if row else None


def commit_case_resolution(conn: sqlite3.Connection, alert_id: str, route: Route, action: str) -> Resolution:
    approval = latest_approval(conn, alert_id)
    approved = approval is not None and approval.decision == "APPROVE"
    if route == Route.PENDING_APPROVAL and not approved:
        raise ApprovalRequired(f"{alert_id}: PENDING_APPROVAL requires a recorded officer approval")
    if action == "HOLD_AND_BLOCK" and not approved:
        raise ApprovalRequired(f"{alert_id}: blocking requires a recorded officer approval")
    if route == Route.NEEDS_REVIEW and action == "CLEAR" and approval is None:
        raise ApprovalRequired(f"{alert_id}: NEEDS_REVIEW cannot be cleared without a human decision")
    resolution = Resolution(record_id=_next_id(conn, "resolutions", "RES"), alert_id=alert_id, action=action,
                            route=route, approval_id=approval.record_id if approval else None, ts=_now())
    conn.execute("INSERT INTO resolutions VALUES (?,?,?,?,?,?)",
                 (resolution.record_id, alert_id, action, route.value, resolution.approval_id, resolution.ts))
    conn.commit()
    return resolution
