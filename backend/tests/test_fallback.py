from types import SimpleNamespace

import httpx
import openai
import pytest

from backend.app.agents.cache import JsonCache
from backend.app.agents.investigator import SYSTEM_PROMPT, ChatBackend, build_investigator
from backend.app.config import Settings
from backend.app.pipeline import run_case
from backend.app.security.classifier import Guard
from backend.tests.fakes import ExplodingBackend, ScriptedBackend, make_investigator, respond

THRESHOLD = 10_000.0


class LowScore:
    def score(self, text):
        return 0.01


def _req():
    return httpx.Request("POST", "https://example.invalid")


def raises(exc):
    def responder(_):
        raise exc
    return responder


RATE_LIMITED = raises(openai.RateLimitError("429", response=httpx.Response(429, request=_req()), body=None))
TIMEOUT = raises(openai.APITimeoutError(request=_req()))
DOWN = raises(openai.APIConnectionError(request=_req()))


def guard(tmp_path, mode="live"):
    s = Settings(_env_file=None, demo_mode=mode, groq_model_guard="guard-test")
    return Guard(s, JsonCache(tmp_path / "g.json"), LowScore())


def alert_of(conn, demo, tag):
    return conn.execute("SELECT record_id FROM alerts WHERE txn_id = ?", (demo[tag]["record_id"],)).fetchone()[0]


def codes(run):
    return {r.code for r in run.decision.reasons}


def step(run, key="investigator"):
    return next(s for s in run.steps if s.key == key)


# ---- main rate-limited / timed out / down: backup answers ----

@pytest.mark.parametrize("failure,status", [(RATE_LIMITED, "rate_limited"), (TIMEOUT, "timeout"),
                                            (DOWN, "unavailable")])
def test_backup_answers_when_main_fails_over(conn, demo, tmp_path, failure, status):
    main, backup = ScriptedBackend(failure), ScriptedBackend(respond("CLEAR"))
    i = make_investigator(tmp_path / "i.json", main, backup=backup)
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    inv = r.investigator
    assert inv.status == "ok" and inv.provider == "backup" and inv.model == "backup-test"
    assert [(a.provider, a.status) for a in inv.attempts] == [("main", status), ("backup", "ok")]
    assert main.prompts == backup.prompts, "backup receives exactly the same typed prompt"
    assert r.decision.route.value == "AUTO_CLEAR" and r.resolution is not None
    assert f"via backup (backup-test) after main {status}" in step(r).summary
    assert "backup-test" in r.report.markdown and r.report.verifier_passed


def test_backup_is_not_called_when_main_answers(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(respond("REVIEW")), backup=ExplodingBackend())
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    assert r.investigator.provider == "main" and [a.provider for a in r.investigator.attempts] == ["main"]


def test_invalid_output_from_main_does_not_fail_over(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(lambda _: "not json"), backup=ExplodingBackend())
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    assert r.investigator.status == "invalid_output" and r.decision.route.value == "NEEDS_REVIEW"
    assert "INVESTIGATOR_FAILED" in codes(r) and "ALL_PROVIDERS_FAILED" not in codes(r)


# ---- backup output gets the same checks as main ----

def test_backup_cannot_release_risky_cases(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(RATE_LIMITED),
                          backup=ScriptedBackend(respond("CLEAR", confidence=1.0)))
    b = run_case(conn, alert_of(conn, demo, "B"), guard(tmp_path), THRESHOLD, i)
    d = run_case(conn, alert_of(conn, demo, "D"), guard(tmp_path), THRESHOLD, i)
    assert b.investigator.provider == d.investigator.provider == "backup"
    assert b.decision.route.value == "NEEDS_REVIEW" and b.resolution is None
    assert d.decision.route.value == "PENDING_APPROVAL" and d.resolution is None


def test_backup_block_makes_benign_case_stricter(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(TIMEOUT), backup=ScriptedBackend(respond("BLOCK")))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    assert r.decision.route.value == "PENDING_APPROVAL" and "LLM_RECOMMENDS_BLOCK" in codes(r)


def test_backup_uncited_record_is_rejected(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(RATE_LIMITED),
                          backup=ScriptedBackend(respond("CLEAR", cite=["TXN-99999"])))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    assert r.investigator.status == "citation_invalid" and r.investigator.provider == "backup"
    assert r.decision.route.value == "NEEDS_REVIEW" and "VERIFIER_REJECTED" in codes(r)


# ---- all providers fail: review with a clear reason ----

@pytest.mark.parametrize("main_fail,backup_fail,expected", [
    (RATE_LIMITED, TIMEOUT, "main rate_limited, backup timeout"),
    (TIMEOUT, RATE_LIMITED, "main timeout, backup rate_limited"),
    (DOWN, DOWN, "main unavailable, backup unavailable"),
])
def test_all_providers_failing_routes_to_review_with_reason(conn, demo, tmp_path, main_fail, backup_fail, expected):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(main_fail), backup=ScriptedBackend(backup_fail))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    assert r.investigator.failed and r.investigator.providers_exhausted
    assert r.decision.route.value == "NEEDS_REVIEW" and r.resolution is None and r.gate == "AWAITING_ANALYST"
    reason = next(x for x in r.decision.reasons if x.code == "ALL_PROVIDERS_FAILED")
    assert expected in reason.detail and "fail closed" in reason.detail
    assert "INVESTIGATOR_FAILED" not in codes(r)
    assert expected in step(r).summary and step(r).status == "DEGRADED"
    assert len(i.cache) == 0, "failures are never cached"
    assert step(r, "verifier").status == "SKIPPED"
    assert r.report.verifier_passed and r.report.llm_rejected == 0
    assert "ALL_PROVIDERS_FAILED" in r.report.markdown.replace("\\_", "_")


def test_no_backup_configured_is_named_in_reason(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(RATE_LIMITED))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    reason = next(x for x in r.decision.reasons if x.code == "ALL_PROVIDERS_FAILED")
    assert "main rate_limited, backup not_configured" in reason.detail


def test_backup_invalid_output_after_main_timeout_is_investigator_failure(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(TIMEOUT), backup=ScriptedBackend(lambda _: "{"))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    assert r.investigator.status == "invalid_output" and not r.investigator.providers_exhausted
    assert r.decision.route.value == "NEEDS_REVIEW" and "INVESTIGATOR_FAILED" in codes(r)


def test_backup_only_configuration_works(conn, demo, tmp_path):
    i = make_investigator(tmp_path / "i.json", ScriptedBackend(), model="", backup=ScriptedBackend(respond("REVIEW")))
    r = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, i)
    assert r.investigator.provider == "backup" and r.decision.route.value == "NEEDS_REVIEW"


# ---- cache and replay ----

def test_backup_answer_is_cached_and_replayed_offline(conn, demo, tmp_path):
    shared = JsonCache(tmp_path / "c.json")
    live = make_investigator(shared, ScriptedBackend(RATE_LIMITED), backup=ScriptedBackend(respond("REVIEW")))
    first = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, live)
    assert first.investigator.provider == "backup" and len(shared) == 1

    replay = make_investigator(JsonCache(tmp_path / "c.json"), ExplodingBackend(), mode="replay",
                               backup=ExplodingBackend())
    again = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, replay)
    assert again.investigator.cached and again.investigator.provider == "backup"
    assert again.investigator.output == first.investigator.output
    assert again.decision.route == first.decision.route


# ---- wiring from env (no network) ----

def test_backup_built_only_when_model_and_url_are_set(tmp_path):
    base = dict(_env_file=None, groq_api_key="test-not-a-key", groq_model_main="main-test")
    cache = JsonCache(tmp_path / "c.json")
    assert build_investigator(Settings(**base), cache).backup is None
    assert build_investigator(Settings(**base, backup_llm_model="b-test"), cache).backup is None
    i = build_investigator(Settings(**base, backup_llm_model="b-test", backup_llm_base_url="http://127.0.0.1:9/v1",
                                    backup_llm_name="gemini"), cache)
    assert i.backup.name == "gemini" and i.backup.model == "b-test" and i.backup.backend.model == "b-test"
    assert [p.name for p in i.providers] == ["main", "gemini"]


@pytest.mark.parametrize("effort", [None, "low"])
def test_chat_backend_request_shape(effort):
    b = ChatBackend("b-test", "", "http://127.0.0.1:9/v1", 5.0, effort)
    calls = []

    def create(**kw):
        calls.append(kw)
        usage = SimpleNamespace(prompt_tokens=300, completion_tokens=80, total_tokens=380,
                                completion_tokens_details=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content='{"findings":[],"recommendation":"REVIEW","confidence":0.5}'))], usage=usage)

    b.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    c = b.complete(SYSTEM_PROMPT, "{}")
    kw = calls[0]
    assert kw["model"] == "b-test" and kw["response_format"]["json_schema"]["strict"] is True
    assert ("reasoning_effort" in kw) == (effort is not None)
    assert c.usage.total_tokens == 380 and c.usage.reasoning_tokens == 0
