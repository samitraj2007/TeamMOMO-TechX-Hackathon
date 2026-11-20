from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Route(str, Enum):
    AUTO_CLEAR = "AUTO_CLEAR"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    PENDING_APPROVAL = "PENDING_APPROVAL"


ROUTE_SEVERITY = {Route.AUTO_CLEAR: 0, Route.NEEDS_REVIEW: 1, Route.PENDING_APPROVAL: 2}

ActorType = Literal["CODE", "LLM", "HUMAN"]


class Customer(BaseModel):
    record_id: str
    name: str
    name_ar: str | None
    nationality: str | None
    dob: str | None
    segment: str
    kyc_status: str
    kyc_note: str | None
    risk_rating: str
    # Free text from the KYC record. Untrusted: it is quarantined like a memo and never reaches the model.
    occupation: str | None = None


class Device(BaseModel):
    record_id: str
    customer_id: str
    label: str | None
    first_seen: str
    verified: bool


class KycDevicesResult(BaseModel):
    customer: Customer
    devices: list[Device]
    txn_device: Device | None
    device_known_and_verified: bool
    record_ids: list[str]


class WatchlistMatch(BaseModel):
    watchlist_id: str
    listed_name: str
    screened_name: str
    matched_on: Literal["name", "alias", "name_ar"]
    dob_match: bool | None
    nationality_match: bool | None
    band: Literal["HIT", "POSSIBLE"]


class SanctionsResult(BaseModel):
    band: Literal["HIT", "POSSIBLE", "CLEAR"]
    matches: list[WatchlistMatch]
    screened_names: list[str]
    record_ids: list[str]


class Velocity(BaseModel):
    record_id: str
    txn_count_24h: int
    amount_24h: float
    new_payees_24h: int


Action = Literal["CLEAR", "ESCALATE", "HOLD_AND_BLOCK"]
ACTION_SEVERITY = {"CLEAR": 0, "ESCALATE": 1, "HOLD_AND_BLOCK": 2}


class Approval(BaseModel):
    record_id: str
    alert_id: str
    actor: str
    role: Literal["ANALYST", "COMPLIANCE_OFFICER"]
    decision: Literal["APPROVE", "REJECT", "MORE_INFO"]
    action: Action | None = None
    override: bool = False
    reason: str = Field(min_length=3)
    ts: str


class Resolution(BaseModel):
    record_id: str
    alert_id: str
    action: Literal["CLEAR", "HOLD_AND_BLOCK", "ESCALATE"]
    route: Route
    approval_id: str | None
    ts: str
