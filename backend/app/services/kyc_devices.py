import sqlite3

from backend.app.schemas import Customer, Device, KycDevicesResult


class RecordNotFound(LookupError):
    pass


def fetch_customer_kyc_and_devices(conn: sqlite3.Connection, customer_id: str,
                                   txn_device_id: str | None) -> KycDevicesResult:
    """Unknown customer raises. A transaction device not on file is a fact (unverified), not an error."""
    row = conn.execute("SELECT * FROM customers WHERE record_id = ?", (customer_id,)).fetchone()
    if row is None:
        raise RecordNotFound(customer_id)
    customer = Customer(**{k: row[k] for k in Customer.model_fields})
    devices = [Device(**dict(r)) for r in
               conn.execute("SELECT * FROM devices WHERE customer_id = ? ORDER BY record_id", (customer_id,))]
    txn_device = next((d for d in devices if d.record_id == txn_device_id), None)
    return KycDevicesResult(customer=customer, devices=devices, txn_device=txn_device,
                            device_known_and_verified=txn_device is not None and txn_device.verified,
                            record_ids=[customer.record_id, *(d.record_id for d in devices)])
