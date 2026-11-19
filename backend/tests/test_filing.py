"""Filing gate: no regulatory filing without a recorded compliance officer approval; every attempt is audited."""
import hashlib

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app import audit
from backend.app.agents.cache import JsonCache
from backend.app.config import Settings, get_settings
from backend.app.pipeline import run_case
from backend.app.reports.builder import build_report
from backend.app.security.classifier import Guard
from backend.app.services.case_resolution import record_approval
from backend.app.services.filing import AlreadyFiled, FilingRefused, file_report
from backend.tests.fakes import make_investigator


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


def run(client, tag):
    alert = {c["demo_tag"]: c["alert_id"] for c in client.get("/cases").json()}[tag]
    client.post(f"/cases/{alert}/run")
    return alert


def decide(client, alert, decision, reason="Reviewed evidence", **kw):
    return client.post(f"/cases/{alert}/decision", json={"decision": decision, "reason": reason, **kw})


def file(client, alert, **kw):
    return client.post(f"/cases/{alert}/file-report", json=kw)


def kinds(client, alert):
    return [e["kind"] for e in client.get(f"/cases/{alert}/audit").json()]


# ---- refusal paths ----

def test_refused_without_any_approval(client):
    d = run(client, "D")
    r = file(client, d)
    assert r.status_code == 403 and "compliance officer approval" in r.json()["detail"]
    assert kinds(client, d)[-1] == "FILING_REFUSED" and "FILING" not in kinds(client, d)


def test_refused_for_auto_cleared_case(client):
    a = run(client, "A")
    assert file(client, a).status_code == 403
    assert "FILING" not in kinds(client, a)


def test_refused_when_only_an_analyst_approved(client):
    b = run(client, "B")
    assert decide(client, b, "APPROVE", "Memo injection; escalate to FIU", role="ANALYST",
                  action="ESCALATE").status_code == 200
    assert file(client, b).status_code == 403
    assert kinds(client, b)[-1] == "FILING_REFUSED"


@pytest.mark.parametrize("decision", ["REJECT", "MORE_INFO"])
def test_refused_when_officer_did_not_approve(client, decision):
    d = run(client, "D")
    assert decide(client, d, decision, "Officer wants the full KYC file before deciding").status_code == 200
    assert file(client, d).status_code == 403


def test_refused_when_filer_is_not_an_officer(client):
    d = run(client, "D")
    assert decide(client, d, "APPROVE", "Confirmed watchlist hit").status_code == 200
    r = file(client, d, actor="analyst.demo", role="ANALYST")
    assert r.status_code == 403 and "only a compliance officer" in r.json()["detail"]
    entry = client.get(f"/cases/{d}/audit").json()[-1]
    assert entry["kind"] == "FILING_REFUSED" and entry["actor"] == "CODE"
    assert entry["payload"]["filed_by"] == "analyst.demo" and entry["payload"]["refusal"] == "FilingRefused"


def test_refused_before_run_unknown_case_and_bad_body(client):
    d = {c["demo_tag"]: c["alert_id"] for c in client.get("/cases").json()}["D"]
    assert file(client, d).status_code == 409
    assert file(client, "ALT-99999").status_code == 404
    run(client, "D")
    assert file(client, d, actor="officer.demo", submit_to="regulator").status_code == 422
    assert file(client, d, actor="officer demo; drop").status_code == 422


# ---- success path ----

def test_files_after_officer_approval_and_writes_audit(client):
    d = run(client, "D")
    approval = decide(client, d, "APPROVE", "Confirmed watchlist hit; hold and block").json()["approval"]
    r = file(client, d)
    assert r.status_code == 200
    out = r.json()
    assert out["status"] == "SUBMITTED_SIMULATED" and out["approval_id"] == approval["record_id"]
    assert len(out["report_sha256"]) == 64
    txn_id = client.get(f"/cases/{d}").json()["summary"]["txn_id"]
    assert txn_id in out["cited_record_ids"]
    entry = client.get(f"/cases/{d}/audit").json()[-1]
    assert entry["kind"] == "FILING" and entry["actor"] == "HUMAN" and entry["record_id"] == out["filing_id"]
    assert entry["hash"] == out["audit_hash"] and entry["payload"]["approved_by"] == "officer.demo"
    assert entry["payload"]["resolution_id"] is not None
    assert client.get("/audit/verify").json()["ok"] is True


def test_filing_holds_hashes_and_ids_not_raw_text(client):
    b = run(client, "B")
    assert decide(client, b, "APPROVE", "Injection plus new payee", action="HOLD_AND_BLOCK").status_code == 200
    assert file(client, b).status_code == 200
    raw = [v for v in client.get(f"/cases/{b}").json()["raw_fields"].values() if v and len(v) > 3]
    assert raw
    entry = client.get(f"/cases/{b}/audit").json()[-1]
    text = str(entry["payload"])
    assert entry["kind"] == "FILING" and not any(v in text for v in raw)


def test_second_filing_refused_and_audited(client):
    d = run(client, "D")
    decide(client, d, "APPROVE", "Confirmed watchlist hit")
    first = file(client, d).json()["filing_id"]
    r = file(client, d)
    assert r.status_code == 409 and first in r.json()["detail"]
    assert kinds(client, d).count("FILING") == 1 and kinds(client, d)[-1] == "FILING_REFUSED"


# ---- service level: the gate holds without the API ----

def test_service_refuses_and_files(conn, tmp_path):
    g = Guard(Settings(_env_file=None, groq_model_guard="guard-test"), JsonCache(tmp_path / "c.json"), LowScore())
    alert = conn.execute("SELECT a.record_id FROM alerts a JOIN transactions t ON t.record_id = a.txn_id "
                         "WHERE t.demo_tag = 'D'").fetchone()[0]
    result = run_case(conn, alert, g, 10_000.0, make_investigator(tmp_path / "inv.json"))
    report = build_report(conn, result)
    with pytest.raises(FilingRefused):
        file_report(conn, alert, report, "officer.demo")
    record_approval(conn, alert, "analyst.demo", "APPROVE", "analyst approval", role="ANALYST", action="ESCALATE")
    with pytest.raises(FilingRefused):
        file_report(conn, alert, report, "officer.demo")
    record_approval(conn, alert, "officer.demo", "APPROVE", "officer approval", action="HOLD_AND_BLOCK")
    entry = file_report(conn, alert, report, "officer.demo")
    assert entry.payload["report_sha256"] == hashlib.sha256(report.markdown.encode()).hexdigest()
    with pytest.raises(AlreadyFiled):
        file_report(conn, alert, report, "officer.demo")
    got = [e.kind for e in audit.entries_for(conn, alert) if e.kind.startswith("FILING")]
    assert got == ["FILING_REFUSED", "FILING_REFUSED", "FILING", "FILING_REFUSED"]
    assert audit.verify(conn).ok
