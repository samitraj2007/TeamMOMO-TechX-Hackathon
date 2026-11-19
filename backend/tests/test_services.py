import pytest

from backend.app.matching.names import arabic_key, latin_key
from backend.app.schemas import Route
from backend.app.services.case_resolution import ApprovalRequired, commit_case_resolution, record_approval
from backend.app.services.kyc_devices import RecordNotFound, fetch_customer_kyc_and_devices
from backend.app.services.sanctions import check_sanctions_watchlist
from backend.app.services.velocity import fetch_velocity


def _customer(conn, cid):
    return dict(conn.execute("SELECT * FROM customers WHERE record_id = ?", (cid,)).fetchone())


def _alert(conn, txn_id):
    return conn.execute("SELECT record_id FROM alerts WHERE txn_id = ?", (txn_id,)).fetchone()[0]


def test_name_keys_ignore_articles_order_and_marks():
    assert latin_key("Ahmed Nasser Al-Qasimi") == latin_key("qasimi ahmed NASSER")
    assert arabic_key("أحمد ناصر القاسمي") == arabic_key("احمد ناصر قاسمي")
    assert arabic_key("مُحَمَّد") == arabic_key("محمد")


def test_kyc_devices_returns_record_ids(conn, demo):
    a = demo["A"]
    r = fetch_customer_kyc_and_devices(conn, a["customer_id"], a["device_id"])
    assert r.customer.record_id == a["customer_id"]
    assert r.device_known_and_verified is True
    assert a["customer_id"] in r.record_ids and a["device_id"] in r.record_ids


def test_kyc_unknown_customer_raises(conn):
    with pytest.raises(RecordNotFound):
        fetch_customer_kyc_and_devices(conn, "CUS-9999", "DEV-0001")


def test_account_takeover_device_not_verified(conn):
    row = conn.execute("SELECT * FROM transactions WHERE scenario = 'account_takeover' LIMIT 1").fetchone()
    r = fetch_customer_kyc_and_devices(conn, row["customer_id"], row["device_id"])
    assert r.device_known_and_verified is False


def test_sanctions_alias_hit_with_dob(conn, demo):
    c = _customer(conn, demo["D"]["customer_id"])
    r = check_sanctions_watchlist(conn, c["name"], c["name_ar"], c["dob"], c["nationality"])
    assert r.band == "HIT"
    assert r.matches[0].watchlist_id == "WL-002" and r.matches[0].matched_on == "alias"


def test_sanctions_namesake_is_possible_not_hit(conn, demo):
    c = _customer(conn, demo["E"]["customer_id"])
    r = check_sanctions_watchlist(conn, c["name"], c["name_ar"], c["dob"], c["nationality"])
    assert r.band == "POSSIBLE"
    assert r.matches[0].dob_match is False


def test_sanctions_arabic_script_match(conn):
    r = check_sanctions_watchlist(conn, "Unknown Latin Spelling", "مُحَمَّد صالح درويش", "1981-07-02", "JO")
    assert r.band == "HIT" and r.matches[0].matched_on == "name_ar"


def test_sanctions_clear_for_ordinary_customer(conn, demo):
    c = _customer(conn, demo["A"]["customer_id"])
    assert check_sanctions_watchlist(conn, c["name"], c["name_ar"], c["dob"], c["nationality"]).band == "CLEAR"


def test_velocity(conn, demo):
    v = fetch_velocity(conn, demo["A"]["record_id"])
    assert v.record_id.startswith("VEL-") and v.txn_count_24h >= 1


def test_commit_refuses_pending_approval_without_approval(conn, demo):
    alert = _alert(conn, demo["D"]["record_id"])
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, alert, Route.PENDING_APPROVAL, "HOLD_AND_BLOCK")
    assert conn.execute("SELECT COUNT(*) FROM resolutions").fetchone()[0] == 0


def test_commit_refuses_after_rejection(conn, demo):
    alert = _alert(conn, demo["D"]["record_id"])
    record_approval(conn, alert, "officer.demo", "REJECT", "Insufficient evidence")
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, alert, Route.PENDING_APPROVAL, "HOLD_AND_BLOCK")


def test_commit_succeeds_after_approval(conn, demo):
    alert = _alert(conn, demo["D"]["record_id"])
    apr = record_approval(conn, alert, "officer.demo", "APPROVE", "Watchlist alias confirmed by DOB")
    res = commit_case_resolution(conn, alert, Route.PENDING_APPROVAL, "HOLD_AND_BLOCK")
    assert res.approval_id == apr.record_id


def test_block_always_needs_approval(conn, demo):
    alert = _alert(conn, demo["A"]["record_id"])
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, alert, Route.AUTO_CLEAR, "HOLD_AND_BLOCK")


def test_needs_review_cannot_be_cleared_without_human(conn, demo):
    alert = _alert(conn, demo["B"]["record_id"])
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, alert, Route.NEEDS_REVIEW, "CLEAR")


def test_auto_clear_commit_allowed(conn, demo):
    alert = _alert(conn, demo["A"]["record_id"])
    assert commit_case_resolution(conn, alert, Route.AUTO_CLEAR, "CLEAR").approval_id is None


def test_approval_reason_required(conn, demo):
    alert = _alert(conn, demo["D"]["record_id"])
    with pytest.raises(ValueError):
        record_approval(conn, alert, "officer.demo", "APPROVE", "  ")
