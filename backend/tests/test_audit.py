import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
from backend.app import audit
from backend.app.agents.cache import JsonCache
from backend.app.config import Settings, get_settings
from backend.app.pipeline import free_text_fields, run_case
from backend.app.schemas import Route
from backend.app.security.classifier import Guard
from backend.app.services.case_resolution import ApprovalRequired, commit_case_resolution, record_approval
from backend.tests.fakes import make_investigator

THRESHOLD = 10_000.0


class LowScore:
    def score(self, text):
        return 0.01


def guard(tmp_path):
    s = Settings(_env_file=None, groq_model_guard="guard-test")
    return Guard(s, JsonCache(tmp_path / "g.json"), LowScore())


def alert_of(conn, demo, tag):
    return conn.execute("SELECT record_id FROM alerts WHERE txn_id = ?", (demo[tag]["record_id"],)).fetchone()[0]


def kinds(conn, alert_id):
    return [(e.kind, e.payload.get("step")) for e in audit.entries_for(conn, alert_id)]


def drop_guards(conn):
    """Simulates an attacker with raw write access to the database file."""
    conn.execute("DROP TRIGGER audit_log_no_update")
    conn.execute("DROP TRIGGER audit_log_no_delete")


@pytest.fixture
def chain(conn, demo, tmp_path):
    """A, B and D run; D approved and committed by an officer. Returns (conn, D alert id)."""
    g, i = guard(tmp_path), make_investigator(tmp_path / "i.json")
    for tag in "ABD":
        run_case(conn, alert_of(conn, demo, tag), g, THRESHOLD, i)
    d = alert_of(conn, demo, "D")
    with pytest.raises(ApprovalRequired):
        commit_case_resolution(conn, d, Route.PENDING_APPROVAL, "HOLD_AND_BLOCK", THRESHOLD)
    record_approval(conn, d, "officer.amira", "APPROVE", "Watchlist hit with DOB match", action="HOLD_AND_BLOCK")
    commit_case_resolution(conn, d, Route.PENDING_APPROVAL, "HOLD_AND_BLOCK", THRESHOLD)
    return conn, d


# ---- every step and decision is recorded, in order ----

def test_every_pipeline_step_is_recorded_in_order(conn, demo, tmp_path):
    a = alert_of(conn, demo, "A")
    r = run_case(conn, a, guard(tmp_path), THRESHOLD, make_investigator(tmp_path / "i.json"))
    assert r.decision.route == Route.AUTO_CLEAR
    steps = [k for k in r.steps]
    assert kinds(conn, a) == [("STEP", s.key) for s in steps[:-1]] + [("COMMIT", None), ("STEP", "gate")]
    entries = audit.entries_for(conn, a)
    assert entries[0].prev_hash == audit.GENESIS
    assert all(e.prev_hash == p.hash for p, e in zip(entries, entries[1:]))
    policy = next(e for e in entries if e.payload.get("step") == "policy")
    assert policy.payload["route"] == "AUTO_CLEAR" and "AMOUNT_WITHIN_THRESHOLD" in policy.payload["reasons"]
    inv = next(e for e in entries if e.payload.get("step") == "investigator")
    assert inv.actor == "LLM" and inv.payload["model"] == "main-test" and inv.payload["total_tokens"] == 380
    assert audit.verify(conn).ok


def test_human_decisions_and_refusals_are_recorded(chain):
    conn, d = chain
    trail = [e for e in audit.entries_for(conn, d) if e.kind != "STEP"]
    assert [e.kind for e in trail] == ["COMMIT_REFUSED", "DECISION", "COMMIT"]
    refused, decision, commit = trail
    assert refused.payload["refusal"] == "ApprovalRequired" and refused.actor == "CODE"
    assert decision.actor == "HUMAN" and decision.payload["user"] == "officer.amira"
    assert decision.payload["reason"] == "Watchlist hit with DOB match"
    assert commit.payload["approval_id"] == decision.payload["approval_id"]
    v = audit.verify(conn)
    assert v.ok and v.entries == len(conn.execute("SELECT * FROM audit_log").fetchall())


def test_rerun_appends_and_never_rewrites(conn, demo, tmp_path):
    b = alert_of(conn, demo, "B")
    g, i = guard(tmp_path), make_investigator(tmp_path / "i.json")
    run_case(conn, b, g, THRESHOLD, i)
    first = [e.hash for e in audit.entries_for(conn, b)]
    run_case(conn, b, g, THRESHOLD, i)
    again = [e.hash for e in audit.entries_for(conn, b)]
    assert again[:len(first)] == first and len(again) == 2 * len(first)


def test_report_cites_latest_audit_entry(chain, demo, tmp_path):
    conn, d = chain
    r = run_case(conn, d, guard(tmp_path), THRESHOLD, make_investigator(tmp_path / "i.json"))
    head = audit.latest_for(conn, d)
    line = next(c for c in r.report.sentences if c.section == "audit_ref")
    assert line.accepted and line.record_ids == [head.record_id] and head.hash in line.text
    assert conn.execute("SELECT 1 FROM audit_log WHERE record_id = ?", (head.record_id,)).fetchone()


def test_audit_payloads_hold_no_raw_free_text(conn, tmp_path):
    g, i = guard(tmp_path), make_investigator(tmp_path / "i.json")
    hostile = conn.execute("SELECT a.record_id, t.* FROM alerts a JOIN transactions t ON t.record_id = a.txn_id "
                           "WHERE t.injection_family IS NOT NULL").fetchall()
    for row in hostile:
        run_case(conn, row[0], g, THRESHOLD, i)
        text = " ".join(r[0] for r in conn.execute("SELECT payload FROM audit_log WHERE alert_id = ?", (row[0],)))
        for raw in free_text_fields(conn, dict(row)).values():
            if raw and len(raw) > 8:
                assert raw not in text, (row[0], raw)


# ---- tamper detection ----

def test_update_and_delete_are_blocked_by_triggers(chain):
    conn, _ = chain
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        conn.execute("UPDATE audit_log SET actor = 'CODE' WHERE seq = 3")
    with pytest.raises(sqlite3.DatabaseError, match="append-only"):
        conn.execute("DELETE FROM audit_log WHERE seq = 3")
    assert audit.verify(conn).ok


def _edit_payload(conn, seq, **changes):
    payload = json.loads(conn.execute("SELECT payload FROM audit_log WHERE seq = ?", (seq,)).fetchone()[0])
    conn.execute("UPDATE audit_log SET payload = ? WHERE seq = ?", (audit.canonical({**payload, **changes}), seq))


def _seq_of(conn, alert_id, kind):
    return conn.execute("SELECT seq FROM audit_log WHERE alert_id = ? AND kind = ? ORDER BY seq LIMIT 1",
                        (alert_id, kind)).fetchone()[0]


@pytest.mark.parametrize("column,value", [("actor", "CODE"), ("kind", "COMMIT"), ("ts", "2026-01-01T00:00:00+00:00"),
                                          ("alert_id", "ALT-00001")])
def test_edited_column_is_detected(chain, column, value):
    conn, d = chain
    drop_guards(conn)
    seq = _seq_of(conn, d, "DECISION")
    conn.execute(f"UPDATE audit_log SET {column} = ? WHERE seq = ?", (value, seq))
    v = audit.verify(conn)
    assert not v.ok and v.reason == "HASH_MISMATCH" and v.first_bad_record_id == f"AUD-{seq:06d}"


def test_rewritten_human_reason_is_detected(chain):
    conn, d = chain
    drop_guards(conn)
    seq = _seq_of(conn, d, "DECISION")
    _edit_payload(conn, seq, reason="Customer verified by phone", action="CLEAR")
    v = audit.verify(conn)
    assert not v.ok and v.reason == "HASH_MISMATCH" and v.first_bad_record_id == f"AUD-{seq:06d}"


def test_edit_with_recomputed_own_hash_breaks_the_next_link(chain):
    conn, d = chain
    drop_guards(conn)
    seq = _seq_of(conn, d, "DECISION")
    _edit_payload(conn, seq, reason="Customer verified by phone")
    row = conn.execute("SELECT * FROM audit_log WHERE seq = ?", (seq,)).fetchone()
    forged = audit.digest(row["prev_hash"], seq, row["record_id"], row["ts"], row["alert_id"], row["kind"],
                          row["actor"], row["payload"])
    conn.execute("UPDATE audit_log SET hash = ? WHERE seq = ?", (forged, seq))
    v = audit.verify(conn)
    assert not v.ok and v.reason == "PREV_HASH_MISMATCH" and v.first_bad_record_id == f"AUD-{seq + 1:06d}"


def test_deleted_entry_is_detected(chain):
    conn, d = chain
    drop_guards(conn)
    seq = _seq_of(conn, d, "COMMIT_REFUSED")
    conn.execute("DELETE FROM audit_log WHERE seq = ?", (seq,))
    v = audit.verify(conn)
    assert not v.ok and v.reason == "SEQUENCE_GAP"


def test_full_chain_rewrite_is_caught_by_anchor(chain):
    """An attacker who recomputes every later hash passes a bare verify; a previously recorded head does not."""
    conn, d = chain
    anchor = audit.verify(conn).head_hash
    drop_guards(conn)
    seq = _seq_of(conn, d, "DECISION")
    _edit_payload(conn, seq, reason="Customer verified by phone")
    prev = conn.execute("SELECT hash FROM audit_log WHERE seq = ?", (seq - 1,)).fetchone()[0]
    for row in conn.execute("SELECT * FROM audit_log WHERE seq >= ? ORDER BY seq", (seq,)).fetchall():
        h = audit.digest(prev, row["seq"], row["record_id"], row["ts"], row["alert_id"], row["kind"], row["actor"],
                         row["payload"])
        conn.execute("UPDATE audit_log SET prev_hash = ?, hash = ? WHERE seq = ?", (prev, h, row["seq"]))
        prev = h
    assert audit.verify(conn).ok
    v = audit.verify(conn, anchor=anchor)
    assert not v.ok and v.reason == "ANCHOR_NOT_FOUND"


def test_truncated_tail_is_caught_by_anchor(chain):
    conn, _ = chain
    anchor = audit.verify(conn).head_hash
    drop_guards(conn)
    conn.execute("DELETE FROM audit_log WHERE seq = (SELECT MAX(seq) FROM audit_log)")
    assert audit.verify(conn, anchor=anchor).reason == "ANCHOR_NOT_FOUND"
    assert audit.verify(conn, anchor=audit.verify(conn).head_hash).ok


def test_empty_log_verifies():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    from backend.app.db import SCHEMA
    c.executescript(SCHEMA)
    v = audit.verify(c)
    assert v.ok and v.entries == 0 and v.head_hash == audit.GENESIS


# ---- API ----

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
    return TestClient(main.app), s.db_file


def _demo_alert(c, tag):
    return next(x["alert_id"] for x in c.get("/cases").json() if x["demo_tag"] == tag)


def test_api_verify_case_trail_and_records(client):
    c, _ = client
    d = _demo_alert(c, "D")
    c.post(f"/cases/{d}/run")
    assert c.post(f"/cases/{d}/decision", json={"decision": "APPROVE", "reason": "Officer only",
                                                "role": "ANALYST"}).status_code == 403
    assert c.post(f"/cases/{d}/decision", json={"decision": "APPROVE", "action": "HOLD_AND_BLOCK",
                                                "reason": "Watchlist hit with DOB match"}).status_code == 200
    trail = c.get(f"/cases/{d}/audit").json()
    assert [e["kind"] for e in trail if e["kind"] != "STEP"] == ["DECISION_REFUSED", "DECISION", "COMMIT"]
    v = c.get("/audit/verify").json()
    assert v["ok"] and v["entries"] == len(trail) and v["head_record_id"] == trail[-1]["record_id"]
    rec = c.get(f"/records/{trail[-1]['record_id']}").json()
    assert rec["table"] == "audit_log" and rec["row"]["hash"] == v["head_hash"]
    assert c.get("/audit/verify", params={"anchor": v["head_hash"]}).json()["ok"]
    assert c.get("/audit/verify", params={"anchor": "not-a-hash"}).status_code == 422
    report = c.get(f"/cases/{d}/report").json()
    assert v["head_hash"] in report["markdown"]


def test_api_verify_reports_tampering(client):
    c, db_file = client
    a = _demo_alert(c, "A")
    c.post(f"/cases/{a}/run")
    raw = sqlite3.connect(db_file)
    raw.execute("DROP TRIGGER audit_log_no_update")
    raw.execute("UPDATE audit_log SET payload = replace(payload, 'AUTO_CLEAR', 'NEEDS_REVIEW') "
                "WHERE payload LIKE '%AUTO_CLEAR%'")
    raw.commit()
    raw.close()
    v = c.get("/audit/verify").json()
    assert not v["ok"] and v["reason"] == "HASH_MISMATCH" and v["first_bad_record_id"].startswith("AUD-")


def test_api_ingest_is_audited_before_its_steps(client):
    c, _ = client
    r = c.post("/cases/ingest", json={"customer_id": "CUS-0021", "device_id": "DEV-0021", "amount": 640.0,
                                      "currency": "AED", "channel": "web", "memo": "Supplier payment INV-7781"})
    trail = c.get(f"/cases/{r.json()['alert_id']}/audit").json()
    assert trail[0]["kind"] == "INGEST" and trail[0]["actor"] == "API"
    assert trail[0]["payload"]["memo_chars"] == 25 and "Supplier" not in json.dumps(trail[0]["payload"])
    assert trail[1]["payload"]["step"] == "received"
    assert c.get("/audit/verify").json()["ok"]
