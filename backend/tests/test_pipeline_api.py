import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app.agents.cache import JsonCache
from backend.app.config import Settings, get_settings
from backend.app.pipeline import run_case
from backend.app.security.classifier import Guard
from backend.tests.fakes import make_investigator


class LowScoreBackend:
    """Classifier that never flags: proves the deterministic layer alone routes every case correctly."""

    def score(self, text):
        return 0.01


def guard(tmp_path, backend=LowScoreBackend()):
    return Guard(Settings(_env_file=None, groq_model_guard="guard-test"), JsonCache(tmp_path / "c.json"), backend)


def inv(tmp_path):
    """Investigator that agrees CLEAR: the deterministic layers alone must still route every case correctly."""
    return make_investigator(tmp_path / "inv.json")


def all_alerts(conn):
    return [r[0] for r in conn.execute("SELECT record_id FROM alerts ORDER BY record_id")]


def test_golden_every_case_routes_as_labelled(conn, tmp_path):
    g, i = guard(tmp_path), inv(tmp_path)
    wrong = []
    for alert_id in all_alerts(conn):
        r = run_case(conn, alert_id, g, 10_000.0, i)
        expected = conn.execute("SELECT expected_route FROM transactions WHERE record_id = ?",
                                (r.txn_id,)).fetchone()[0]
        if r.decision.route.value != expected:
            wrong.append((alert_id, expected, r.decision.route.value, [x.code for x in r.decision.reasons]))
    assert wrong == []


def test_no_hostile_or_high_value_case_auto_clears(conn, tmp_path):
    g, i = guard(tmp_path), inv(tmp_path)
    for alert_id in all_alerts(conn):
        r = run_case(conn, alert_id, g, 10_000.0, i)
        txn = conn.execute("SELECT * FROM transactions WHERE record_id = ?", (r.txn_id,)).fetchone()
        if txn["injection_family"] or txn["amount"] > 10_000 or txn["scenario"] == "watchlist_hit":
            assert r.decision.route.value != "AUTO_CLEAR" and r.resolution is None


def test_investigator_input_never_contains_raw_text(conn, tmp_path):
    g, i = guard(tmp_path), inv(tmp_path)
    for alert_id in all_alerts(conn):
        r = run_case(conn, alert_id, g, 10_000.0, i)
        txn = conn.execute("SELECT memo, payee_name FROM transactions WHERE record_id = ?", (r.txn_id,)).fetchone()
        dumped = r.investigator_input.model_dump_json()
        for raw in (txn["memo"], txn["payee_name"]):
            if raw and len(raw) > 12:
                assert raw not in dumped


def test_classifier_down_fails_closed(conn, demo, tmp_path):
    class Down:
        def score(self, text):
            raise ConnectionError

    alert = conn.execute("SELECT record_id FROM alerts WHERE txn_id = ?", (demo["A"]["record_id"],)).fetchone()[0]
    r = run_case(conn, alert, guard(tmp_path, Down()), 10_000.0, inv(tmp_path))
    assert r.decision.route.value == "NEEDS_REVIEW"
    assert "CLASSIFIER_UNAVAILABLE" in {x.code for x in r.decision.reasons}


# ---- API ----

@pytest.fixture
def client(tmp_path, monkeypatch):
    s = Settings(_env_file=None, db_path=str(tmp_path / "api.sqlite"), cache_path=str(tmp_path / "c.json"),
                 groq_model_guard="guard-test")
    monkeypatch.setattr(main, "settings", s)
    monkeypatch.setattr(main, "_guard", Guard(s, JsonCache(s.cache_file), LowScoreBackend()))
    monkeypatch.setattr(main, "_investigator", make_investigator(tmp_path / "inv.json"))
    monkeypatch.setattr(main, "_runs", {})
    get_settings.cache_clear()
    monkeypatch.setattr("backend.app.db.get_settings", lambda: s)
    return TestClient(main.app)


def by_tag(client):
    return {c["demo_tag"]: c for c in client.get("/cases").json()}


def test_list_pinned_cases(client):
    cases = client.get("/cases").json()
    assert [c["demo_tag"] for c in cases][:3] == ["A", "B", "D"]
    assert len(client.get("/cases?all=true").json()) == 100


def test_hero_case_flow(client):
    b = by_tag(client)["B"]
    run = client.post(f"/cases/{b['alert_id']}/run").json()
    assert run["decision"]["route"] == "NEEDS_REVIEW" and run["gate"] == "AWAITING_ANALYST"
    assert run["quarantine"]["regex_flagged"] is True
    memo = client.get(f"/cases/{b['alert_id']}").json()["raw_fields"]["memo"]
    spans = [memo[s["start"]:s["end"]] for s in run["quarantine"]["spans"]]
    assert any("SYSTEM OVERRIDE" in s for s in spans)
    assert [s["actor"] for s in run["steps"]][:3] == ["CODE", "CODE", "LLM"]


def test_auto_clear_commits(client):
    a = by_tag(client)["A"]
    run = client.post(f"/cases/{a['alert_id']}/run").json()
    assert run["decision"]["route"] == "AUTO_CLEAR" and run["gate"] == "AUTO_COMMITTED"
    assert run["resolution"]["action"] == "CLEAR"


def test_approval_gate_flow(client):
    d = by_tag(client)["D"]
    aid = d["alert_id"]
    assert client.post(f"/cases/{aid}/commit", json={"action": "HOLD_AND_BLOCK"}).status_code == 409
    run = client.post(f"/cases/{aid}/run").json()
    assert run["decision"]["route"] == "PENDING_APPROVAL" and run["gate"] == "AWAITING_APPROVAL"
    assert {"AMOUNT_OVER_THRESHOLD", "WATCHLIST_HIT"} <= {r["code"] for r in run["decision"]["reasons"]}
    refused = client.post(f"/cases/{aid}/commit", json={"action": "HOLD_AND_BLOCK"})
    assert refused.status_code == 403
    assert client.post(f"/cases/{aid}/decision", json={"decision": "APPROVE", "reason": ""}).status_code == 422
    ok = client.post(f"/cases/{aid}/decision",
                     json={"decision": "APPROVE", "action": "HOLD_AND_BLOCK", "reason": "Alias + DOB match WL-002"})
    assert ok.status_code == 200 and ok.json()["resolution"]["approval_id"] == ok.json()["approval"]["record_id"]
    assert client.get(f"/cases/{aid}").json()["resolution"]["action"] == "HOLD_AND_BLOCK"


def test_unknown_case_404(client):
    assert client.get("/cases/ALT-99999").status_code == 404


def test_reset(client):
    a = by_tag(client)["A"]
    client.post(f"/cases/{a['alert_id']}/run")
    assert client.post("/demo/reset").json()["counts"]["transactions"] == 100
    assert client.get(f"/cases/{a['alert_id']}").json()["resolution"] is None
