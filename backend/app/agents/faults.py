"""Controlled provider faults for live resilience drills (demo mode only).

An operator arms the switch with POST /demo/fault. The next `count` calls to the MAIN investigator provider then
time out, get rate-limited, or answer slowly. The existing failover reacts exactly as it would to a real fault: it
tries the backup provider, or fails closed to human review. Every staged failure is marked `injected` in the
provider attempts, so the audit trail never presents a drill as a real outage. Code checks, routing and the policy
engine are untouched.
"""

import threading
import time
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

FaultMode = Literal["timeout", "slow", "rate_limited", "off"]
FaultScope = Literal["main", "all"]  # "all" = a full outage: the backup provider fails the same way


class FaultConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: FaultMode
    count: int = Field(default=1, ge=1, le=3, description="Main-provider calls affected before auto-disarm")
    delay_s: float = Field(default=6.0, ge=0.5, le=30, description="Delay for mode=slow")
    scope: FaultScope = "main"

    @model_validator(mode="after")
    def _slow_stays_under_the_limit(self):
        if self.mode == "slow" and self.delay_s > 9.5:
            raise ValueError("a slow drill must stay under the 10 s timeout; use mode=timeout for a failure")
        return self


class FaultArmed(BaseModel):
    mode: Literal["timeout", "slow", "rate_limited"]
    remaining: int
    delay_s: float
    scope: FaultScope = "main"


class InjectedFault(Exception):
    """A staged provider failure. `status` is the investigator status it stands for."""

    def __init__(self, status: Literal["timeout", "rate_limited"], message: str):
        super().__init__(message)
        self.status = status
        self.injected = True


class FaultSwitch:
    def __init__(self):
        self._lock = threading.Lock()
        self._armed: FaultArmed | None = None

    def arm(self, cfg: FaultConfig) -> FaultArmed | None:
        with self._lock:
            self._armed = None if cfg.mode == "off" else FaultArmed(mode=cfg.mode, remaining=cfg.count,
                                                                    delay_s=cfg.delay_s, scope=cfg.scope)
            return self.state()

    def state(self) -> FaultArmed | None:
        return self._armed.model_copy() if self._armed else None

    def take(self, role: Literal["main", "backup"] = "main", last: bool = True) -> FaultArmed | None:
        """The armed fault for this provider, if any. One investigation counts once, on the last provider the
        drill reaches: main for a main-only drill; for a full outage, the backup (or main when there is none)."""
        with self._lock:
            if self._armed is None or (role == "backup" and self._armed.scope != "all"):
                return None
            taken = self._armed.model_copy()
            if role == "main" and self._armed.scope == "all" and not last:
                return taken
            self._armed.remaining -= 1
            if self._armed.remaining <= 0:
                self._armed = None
            return taken


class FaultyBackend:
    """Wraps a provider's backend. With nothing armed it is a transparent pass-through."""

    def __init__(self, inner, switch: FaultSwitch, timeout_s: float,
                 sleep: Callable[[float], None] = time.sleep, role: Literal["main", "backup"] = "main",
                 last: bool = True):
        self.inner, self.switch, self.timeout_s, self.sleep, self.role = inner, switch, timeout_s, sleep, role
        self.last = last  # no provider after this one in the chain
        self.model = getattr(inner, "model", None)

    def complete(self, system: str, user: str):
        fault = self.switch.take(self.role, self.last)
        if fault is None:
            return self.inner.complete(system, user)
        if fault.mode == "timeout":
            self.sleep(self.timeout_s)  # a real, visible wait: the same limit a real slow provider would hit
            raise InjectedFault("timeout", f"injected demo fault: no answer within {self.timeout_s:g} s")
        if fault.mode == "rate_limited":
            raise InjectedFault("rate_limited", "injected demo fault: provider returned 429")
        self.sleep(fault.delay_s)  # slow: delayed, then the real call
        return self.inner.complete(system, user)
