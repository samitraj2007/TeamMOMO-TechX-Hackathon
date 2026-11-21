"""Verify the configured backup investigator provider (BACKUP_LLM_*) with real calls, before anyone claims it works.

It builds the investigator input for demo case A on a throwaway database (no model call for that part), then sends
it to the BACKUP provider alone, 3 times by default. Each answer must be valid strict JSON for the investigator
schema and cite only records from the evidence. Nothing is cached and the demo database is not touched.

Usage: python scripts/check_backup.py [--calls 3]     Exit code 0 only when every call passes.
Prints provider name, model, latency and tokens. Never prints keys or URLs with credentials.
"""
import argparse
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.agents.cache import JsonCache  # noqa: E402
from backend.app.agents.investigator import Investigator, build_backup  # noqa: E402
from backend.app.config import get_settings  # noqa: E402
from backend.app.db import connect  # noqa: E402
from backend.app.pipeline import run_case  # noqa: E402
from backend.app.security.classifier import Guard  # noqa: E402
from backend.data.generate import generate  # noqa: E402


class _NoInjection:
    """Offline classifier stand-in: the check is about the investigator provider, not Prompt Guard."""

    def score(self, text: str) -> float:
        return 0.01


class _Captured(Exception):
    def __init__(self, inp):
        self.inp = inp


class _Capture:
    def run(self, inp):
        raise _Captured(inp)


def sample_input(tmp: Path, settings, tag: str = "A"):
    db = tmp / "probe.sqlite"
    generate(db)
    conn = connect(db)
    try:
        alert = conn.execute("SELECT a.record_id FROM alerts a JOIN transactions t ON t.record_id = a.txn_id "
                             "WHERE t.demo_tag = ?", (tag,)).fetchone()["record_id"]
        guard = Guard(settings.model_copy(update={"demo_mode": "live", "groq_model_guard": settings.groq_model_guard or "probe"}),
                      JsonCache(tmp / "guard.json"), _NoInjection())
        try:
            run_case(conn, alert, guard, settings.aed_block_threshold, _Capture())
        except _Captured as c:
            return c.inp
    finally:
        conn.close()
    raise RuntimeError("could not build the sample input")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--calls", type=int, default=3)
    ap.add_argument("--case", default="A", help="demo case tag to probe with (A-E)")
    ap.add_argument("--pause", type=float, default=4.0, help="seconds between calls (free-tier rate limits)")
    args = ap.parse_args(argv)
    settings = get_settings()
    backup = build_backup(settings)
    if backup is None:
        print("Backup provider: NOT CONFIGURED (BACKUP_LLM_MODEL / BACKUP_LLM_BASE_URL empty, or the key equals "
              "GROQ_API_KEY). Nothing to verify; the system fails closed to human review when the main model fails.")
        return 2
    print(f"Backup provider: {backup.name} - model {backup.model} - timeout {settings.llm_timeout_s:g} s")
    live = settings.model_copy(update={"demo_mode": "live", "groq_model_main": backup.model})

    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        inp = sample_input(tmp, settings, args.case)
        print(f"Sample: demo case {args.case} ({inp.case_id}), code route {inp.policy.code_route.value}, "
              f"{len(inp.evidence)} evidence records")
        passed = 0
        for i in range(1, args.calls + 1):
            if i > 1:
                time.sleep(args.pause)
            # Backup alone (no main backend), fresh cache each call: every call is a real provider call.
            inv = Investigator(live, JsonCache(tmp / f"probe-{i}.json"), None, backup)
            r = inv.run(inp)
            tokens = r.usage.total_tokens if r.usage else 0
            ok = r.status == "ok" and not r.invalid_citations and r.output is not None
            passed += ok
            detail = (f"recommends {r.output.recommendation} ({r.output.confidence:.2f}), "
                      f"{len(r.output.findings)} cited findings" if r.output else r.status)
            if r.invalid_citations:
                detail += f", uncited IDs {r.invalid_citations}"
            print(f"  call {i}: {'PASS' if ok else 'FAIL'} - {r.status} - {r.duration_ms / 1000:.1f} s - "
                  f"{tokens} tok - {detail}")
    verdict = "VERIFIED" if passed == args.calls else "NOT VERIFIED"
    print(f"{verdict}: {passed}/{args.calls} calls returned valid, fully cited investigator output")
    return 0 if passed == args.calls else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
