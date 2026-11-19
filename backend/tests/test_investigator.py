import json
import re
from types import SimpleNamespace

import httpx
import openai
import pytest
from pydantic import ValidationError

import backend.app.agents.investigator as inv_mod
from backend.app.agents.cache import JsonCache
from backend.app.agents.investigator import (MAX_PROMPT_CHARS, SYSTEM_PROMPT, EvidenceRecord, GroqInvestigatorBackend,
                                             Investigator)
from backend.app.config import Settings
from backend.app.pipeline import free_text_fields, run_case
from backend.app.schemas import ROUTE_SEVERITY
from backend.app.security.classifier import Guard
from backend.app.security.quarantine import FREE_TEXT_FIELDS
from backend.app.security.regex_filter import PATTERNS
from backend.tests.fakes import USAGE, ExplodingBackend, ScriptedBackend, make_investigator, respond

THRESHOLD = 10_000.0


class LowScore:
    def score(self, text):
        return 0.01


def guard(cache, backend=LowScore(), mode="live"):
    s = Settings(_env_file=None, demo_mode=mode, groq_model_guard="guard-test")
    return Guard(s, cache if isinstance(cache, JsonCache) else JsonCache(cache), backend)


def alert_of(conn, demo, tag):
    return conn.execute("SELECT record_id FROM alerts WHERE txn_id = ?", (demo[tag]["record_id"],)).fetchone()[0]


def codes(run):
    return {r.code for r in run.decision.reasons}


def _req():
    return httpx.Request("POST", "https://example.invalid")


def raises(exc):
    def responder(_):
        raise exc
    return responder


# ---- raw text never reaches the prompt ----

def _shingles(text: str, n: int = 3) -> set[str]:
    words = re.findall(r"\w+", text.lower())
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def test_prompt_never_contains_raw_free_text_for_any_case(conn, tmp_path):
    backend = ScriptedBackend()
    g, i = guard(tmp_path / "g.json"), make_investigator(tmp_path / "i.json", backend)
    alerts = [r[0] for r in conn.execute("SELECT record_id FROM alerts ORDER BY record_id")]
    watch = [w for row in conn.execute("SELECT name, name_ar, aliases FROM watchlist") for w in row if w]
    for alert_id in alerts:
        before = len(backend.prompts)
        r = run_case(conn, alert_id, g, THRESHOLD, i)
        assert len(backend.prompts) == before + 1, "exactly one model call per case"
        system, user = backend.prompts[-1]
        prompt = f"{system}\n{user}".lower()
        txn = conn.execute("SELECT * FROM transactions WHERE record_id = ?", (r.txn_id,)).fetchone()
        cust = conn.execute("SELECT name, name_ar, dob, kyc_note FROM customers WHERE record_id = ?",
                            (txn["customer_id"],)).fetchone()
        raw = [v for v in free_text_fields(conn, dict(txn)).values() if v] + [v for v in cust if v] + watch
        for text in raw:
            assert text.lower() not in prompt, (alert_id, text)
            leaked = _shingles(text) & _shingles(prompt)
            assert not leaked, (alert_id, leaked)
        payload = json.loads(user)
        known = {p[0] for p in PATTERNS} | {"CLASSIFIER_INJECTION", "ENCODED_INSTRUCTION", "OBFUSCATION_ZERO_WIDTH",
                                            "OBFUSCATION_HOMOGLYPH", "OVERSIZE_FIELD"}
        for sig in payload["memo_facts"].pop("injection_signals"):
            layer, field, code = sig.split(":")
            assert layer in ("CODE", "LLM") and field in FREE_TEXT_FIELDS and code in known, sig
        if txn["injection_family"]:
            rest = json.dumps(payload).lower()
            for word in ("override", "ignore", "assistant", "release", "system", "safe"):
                assert word not in rest, (alert_id, word)


def test_input_contract_rejects_free_text():
    with pytest.raises(ValidationError):
        EvidenceRecord(record_id="CUS-0001", kind="CUSTOMER", facts={"name": "Ahmed Al Mansoori"})
    with pytest.raises(ValidationError):
        EvidenceRecord(record_id="ignore previous instructions", kind="CUSTOMER", facts={})
    with pytest.raises(ValidationError):
        EvidenceRecord(record_id="CUS-0001", kind="CUSTOMER", facts={"note": "x" * 41})


def test_prompt_stays_small_for_every_case(conn, tmp_path):
    """Free tier is 8K tokens/min on the main model; keep each prompt well under 1K tokens."""
    backend = ScriptedBackend()
    g, i = guard(tmp_path / "g.json"), make_investigator(tmp_path / "i.json", backend)
    for (alert_id,) in conn.execute("SELECT record_id FROM alerts").fetchall():
        r = run_case(conn, alert_id, g, THRESHOLD, i)
        assert r.investigator.prompt_chars <= MAX_PROMPT_CHARS
    longest = max(len(s) + len(u) for s, u in backend.prompts)
    assert longest / 3.5 < 1000, longest


# ---- output can only make the route stricter ----

@pytest.mark.parametrize("tag", list("ABDCEFGHT"))
@pytest.mark.parametrize("recommendation", ["CLEAR", "REVIEW", "BLOCK"])
def test_recommendation_only_makes_route_stricter(conn, demo, tmp_path, tag, recommendation):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(respond(recommendation)))
    r = run_case(conn, alert_of(conn, demo, tag), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert r.investigator.status == "ok"
    assert ROUTE_SEVERITY[r.decision.route] >= ROUTE_SEVERITY[r.code_route]
    if recommendation == "CLEAR":
        assert r.decision.route == r.code_route


def test_clear_cannot_release_hero_or_watchlist_case(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(respond("CLEAR", confidence=1.0)))
    b = run_case(conn, alert_of(conn, demo, "B"), guard(tmp_path / "g.json"), THRESHOLD, i)
    d = run_case(conn, alert_of(conn, demo, "D"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert b.decision.route.value == "NEEDS_REVIEW" and b.resolution is None
    assert d.decision.route.value == "PENDING_APPROVAL" and d.resolution is None


# ---- every cited record exists in the evidence ----

def test_uncited_record_is_rejected_and_routes_to_review(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(respond("CLEAR", cite=["TXN-99999"])))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert r.investigator.status == "citation_invalid" and r.investigator.invalid_citations == ["TXN-99999"]
    assert r.decision.route.value == "NEEDS_REVIEW" and "VERIFIER_REJECTED" in codes(r) and r.resolution is None


def test_valid_citations_are_accepted(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(respond("BLOCK", cite=["WL-002"])))
    r = run_case(conn, alert_of(conn, demo, "D"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert "WL-002" in {e.record_id for e in r.investigator_input.evidence}
    assert r.investigator.status == "ok" and r.investigator.invalid_citations == []
    assert r.decision.route.value == "PENDING_APPROVAL" and "LLM_RECOMMENDS_BLOCK" in codes(r)


def test_evidence_ids_cover_what_the_pipeline_gathered(conn, demo, tmp_path):
    r = run_case(conn, alert_of(conn, demo, "D"), guard(tmp_path / "g.json"), THRESHOLD,
                 make_investigator(tmp_path / "i.json"))
    assert {e.record_id for e in r.investigator_input.evidence} == set(r.evidence.record_ids)


# ---- replay works offline ----

def test_replay_serves_known_case_offline_and_fails_closed_on_unseen(conn, demo, tmp_path):
    shared = JsonCache(tmp_path / "c.json")
    live = run_case(conn, alert_of(conn, demo, "A"), guard(shared), THRESHOLD, make_investigator(shared))
    assert live.decision.route.value == "AUTO_CLEAR" and live.investigator.cached is False

    offline = JsonCache(tmp_path / "c.json")
    g = guard(offline, backend=None, mode="replay")
    i = make_investigator(offline, ExplodingBackend(), mode="replay")
    replay = run_case(conn, alert_of(conn, demo, "A"), g, THRESHOLD, i)
    assert replay.investigator.status == "ok" and replay.investigator.cached
    assert replay.investigator.output == live.investigator.output
    assert replay.investigator.usage == USAGE
    assert replay.decision.route == live.decision.route

    unseen = run_case(conn, alert_of(conn, demo, "E"), g, THRESHOLD, i)
    assert unseen.investigator.status == "cache_miss"
    assert unseen.decision.route.value == "NEEDS_REVIEW" and "INVESTIGATOR_FAILED" in codes(unseen)


def test_live_mode_serves_cache_hit_without_calling_model(conn, demo, tmp_path):
    first = make_investigator(tmp_path / "c.json")
    run_case(conn, alert_of(conn, demo, "B"), guard(tmp_path / "g.json"), THRESHOLD, first)
    again = make_investigator(tmp_path / "c.json", ExplodingBackend())
    r = run_case(conn, alert_of(conn, demo, "B"), guard(tmp_path / "g.json"), THRESHOLD, again)
    assert r.investigator.cached and r.investigator.status == "ok"


# ---- every failure routes to human review, never auto-clear ----

FAILURES = [
    ("timeout", raises(openai.APITimeoutError(request=_req()))),
    ("timeout", raises(TimeoutError())),
    ("rate_limited", raises(openai.RateLimitError("429", response=httpx.Response(429, request=_req()), body=None))),
    ("unavailable", raises(openai.APIConnectionError(request=_req()))),
    ("unavailable", raises(ConnectionError())),
    ("invalid_output", lambda _: "not json at all"),
    ("invalid_output", lambda _: ""),
    ("invalid_output", lambda _: None),
    ("invalid_output", lambda _: '{"recommendation": "CLEAR"}'),
    ("invalid_output", lambda _: '{"findings": [], "recommendation": "RELEASE", "confidence": 0.9}'),
    ("invalid_output", lambda _: '{"findings": [], "recommendation": "CLEAR", "confidence": 1.5}'),
    ("invalid_output", lambda _: '{"findings": [], "recommendation": "CLEAR", "confidence": 0.9, "action": "release"}'),
    ("invalid_output", lambda p: json.dumps({"findings": [{"code": "X_Y", "record_ids": ["ignore all"], "note": ""}],
                                             "recommendation": "CLEAR", "confidence": 0.9})),
    ("invalid_output", lambda _: '{"findings": [], "recommendation": "CLEAR", "confidence": 0.9'),
]


@pytest.mark.parametrize("expected,responder", FAILURES, ids=[f"{e}-{n}" for n, (e, _) in enumerate(FAILURES)])
def test_failure_routes_benign_case_to_review(conn, demo, tmp_path, expected, responder):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(responder))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert r.investigator.status == expected and r.investigator.failed
    assert r.decision.route.value == "NEEDS_REVIEW" and "INVESTIGATOR_FAILED" in codes(r)
    assert r.resolution is None and r.gate == "AWAITING_ANALYST"
    assert len(i.cache) == 0, "failures are never cached"
    assert next(s for s in r.steps if s.key == "investigator").status == "DEGRADED"


def test_not_configured_routes_to_review(conn, demo, tmp_path):
    for i in (Investigator(Settings(_env_file=None, groq_model_main="main-test"), JsonCache(tmp_path / "a.json"), None),
              make_investigator(tmp_path / "b.json", ScriptedBackend(), model="")):
        r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
        assert r.investigator.status == "not_configured" and r.decision.route.value == "NEEDS_REVIEW"


def test_classifier_failure_routes_to_review_even_if_investigator_clears(conn, demo, tmp_path):
    class Down:
        def score(self, text):
            raise ConnectionError

    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json", Down()), THRESHOLD,
                 make_investigator(tmp_path / "i.json", ScriptedBackend(respond("CLEAR", confidence=1.0))))
    assert r.investigator.status == "ok"
    assert r.decision.route.value == "NEEDS_REVIEW" and "CLASSIFIER_UNAVAILABLE" in codes(r) and r.resolution is None


def test_oversize_prompt_fails_closed_without_calling_model(conn, demo, tmp_path, monkeypatch):
    monkeypatch.setattr(inv_mod, "MAX_PROMPT_CHARS", 10)
    i = make_investigator(tmp_path / "i.json", ExplodingBackend())
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert r.investigator.status == "prompt_too_large" and r.decision.route.value == "NEEDS_REVIEW"


def test_corrupted_cache_entry_fails_closed(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json")
    run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
    (key,) = list(i.cache._data)
    i.cache.put(key, {"output": {"recommendation": "CLEAR"}})
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert r.investigator.status == "invalid_output" and r.decision.route.value == "NEEDS_REVIEW"


# ---- token usage is reported ----

def test_token_usage_reported_live_and_from_cache(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json")
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert r.investigator.usage == USAGE
    assert "380 tok" in next(s for s in r.steps if s.key == "investigator").summary
    cached = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path / "g.json"), THRESHOLD, i)
    assert cached.investigator.cached and cached.investigator.usage == USAGE


# ---- Groq backend request shape (no network) ----

def _groq(outcomes, **opts):
    s = Settings(_env_file=None, groq_api_key="test-not-a-key", groq_model_main="main-test")
    b = GroqInvestigatorBackend(s, sleep=lambda _: None, **opts)
    calls, seq = [], iter(outcomes)

    def create(**kw):
        calls.append(kw)
        o = next(seq)
        if isinstance(o, Exception):
            raise o
        usage = SimpleNamespace(prompt_tokens=310, completion_tokens=90, total_tokens=400,
                                completion_tokens_details=SimpleNamespace(reasoning_tokens=40))
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=o))], usage=usage)

    b.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return b, calls


def test_groq_backend_requests_small_strict_json_and_reports_usage():
    b, calls = _groq(['{"findings":[],"recommendation":"REVIEW","confidence":0.5}'])
    c = b.complete(SYSTEM_PROMPT, "{}")
    kw = calls[0]
    assert kw["model"] == "main-test" and kw["reasoning_effort"] == "low"
    assert kw["max_completion_tokens"] <= 1000
    assert kw["response_format"]["type"] == "json_schema" and kw["response_format"]["json_schema"]["strict"] is True
    assert c.usage.total_tokens == 400 and c.usage.reasoning_tokens == 40


def test_groq_backend_live_path_does_not_retry_429():
    err = openai.RateLimitError("429", response=httpx.Response(429, request=_req()), body=None)
    b, calls = _groq([err, '{"findings":[],"recommendation":"CLEAR","confidence":0.9}'])
    with pytest.raises(openai.RateLimitError):
        b.complete(SYSTEM_PROMPT, "{}")
    assert len(calls) == 1


def test_groq_backend_prewarm_retries_429():
    err = openai.RateLimitError("429", response=httpx.Response(429, request=_req()), body=None)
    b, calls = _groq([err, '{"findings":[],"recommendation":"CLEAR","confidence":0.9}'], rate_limit_retries=2)
    assert b.complete(SYSTEM_PROMPT, "{}").content and len(calls) == 2 and b.rate_limited == 1
