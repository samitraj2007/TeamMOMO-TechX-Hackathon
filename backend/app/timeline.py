"""Case timeline (CODE): the audit entries for one case as ordered steps.

Each step is rebuilt from an allow-list of typed payload keys. The only strings carried over are IDs, enums and the
pipeline's own code-generated step summaries. Memos, names, device labels, KYC notes, model notes and the text of
human reasons never appear (a human reason is shown as its length only).
"""

from typing import Literal

from pydantic import BaseModel

from backend.app.audit import AuditEntry, Kind

ActorType = Literal["CODE", "LLM", "HUMAN"]
ACTOR_TYPES: dict[str, ActorType] = {"CODE": "CODE", "API": "CODE", "LLM": "LLM", "HUMAN": "HUMAN"}


class TimelineCall(BaseModel):
    name: str
    target: str | None
    record_ids: list[str]
    duration_ms: float
    ok: bool


class TimelineStep(BaseModel):
    seq: int
    audit_id: str
    ts: str
    run: int
    kind: Kind
    step: str
    actor_type: ActorType
    status: str
    summary: str
    duration_ms: float | None
    record_ids: list[str]
    service_calls: list[TimelineCall]
    hash: str


class CaseTimeline(BaseModel):
    alert_id: str
    steps: list[TimelineStep]


def _ids(*values) -> list[str]:
    out: list[str] = []
    for v in values:
        for i in (v if isinstance(v, list) else [v]):
            if isinstance(i, str) and i and i not in out:
                out.append(i)
    return out


def _calls(p: dict) -> list[TimelineCall]:
    return [TimelineCall(name=str(c["name"]), target=c.get("target"), record_ids=_ids(c.get("record_ids", [])),
                         duration_ms=float(c.get("duration_ms", 0)), ok=bool(c.get("ok")))
            for c in p.get("service_calls", [])]


def _step(e: AuditEntry, run: int) -> TimelineStep:
    p = e.payload
    calls: list[TimelineCall] = []
    duration: float | None = None
    if e.kind == "STEP":
        calls, duration, name, status = _calls(p), p.get("duration_ms"), p["step"], p["status"]
        summary = p["summary"]
        ids = _ids(p.get("txn_id"), p.get("record_ids", []), p.get("cited", []), p.get("resolution_id"),
                   *[c.record_ids for c in calls])
    elif e.kind == "INGEST":
        name, status = "ingest", "DONE"
        summary = f"Ingested {p['txn_id']} · {p['amount']:,.2f} {p['currency']} via {p['channel']}"
        ids = _ids(p["txn_id"], p.get("velocity_id"), p.get("customer_id"), p.get("device_id"))
    elif e.kind == "MANUAL_RUN":
        name, status = "manual_run", "DONE"
        summary = f"Manual pipeline run on {p['txn_id']} (not alerted by rules)"
        ids = _ids(p["txn_id"])
    elif e.kind == "DECISION":
        name, status = "decision", p["decision"]
        summary = f"{p['role']} {p['user']} {p['decision']}" + (f" {p['action']}" if p.get("action") else "") \
            + (" · override" if p.get("override") else "") + f" · reason recorded ({len(p.get('reason', ''))} chars)"
        ids = _ids(p.get("approval_id"))
    elif e.kind == "DECISION_REFUSED":
        name, status = "decision", "REFUSED"
        summary = f"{p['role']} {p['user']} {p['decision']} refused · {p['refusal']}"
        ids = []
    elif e.kind == "COMMIT":
        name, status = "commit", "DONE"
        summary = f"Committed {p['action']} on route {p['route']}"
        ids = _ids(p.get("resolution_id"), p.get("approval_id"))
    elif e.kind == "COMMIT_REFUSED":
        name, status = "commit", "REFUSED"
        summary = f"Commit {p['action']} on route {p['route']} refused · {p['refusal']}"
        ids = []
    elif e.kind == "FILING":
        name, status = "filing", p["status"]
        summary = f"Report filed by {p['role']} {p['filed_by']} · sha256 {p['report_sha256'][:12]}"
        ids = _ids(p.get("approval_id"), p.get("resolution_id"), p.get("cited_record_ids", []))
    else:  # FILING_REFUSED
        name, status = "filing", "REFUSED"
        summary = f"Filing by {p['role']} {p['filed_by']} refused · {p['refusal']}"
        ids = []
    return TimelineStep(seq=e.seq, audit_id=e.record_id, ts=e.ts, run=run, kind=e.kind, step=name,
                        actor_type=ACTOR_TYPES.get(e.actor, "CODE"), status=str(status), summary=summary,
                        duration_ms=duration, record_ids=ids, service_calls=calls, hash=e.hash)


def build_timeline(alert_id: str, entries: list[AuditEntry]) -> CaseTimeline:
    steps, run = [], 0
    for e in sorted(entries, key=lambda x: x.seq):
        if e.kind == "STEP" and e.payload.get("step") == "received":
            run += 1
        steps.append(_step(e, run))
    return CaseTimeline(alert_id=alert_id, steps=steps)
