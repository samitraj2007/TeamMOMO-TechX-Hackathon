"""Per-case pipeline: RECEIVED -> QUARANTINED -> EVIDENCE_GATHERED -> (INVESTIGATOR, Phase 1) -> POLICY_DECIDED -> GATE."""

import sqlite3
import time
from typing import Literal

from pydantic import BaseModel

from backend.app.policy.engine import PolicyConfig, PolicyInput, decide
from backend.app.schemas import ActorType, KycDevicesResult, Resolution, Route, SanctionsResult, Velocity
from backend.app.security.classifier import Guard
from backend.app.security.quarantine import MemoFacts, QuarantineResult, quarantine
from backend.app.services.case_resolution import commit_case_resolution
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


class InvestigatorInput(BaseModel):
    """Exactly what the Phase 1 investigator will receive: typed facts and record IDs, never raw text."""
    memo_facts: MemoFacts
    amount_aed: float
    evidence_record_ids: list[str]
    watchlist_band: str
    device_known_and_verified: bool | None


class CaseRun(BaseModel):
    alert_id: str
    txn_id: str
    steps: list[Step]
    quarantine: QuarantineResult
    evidence: Evidence
    investigator_input: InvestigatorInput
    decision: DecisionOut
    resolution: Resolution | None
    gate: Literal["AUTO_COMMITTED", "AWAITING_ANALYST", "AWAITING_APPROVAL", "ALREADY_RESOLVED"]
    total_ms: int


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


def run_case(conn: sqlite3.Connection, alert_id: str, guard: Guard, threshold: float) -> CaseRun:
    t_total = time.perf_counter()
    steps: list[Step] = []

    t0 = time.perf_counter()
    alert, txn = load_case(conn, alert_id)
    steps.append(Step(key="received", label="Alert received", actor="CODE", status="DONE", duration_ms=_ms(t0),
                      summary=f"{alert['rule_id']} on {txn['record_id']} · {txn['amount']:,.2f} {txn['currency']}"))

    q = quarantine(free_text_fields(conn, txn), guard)
    facts = q.memo_facts
    code_hits = [s for s in facts.injection_signals if s.layer == "CODE"]
    steps.append(Step(key="quarantine_regex", label="Quarantine · deterministic filter", actor="CODE",
                      status="FLAGGED" if code_hits else "DONE", duration_ms=q.duration_ms - q.classifier_ms,
                      summary=f"{len(code_hits)} signal(s) across {len(facts.fields_scanned)} free-text fields"))
    steps.append(Step(key="quarantine_classifier", label="Quarantine · injection classifier", actor="LLM",
                      status={"INJECTION": "FLAGGED", "BENIGN": "DONE", "UNAVAILABLE": "DEGRADED"}[q.classifier_verdict],
                      duration_ms=q.classifier_ms,
                      summary=f"{q.classifier_verdict}" + (" (cached)" if q.classifier and all(v.cached for v in q.classifier) else "")))

    t0 = time.perf_counter()
    ev = _gather_evidence(conn, txn)
    bands = [s.band for s in (ev.sanctions_customer, ev.sanctions_payee) if s is not None]
    band = max(bands, key=BAND_ORDER.__getitem__) if bands else "CLEAR"
    steps.append(Step(key="evidence", label="Evidence · KYC, devices, sanctions, velocity", actor="CODE",
                      status="DONE" if ev.complete else "FAILED", duration_ms=_ms(t0),
                      summary=f"{len(ev.record_ids)} records · watchlist {band}"))

    inv_input = InvestigatorInput(memo_facts=facts, amount_aed=txn["amount"], evidence_record_ids=ev.record_ids,
                                  watchlist_band=band,
                                  device_known_and_verified=ev.kyc.device_known_and_verified if ev.kyc else None)
    steps.append(Step(key="investigator", label="Investigator (receives MemoFacts only)", actor="LLM",
                      status="SKIPPED", duration_ms=0, summary="Phase 1: bounded tool loop + cited report"))

    t0 = time.perf_counter()
    vel = ev.velocity
    decision = decide(PolicyInput(
        amount=txn["amount"], currency=txn["currency"], watchlist_band=band,
        device_known_and_verified=bool(ev.kyc and ev.kyc.device_known_and_verified),
        txn_count_24h=vel.txn_count_24h if vel else 0, amount_24h=vel.amount_24h if vel else float("inf"),
        new_payees_24h=vel.new_payees_24h if vel else 0, injection_detected=facts.injection_detected,
        classifier_degraded=facts.classifier_status != "ok", evidence_complete=ev.complete,
    ), PolicyConfig(aed_block_threshold=threshold))
    steps.append(Step(key="policy", label="Policy engine (pure Python)", actor="CODE",
                      status="FLAGGED" if decision.route != Route.AUTO_CLEAR else "DONE", duration_ms=_ms(t0),
                      summary=f"{decision.route.value} · " + ", ".join(r.code for r in decision.reasons[:3])))

    existing = conn.execute("SELECT * FROM resolutions WHERE alert_id = ? ORDER BY record_id DESC LIMIT 1",
                            (alert_id,)).fetchone()
    resolution = None
    if existing is not None:
        resolution = Resolution(**dict(existing))
        gate = "ALREADY_RESOLVED"
    elif decision.route == Route.AUTO_CLEAR:
        resolution = commit_case_resolution(conn, alert_id, Route.AUTO_CLEAR, "CLEAR")
        gate = "AUTO_COMMITTED"
    elif decision.route == Route.PENDING_APPROVAL:
        gate = "AWAITING_APPROVAL"
    else:
        gate = "AWAITING_ANALYST"
    steps.append(Step(key="gate", label="Human gate", actor="HUMAN" if gate.startswith("AWAITING") else "CODE",
                      status="WAITING" if gate.startswith("AWAITING") else "DONE", duration_ms=0,
                      summary={"AUTO_COMMITTED": "Auto-cleared and committed by code with reason codes",
                               "AWAITING_ANALYST": "Escalated to analyst review - funds NOT released",
                               "AWAITING_APPROVAL": "Held - compliance officer approval required before commit",
                               "ALREADY_RESOLVED": "Case already resolved"}[gate]))

    return CaseRun(alert_id=alert_id, txn_id=txn["record_id"], steps=steps, quarantine=q, evidence=ev,
                   investigator_input=inv_input,
                   decision=DecisionOut(route=decision.route, threshold_aed=decision.threshold_aed,
                                        reasons=[ReasonOut(code=r.code, route=r.route, detail=r.detail)
                                                 for r in decision.reasons]),
                   resolution=resolution, gate=gate, total_ms=_ms(t_total))
