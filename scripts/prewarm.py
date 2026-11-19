"""Fill the model cache (backend/data/llm_cache.json) so DEMO_MODE=replay works offline.

Usage: python scripts/prewarm.py            # pinned demo cases: classifier + investigator
       python scripts/prewarm.py --all      # all 100 cases (paced for the free tier)
       python scripts/prewarm.py --guard-only
"""

import argparse
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.agents.cache import JsonCache  # noqa: E402
from backend.app.agents.investigator import build_investigator  # noqa: E402
from backend.app.config import get_settings  # noqa: E402
from backend.app.db import connect, ensure_seeded  # noqa: E402
from backend.app.pipeline import run_case  # noqa: E402
from backend.app.security.classifier import build_guard  # noqa: E402

MAIN_TOKENS_PER_MIN = 6000  # free tier is 8K TPM on GROQ_MODEL_MAIN; leave headroom for live demo calls


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--guard-only", action="store_true")
    ap.add_argument("--interval", type=float, default=2.1,
                    help="min seconds between classifier calls (2.1s = ~28 req/min, under the free-tier 30 RPM)")
    ap.add_argument("--retries", type=int, default=5, help="backoff retries per call on HTTP 429")
    args = ap.parse_args()

    settings = get_settings()
    if settings.demo_mode != "live":
        print("DEMO_MODE must be 'live' to prewarm.")
        return 2
    cache = JsonCache(settings.cache_file)
    guard = build_guard(settings, cache, min_interval_s=args.interval, rate_limit_retries=args.retries)
    investigator = build_investigator(settings, cache, rate_limit_retries=args.retries)
    if guard.backend is None or (not args.guard_only and investigator.backend is None):
        print("Missing GROQ_API_KEY / GROQ_MODEL_GUARD / GROQ_MODEL_MAIN in .env - cannot prewarm.")
        return 2
    investigator.backup = None  # the demo cache holds main-model output only
    if args.guard_only:
        investigator.backend = None

    ensure_seeded()
    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp) / "prewarm.sqlite"
        shutil.copy(settings.db_file, scratch)
        conn = connect(scratch)
        try:
            return _run(conn, args, settings, cache, guard, investigator)
        finally:
            conn.close()


def _run(conn, args, settings, cache, guard, investigator) -> int:
    where = "" if args.all else "WHERE t.demo_tag IS NOT NULL"
    rows = conn.execute(f"SELECT a.record_id, t.demo_tag, t.scenario "
                        f"FROM alerts a JOIN transactions t ON t.record_id = a.txn_id {where} "
                        f"ORDER BY a.record_id").fetchall()

    before = len(cache)
    guard_failures, inv_failures, tokens, live_calls = 0, 0, [], 0
    failed_cases: list[str] = []
    started = time.monotonic()
    print(f"guard={settings.groq_model_guard} main={settings.groq_model_main or '-'} cases={len(rows)}", flush=True)
    for r in rows:
        run = run_case(conn, r["record_id"], guard, settings.aed_block_threshold, investigator)
        q, inv = run.quarantine, run.investigator
        g_bad = sum(v.status != "ok" for v in q.classifier)
        i_bad = not args.guard_only and inv.status != "ok"
        guard_failures += g_bad
        inv_failures += i_bad
        if g_bad or i_bad:
            failed_cases.append(r["record_id"])
        u = inv.usage
        if u and not inv.cached:
            tokens.append(u.total_tokens)
            live_calls += 1
        inv_txt = "-" if args.guard_only else (
            f"{inv.status}" + (f" {inv.output.recommendation} {inv.output.confidence:.2f}" if inv.output else "")
            + (f" tok={u.prompt_tokens}+{u.completion_tokens}({u.reasoning_tokens}r)={u.total_tokens}" if u else "")
            + (" cached" if inv.cached else ""))
        print(f"{r['record_id']} [{r['demo_tag'] or '-'}] {r['scenario']:<20} guard={q.classifier_verdict:<11} "
              f"inv={inv_txt:<52} route={run.decision.route.value}", flush=True)
        if u and not inv.cached:
            time.sleep(u.total_tokens / MAIN_TOKENS_PER_MIN * 60)

    print(f"cases fully cached: {len(rows) - len(failed_cases)}/{len(rows)}; failed cases: {failed_cases or 'none'}")
    print(f"cache entries: {before} -> {len(cache)}; classifier failures: {guard_failures}; "
          f"investigator failures: {inv_failures}; 429s seen: guard {guard.backend.rate_limited}"
          + (f", main {investigator.backend.rate_limited}" if investigator.backend else ""))
    if tokens:
        print(f"investigator live calls: {live_calls}; tokens per call min/avg/max: "
              f"{min(tokens)}/{sum(tokens) // len(tokens)}/{max(tokens)}; total {sum(tokens)}")
    print(f"elapsed: {time.monotonic() - started:.0f}s; cache file: {settings.cache_file}")
    return 1 if guard_failures or inv_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
