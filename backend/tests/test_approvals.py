import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app.agents.cache import JsonCache
from backend.app.config import Settings, get_settings
from backend.app.schemas import Route
from backend.app.security.classifier import Guard
from backend.app.services.case_resolution import (AlreadyResolved, ApprovalRequired, commit_case_resolution,
                                                  gated_facts, record_approval)
from backend.tests.fakes import make_investigator

LONG = "Customer provided the signed contract and a bank letter confirming the payee"
WATCHLIST_SMALL = "ALT-00010"   # 2,000 AED, watchlist HIT
HIGH_VALUE_ONLY = "ALT-00061"   # 34,403.80 AED, no watchlist match
NAMESAKE = "ALT-00011"          # watchlist POSSIBLE


class LowScore:
    def score(self, text):
        return 0.01


@pytest.fixture
def client(tmp_path, monkeypatch):
    s = Settings(_env_file=None, db_path=str(tmp_path / "api.sqlite"), cache_path=str(tmp_path / "c.json"),
                 groq_model_guard="guard-test")
    monkeypatch.setattr(main, "settings", s)
    monkeypatch.setattr(main, "_guard", Guard(s, JsonCache(s.cache_file), LowScore()))
    monkeypatch.setattr(main, "_investigator", make_investigator(tmp_path / "inv.json"))
    monkeypatch.setattr(main, "_runs", {})
    get_settings.cache_clear()
    monkeypatch.setattr("backend.app.db.get_settings", lambda: s)
    return TestClient(main.app)


def run(client, tag_or_id):
    alert = {c["demo_tag"]: c["alert_id"] for c in client.get("/cases").json()}.get(tag_or_id, tag_or_id)
    client.post(f"/cases/{alert}/run")
    return alert


def decide(client, alert, decision, reason="Reviewed evidence", **kw):
    return client.post(f"/cases/{alert}/decision", json={"decision": decision, "reason": reason, **kw})


def resolution(client, alert):
    return client.get(f"/cases/{alert}").json()["resolution"]


# ---- PENDING_APPROVAL (case D: 48,000 AED + watchlist hit) ----

def test_officer_approves_block(client):
    d = run(client, "D")
    r = decide(client, d, "APPROVE", "Alias and DOB match WL-002")
    assert r.status_code == 200 and r.json()["status"] == "COMMITTED" and r.json()["override"] is False
    assert r.json()["resolution"]["action"] == "HOLD_AND_BLOCK"
    assert r.json()["resolution"]["approval_id"] == r.json()["approval"]["record_id"]


def test_analyst_cannot_decide_high_value_case(client):
    d = run(client, "D")
    for decision in ("APPROVE", "REJECT", "MORE_INFO"):
        assert decide(client, d, decision, LONG, role="ANALYST").status_code == 403
    assert client.get(f"/cases/{d}").json()["approval"] is None


def test_reason_required_for_every_decision(client):
    d = run(client, "D")
    for decision in ("APPROVE", "REJECT", "MORE_INFO"):
        assert decide(client, d, decision, "").status_code == 422
        assert decide(client, d, decision, "  ").status_code == 422
    assert client.post(f"/cases/{d}/decision", json={"decision": "APPROVE"}).status_code == 422


def test_override_to_clear_needs_substantive_reason(client):
    d = run(client, "D")
    short = decide(client, d, "APPROVE", "looks fine", action="CLEAR")
    assert short.status_code == 422 and "override" in short.json()["detail"]
    ok = decide(client, d, "APPROVE", LONG, action="CLEAR")
    assert ok.status_code == 200 and ok.json()["override"] is True and ok.json()["approval"]["override"] is True
    assert ok.json()["resolution"]["action"] == "CLEAR"


def test_reject_is_an_override_and_does_not_commit(client):
    d = run(client, "D")
    assert decide(client, d, "REJECT", "not convinced").status_code == 422
    r = decide(client, d, "REJECT", LONG)
    assert r.json()["status"] == "REJECTED" and r.json()["resolution"] is None and r.json()["override"] is True
    assert client.post(f"/cases/{d}/commit", json={"action": "HOLD_AND_BLOCK"}).status_code == 403
    assert client.post(f"/cases/{d}/commit", json={"action": "CLEAR"}).status_code == 403
    assert resolution(client, d) is None


def test_more_info_holds_then_approval_commits(client):
    d = run(client, "D")
    r = decide(client, d, "MORE_INFO", "Request source-of-funds letter")
    assert r.json()["status"] == "AWAITING_INFO" and r.json()["resolution"] is None
    assert client.post(f"/cases/{d}/commit", json={"action": "HOLD_AND_BLOCK"}).status_code == 403
    assert decide(client, d, "APPROVE", "Source of funds not provided; hold").json()["status"] == "COMMITTED"


def test_no_second_decision_or_commit_after_resolution(client):
    d = run(client, "D")
    decide(client, d, "APPROVE", "Alias and DOB match WL-002")
    assert decide(client, d, "APPROVE", "again please").status_code == 409
    assert client.post(f"/cases/{d}/commit", json={"action": "HOLD_AND_BLOCK"}).status_code == 409


def test_more_info_is_not_an_approval(client):
    d = run(client, "D")
    decide(client, d, "MORE_INFO", "Need payee documents")
    assert client.post(f"/cases/{d}/commit", json={"action": "CLEAR"}).status_code == 403


def test_approval_cannot_be_reused_for_a_different_action(conn):
    record_approval(conn, "ALT-00012", "officer.demo", "APPROVE", "Alias and DOB match", action="HOLD_AND_BLOCK")
    with pytest.raises(ApprovalRequired, match="approval was for HOLD_AND_BLOCK"):
        commit_case_resolution(conn, "ALT-00012", Route.PENDING_APPROVAL, "CLEAR")
    assert commit_case_resolution(conn, "ALT-00012", Route.PENDING_APPROVAL, "HOLD_AND_BLOCK").approval_id


# ---- NEEDS_REVIEW (case B: hostile memo) ----

def test_analyst_escalates_review_case(client):
    b = run(client, "B")
    r = decide(client, b, "APPROVE", "Memo injection; escalate to FIU", role="ANALYST", action="ESCALATE")
    assert r.json()["status"] == "COMMITTED" and r.json()["override"] is False
    assert r.json()["approval"]["role"] == "ANALYST"


def test_analyst_clearing_review_case_is_an_override(client):
    b = run(client, "B")
    assert decide(client, b, "APPROVE", "fine", role="ANALYST", action="CLEAR").status_code == 422
    r = decide(client, b, "APPROVE", LONG, role="ANALYST", action="CLEAR")
    assert r.status_code == 200 and r.json()["override"] is True


def test_analyst_cannot_block(client):
    b = run(client, "B")
    assert decide(client, b, "APPROVE", "Block it", role="ANALYST", action="HOLD_AND_BLOCK").status_code == 403
    assert decide(client, b, "APPROVE", "Injection plus new payee", action="HOLD_AND_BLOCK").json()["status"] \
        == "COMMITTED"


def test_auto_cleared_case_takes_no_decision(client):
    a = run(client, "A")
    assert decide(client, a, "APPROVE", LONG).status_code == 409


def test_watchlist_case_under_threshold_needs_officer(client):
    alert = run(client, WATCHLIST_SMALL)
    assert decide(client, alert, "APPROVE", LONG, role="ANALYST", action="ESCALATE").status_code == 403


# ---- commit_case_resolution refuses on the facts, whatever route it is told ----

@pytest.mark.parametrize("alert", ["ALT-00012", WATCHLIST_SMALL, HIGH_VALUE_ONLY])
@pytest.mark.parametrize("route", list(Route))
def test_commit_refuses_gated_case_without_officer_approval(conn, alert, route):
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, alert, route, "CLEAR")
    record_approval(conn, alert, "analyst.demo", "APPROVE", "analyst approval", role="ANALYST", action="CLEAR")
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, alert, route, "CLEAR")
    assert conn.execute("SELECT COUNT(*) FROM resolutions").fetchone()[0] == 0


def test_commit_allows_gated_case_with_officer_approval(conn):
    record_approval(conn, HIGH_VALUE_ONLY, "officer.demo", "APPROVE", LONG, action="CLEAR", override=True)
    assert commit_case_resolution(conn, HIGH_VALUE_ONLY, Route.PENDING_APPROVAL, "CLEAR").approval_id


def test_namesake_possible_match_needs_a_human_decision(conn):
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, NAMESAKE, Route.AUTO_CLEAR, "CLEAR")
    record_approval(conn, NAMESAKE, "analyst.demo", "APPROVE", "DOB differs from the listed entry", role="ANALYST",
                    action="CLEAR")
    assert commit_case_resolution(conn, NAMESAKE, Route.NEEDS_REVIEW, "CLEAR").approval_id


def test_every_case_gated_iff_high_value_or_watchlist(conn):
    """Auto-clear commit without any human: allowed only when the records show no high value and no watchlist."""
    for (alert, amount) in conn.execute("SELECT a.record_id, t.amount FROM alerts a "
                                        "JOIN transactions t ON t.record_id = a.txn_id").fetchall():
        facts = gated_facts(conn, alert, 10_000.0)
        gated = facts["high_value"] or facts["watchlist_hit"] or facts["watchlist_possible"]
        assert facts["high_value"] == (amount > 10_000)
        if gated:
            with pytest.raises(ApprovalRequired):
                commit_case_resolution(conn, alert, Route.AUTO_CLEAR, "CLEAR")
        else:
            commit_case_resolution(conn, alert, Route.AUTO_CLEAR, "CLEAR")


def test_commit_twice_refused(conn, demo):
    alert = conn.execute("SELECT record_id FROM alerts WHERE txn_id = ?", (demo["A"]["record_id"],)).fetchone()[0]
    commit_case_resolution(conn, alert, Route.AUTO_CLEAR, "CLEAR")
    with pytest.raises(AlreadyResolved):
        commit_case_resolution(conn, alert, Route.AUTO_CLEAR, "CLEAR")


def test_override_reason_enforced_in_service(conn):
    with pytest.raises(ValueError):
        record_approval(conn, "ALT-00012", "officer.demo", "REJECT", "too short", override=True)
