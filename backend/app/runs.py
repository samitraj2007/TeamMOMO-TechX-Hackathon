"""Investigation results that survive a restart (CODE).

`RunStore` is a dict-like store of `CaseRun` snapshots written through to the `case_runs` table, so reports, evidence
packs and the Case records screen still work after the backend restarts. The audit log remains the record of what
happened; a stored run is the snapshot the report is built from. Writes take the API's DB lock, and callers assign
only after leaving their own `with lock:` block (the lock is not re-entrant).
"""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator, MutableMapping
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from backend.app.db import connect, ensure_seeded

if TYPE_CHECKING:
    from backend.app.pipeline import CaseRun


class RunStore(MutableMapping):
    def __init__(self, lock: threading.Lock | None = None, path: Callable[[], Path] | None = None):
        self._lock = lock or threading.Lock()
        self._path = path
        self._cache: dict[tuple[str, str], CaseRun] = {}

    def _db(self) -> tuple[str, sqlite3.Connection]:
        p = ensure_seeded(self._path() if self._path else None)
        return str(p), connect(p)

    def __getitem__(self, alert_id: str) -> "CaseRun":
        from backend.app.pipeline import CaseRun

        key, conn = self._db()
        try:
            if (key, alert_id) in self._cache:
                return self._cache[(key, alert_id)]
            row = conn.execute("SELECT run_json FROM case_runs WHERE alert_id = ?", (alert_id,)).fetchone()
        finally:
            conn.close()
        if row is None:
            raise KeyError(alert_id)
        run = CaseRun.model_validate_json(row["run_json"])
        self._cache[(key, alert_id)] = run
        return run

    def __setitem__(self, alert_id: str, run: "CaseRun") -> None:
        with self._lock:
            key, conn = self._db()
            try:
                conn.execute("INSERT OR REPLACE INTO case_runs (alert_id, ts, route, inv_status, run_json) "
                             "VALUES (?,?,?,?,?)",
                             (alert_id, datetime.now(timezone.utc).isoformat(), run.decision.route.value,
                              run.investigator.status, run.model_dump_json()))
                conn.commit()
            finally:
                conn.close()
            self._cache[(key, alert_id)] = run

    def __delitem__(self, alert_id: str) -> None:
        raise TypeError("stored runs are kept; reset the demo database to clear them")

    def __iter__(self) -> Iterator[str]:
        _, conn = self._db()
        try:
            ids = [r["alert_id"] for r in conn.execute("SELECT alert_id FROM case_runs ORDER BY alert_id")]
        finally:
            conn.close()
        return iter(ids)

    def __len__(self) -> int:
        _, conn = self._db()
        try:
            return conn.execute("SELECT COUNT(*) FROM case_runs").fetchone()[0]
        finally:
            conn.close()

    def clear(self) -> None:
        """Forget cached runs. The demo reset rebuilds the database file, which drops the stored rows."""
        self._cache.clear()
