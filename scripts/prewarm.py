"""Fill the classifier cache (backend/data/llm_cache.json) so DEMO_MODE=replay works offline.

Usage: python scripts/prewarm.py            # pinned demo cases only
       python scripts/prewarm.py --all      # all 100 cases (paced for the free tier)
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.config import get_settings  # noqa: E402
from backend.app.db import connect, ensure_seeded  # noqa: E402
from backend.app.pipeline import free_text_fields  # noqa: E402
from backend.app.security.classifier import build_guard  # noqa: E402
from backend.app.security.quarantine import quarantine  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--interval", type=float, default=2.1,
                    help="min seconds between API calls (2.1s = ~28 req/min, under the free-tier 30 RPM)")
    ap.add_argument("--retries", type=int, default=5, help="backoff retries per call on HTTP 429")
    args = ap.parse_args()

    settings = get_settings()
    if settings.demo_mode != "live":
        print("DEMO_MODE must be 'live' to prewarm.")
        return 2
    guard = build_guard(settings, min_interval_s=args.interval, rate_limit_retries=args.retries)
    if guard.backend is None:
        print("No GROQ_API_KEY / GROQ_MODEL_GUARD in .env - cannot prewarm.")
        return 2

    ensure_seeded()
    conn = connect()
    where = "" if args.all else "WHERE t.demo_tag IS NOT NULL"
    rows = conn.execute(f"SELECT a.record_id, t.record_id AS txn_id, t.demo_tag, t.injection_family, t.scenario "
                        f"FROM alerts a JOIN transactions t ON t.record_id = a.txn_id {where} "
                        f"ORDER BY a.record_id").fetchall()

    before = len(guard.cache)
    failures = 0
    failed_cases: list[str] = []
    started = time.monotonic()
    print(f"model={settings.groq_model_guard} threshold={settings.guard_threshold} cases={len(rows)}", flush=True)
    for r in rows:
        txn = dict(conn.execute("SELECT * FROM transactions WHERE record_id = ?", (r["txn_id"],)).fetchone())
        q = quarantine(free_text_fields(conn, txn), guard)
        scores = " ".join(f"{v.field}={'%.3f' % v.score if v.score is not None else v.status}" for v in q.classifier)
        bad = sum(v.status != "ok" for v in q.classifier)
        failures += bad
        if bad:
            failed_cases.append(r["record_id"])
        tag = r["demo_tag"] or "-"
        print(f"{r['record_id']} [{tag}] {r['scenario']:<20} regex={'HIT ' if q.regex_flagged else 'clean'} "
              f"guard={q.classifier_verdict:<11} {scores}", flush=True)

    print(f"cases fully cached: {len(rows) - len(failed_cases)}/{len(rows)}; failed cases: {failed_cases or 'none'}")
    print(f"cache entries: {before} -> {len(guard.cache)}; failed calls: {failures}; "
          f"429s seen: {guard.backend.rate_limited}; elapsed: {time.monotonic() - started:.0f}s")
    print(f"cache file: {settings.cache_file}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
