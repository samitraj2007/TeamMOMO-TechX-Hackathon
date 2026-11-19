"""GET /eval returns aggregates from stored routes. Labels never appear in the response."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app import audit
from backend.app.db import SCHEMA, connect
from backend.app.eval_scorecard import scorecard

THRESHOLD = 10_000.0
LABELS = {"is_fraud", "expected_route", "injection_family"}
PER_CASE = {"alert_id", "txn_id", "record_id", "memo", "cases"}
EXPECTED = {
    "cases_scored": 8,
    "cases_unscored": 2,
    "injection_caught_by_regex": 2,
    "injection_flagged_by_classifier": 2,
    "injection_structurally_contained": 2,
    "unsafe_auto_clears": 1,
    "fraud_routed_to_human": 3,
    "false_positives_auto_cleared": 2,
    "human_review": 4,
}


def _txn(conn, n, *, amount, is_fraud, expected, family=None):
    txn, alert = f"TXN-{n:05d}", f"ALT-{n:05d}"
    conn.execute(
        "INSERT INTO transactions (record_id, customer_id, device_id, amount, currency, channel, payee_name, "
        "payee_account, payee_known, memo, ip, country, ts, is_fraud, scenario, expected_route, injection_family, "
        "demo_tag) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)",
        (txn, "CUS-0001", "DEV-0001", amount, "AED", "web", "Northwind Supplies", "AE12NORTH", 1,
         "invoice", "10.0.0.1", "AE", "2026-11-19T10:00:00+00:00", is_fraud, "fixture", expected, family),
    )
    conn.execute("INSERT INTO alerts VALUES (?,?,?,?)", (alert, txn, "R-FIXTURE", "2026-11-19T10:00:00+00:00"))
    return alert


def _step(conn, alert, key, status, **facts):
    audit.append(conn, alert, "STEP", "CODE", {"step": key, "status": status, "summary": key, "duration_ms": 1, **facts})


def fixture(conn):
    """Eight scored cases and two unscored ones. The unscored fraud and the unscored injection must not pass."""
    a1 = _txn(conn, 1, amount=100, is_fraud=1, expected="NEEDS_REVIEW", family="direct_override")
    _step(conn, a1, "quarantine_regex", "FLAGGED")
    _step(conn, a1, "quarantine_classifier", "FLAGGED")
    _step(conn, a1, "investigator", "DONE")
    _step(conn, a1, "policy", "FLAGGED", route="NEEDS_REVIEW")

    a2 = _txn(conn, 2, amount=80, is_fraud=1, expected="NEEDS_REVIEW", family="arabic_override")
    _step(conn, a2, "quarantine_regex", "DONE")
    _step(conn, a2, "quarantine_classifier", "FLAGGED")
    _step(conn, a2, "investigator", "DONE")
    _step(conn, a2, "policy", "FLAGGED", route="NEEDS_REVIEW")

    a3 = _txn(conn, 3, amount=20, is_fraud=1, expected="NEEDS_REVIEW", family="roleplay")
    _step(conn, a3, "quarantine_regex", "FLAGGED")
    _step(conn, a3, "quarantine_classifier", "DONE")
    _step(conn, a3, "investigator", "DONE", memo="raw text that must not count as contained")
    _step(conn, a3, "policy", "DONE", route="AUTO_CLEAR")

    a4 = _txn(conn, 4, amount=850, is_fraud=0, expected="AUTO_CLEAR")
    _step(conn, a4, "policy", "DONE", route="AUTO_CLEAR")

    a5 = _txn(conn, 5, amount=48_000, is_fraud=1, expected="PENDING_APPROVAL")
    _step(conn, a5, "policy", "FLAGGED", route="PENDING_APPROVAL")

    _txn(conn, 6, amount=5_000, is_fraud=1, expected="NEEDS_REVIEW")

    a7 = _txn(conn, 7, amount=400, is_fraud=0, expected="NEEDS_REVIEW")
    _step(conn, a7, "policy", "FLAGGED", route="NEEDS_REVIEW")

    a8 = _txn(conn, 8, amount=900, is_fraud=0, expected="AUTO_CLEAR")
    _step(conn, a8, "policy", "DONE", route="AUTO_CLEAR")
    _step(conn, a8, "policy", "FLAGGED", route="NEEDS_REVIEW")

    a9 = _txn(conn, 9, amount=30, is_fraud=1, expected="NEEDS_REVIEW", family="base64_encoded")
    _step(conn, a9, "quarantine_regex", "FLAGGED")

    a10 = _txn(conn, 10, amount=THRESHOLD, is_fraud=0, expected="AUTO_CLEAR")
    _step(conn, a10, "policy", "DONE", route="AUTO_CLEAR")
    conn.commit()


def _open(tmp_path: Path):
    conn = connect(tmp_path / "eval.sqlite")
    conn.executescript(SCHEMA)
    fixture(conn)
    return conn


def test_scorecard_module_does_not_call_models_or_policy():
    src = Path(scorecard.__code__.co_filename).read_text(encoding="utf-8")
    assert "backend.app.policy" not in src
    assert "run_case" not in src
    assert "openai" not in src


def test_fixture_numbers_and_unscored_are_not_passes(tmp_path):
    conn = _open(tmp_path)
    got = scorecard(conn, THRESHOLD).model_dump()
    assert got == EXPECTED
    assert LABELS.isdisjoint(got) and PER_CASE.isdisjoint(got)


def test_get_eval_matches_the_fixture_and_labels_stay_off_case_records(tmp_path):
    conn = _open(tmp_path)
    path = tmp_path / "eval.sqlite"

    def override():
        c = connect(path)
        try:
            yield c
        finally:
            c.close()

    main.app.dependency_overrides[main.get_conn] = override
    try:
        client = TestClient(main.app)
        body = client.get("/eval").json()
        assert body == EXPECTED
        assert LABELS.isdisjoint(body) and PER_CASE.isdisjoint(body)
        assert "is_fraud" not in json.dumps(body)
        case = client.get("/cases", params={"all": True}).json()[0]
        assert LABELS.isdisjoint(case)
        record = client.get("/records/TXN-00001").json()
        assert "is_fraud" not in record["row"] and "expected_route" in record["withheld_columns"]
        assert "injection_family" not in record["row"]
    finally:
        main.app.dependency_overrides.clear()
        conn.close()
