"""Per-case pipeline: RECEIVED -> QUARANTINED -> EVIDENCE_GATHERED -> INVESTIGATOR -> POLICY_DECIDED -> GATE."""

import dataclasses
import sqlite3
import time
from typing import Literal

from pydantic import BaseModel

from backend.app import audit
from backend.app.agents.investigator import (EvidenceRecord, Investigator, InvestigatorInput, InvestigatorResult,
                                             PolicyFacts)
from backend.app.policy.engine import PolicyConfig, PolicyInput, decide
from backend.app.reports.builder import Report, build_report, identities, verify_findings
from backend.app.schemas import ActorType, KycDevicesResult, Resolution, Route, SanctionsResult, Velocity
from backend.app.security.classifier import Guard
from backend.app.security.quarantine import QuarantineResult, quarantine
from backend.app.services.case_resolution import commit_case_resolution, latest_approval
from backend.app.services.kyc_devices import RecordNotFound, fetch_customer_kyc_and_devices
from backend.app.services.sanctions import check_sanctions_watchlist
from backend.app.services.velocity import fetch_velocity

BAND_ORDER = {"CLEAR": 0, "POSSIBLE": 1, "HIT": 2}


class Step(BaseModel):
    key: str
    label: str
    actor: ActorType
    status: Literal["DONE", "FLAGGED", "DEGRADED", "SKIPPED", "WAITING", "FAILED"]
    duration_ms: int
    summary: str


class Evidence(BaseModel):
    kyc: KycDevicesResult | None
    sanctions_customer: SanctionsResult | None
    sanctions_payee: SanctionsResult | None
    velocity: Velocity | None
    complete: bool
    record_ids: list[str]


class ReasonOut(BaseModel):
    code: str
    route: Route
    detail: str


class DecisionOut(BaseModel):
    route: Route
    reasons: list[ReasonOut]
    threshold_aed: float


class CaseRun(BaseModel):
    alert_id: str
    txn_id: str
    steps: list[Step]
    quarantine: QuarantineResult
    evidence: Evidence
    investigator_input: InvestigatorInput
    investigator: InvestigatorResult
    code_route: Route
    decision: DecisionOut
    resolution: Resolution | None
    gate: Literal["AUTO_COMMITTED", "AWAITING_ANALYST", "AWAITING_APPROVAL", "ALREADY_RESOLVED"]
    total_ms: int
    report: Report | None = None


def _ms(t0: float) -> int:
    return round((time.perf_counter() - t0) * 1000)


def load_case(conn: sqlite3.Connection, alert_id: str) -> tuple[dict, dict]:
    alert = conn.execute("SELECT * FROM alerts WHERE record_id = ?", (alert_id,)).fetchone()
    if alert is None:
        raise RecordNotFound(alert_id)
    txn = conn.execute("SELECT * FROM transactions WHERE record_id = ?", (alert["txn_id"],)).fetchone()
    return dict(alert), dict(txn)


def free_text_fields(conn: sqlite3.Connection, txn: dict) -> dict[str, str | None]:
    device = conn.execute("SELECT label FROM devices WHERE record_id = ?", (txn["device_id"],)).fetchone()
    customer = conn.execute("SELECT kyc_note FROM customers WHERE record_id = ?", (txn["customer_id"],)).fetchone()
    return {"memo": txn["memo"], "payee_name": txn["payee_name"],
            "device_label": device["label"] if device else None, "kyc_note": customer["kyc_note"] if customer else None}


def _gather_evidence(conn: sqlite3.Connection, txn: dict) -> Evidence:
    kyc = sanc_c = sanc_p = vel = None
    complete = True
    try:
        kyc = fetch_customer_kyc_and_devices(conn, txn["customer_id"], txn["device_id"])
        c = kyc.customer
        sanc_c = check_sanctions_watchlist(conn, c.name, c.name_ar, c.dob, c.nationality)
    except Exception:
        complete = False
    try:
        sanc_p = check_sanctions_watchlist(conn, txn["payee_name"] or "")
    except Exception:
        complete = False
    try:
        vel = fetch_velocity(conn, txn["record_id"])
    except Exception:
        complete = False
    ids = [txn["record_id"]]
    for part in (kyc, sanc_c, sanc_p):
        if part is not None:
            ids += [i for i in part.record_ids if i not in ids]
    if vel is not None:
        ids.append(vel.record_id)
    return Evidence(kyc=kyc, sanctions_customer=sanc_c, sanctions_payee=sanc_p, velocity=vel, complete=complete,
                    record_ids=ids)


def evidence_records(txn: dict, ev: Evidence) -> list[EvidenceRecord]:
    """Typed view of the evidence for the investigator. Names, DOBs, labels and notes are deliberately absent."""
    recs = [EvidenceRecord(record_id=txn["record_id"], kind="TRANSACTION", facts={
        "amount": txn["amount"], "currency": txn["currency"], "channel": txn["channel"], "country": txn["country"],
        "payee_known": bool(txn["payee_known"]),
        "device_on_file": bool(ev.kyc and ev.kyc.txn_device is not None)})]
    if ev.kyc is not None:
        c = ev.kyc.customer
        recs.append(EvidenceRecord(record_id=c.record_id, kind="CUSTOMER", facts={
            "segment": c.segment, "kyc_status": c.kyc_status, "risk_rating": c.risk_rating,
            "nationality": c.nationality, "devices_on_file": len(ev.kyc.devices)}))
        if (d := ev.kyc.txn_device) is not None:
            recs.append(EvidenceRecord(record_id=d.record_id, kind="DEVICE", facts={
                "verified": d.verified, "first_seen": d.first_seen}))
    for subject, s in (("customer", ev.sanctions_customer), ("payee", ev.sanctions_payee)):
        for m in s.matches if s is not None else []:
            recs.append(EvidenceRecord(record_id=m.watchlist_id, kind="WATCHLIST_MATCH", facts={
                "subject": subject, "band": m.band, "matched_on": m.matched_on, "dob_match": m.dob_match,
                "nationality_match": m.nationality_match}))
    if ev.velocity is not None:
        v = ev.velocity
        recs.append(EvidenceRecord(record_id=v.record_id, kind="VELOCITY", facts={
            "txn_count_24h": v.txn_count_24h, "amount_24h": v.amount_24h, "new_payees_24h": v.new_payees_24h}))
    seen: set[str] = set()
    return [r for r in recs if not (r.record_id in seen or seen.add(r.record_id))]


def _investigator_step(r: InvestigatorResult) -> Step:
    tokens = f" · {r.usage.total_tokens} tok" if r.usage else ""
    cached = " (cached)" if r.cached else ""
    if r.failed:
        tried = " · " + ", ".join(f"{a.provider} {a.status}" for a in r.attempts) if len(r.attempts) > 1 else ""
        return Step(key="investigator", label="Investigator (receives MemoFacts only)", actor="LLM",
                    status="DEGRADED", duration_ms=r.duration_ms,
                    summary=f"{r.status} - fail closed to human review{tried}{tokens}{cached}")
    o = r.output
    via = f" · via {r.provider} ({r.model}) after main {r.attempts[0].status}" \
        if r.provider not in (None, "main") and r.attempts and r.attempts[0].provider == "main" else ""
    return Step(key="investigator", label="Investigator (receives MemoFacts only)", actor="LLM",
                status="FLAGGED" if r.status != "ok" or o.recommendation != "CLEAR" else "DONE",
                duration_ms=r.duration_ms,
                summary=f"recommends {o.recommendation} ({o.confidence:.2f}) · {len(o.findings)} cited findings"
                        + (f" · {len(r.invalid_citations)} uncited ID(s) rejected" if r.invalid_citations else "")
                        + via + tokens + cached)


def run_case(conn: sqlite3.Connection, alert_id: str, guard: Guard, threshold: float,
             investigator: Investigator) -> CaseRun:
    t_total = time.perf_counter()
    steps: list[Step] = []

    t0 = time.perf_counter()
    alert, txn = load_case(conn, alert_id)

    def add(step: Step, **facts) -> None:
        steps.append(step)
        audit.append(conn, alert_id, "STEP", step.actor, {"step": step.key, "status": step.status,
                                                          "summary": step.summary, "duration_ms": step.duration_ms,
                                                          **facts})

    add(Step(key="received", label="Alert received", actor="CODE", status="DONE", duration_ms=_ms(t0),
             summary=f"{alert['rule_id']} on {txn['record_id']} · {txn['amount']:,.2f} {txn['currency']}"),
        txn_id=txn["record_id"])

    q = quarantine(free_text_fields(conn, txn), guard)
    facts = q.memo_facts
    code_hits = [s for s in facts.injection_signals if s.layer == "CODE"]
    add(Step(key="quarantine_regex", label="Quarantine · deterministic filter", actor="CODE",
             status="FLAGGED" if code_hits else "DONE", duration_ms=q.duration_ms - q.classifier_ms,
             summary=f"{len(code_hits)} signal(s) across {len(facts.fields_scanned)} free-text fields"),
        signals=[f"{s.layer}:{s.field}:{s.code}" for s in code_hits], raw_hash=facts.raw_hash)
    add(Step(key="quarantine_classifier", label="Quarantine · injection classifier", actor="LLM",
             status={"INJECTION": "FLAGGED", "BENIGN": "DONE", "UNAVAILABLE": "DEGRADED"}[q.classifier_verdict],
             duration_ms=q.classifier_ms,
             summary=f"{q.classifier_verdict}" + "".join(
                 f" · SEGMENT_CAP_EXCEEDED on {v.field} ({v.segments_scanned}/{v.segments_total} segments scanned)"
                 for v in q.classifier if v.status == "segment_cap")
             + (" (cached)" if q.classifier and all(v.cached for v in q.classifier) else "")),
        segments={v.field: f"{v.segments_scanned}/{v.segments_total}" for v in q.classifier},
        segment_cap_exceeded=any(v.status == "segment_cap" for v in q.classifier))

    t0 = time.perf_counter()
    ev = _gather_evidence(conn, txn)
    bands = [s.band for s in (ev.sanctions_customer, ev.sanctions_payee) if s is not None]
    band = max(bands, key=BAND_ORDER.__getitem__) if bands else "CLEAR"
    add(Step(key="evidence", label="Evidence · KYC, devices, sanctions, velocity", actor="CODE",
             status="DONE" if ev.complete else "FAILED", duration_ms=_ms(t0),
             summary=f"{len(ev.record_ids)} records · watchlist {band}"),
        record_ids=ev.record_ids)

    vel = ev.velocity
    cfg = PolicyConfig(aed_block_threshold=threshold)
    code_input = PolicyInput(
        amount=txn["amount"], currency=txn["currency"], watchlist_band=band,
        device_known_and_verified=bool(ev.kyc and ev.kyc.device_known_and_verified),
        txn_count_24h=vel.txn_count_24h if vel else 0, amount_24h=vel.amount_24h if vel else float("inf"),
        new_payees_24h=vel.new_payees_24h if vel else 0, injection_detected=facts.injection_detected,
        classifier_degraded=facts.classifier_status != "ok", evidence_complete=ev.complete,
    )
    code_decision = decide(code_input, cfg)

    inv_input = InvestigatorInput(
        case_id=alert_id, memo_facts=facts, evidence=evidence_records(txn, ev),
        policy=PolicyFacts(threshold_aed=threshold, code_route=code_decision.route,
                           code_reasons=[r.code for r in code_decision.reasons if r.route != Route.AUTO_CLEAR],
                           classifier_status=facts.classifier_status, evidence_complete=ev.complete))
    inv = investigator.run(inv_input)
    add(_investigator_step(inv), investigator_status=inv.status, model=inv.model, provider=inv.provider,
        prompt_version=inv.prompt_version, cached=inv.cached,
        total_tokens=inv.usage.total_tokens if inv.usage else 0,
        attempts=[f"{a.provider} {a.status}" for a in inv.attempts],
        recommendation=inv.output.recommendation if inv.output else None,
        cited=sorted({i for f in inv.output.findings for i in f.record_ids}) if inv.output else [])

    t0 = time.perf_counter()
    llm_checks = [] if inv.failed else verify_findings(inv, inv_input.record_ids(), identities(conn, ev.kyc, txn))
    llm_rejected = sum(not c.accepted for c in llm_checks)
    verifier_passed = None if inv.failed else inv.status == "ok" and llm_rejected == 0
    add(Step(key="verifier", label="Citation verifier", actor="CODE",
             status="SKIPPED" if inv.failed else ("FLAGGED" if not verifier_passed else "DONE"),
             duration_ms=_ms(t0),
             summary="no findings to verify" if inv.failed else
             f"{len(llm_checks) - llm_rejected}/{len(llm_checks)} model sentences cited"
             + (f" · {llm_rejected} rejected" if llm_rejected else "")),
        verifier_passed=verifier_passed)

    t0 = time.perf_counter()
    decision = decide(dataclasses.replace(
        code_input,
        llm_recommendation=inv.output.recommendation if inv.output is not None and not inv.failed else None,
        investigator_failed=inv.failed,
        provider_failures=tuple(f"{a.provider} {a.status}" for a in inv.attempts) if inv.providers_exhausted else (),
        verifier_passed=verifier_passed,
    ), cfg)
    add(Step(key="policy", label="Policy engine (pure Python)", actor="CODE",
             status="FLAGGED" if decision.route != Route.AUTO_CLEAR else "DONE", duration_ms=_ms(t0),
             summary=f"{decision.route.value} · " + ", ".join(r.code for r in decision.reasons[:3])),
        route=decision.route.value, code_route=code_decision.route.value,
        reasons=[r.code for r in decision.reasons])

    existing = conn.execute("SELECT * FROM resolutions WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                            (alert_id,)).fetchone()
    resolution = None
    if existing is not None:
        resolution = Resolution(**dict(existing))
        gate = "ALREADY_RESOLVED"
    elif decision.route == Route.AUTO_CLEAR:
        resolution = commit_case_resolution(conn, alert_id, Route.AUTO_CLEAR, "CLEAR", threshold)
        gate = "AUTO_COMMITTED"
    elif decision.route == Route.PENDING_APPROVAL:
        gate = "AWAITING_APPROVAL"
    else:
        gate = "AWAITING_ANALYST"
    add(Step(key="gate", label="Human gate", actor="HUMAN" if gate.startswith("AWAITING") else "CODE",
             status="WAITING" if gate.startswith("AWAITING") else "DONE", duration_ms=0,
             summary={"AUTO_COMMITTED": "Auto-cleared and committed by code with reason codes",
                      "AWAITING_ANALYST": "Escalated to analyst review - funds NOT released",
                      "AWAITING_APPROVAL": "Held - compliance officer approval required before commit",
                      "ALREADY_RESOLVED": "Case already resolved"}[gate]),
        gate=gate, resolution_id=resolution.record_id if resolution else None)
    conn.commit()

    run = CaseRun(alert_id=alert_id, txn_id=txn["record_id"], steps=steps, quarantine=q, evidence=ev,
                  investigator_input=inv_input, investigator=inv, code_route=code_decision.route,
                  decision=DecisionOut(route=decision.route, threshold_aed=decision.threshold_aed,
                                       reasons=[ReasonOut(code=r.code, route=r.route, detail=r.detail)
                                                for r in decision.reasons]),
                  resolution=resolution, gate=gate, total_ms=0)
    run.report = build_report(conn, run, latest_approval(conn, alert_id), resolution, audit.latest_for(conn, alert_id))
    run.total_ms = _ms(t_total)
    return run
