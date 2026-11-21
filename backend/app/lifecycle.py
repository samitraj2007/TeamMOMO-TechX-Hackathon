"""Case lifecycle (CODE): where a case stands and who may act next.

Read-only and derived from the run, approvals, resolutions and the audit log. The UI shows this instead of re-deriving
the rules; the decision and filing endpoints still enforce them independently.

    investigated -> analyst_review -> officer_approval -> filed
"""

import sqlite3
from typing import Literal

from pydantic import BaseModel

from backend.app import audit
from backend.app.schemas import Approval, Route
from backend.app.services.case_resolution import approvals_for, escalated_by, gated_facts, latest_resolution
from backend.app.services.filing import existing_filing

Who = Literal["ANALYST", "COMPLIANCE_OFFICER", "CODE"]
State = Literal["done", "current", "upcoming", "skipped", "not_needed"]
OFFICER = "COMPLIANCE_OFFICER"


class Step(BaseModel):
    id: Literal["investigated", "analyst_review", "officer_approval", "filed"]
    label: str
    state: State
    who_can_act: Who | None = None
    note: str | None = None
    by: str | None = None
    ts: str | None = None
    record_id: str | None = None


class Lifecycle(BaseModel):
    alert_id: str
    route: Route | None
    officer_required: bool
    escalated_by: list[str]
    next_action_role: Who | None
    steps: list[Step]


def recorded_route(conn: sqlite3.Connection, alert_id: str) -> Route | None:
    """The route code recorded for this case, for cases whose run snapshot was never stored (decided before runs
    were saved). Latest policy step in the audit log, else the latest resolution. Read-only."""
    row = conn.execute("SELECT json_extract(payload, '$.route') AS route FROM audit_log WHERE alert_id = ? "
                       "AND kind = 'STEP' AND json_extract(payload, '$.step') = 'policy' ORDER BY seq DESC LIMIT 1",
                       (alert_id,)).fetchone()
    if row is None or row["route"] is None:
        row = conn.execute("SELECT route FROM resolutions WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                           (alert_id,)).fetchone()
    try:
        return Route(row["route"]) if row and row["route"] else None
    except ValueError:
        return None


def _who(a: Approval) -> str:
    return f"{a.actor} ({'compliance officer' if a.role == OFFICER else 'analyst'})"


def lifecycle(conn: sqlite3.Connection, alert_id: str, route: Route | None, threshold: float,
              run_stored: bool = True) -> Lifecycle:
    decisions = approvals_for(conn, alert_id)
    escalations = [d for d in decisions if d.decision == "ESCALATE"]
    escalators = escalated_by(conn, alert_id)
    resolution = latest_resolution(conn, alert_id)
    filing = existing_filing(conn, alert_id)
    facts = gated_facts(conn, alert_id, threshold)
    policy = next((e for e in reversed(audit.entries_for(conn, alert_id))
                   if e.kind == "STEP" and e.payload.get("step") == "policy"), None)
    gated = route == Route.PENDING_APPROVAL or facts["high_value"] or facts["watchlist_hit"]
    officer_required = route is not None and route != Route.AUTO_CLEAR and (gated or bool(escalators))
    officer_approve = next((d for d in reversed(decisions) if d.decision == "APPROVE" and d.role == OFFICER), None)
    last = next((d for d in reversed(decisions) if d.decision != "ESCALATE"), None)

    steps: list[Step] = []
    if route is None:
        steps.append(Step(id="investigated", label="Investigated", state="current", who_can_act="ANALYST",
                          note="Run the investigation. Code routes the case; the model only advises."))
    else:
        steps.append(Step(id="investigated", label="Investigated", state="done", by="code (policy engine)",
                          note=f"Routed {route.value.replace('_', ' ').lower()}" + ("" if run_stored else
                               ". Run snapshot not stored (case ran before runs were saved); run again to rebuild "
                               "the report"),
                          ts=policy.ts if policy else None, record_id=policy.record_id if policy else None))

    # Analyst review
    if route is None:
        steps.append(Step(id="analyst_review", label="Analyst review", state="upcoming", who_can_act="ANALYST"))
    elif route == Route.AUTO_CLEAR:
        steps.append(Step(id="analyst_review", label="Analyst review", state="not_needed",
                          note="Auto-cleared by code: small, verified and low risk"))
    elif gated and not escalations:
        steps.append(Step(id="analyst_review", label="Analyst review", state="skipped",
                          note="High value, watchlist or officer route: goes straight to a compliance officer"))
    elif escalations:
        e = escalations[0]
        steps.append(Step(id="analyst_review", label="Analyst review", state="done", by=_who(e), ts=e.ts,
                          record_id=e.record_id, note="Escalated to a compliance officer"))
    elif resolution is not None and last is not None:
        steps.append(Step(id="analyst_review", label="Analyst review", state="done", by=_who(last), ts=last.ts,
                          record_id=last.record_id, note=f"{last.decision.lower()} · committed {resolution.action}"))
    else:
        note = "Clear the case, or escalate it to a compliance officer"
        if last is not None:
            note = f"{last.decision.replace('_', ' ').lower()} by {last.actor}; still open. " + note
        steps.append(Step(id="analyst_review", label="Analyst review", state="current", who_can_act="ANALYST",
                          note=note, record_id=last.record_id if last else None))

    # Officer approval
    if route is None:
        steps.append(Step(id="officer_approval", label="Officer approval", state="upcoming"))
    elif not officer_required:
        state: State = "not_needed" if (route == Route.AUTO_CLEAR or resolution is not None) else "upcoming"
        steps.append(Step(id="officer_approval", label="Officer approval", state=state,
                          note="Only if the analyst escalates" if state == "upcoming" else "Not needed for this case"))
    elif resolution is not None and officer_approve is not None:
        steps.append(Step(id="officer_approval", label="Officer approval", state="done", by=_who(officer_approve),
                          ts=officer_approve.ts, record_id=officer_approve.record_id,
                          note=f"Approved {officer_approve.action or resolution.action}"))
    else:
        note = "A compliance officer approves the action or rejects it, with a written reason"
        if escalators:
            note += f". Four-eyes: not {', '.join(sorted(escalators))}"
        if last is not None and last.decision != "APPROVE":
            note = f"{last.decision.replace('_', ' ').lower()} by {last.actor}; still open. " + note
        steps.append(Step(id="officer_approval", label="Officer approval", state="current", who_can_act=OFFICER,
                          note=note))

    # Filing
    if filing is not None:
        steps.append(Step(id="filed", label="Report filed", state="done", by=f"{filing.payload.get('filed_by')} "
                          "(compliance officer)", ts=filing.ts, record_id=filing.record_id,
                          note="Submitted to the regulator (simulated); report hash in the audit log"))
    elif officer_approve is not None and resolution is not None:
        steps.append(Step(id="filed", label="Report filed", state="current", who_can_act=OFFICER,
                          note="A compliance officer submits the SAR to the regulator (simulated)"))
    elif route is not None and not officer_required and (route == Route.AUTO_CLEAR or resolution is not None):
        steps.append(Step(id="filed", label="Report filed", state="not_needed",
                          note="No officer approval, so no regulatory report"))
    else:
        steps.append(Step(id="filed", label="Report filed", state="upcoming",
                          note="Opens after a compliance officer approves"))

    current = next((s for s in steps if s.state == "current"), None)
    return Lifecycle(alert_id=alert_id, route=route, officer_required=officer_required,
                     escalated_by=sorted(escalators), next_action_role=current.who_can_act if current else None,
                     steps=steps)
