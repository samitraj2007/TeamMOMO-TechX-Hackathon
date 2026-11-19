"""Ingest an unseen transaction: strict validation, size limits, then the full pipeline.

Type-invalid input is rejected with 422 and never stored. Valid but partial or odd input (unknown customer or
device, non-AED currency, oversize or hostile free text) is stored and run; the policy engine routes it to review.
"""

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

from backend.app import audit

MAX_BODY_BYTES = 32_768
MEMO_MAX_CHARS = 10_000
NAME_MAX_CHARS = 200


class IngestIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    customer_id: Annotated[str, StringConstraints(pattern=r"^CUS-\d{4,6}$")]
    device_id: Annotated[str, StringConstraints(pattern=r"^DEV-\d{4,6}$")] | None = None
    amount: float = Field(gt=0, le=100_000_000, allow_inf_nan=False)
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")]
    channel: Literal["mobile", "web", "branch"]
    country: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")] = "AE"
    payee_name: str | None = Field(default=None, max_length=NAME_MAX_CHARS)
    payee_account: Annotated[str, StringConstraints(pattern=r"^[A-Z0-9]{4,34}$")] | None = None
    payee_known: bool = False
    memo: str | None = Field(default=None, max_length=MEMO_MAX_CHARS)
    ts: AwareDatetime | None = None


def _next(conn: sqlite3.Connection, table: str, prefix: str) -> str:
    return f"{prefix}-{conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0] + 1:05d}"


def store(conn: sqlite3.Connection, body: IngestIn) -> tuple[str, str]:
    """Insert transaction, alert and a code-computed 24h velocity row. Returns (alert_id, txn_id)."""
    ts = (body.ts or datetime.now(timezone.utc)).astimezone(timezone.utc)
    txn_id, alert_id, vel_id = _next(conn, "transactions", "TXN"), _next(conn, "alerts", "ALT"), \
        _next(conn, "velocity_logs", "VEL")
    conn.execute(
        "INSERT INTO transactions (record_id, customer_id, device_id, amount, currency, channel, payee_name, "
        "payee_account, payee_known, memo, ip, country, ts, is_fraud, scenario, expected_route, injection_family, "
        "demo_tag) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,-1,'ingested','UNKNOWN',NULL,NULL)",
        (txn_id, body.customer_id, body.device_id, body.amount, body.currency, body.channel, body.payee_name,
         body.payee_account, int(body.payee_known), body.memo, body.country, ts.isoformat()))
    since = (ts - timedelta(hours=24)).isoformat()
    window = conn.execute("SELECT amount, payee_known FROM transactions WHERE customer_id = ? AND ts > ? AND ts <= ?",
                          (body.customer_id, since, ts.isoformat())).fetchall()
    conn.execute("INSERT INTO velocity_logs VALUES (?,?,?,?,?,?)",
                 (vel_id, txn_id, body.customer_id, len(window), sum(r["amount"] for r in window),
                  sum(not r["payee_known"] for r in window)))
    conn.execute("INSERT INTO alerts VALUES (?,?,?,?)", (alert_id, txn_id, "R-INGEST", ts.isoformat()))
    audit.append(conn, alert_id, "INGEST", "API", {
        "txn_id": txn_id, "velocity_id": vel_id, "customer_id": body.customer_id, "device_id": body.device_id,
        "amount": body.amount, "currency": body.currency, "channel": body.channel,
        "memo_chars": len(body.memo or ""), "payee_name_chars": len(body.payee_name or "")})
    conn.commit()
    return alert_id, txn_id
