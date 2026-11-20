"""The ONLY place a case is committed. Called by deterministic code, never exposed to an LLM.

The gate re-derives the high-value and watchlist facts from the database itself, so a wrong or forged `route`
argument cannot release a gated case.
"""

import sqlite3
from datetime import datetime, timezone

from backend.app import audit
from backend.app.schemas import ACTION_SEVERITY, Action, Approval, Resolution, Route
from backend.app.services.sanctions import check_sanctions_watchlist

OVERRIDE_MIN_REASON = 20


class ApprovalRequired(PermissionError):
    pass


class AlreadyResolved(RuntimeError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _next_id(conn: sqlite3.Connection, table: str, prefix: str) -> str:
    n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    return f"{prefix}-{n + 1:05d}"


def proposed_action(route: Route) -> Action:
    """What the system proposes for a route; deciding anything less strict is an override."""
    return {Route.PENDING_APPROVAL: "HOLD_AND_BLOCK", Route.NEEDS_REVIEW: "ESCALATE"}.get(route, "CLEAR")


def is_override(route: Route, decision: str, action: Action | None) -> bool:
    if decision == "REJECT":
        return True
    return decision == "APPROVE" and action is not None and \
        ACTION_SEVERITY[action] < ACTION_SEVERITY[proposed_action(route)]


def gated_facts(conn: sqlite3.Connection, alert_id: str, threshold: float) -> dict[str, bool]:
    """High-value and watchlist facts straight from the records, independent of any computed route."""
    txn = conn.execute("SELECT t.* FROM transactions t JOIN alerts a ON a.txn_id = t.record_id "
                       "WHERE a.record_id = ?", (alert_id,)).fetchone()
    if txn is None:
        raise LookupError(alert_id)
    cust = conn.execute("SELECT * FROM customers WHERE record_id = ?", (txn["customer_id"],)).fetchone()
    bands = [check_sanctions_watchlist(conn, txn["payee_name"] or "").band]
    if cust is not None:
        bands.append(check_sanctions_watchlist(conn, cust["name"], cust["name_ar"], cust["dob"],
                                               cust["nationality"]).band)
    high_value = not (txn["amount"] <= threshold) or txn["currency"] != "AED"
    return {"high_value": high_value, "watchlist_hit": "HIT" in bands, "watchlist_possible": "POSSIBLE" in bands}


def record_approval(conn: sqlite3.Connection, alert_id: str, actor: str, decision: str, reason: str,
                    role: str = "COMPLIANCE_OFFICER", action: Action | None = None,
                    override: bool = False) -> Approval:
    reason = reason.strip()
    if override and len(reason) < OVERRIDE_MIN_REASON:
        raise ValueError(f"an override needs a reason of at least {OVERRIDE_MIN_REASON} characters")
    approval = Approval(record_id=_next_id(conn, "approvals", "APR"), alert_id=alert_id, actor=actor, role=role,
                        decision=decision, action=action, override=override, reason=reason, ts=_now())
    conn.execute("INSERT INTO approvals (record_id, alert_id, actor, role, decision, action, override, reason, ts) "
                 "VALUES (?,?,?,?,?,?,?,?,?)",
                 (approval.record_id, alert_id, actor, role, decision, action, int(override), reason, approval.ts))
    audit.append(conn, alert_id, "DECISION", "HUMAN", {
        "approval_id": approval.record_id, "user": actor, "role": role, "decision": decision, "action": action,
        "override": override, "reason": reason})
    conn.commit()
    return approval


def latest_approval(conn: sqlite3.Connection, alert_id: str) -> Approval | None:
    row = conn.execute("SELECT * FROM approvals WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                       (alert_id,)).fetchone()
    return Approval(**{**dict(row), "override": bool(row["override"])}) if row else None


def approvals_for(conn: sqlite3.Connection, alert_id: str) -> list[Approval]:
    """Every human decision on the case, oldest first. Rejections and requests for more information stay on
    record next to the approval that finally committed the case."""
    rows = conn.execute("SELECT * FROM approvals WHERE alert_id = ? ORDER BY record_id", (alert_id,)).fetchall()
    return [Approval(**{**dict(r), "override": bool(r["override"])}) for r in rows]


def latest_resolution(conn: sqlite3.Connection, alert_id: str) -> Resolution | None:
    row = conn.execute("SELECT * FROM resolutions WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                       (alert_id,)).fetchone()
    return Resolution(**dict(row)) if row else None


def commit_case_resolution(conn: sqlite3.Connection, alert_id: str, route: Route, action: str,
                           threshold: float = 10_000.0) -> Resolution:
    """Every attempt is audited, including refusals."""
    try:
        resolution = _commit(conn, alert_id, route, action, threshold)
    except (ApprovalRequired, AlreadyResolved) as e:
        audit.append(conn, alert_id, "COMMIT_REFUSED", "CODE", {
            "route": route.value, "action": action, "refusal": type(e).__name__, "detail": str(e)})
        conn.commit()
        raise
    audit.append(conn, alert_id, "COMMIT", "CODE", {
        "resolution_id": resolution.record_id, "route": route.value, "action": action,
        "approval_id": resolution.approval_id})
    conn.commit()
    return resolution


def _commit(conn: sqlite3.Connection, alert_id: str, route: Route, action: str, threshold: float) -> Resolution:
    if latest_resolution(conn, alert_id) is not None:
        raise AlreadyResolved(f"{alert_id}: already resolved")
    facts = gated_facts(conn, alert_id, threshold)
    approval = latest_approval(conn, alert_id)
    approved = approval is not None and approval.decision == "APPROVE"
    by_officer = approved and approval.role == "COMPLIANCE_OFFICER"
    if approved and (approval.action or proposed_action(route)) != action:
        raise ApprovalRequired(f"{alert_id}: approval was for {approval.action or proposed_action(route)}, "
                               f"not {action}")
    if (route == Route.PENDING_APPROVAL or facts["high_value"] or facts["watchlist_hit"]) and not by_officer:
        raise ApprovalRequired(f"{alert_id}: high-value or watchlist case requires a recorded compliance officer "
                               f"approval")
    if action == "HOLD_AND_BLOCK" and not by_officer:
        raise ApprovalRequired(f"{alert_id}: blocking requires a recorded compliance officer approval")
    if (route == Route.NEEDS_REVIEW or facts["watchlist_possible"]) and not approved:
        raise ApprovalRequired(f"{alert_id}: case needs a recorded human decision before commit")
    resolution = Resolution(record_id=_next_id(conn, "resolutions", "RES"), alert_id=alert_id, action=action,
                            route=route, approval_id=approval.record_id if approved else None, ts=_now())
    conn.execute("INSERT INTO resolutions VALUES (?,?,?,?,?,?)",
                 (resolution.record_id, alert_id, action, route.value, resolution.approval_id, resolution.ts))
    return resolution
