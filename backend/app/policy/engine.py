"""Deterministic routing policy. PURE PYTHON: no LLM, HTTP or agent imports (enforced by test_policy.py).

Strictest route wins: PENDING_APPROVAL > NEEDS_REVIEW > AUTO_CLEAR.
An LLM recommendation can only raise the route, never lower it.
"""

import math
from dataclasses import dataclass, field
from typing import Literal

from backend.app.schemas import ROUTE_SEVERITY, Route


@dataclass(frozen=True)
class PolicyConfig:
    aed_block_threshold: float = 10_000.0
    max_txn_count_24h: int = 5
    max_new_payees_24h: int = 1
    max_amount_24h_multiple: float = 2.0


@dataclass(frozen=True)
class PolicyInput:
    amount: float
    currency: str
    watchlist_band: Literal["HIT", "POSSIBLE", "CLEAR"]
    device_known_and_verified: bool
    txn_count_24h: int
    amount_24h: float
    new_payees_24h: int
    injection_detected: bool
    classifier_degraded: bool
    evidence_complete: bool = True
    llm_recommendation: Literal["CLEAR", "REVIEW", "BLOCK"] | None = None
    investigator_failed: bool = False
    provider_failures: tuple[str, ...] = ()
    verifier_passed: bool | None = None


@dataclass(frozen=True)
class Reason:
    code: str
    route: Route
    detail: str


@dataclass(frozen=True)
class PolicyDecision:
    route: Route
    reasons: list[Reason] = field(default_factory=list)
    threshold_aed: float = 0.0


def decide(inp: PolicyInput, cfg: PolicyConfig = PolicyConfig()) -> PolicyDecision:
    t = cfg.aed_block_threshold
    esc: list[Reason] = []

    def escalate(code: str, route: Route, detail: str) -> None:
        esc.append(Reason(code, route, detail))

    if not math.isfinite(inp.amount) or inp.amount < 0:
        escalate("INVALID_AMOUNT", Route.NEEDS_REVIEW, "Amount is not a finite non-negative number")
    if inp.currency != "AED":
        escalate("NON_AED_CURRENCY", Route.NEEDS_REVIEW, f"Threshold is defined in AED, got {inp.currency}")
    if not (inp.amount <= t):
        escalate("AMOUNT_OVER_THRESHOLD", Route.PENDING_APPROVAL, f"{inp.amount:,.2f} AED > {t:,.0f} AED")
    if inp.watchlist_band == "HIT":
        escalate("WATCHLIST_HIT", Route.PENDING_APPROVAL, "Name match corroborated by date of birth")
    elif inp.watchlist_band == "POSSIBLE":
        escalate("WATCHLIST_POSSIBLE_MATCH", Route.NEEDS_REVIEW, "Name match without corroboration")
    if not inp.device_known_and_verified:
        escalate("DEVICE_UNVERIFIED", Route.NEEDS_REVIEW, "Transaction device is new or unverified")
    if (inp.txn_count_24h > cfg.max_txn_count_24h or inp.new_payees_24h > cfg.max_new_payees_24h
            or not (inp.amount_24h <= t * cfg.max_amount_24h_multiple)):
        escalate("VELOCITY_ABNORMAL", Route.NEEDS_REVIEW,
                 f"{inp.txn_count_24h} txns / {inp.new_payees_24h} new payees / {inp.amount_24h:,.0f} AED in 24h")
    if inp.injection_detected:
        escalate("INJECTION_SIGNAL", Route.NEEDS_REVIEW, "Quarantine flagged instruction-like free text")
    if inp.classifier_degraded:
        escalate("CLASSIFIER_UNAVAILABLE", Route.NEEDS_REVIEW, "Injection classifier did not return; fail closed")
    if not inp.evidence_complete:
        escalate("EVIDENCE_INCOMPLETE", Route.NEEDS_REVIEW, "An evidence service failed")
    if inp.investigator_failed and inp.provider_failures:
        escalate("ALL_PROVIDERS_FAILED", Route.NEEDS_REVIEW,
                 f"No model provider answered ({', '.join(inp.provider_failures)}); fail closed")
    elif inp.investigator_failed:
        escalate("INVESTIGATOR_FAILED", Route.NEEDS_REVIEW, "Investigator error or timeout; fail closed")
    if inp.verifier_passed is False:
        escalate("VERIFIER_REJECTED", Route.NEEDS_REVIEW, "Report contained uncited claims")
    if inp.llm_recommendation == "BLOCK":
        escalate("LLM_RECOMMENDS_BLOCK", Route.PENDING_APPROVAL, "Investigator recommends block; human must approve")
    elif inp.llm_recommendation == "REVIEW":
        escalate("LLM_RECOMMENDS_REVIEW", Route.NEEDS_REVIEW, "Investigator requests human review")

    if esc:
        route = max((r.route for r in esc), key=ROUTE_SEVERITY.__getitem__)
        return PolicyDecision(route=route, reasons=esc, threshold_aed=t)

    clear = [
        Reason("AMOUNT_WITHIN_THRESHOLD", Route.AUTO_CLEAR, f"{inp.amount:,.2f} AED <= {t:,.0f} AED"),
        Reason("WATCHLIST_CLEAR", Route.AUTO_CLEAR, "No watchlist match"),
        Reason("DEVICE_VERIFIED", Route.AUTO_CLEAR, "Known, verified device"),
        Reason("VELOCITY_NORMAL", Route.AUTO_CLEAR, "24h activity within limits"),
        Reason("NO_INJECTION_SIGNAL", Route.AUTO_CLEAR, "Quarantine and classifier both clean"),
    ]
    if inp.llm_recommendation == "CLEAR":
        clear.append(Reason("LLM_AGREES_CLEAR", Route.AUTO_CLEAR, "Investigator concurs"))
    return PolicyDecision(route=Route.AUTO_CLEAR, reasons=clear, threshold_aed=t)
