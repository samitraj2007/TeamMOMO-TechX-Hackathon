import sqlite3

from backend.app.schemas import Velocity
from backend.app.services.kyc_devices import RecordNotFound


def fetch_velocity(conn: sqlite3.Connection, txn_id: str) -> Velocity:
    row = conn.execute("SELECT * FROM velocity_logs WHERE txn_id = ?", (txn_id,)).fetchone()
    if row is None:
        raise RecordNotFound(txn_id)
    return Velocity(record_id=row["record_id"], txn_count_24h=row["txn_count_24h"], amount_24h=row["amount_24h"],
                    new_payees_24h=row["new_payees_24h"])
