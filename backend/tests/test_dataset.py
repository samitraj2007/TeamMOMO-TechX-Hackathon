import sqlite3
from collections import Counter

from backend.data.generate import N_TRANSACTIONS, build_dataset, generate


def test_deterministic():
    assert build_dataset() == build_dataset()


def test_different_seed_differs():
    assert build_dataset(1) != build_dataset(2)


def test_counts_and_mix():
    d = build_dataset()
    tx = d["transactions"]
    assert len(tx) == N_TRANSACTIONS
    assert len(d["velocity_logs"]) == N_TRANSACTIONS and 90 <= len(d["alerts"]) <= 110
    assert 100 <= len(d["customers"]) <= 200
    assert 120 <= len(d["devices"]) <= 260
    assert len(d["watchlist"]) == 8
    scen = Counter(t["scenario"] for t in tx)
    assert scen["hostile_memo"] >= 40
    assert scen["benign_trigger_word"] >= 6
    assert sum(t["is_fraud"] for t in tx) < N_TRANSACTIONS * 0.2
    assert all(t["currency"] == "AED" for t in tx)
    assert any(t["amount"] > 10_000 for t in tx)


def test_record_ids_unique_across_tables():
    d = build_dataset()
    ids = [r["record_id"] for rows in d.values() for r in rows]
    assert len(ids) == len(set(ids))


def test_hostile_rows_labelled():
    tx = build_dataset()["transactions"]
    hostile = [t for t in tx if t["scenario"] == "hostile_memo"]
    assert all(t["injection_family"] and t["expected_route"] == "NEEDS_REVIEW" for t in hostile)
    assert all(t["injection_family"] is None for t in tx if t["scenario"] != "hostile_memo")


def test_pinned_demo_cases():
    tx = {t["demo_tag"]: t for t in build_dataset()["transactions"] if t["demo_tag"]}
    assert set("ABCDEFGHT") <= set(tx)
    assert tx["A"]["expected_route"] == "AUTO_CLEAR" and tx["A"]["amount"] == 850.0
    assert tx["B"]["amount"] == 3_500.0 and "SYSTEM OVERRIDE" in tx["B"]["memo"]
    assert tx["D"]["amount"] == 48_000.0 and tx["D"]["expected_route"] == "PENDING_APPROVAL"
    assert tx["E"]["scenario"] == "benign_namesake"


def test_generate_writes_sqlite_with_valid_references(tmp_path):
    path = tmp_path / "mini.sqlite"
    counts = generate(path)
    assert counts["transactions"] == N_TRANSACTIONS
    conn = sqlite3.connect(path)
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == N_TRANSACTIONS
    conn.close()
