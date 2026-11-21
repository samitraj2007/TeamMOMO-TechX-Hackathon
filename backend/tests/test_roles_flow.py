"""Analyst vs compliance officer: escalation hand-off, four-eyes, and the derived case lifecycle."""

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app.agents.cache import JsonCache
from backend.app.config import Settings, get_settings
from backend.app.security.classifier import Guard
from backend.tests.fakes import ScriptedBackend, make_investigator, respond

ESCALATE_REASON = "Memo looks like an injection attempt; needs officer sign-off"
APPROVE_REASON = "Officer review: escalation justified, holding funds"
CLEAR_REASON = "Payee matches the signed supplier contract and invoice on file"


class LowScore:
    def score(self, text):
        return 0.01


@pytest.fixture
def client(tmp_path, monkeypatch):
    s = Settings(_env_file=None, db_path=str(tmp_path / "api.sqlite"), cache_path=str(tmp_path / "c.json"),
                 groq_model_guard="guard-test")
    monkeypatch.setattr(main, "settings", s)
    monkeypatch.setattr(main, "_guard", Guard(s, JsonCache(s.cache_file), LowScore()))
    monkeypatch.setattr(main, "_investigator",
                        make_investigator(tmp_path / "inv.json", ScriptedBackend(respond("REVIEW", confidence=0.6))))
    monkeypatch.setattr(main, "_runs", {})
    get_settings.cache_clear()
    monkeypatch.setattr("backend.app.db.get_settings", lambda: s)
    return TestClient(main.app)


def alert(client, tag):
    return {c["demo_tag"]: c["alert_id"] for c in client.get("/cases").json()}[tag]


def run(client, tag):
    a = alert(client, tag)
    r = client.post(f"/cases/{a}/run")
    assert r.status_code == 200
    return a, r.json()["decision"]["route"]


def decide(client, a, decision, reason, role, actor, **kw):
    return client.post(f"/cases/{a}/decision",
                       json={"decision": decision, "reason": reason, "role": role, "actor": actor, **kw})


def steps(client, a):
    lc = client.get(f"/cases/{a}/lifecycle").json()
    return lc, {s["id"]: s for s in lc["steps"]}


def escalated_case(client):
    b, route = run(client, "B")
    assert route == "NEEDS_REVIEW"
    r = decide(client, b, "ESCALATE", ESCALATE_REASON, "ANALYST", "analyst.demo")
    assert r.status_code == 200, r.text
    return b, r.json()


# ---- escalation ----

def test_escalation_hands_off_without_committing(client):
    b, out = escalated_case(client)
    assert out["status"] == "ESCALATED" and out["resolution"] is None
    assert client.get(f"/cases/{b}").json()["resolution"] is None
    r = decide(client, b, "APPROVE", CLEAR_REASON, "ANALYST", "analyst.two", action="CLEAR")
    assert r.status_code == 403 and "compliance officer" in r.json()["detail"]
    refused = [e for e in client.get(f"/cases/{b}/audit").json() if e["kind"] == "DECISION_REFUSED"]
    assert refused[-1]["payload"]["refusal"] == "OFFICER_REQUIRED"


def test_direct_commit_after_escalation_is_refused(client):
    b, _ = escalated_case(client)
    assert client.post(f"/cases/{b}/commit", json={"action": "ESCALATE"}).status_code == 403
    assert client.post(f"/cases/{b}/commit", json={"action": "CLEAR"}).status_code == 403


def test_escalation_refused_where_it_adds_nothing(client):
    d, route = run(client, "D")
    assert route == "PENDING_APPROVAL"
    assert decide(client, d, "ESCALATE", ESCALATE_REASON, "ANALYST", "analyst.demo").status_code == 409
    b, _ = escalated_case(client)
    assert decide(client, b, "ESCALATE", ESCALATE_REASON, "ANALYST", "analyst.two").status_code == 409
    a, route = run(client, "A")
    if route == "AUTO_CLEAR":
        assert decide(client, a, "ESCALATE", ESCALATE_REASON, "ANALYST", "analyst.demo").status_code == 409


def test_escalate_on_resolved_case_is_refused(client):
    b, _ = run(client, "B")
    assert decide(client, b, "APPROVE", CLEAR_REASON, "ANALYST", "analyst.demo", action="CLEAR").status_code == 200
    assert decide(client, b, "ESCALATE", ESCALATE_REASON, "ANALYST", "analyst.demo").status_code == 409


# ---- four-eyes ----

def test_four_eyes_same_person_refused_and_audited(client):
    b, _ = escalated_case(client)
    r = decide(client, b, "APPROVE", APPROVE_REASON, "COMPLIANCE_OFFICER", "Analyst.Demo")
    assert r.status_code == 403 and "Four-eyes" in r.json()["detail"]
    refused = [e for e in client.get(f"/cases/{b}/audit").json() if e["kind"] == "DECISION_REFUSED"]
    assert refused[-1]["payload"]["refusal"] == "SAME_PERSON"
    assert client.get(f"/cases/{b}").json()["resolution"] is None


def test_four_eyes_different_officer_commits_and_files(client):
    b, _ = escalated_case(client)
    r = decide(client, b, "APPROVE", APPROVE_REASON, "COMPLIANCE_OFFICER", "officer.demo")
    assert r.status_code == 200 and r.json()["status"] == "COMMITTED"
    assert r.json()["resolution"]["action"] == "ESCALATE"
    f = client.post(f"/cases/{b}/file-report", json={"actor": "officer.demo", "role": "COMPLIANCE_OFFICER"})
    assert f.status_code == 200, f.text


# ---- lifecycle ----

def test_lifecycle_unrun(client):
    a = alert(client, "B")
    lc, s = steps(client, a)
    assert lc["route"] is None and s["investigated"]["state"] == "current"
    assert [x["state"] for x in lc["steps"][1:]] == ["upcoming", "upcoming", "upcoming"]


def test_lifecycle_through_escalation_approval_and_filing(client):
    b, _ = run(client, "B")
    lc, s = steps(client, b)
    assert s["analyst_review"]["state"] == "current" and lc["next_action_role"] == "ANALYST"
    assert s["officer_approval"]["state"] == "upcoming"

    decide(client, b, "ESCALATE", ESCALATE_REASON, "ANALYST", "analyst.demo")
    lc, s = steps(client, b)
    assert s["analyst_review"]["state"] == "done" and s["analyst_review"]["by"].startswith("analyst.demo")
    assert s["officer_approval"]["state"] == "current" and lc["next_action_role"] == "COMPLIANCE_OFFICER"
    assert lc["escalated_by"] == ["analyst.demo"] and "Four-eyes" in s["officer_approval"]["note"]

    decide(client, b, "APPROVE", APPROVE_REASON, "COMPLIANCE_OFFICER", "officer.demo")
    lc, s = steps(client, b)
    assert s["officer_approval"]["state"] == "done" and s["filed"]["state"] == "current"

    client.post(f"/cases/{b}/file-report", json={"actor": "officer.demo", "role": "COMPLIANCE_OFFICER"})
    lc, s = steps(client, b)
    assert all(x["state"] in ("done", "skipped", "not_needed") for x in lc["steps"])
    assert s["filed"]["state"] == "done" and lc["next_action_role"] is None


def test_lifecycle_officer_route_skips_analyst(client):
    d, _ = run(client, "D")
    lc, s = steps(client, d)
    assert s["analyst_review"]["state"] == "skipped" and s["officer_approval"]["state"] == "current"
    assert lc["officer_required"] is True


def test_lifecycle_analyst_clear_needs_no_officer_or_filing(client):
    b, _ = run(client, "B")
    decide(client, b, "APPROVE", CLEAR_REASON, "ANALYST", "analyst.demo", action="CLEAR")
    _, s = steps(client, b)
    assert s["analyst_review"]["state"] == "done"
    assert s["officer_approval"]["state"] == "not_needed" and s["filed"]["state"] == "not_needed"


# ---- notifications ----

def test_escalation_notification_has_no_reason_text(client):
    b, _ = escalated_case(client)
    events = client.get("/notifications").json()["events"]
    esc = [e for e in events if e["alert_id"] == b and "escalated" in e["title"]]
    assert esc and esc[0]["type"] == "approval_needed" and esc[0]["severity"] == "high"
    assert "injection" not in esc[0]["title"]
    decide(client, b, "APPROVE", APPROVE_REASON, "COMPLIANCE_OFFICER", "analyst.demo")
    refused = client.get("/notifications").json()["events"]
    assert any(e["type"] == "refused" and "SAME_PERSON" in e["title"] for e in refused)


# ---- cases decided before runs were stored ----

def test_case_without_stored_run_keeps_its_recorded_route_and_history(client, monkeypatch):
    b, _ = run(client, "B")
    assert decide(client, b, "APPROVE", CLEAR_REASON, "ANALYST", "analyst.demo", action="CLEAR").status_code == 200
    monkeypatch.setattr(main, "_runs", {})  # the run snapshot was never stored (pre-RunStore data)
    lc, s = steps(client, b)
    assert lc["route"] == "NEEDS_REVIEW"
    assert s["investigated"]["state"] == "done" and "not stored" in s["investigated"]["note"]
    assert s["analyst_review"]["state"] == "done" and s["filed"]["state"] == "not_needed"
    detail = client.get(f"/cases/{b}").json()
    assert detail["run"] is None and detail["summary"]["last_route"] == "NEEDS_REVIEW"
    assert detail["resolution"]["action"] == "CLEAR" and len(detail["decisions"]) == 1
