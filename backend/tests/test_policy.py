import ast
from dataclasses import replace
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

import backend.app.policy.engine as engine_module
from backend.app.policy.engine import PolicyConfig, PolicyInput, decide
from backend.app.schemas import ROUTE_SEVERITY, Route

CLEAN = PolicyInput(amount=850.0, currency="AED", watchlist_band="CLEAR", device_known_and_verified=True,
                    txn_count_24h=1, amount_24h=850.0, new_payees_24h=0, injection_detected=False,
                    classifier_degraded=False)

inputs = st.builds(
    PolicyInput,
    amount=st.one_of(st.floats(allow_nan=True, allow_infinity=True), st.floats(0, 50_000),
                     st.sampled_from([10_000.0, 10_000.01, 9_999.99])),
    currency=st.sampled_from(["AED", "AED", "USD"]),
    watchlist_band=st.sampled_from(["HIT", "POSSIBLE", "CLEAR"]),
    device_known_and_verified=st.booleans(),
    txn_count_24h=st.integers(0, 20),
    amount_24h=st.floats(0, 100_000),
    new_payees_24h=st.integers(0, 5),
    injection_detected=st.booleans(),
    classifier_degraded=st.booleans(),
    evidence_complete=st.booleans(),
    llm_recommendation=st.sampled_from([None, "CLEAR", "REVIEW", "BLOCK"]),
    investigator_failed=st.booleans(),
    verifier_passed=st.sampled_from([None, True, False]),
)


def route(**kw):
    return decide(replace(CLEAN, **kw)).route


def codes(**kw):
    return {r.code for r in decide(replace(CLEAN, **kw)).reasons}


# ---- examples ----

def test_clean_case_auto_clears_with_reasons():
    d = decide(CLEAN)
    assert d.route == Route.AUTO_CLEAR
    assert {"AMOUNT_WITHIN_THRESHOLD", "WATCHLIST_CLEAR", "NO_INJECTION_SIGNAL"} <= {r.code for r in d.reasons}


def test_exactly_at_threshold_is_not_over():
    assert route(amount=10_000.0, amount_24h=10_000.0) == Route.AUTO_CLEAR


def test_one_fil_over_threshold_needs_approval():
    assert route(amount=10_000.01, amount_24h=10_000.01) == Route.PENDING_APPROVAL


def test_threshold_comes_from_config():
    assert decide(replace(CLEAN, amount=6_000.0, amount_24h=6_000.0),
                  PolicyConfig(aed_block_threshold=5_000.0)).route == Route.PENDING_APPROVAL


def test_watchlist_hit_needs_approval_even_when_small():
    assert route(watchlist_band="HIT", amount=10.0) == Route.PENDING_APPROVAL


def test_possible_match_needs_review():
    assert route(watchlist_band="POSSIBLE") == Route.NEEDS_REVIEW


def test_injection_escalates():
    assert route(injection_detected=True) == Route.NEEDS_REVIEW
    assert "INJECTION_SIGNAL" in codes(injection_detected=True)


def test_injection_on_high_value_goes_to_strictest_route():
    d = decide(replace(CLEAN, injection_detected=True, amount=48_000.0, amount_24h=48_000.0))
    assert d.route == Route.PENDING_APPROVAL
    assert {"INJECTION_SIGNAL", "AMOUNT_OVER_THRESHOLD"} <= {r.code for r in d.reasons}


@pytest.mark.parametrize("kw,code", [
    ({"classifier_degraded": True}, "CLASSIFIER_UNAVAILABLE"),
    ({"evidence_complete": False}, "EVIDENCE_INCOMPLETE"),
    ({"investigator_failed": True}, "INVESTIGATOR_FAILED"),
    ({"verifier_passed": False}, "VERIFIER_REJECTED"),
    ({"device_known_and_verified": False}, "DEVICE_UNVERIFIED"),
    ({"txn_count_24h": 6}, "VELOCITY_ABNORMAL"),
    ({"new_payees_24h": 2}, "VELOCITY_ABNORMAL"),
    ({"amount_24h": 29_100.0}, "VELOCITY_ABNORMAL"),
    ({"currency": "USD"}, "NON_AED_CURRENCY"),
    ({"amount": float("nan")}, "INVALID_AMOUNT"),
])
def test_fail_closed_conditions(kw, code):
    assert route(**kw) != Route.AUTO_CLEAR
    assert code in codes(**kw)


def test_llm_block_needs_approval():
    assert route(llm_recommendation="BLOCK") == Route.PENDING_APPROVAL


def test_llm_clear_cannot_clear_a_risky_case():
    assert route(llm_recommendation="CLEAR", injection_detected=True) == Route.NEEDS_REVIEW
    assert route(llm_recommendation="CLEAR", amount=20_000.0) == Route.PENDING_APPROVAL


# ---- properties ----

@settings(max_examples=2_000)
@given(inputs)
def test_property_high_value_or_watchlist_never_auto_clears(inp):
    if inp.watchlist_band == "HIT" or not (inp.amount <= 10_000.0):
        assert decide(inp).route == Route.PENDING_APPROVAL


@settings(max_examples=2_000)
@given(inputs, st.sampled_from(["CLEAR", "REVIEW", "BLOCK"]))
def test_property_llm_can_only_make_route_stricter(inp, rec):
    without = decide(replace(inp, llm_recommendation=None)).route
    with_llm = decide(replace(inp, llm_recommendation=rec)).route
    assert ROUTE_SEVERITY[with_llm] >= ROUTE_SEVERITY[without]


@settings(max_examples=2_000)
@given(inputs)
def test_property_auto_clear_implies_every_safety_condition(inp):
    if decide(inp).route == Route.AUTO_CLEAR:
        assert inp.amount <= 10_000.0 and inp.currency == "AED" and inp.watchlist_band == "CLEAR"
        assert inp.device_known_and_verified and not inp.injection_detected and not inp.classifier_degraded
        assert inp.evidence_complete and not inp.investigator_failed and inp.verifier_passed is not False
        assert inp.llm_recommendation in (None, "CLEAR")


@settings(max_examples=500)
@given(inputs)
def test_property_route_is_max_of_reasons(inp):
    d = decide(inp)
    assert d.reasons
    assert ROUTE_SEVERITY[d.route] == max(ROUTE_SEVERITY[r.route] for r in d.reasons)


# ---- structural: the policy engine must not touch LLM / network code ----

ALLOWED_IMPORTS = {"math", "dataclasses", "typing", "enum", "backend.app.schemas"}


def test_policy_engine_imports_only_pure_modules():
    tree = ast.parse(Path(engine_module.__file__).read_text("utf-8"))
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {a.name for a in node.names}
        elif isinstance(node, ast.ImportFrom):
            imported.add(node.module)
    assert imported <= ALLOWED_IMPORTS, imported - ALLOWED_IMPORTS


def test_schemas_module_is_pure_too():
    import backend.app.schemas as schemas
    tree = ast.parse(Path(schemas.__file__).read_text("utf-8"))
    mods = {n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)} | \
           {a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names}
    assert mods <= {"enum", "typing", "pydantic"}, mods
