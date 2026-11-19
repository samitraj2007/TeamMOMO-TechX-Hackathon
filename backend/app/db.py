import sqlite3
from pathlib import Path

from backend.app.config import get_settings

SCHEMA = """
CREATE TABLE customers (
  record_id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ar TEXT, nationality TEXT,
  dob TEXT, segment TEXT, kyc_status TEXT, kyc_note TEXT, risk_rating TEXT, customer_since TEXT
);
CREATE TABLE devices (
  record_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(record_id),
  label TEXT, first_seen TEXT, verified INTEGER NOT NULL
);
CREATE TABLE watchlist (
  record_id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ar TEXT, aliases TEXT NOT NULL,
  dob TEXT, nationality TEXT, list_name TEXT
);
CREATE TABLE transactions (
  record_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(record_id),
  device_id TEXT NOT NULL REFERENCES devices(record_id), amount REAL NOT NULL, currency TEXT NOT NULL,
  channel TEXT, payee_name TEXT, payee_account TEXT, payee_known INTEGER NOT NULL, memo TEXT,
  ip TEXT, country TEXT, ts TEXT,
  is_fraud INTEGER NOT NULL, scenario TEXT NOT NULL, expected_route TEXT NOT NULL,
  injection_family TEXT, demo_tag TEXT
);
CREATE TABLE alerts (
  record_id TEXT PRIMARY KEY, txn_id TEXT NOT NULL REFERENCES transactions(record_id),
  rule_id TEXT NOT NULL, raised_at TEXT
);
CREATE TABLE velocity_logs (
  record_id TEXT PRIMARY KEY, txn_id TEXT NOT NULL REFERENCES transactions(record_id),
  customer_id TEXT NOT NULL, txn_count_24h INTEGER NOT NULL, amount_24h REAL NOT NULL,
  new_payees_24h INTEGER NOT NULL
);
CREATE TABLE approvals (
  record_id TEXT PRIMARY KEY, alert_id TEXT NOT NULL, actor TEXT NOT NULL, role TEXT NOT NULL,
  decision TEXT NOT NULL, action TEXT, override INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL, ts TEXT NOT NULL
);
CREATE TABLE resolutions (
  record_id TEXT PRIMARY KEY, alert_id TEXT NOT NULL, action TEXT NOT NULL,
  route TEXT NOT NULL, approval_id TEXT, ts TEXT NOT NULL
);
PRAGMA user_version = 2;
"""
SCHEMA_VERSION = 2


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or get_settings().db_file, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_seeded(path: Path | None = None) -> Path:
    from backend.data.generate import generate

    path = path or get_settings().db_file
    if not path.exists() or _version(path) != SCHEMA_VERSION:
        generate(path)
    return path


def _version(path: Path) -> int:
    conn = sqlite3.connect(path)
    try:
        return conn.execute("PRAGMA user_version").fetchone()[0]
    finally:
        conn.close()
