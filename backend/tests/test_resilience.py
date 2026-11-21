"""Round 3 resilience drills: controlled provider faults, failover, fail-closed review and the batch script. Offline."""

import io
import json
import socket
import sys
import urllib.error
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app.agents.cache import JsonCache
from backend.app.agents.faults import FaultConfig, FaultSwitch, FaultyBackend
from backend.app.agents.investigator import build_backup
from backend.app.config import Settings, get_settings
from backend.app.pipeline import run_case
from backend.app.schemas import Route
from backend.tests.fakes import ExplodingBackend, ScriptedBackend, make_investigator, respond
from backend.tests.test_fallback import alert_of, codes, guard, step

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import live_ingest  # noqa: E402

THRESHOLD = 10_000.0
TOKEN = "drill-token"


def faulty(inner, switch, sleeps):
    return FaultyBackend(inner, switch, timeout_s=10.0, sleep=sleeps.append)


# ---- the switch ----

def test_switch_counts_down_and_disarms():
    sw = FaultSwitch()
    assert sw.arm(FaultConfig(mode="timeout", count=2)).remaining == 2
    assert sw.take().mode == "timeout" and sw.state().remaining == 1
    assert sw.take() is not None and sw.state() is None and sw.take() is None
    sw.arm(FaultConfig(mode="slow"))
    assert sw.arm(FaultConfig(mode="off")) is None and sw.take() is None


def test_unarmed_backend_is_a_pass_through():
    inner, sleeps = ScriptedBackend(respond()), []
    b = faulty(inner, FaultSwitch(), sleeps)
    b.complete("s", json.dumps({"evidence": [{"id": "TXN-00001"}]}))
    assert len(inner.prompts) == 1 and sleeps == []


# ---- through the full pipeline ----

def test_injected_timeout_fails_over_to_the_backup(conn, demo, tmp_path):
    sw, sleeps = FaultSwitch(), []
    main_b, backup = ScriptedBackend(respond("CLEAR")), ScriptedBackend(respond("CLEAR"))
    inv = make_investigator(tmp_path / "i.json", faulty(main_b, sw, sleeps), backup=backup)
    sw.arm(FaultConfig(mode="timeout"))
    run = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, inv)
    a = run.investigator.attempts
    assert [(x.provider, x.status, x.injected) for x in a] == [("main", "timeout", True), ("backup", "ok", False)]
    assert sleeps == [10.0], "a timeout drill waits the real limit before failing"
    assert main_b.prompts == [] and len(backup.prompts) == 1
    assert run.investigator.status == "ok" and run.investigator.provider == "backup"
    assert "injected demo fault" in step(run).summary


def test_injected_timeout_without_backup_fails_closed(conn, demo, tmp_path):
    sw = FaultSwitch()
    inv = make_investigator(tmp_path / "i.json", faulty(ScriptedBackend(respond("CLEAR")), sw, []))
    sw.arm(FaultConfig(mode="timeout"))
    run = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, inv)
    assert run.decision.route == Route.NEEDS_REVIEW and "ALL_PROVIDERS_FAILED" in codes(run)
    assert run.resolution is None, "nothing is auto-cleared when no model answered"
    assert [(x.provider, x.status) for x in run.investigator.attempts] == [("main", "timeout"),
                                                                           ("backup", "not_configured")]
    assert step(run).status == "DEGRADED" and "injected demo fault" in step(run).summary


def test_injected_rate_limit_fails_over_immediately(conn, demo, tmp_path):
    sw, sleeps = FaultSwitch(), []
    inv = make_investigator(tmp_path / "i.json", faulty(ScriptedBackend(respond()), sw, sleeps),
                            backup=ScriptedBackend(respond("CLEAR")))
    sw.arm(FaultConfig(mode="rate_limited"))
    run = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, inv)
    assert run.investigator.attempts[0].status == "rate_limited" and sleeps == []
    assert run.investigator.provider == "backup"


def test_slow_drill_delays_then_answers_from_main(conn, demo, tmp_path):
    sw, sleeps = FaultSwitch(), []
    main_b = ScriptedBackend(respond("CLEAR"))
    inv = make_investigator(tmp_path / "i.json", faulty(main_b, sw, sleeps), backup=ExplodingBackend())
    sw.arm(FaultConfig(mode="slow", delay_s=6))
    run = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, inv)
    assert sleeps == [6] and len(main_b.prompts) == 1
    assert run.investigator.provider == "main" and run.decision.route == Route.AUTO_CLEAR


def test_full_outage_drill_fails_both_providers_closed(conn, demo, tmp_path):
    sw, sleeps = FaultSwitch(), []
    main_b, backup_b = ScriptedBackend(respond("CLEAR")), ScriptedBackend(respond("CLEAR"))
    inv = make_investigator(tmp_path / "i.json", FaultyBackend(main_b, sw, 10.0, sleeps.append, last=False),
                            backup=FaultyBackend(backup_b, sw, 10.0, sleeps.append, role="backup"))
    sw.arm(FaultConfig(mode="timeout", scope="all"))
    run = run_case(conn, alert_of(conn, demo, "A"), guard(tmp_path), THRESHOLD, inv)
    assert [(a.provider, a.status, a.injected) for a in run.investigator.attempts] == [
        ("main", "timeout", True), ("backup", "timeout", True)]
    assert main_b.prompts == backup_b.prompts == [] and sleeps == [10.0, 10.0]
    assert run.decision.route == Route.NEEDS_REVIEW and "ALL_PROVIDERS_FAILED" in codes(run)
    assert run.resolution is None and sw.state() is None, "one investigation consumes one drill"


def test_main_only_drill_never_touches_the_backup():
    sw = FaultSwitch()
    sw.arm(FaultConfig(mode="timeout"))
    assert sw.take("backup") is None and sw.state().remaining == 1


def test_full_outage_without_backup_still_disarms():
    sw = FaultSwitch()
    sw.arm(FaultConfig(mode="timeout", scope="all"))
    assert sw.take("main", last=True) is not None and sw.state() is None


def test_cache_hit_never_consumes_the_fault(conn, demo, tmp_path):
    sw = FaultSwitch()
    cache = JsonCache(tmp_path / "shared.json")
    inv = make_investigator(cache, faulty(ScriptedBackend(respond("CLEAR")), sw, []))
    alert = alert_of(conn, demo, "A")
    run_case(conn, alert, guard(tmp_path), THRESHOLD, inv)
    sw.arm(FaultConfig(mode="timeout"))
    again = run_case(conn, alert, guard(tmp_path), THRESHOLD, inv)
    assert again.investigator.cached and sw.state().remaining == 1


def test_backup_sharing_the_main_key_is_refused():
    s = Settings(_env_file=None, groq_api_key="k-1", backup_llm_api_key="k-1", backup_llm_model="m",
                 backup_llm_base_url="https://example.invalid/v1")
    assert build_backup(s) is None
    assert build_backup(s.model_copy(update={"backup_llm_api_key": "k-2"})).model == "m"


# ---- the endpoint ----

@pytest.fixture
def client(tmp_path, monkeypatch):
    def build(mode="live"):
        s = Settings(_env_file=None, demo_mode=mode, demo_admin_token=TOKEN, db_path=str(tmp_path / "d.sqlite"),
                     cache_path=str(tmp_path / "c.json"))
        monkeypatch.setattr(main, "settings", s)
        monkeypatch.setattr(main, "_faults", FaultSwitch())
        monkeypatch.setattr(main, "_guard", guard(tmp_path))
        monkeypatch.setattr(main, "_investigator", make_investigator(tmp_path / "inv.json"))
        get_settings.cache_clear()
        monkeypatch.setattr("backend.app.db.get_settings", lambda: s)
        return TestClient(main.app)
    return build


def test_fault_endpoint_is_guarded(client):
    assert client(mode="off").post("/demo/fault", json={"mode": "timeout"}).status_code == 404
    c = client()
    assert c.post("/demo/fault", json={"mode": "timeout"}).status_code == 403
    h = {"X-Admin-Token": TOKEN}
    assert c.post("/demo/fault", json={"mode": "explode"}, headers=h).status_code == 422
    assert c.post("/demo/fault", json={"mode": "timeout", "count": 9}, headers=h).status_code == 422


def test_fault_endpoint_arms_and_health_reports_it(client):
    c, h = client(), {"X-Admin-Token": TOKEN}
    r = c.post("/demo/fault", json={"mode": "timeout", "count": 2}, headers=h)
    assert r.status_code == 200 and r.json()["mode"] == "timeout" and r.json()["remaining"] == 2
    health = c.get("/health").json()
    assert health["fault_armed"]["remaining"] == 2 and health["llm_timeout_s"] > 0
    assert c.post("/demo/fault", json={"mode": "off"}, headers=h).json() is None
    assert c.get("/health").json()["fault_armed"] is None


# ---- the batch script keeps going ----

def _http_error(code, detail):
    return urllib.error.HTTPError("u", code, "err", {}, io.BytesIO(json.dumps({"detail": detail}).encode()))


def test_script_turns_failures_into_readable_lines(monkeypatch, capsys):
    ok_run = {"alert_id": "ALT-01001", "run": {
        "alert_id": "ALT-01001",
        "investigator": {"status": "timeout", "cached": False, "usage": None,
                         "attempts": [{"provider": "main", "status": "timeout", "duration_ms": 10000, "injected": True},
                                      {"provider": "backup", "status": "not_configured", "duration_ms": 0}]},
        "decision": {"route": "NEEDS_REVIEW", "reasons": [{"code": "ALL_PROVIDERS_FAILED", "route": "NEEDS_REVIEW"}]},
        "report": {"accepted": 5, "rejected": 0}}}
    outcomes = iter([
        urllib.error.URLError(ConnectionRefusedError("refused")),
        urllib.error.URLError(socket.timeout("timed out")),
        _http_error(422, [{"loc": ["body", "customer_id"], "msg": "String should match pattern"}]),
        ok_run,
    ])

    def fake_post(base, path, body, headers=None, timeout=0):
        out = next(outcomes)
        if isinstance(out, dict):
            return out
        try:
            raise out
        except urllib.error.HTTPError as e:
            raise live_ingest.EventError(f"HTTP {e.code} - {live_ingest._detail(e.read())}") from None
        except urllib.error.URLError as e:
            if isinstance(e.reason, (TimeoutError, socket.timeout)):
                raise live_ingest.EventError("no answer within 120 s") from None
            raise live_ingest.EventError(f"backend unreachable at {base} ({e.reason})") from None

    monkeypatch.setattr(live_ingest, "post", fake_post)
    code = live_ingest.main(["clean", "arabic_memo", "malformed", "missing_device", "--pause", "0"])
    out = capsys.readouterr().out
    assert "backend unreachable" in out and "no answer within 120 s" in out
    assert "HTTP 422 - customer_id: String should match pattern" in out
    assert "FAILED CLOSED -> human review" in out and "main timeout (injected) 10.0s -> backup not_configured" in out
    assert "4 events: 1 processed (1 failed closed to review), 3 errored" in out
    assert code == 1


def test_script_http_helper_reports_real_errors(monkeypatch):
    def raise_(exc):
        def f(*a, **k):
            raise exc
        return f
    monkeypatch.setattr(live_ingest.urllib.request, "urlopen", raise_(_http_error(409, "Already resolved")))
    with pytest.raises(live_ingest.EventError, match="HTTP 409 - Already resolved"):
        live_ingest.post("http://x", "/p", {})
    monkeypatch.setattr(live_ingest.urllib.request, "urlopen", raise_(TimeoutError()))
    with pytest.raises(live_ingest.EventError, match="no answer within"):
        live_ingest.post("http://x", "/p", {}, timeout=5)
