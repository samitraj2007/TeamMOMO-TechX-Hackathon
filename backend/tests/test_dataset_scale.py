"""1,000-row dataset: core 100 unchanged, ~100 alerts, hostile and trigger extras, run-any-transaction endpoint."""
import hashlib
import json
import re

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app.agents.cache import JsonCache
from backend.app.config import Settings, get_settings
from backend.app.security.classifier import Guard
from backend.app.security.regex_filter import scan_field
from backend.data.generate import BASE_TS, BENIGN_TRIGGER_EXTRA, HOSTILE_EXTRA, N_CORE, build_dataset
from backend.tests.fakes import make_investigator

# sha256 of the core rows as produced by the 100-row generator at phase-0-slice (cases A, B, D included).
CORE_FINGERPRINT = "cda14927dd6f9c6045fbbe79664ea2f4c67130083bca058603e5de5310d99602"
ARABIC = re.compile(r"[\u0600-\u06FF]")


@pytest.fixture(scope="module")
def data():
    return build_dataset()


def codes(raw, field="memo"):
    return {h.code for h in scan_field(raw, field)[0]}


def test_core_rows_identical_to_original_generator(data):
    core = {"transactions": data["transactions"][:N_CORE], "customers": data["customers"][:30],
            "devices": data["devices"][:40], "velocity_logs": data["velocity_logs"][:N_CORE],
            "watchlist": data["watchlist"]}
    blob = json.dumps(core, sort_keys=True, ensure_ascii=False).encode()
    assert hashlib.sha256(blob).hexdigest() == CORE_FINGERPRINT


def test_demo_cases_keep_their_ids(data):
    tags = {t["demo_tag"]: t["record_id"] for t in data["transactions"] if t["demo_tag"]}
    alerts = {a["txn_id"]: a["record_id"] for a in data["alerts"]}
    for tag in "ABD":
        assert tag in tags and int(tags[tag].split("-")[1]) <= N_CORE
        assert alerts[tags[tag]] == tags[tag].replace("TXN", "ALT")


def test_scale_and_alert_mix(data):
    tx = data["transactions"]
    alerted = {a["txn_id"] for a in data["alerts"]}
    assert len(tx) == 1000 and len({t["record_id"] for t in tx}) == 1000
    rows = [t for t in tx if t["record_id"] in alerted]
    fraud = sum(t["is_fraud"] for t in rows)
    assert 95 <= len(rows) <= 105
    assert 8 <= fraud <= 20 and len(rows) - fraud >= 80
    hostile = [t for t in rows if t["scenario"] == "hostile_memo"]
    assert len(hostile) >= 40
    assert sum(1 for t in hostile if ARABIC.search((t["memo"] or "") + (t["payee_name"] or ""))) >= 10
    assert sum(t["scenario"] == "benign_trigger_word" for t in rows) >= 6
    assert sum(t["scenario"] in ("watchlist_hit", "watchlist_payee") for t in rows) >= 3


def test_alert_and_velocity_ids_share_the_transaction_number(data):
    for a in data["alerts"]:
        assert a["record_id"][4:] == a["txn_id"][4:]
    assert {v["record_id"][4:] for v in data["velocity_logs"]} == {t["record_id"][4:] for t in data["transactions"]}


def test_every_non_alerted_row_is_benign_auto_clear(data):
    alerted = {a["txn_id"] for a in data["alerts"]}
    rows = [t for t in data["transactions"] if t["record_id"] not in alerted]
    assert len(rows) >= 890
    for t in rows:
        assert t["is_fraud"] == 0 and t["expected_route"] == "AUTO_CLEAR" and t["injection_family"] is None


def test_new_rows_dated_before_base_so_ingest_velocity_is_unchanged(data):
    for t in data["transactions"][N_CORE:]:
        assert t["ts"] < BASE_TS.isoformat()


@pytest.mark.parametrize("family,memo,payee", HOSTILE_EXTRA, ids=[h[0] for h in HOSTILE_EXTRA])
def test_every_hostile_extra_caught_by_regex(family, memo, payee):
    found = codes(memo.format(n=4321)) | (codes(payee, "payee_name") if payee else set())
    assert found, f"{family} not caught"


@pytest.mark.parametrize("memo", BENIGN_TRIGGER_EXTRA)
def test_benign_trigger_extras_not_flagged(memo):
    assert codes(memo) == set()


# ---- API: run the pipeline on any transaction ----

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


def test_transactions_list_labels_alerted(client):
    everything = client.get("/transactions?limit=1000").json()
    assert len(everything) == 1000
    alerted = client.get("/transactions?alerted=true&limit=1000").json()
    quiet = client.get("/transactions?alerted=false&limit=1000").json()
    assert len(alerted) + len(quiet) == 1000 and len(alerted) == len(client.get("/cases?all=true").json())
    assert all(t["alert_id"] is None and not t["alerted"] for t in quiet)
    assert len(client.get("/transactions?limit=10&offset=995").json()) == 5


def test_run_non_alerted_transaction_is_labelled_and_audited(client):
    txn_id = client.get("/transactions?alerted=false&limit=1").json()[0]["txn_id"]
    body = client.post(f"/transactions/{txn_id}/run").json()
    assert body["alerted"] is False and body["rule_id"] == "MANUAL-RUN"
    assert body["label"].startswith("Not alerted by rules")
    assert body["alert_id"] == txn_id.replace("TXN", "ALT")
    assert body["run"]["decision"]["route"] == "AUTO_CLEAR"
    trail = client.get(f"/cases/{body['alert_id']}/audit").json()
    assert trail[0]["kind"] == "MANUAL_RUN"
    case = client.get(f"/cases/{body['alert_id']}").json()["summary"]
    assert case["alerted"] is False and case["title"].startswith("Not alerted by rules")
    listed = {t["txn_id"]: t for t in client.get("/transactions?alerted=false&limit=1000").json()}
    assert listed[txn_id]["alert_id"] == body["alert_id"] and listed[txn_id]["last_route"] == "AUTO_CLEAR"
    again = client.post(f"/transactions/{txn_id}/run").json()
    assert again["alert_id"] == body["alert_id"]
    assert [e["kind"] for e in client.get(f"/cases/{body['alert_id']}/audit").json()].count(
        "MANUAL_RUN") == 1


def test_run_alerted_transaction_reuses_its_alert(client):
    case = next(c for c in client.get("/cases").json() if c["demo_tag"] == "D")
    body = client.post(f"/transactions/{case['txn_id']}/run").json()
    assert body["alerted"] is True and body["alert_id"] == case["alert_id"] and body["rule_id"] == case["rule_id"]
    assert body["run"]["decision"]["route"] == "PENDING_APPROVAL"


def test_sample_of_non_alerted_rows_route_as_labelled(client):
    quiet = client.get("/transactions?alerted=false&limit=1000").json()
    for t in quiet[::45]:
        assert client.post(f"/transactions/{t['txn_id']}/run").json()["run"]["decision"]["route"] == "AUTO_CLEAR"


def test_run_unknown_or_malformed_transaction(client):
    assert client.post("/transactions/TXN-99999/run").status_code == 404
    assert client.post("/transactions/ALT-00001/run").status_code == 422


def test_ingest_ids_follow_the_highest_transaction_number(client):
    body = {"customer_id": "CUS-0021", "device_id": "DEV-0021", "amount": 120.0, "currency": "AED",
            "channel": "mobile", "payee_name": "Spinneys", "memo": "groceries"}
    out = client.post("/cases/ingest", json=body).json()
    assert out["txn_id"] == "TXN-01001" and out["alert_id"] == "ALT-01001"
    quiet = client.get("/transactions?alerted=false&limit=1").json()[0]["txn_id"]
    assert client.post(f"/transactions/{quiet}/run").status_code == 200
    second = client.post("/cases/ingest", json=body).json()
    assert second["txn_id"] == "TXN-01002" and second["alert_id"] == "ALT-01002"


def test_manual_run_keeps_the_audit_chain_valid(client):
    txn_id = client.get("/transactions?alerted=false&limit=1").json()[0]["txn_id"]
    client.post(f"/transactions/{txn_id}/run")
    assert client.get("/audit/verify").json()["ok"] is True
