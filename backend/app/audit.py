"""Append-only, hash-chained audit log for every pipeline step and human decision.

hash = sha256(prev_hash + canonical JSON of [seq, record_id, ts, alert_id, kind, actor, payload]). The payload is
stored as the exact canonical text that was hashed, so verification never depends on re-serialisation. SQLite
triggers reject UPDATE and DELETE; `verify` catches edits made around them. Truncating the tail is only detectable
against an anchor (a head hash recorded elsewhere, e.g. in a filed report).
"""

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel

GENESIS = "0" * 64
Kind = Literal["INGEST", "STEP", "DECISION", "DECISION_REFUSED", "COMMIT", "COMMIT_REFUSED"]


class AuditEntry(BaseModel):
    seq: int
    record_id: str
    ts: str
    alert_id: str | None
    kind: Kind
    actor: str
    payload: dict
    prev_hash: str
    hash: str


class AuditVerify(BaseModel):
    ok: bool
    entries: int
    head_record_id: str | None
    head_hash: str
    first_bad_record_id: str | None = None
    reason: Literal["SEQUENCE_GAP", "PREV_HASH_MISMATCH", "HASH_MISMATCH", "ANCHOR_NOT_FOUND"] | None = None


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(prev_hash: str, seq: int, record_id: str, ts: str, alert_id: str | None, kind: str, actor: str,
           payload_text: str) -> str:
    body = canonical([seq, record_id, ts, alert_id, kind, actor, payload_text])
    return hashlib.sha256((prev_hash + body).encode("utf-8")).hexdigest()


def append(conn: sqlite3.Connection, alert_id: str | None, kind: Kind, actor: str, payload: dict) -> AuditEntry:
    """Inserts without committing; the caller's transaction commits it with the change it records."""
    last = conn.execute("SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
    seq, prev = (last[0] + 1, last[1]) if last else (1, GENESIS)
    record_id, ts, text = f"AUD-{seq:06d}", datetime.now(timezone.utc).isoformat(), canonical(payload)
    h = digest(prev, seq, record_id, ts, alert_id, kind, actor, text)
    conn.execute("INSERT INTO audit_log (seq, record_id, ts, alert_id, kind, actor, payload, prev_hash, hash) "
                 "VALUES (?,?,?,?,?,?,?,?,?)", (seq, record_id, ts, alert_id, kind, actor, text, prev, h))
    return AuditEntry(seq=seq, record_id=record_id, ts=ts, alert_id=alert_id, kind=kind, actor=actor,
                      payload=json.loads(text), prev_hash=prev, hash=h)


def _entry(row: sqlite3.Row) -> AuditEntry:
    return AuditEntry(**{**dict(row), "payload": json.loads(row["payload"])})


def entries_for(conn: sqlite3.Connection, alert_id: str) -> list[AuditEntry]:
    return [_entry(r) for r in conn.execute("SELECT * FROM audit_log WHERE alert_id = ? ORDER BY seq", (alert_id,))]


def latest_for(conn: sqlite3.Connection, alert_id: str) -> AuditEntry | None:
    row = conn.execute("SELECT * FROM audit_log WHERE alert_id = ? ORDER BY seq DESC LIMIT 1", (alert_id,)).fetchone()
    return _entry(row) if row else None


def verify(conn: sqlite3.Connection, anchor: str | None = None) -> AuditVerify:
    prev, n, head_id, seen_anchor = GENESIS, 0, None, anchor is None
    for row in conn.execute("SELECT * FROM audit_log ORDER BY seq"):
        n += 1

        def bad(reason) -> AuditVerify:
            return AuditVerify(ok=False, entries=n, head_record_id=head_id, head_hash=prev,
                               first_bad_record_id=row["record_id"], reason=reason)

        if row["seq"] != n or row["record_id"] != f"AUD-{n:06d}":
            return bad("SEQUENCE_GAP")
        if row["prev_hash"] != prev:
            return bad("PREV_HASH_MISMATCH")
        if digest(prev, row["seq"], row["record_id"], row["ts"], row["alert_id"], row["kind"], row["actor"],
                  row["payload"]) != row["hash"]:
            return bad("HASH_MISMATCH")
        prev, head_id = row["hash"], row["record_id"]
        seen_anchor = seen_anchor or prev == anchor
    if not seen_anchor:
        return AuditVerify(ok=False, entries=n, head_record_id=head_id, head_hash=prev, reason="ANCHOR_NOT_FOUND")
    return AuditVerify(ok=True, entries=n, head_record_id=head_id, head_hash=prev)
