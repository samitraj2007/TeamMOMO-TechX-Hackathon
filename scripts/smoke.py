"""Pre-demo smoke test against a running backend. Stdlib only.

Usage: python scripts/smoke.py [--base http://127.0.0.1:8000]
Exit code 0 = demo path is safe.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

failures: list[str] = []


def call(base: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{' - ' + detail if detail and not ok else ''}")
    if not ok:
        failures.append(label)


def check_investigator(run: dict, inv_ok: bool) -> None:
    inv = run["investigator"]
    u = inv.get("usage") or {}
    detail = f"{inv['status']}" + (f", {u.get('total_tokens')} tok" if u else "") + (" cached" if inv["cached"] else "")
    check(f"investigator ok ({detail})", not inv_ok or inv["status"] == "ok", inv["status"])
    if inv["output"]:
        known = {e["record_id"] for e in run["investigator_input"]["evidence"]}
        cited = {i for f in inv["output"]["findings"] for i in f["record_ids"]}
        check("every cited record exists in evidence", cited <= known, str(sorted(cited - known)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    base = ap.parse_args().base

    try:
        _, health = call(base, "GET", "/health")
    except OSError as e:
        print(f"Backend unreachable at {base}: {e}")
        return 1
    print(f"health: {health}")
    replay = health.get("demo_mode") == "replay"
    guard_ok = health.get("guard_live") or replay
    inv_ok = health.get("investigator_live") or replay
    if not guard_ok:
        print("  WARNING: classifier offline - Case A will fail closed to NEEDS_REVIEW instead of AUTO_CLEAR")
    if not inv_ok:
        print("  WARNING: investigator offline - Case A will fail closed to NEEDS_REVIEW instead of AUTO_CLEAR")
    guard_ok = guard_ok and inv_ok

    status, _ = call(base, "POST", "/demo/reset")
    check("reset", status == 200)
    _, cases = call(base, "GET", "/cases")
    tags = {c["demo_tag"]: c["alert_id"] for c in cases}
    check("pinned cases A, B, D present", {"A", "B", "D"} <= set(tags))

    print("Case A (benign):")
    _, a = call(base, "POST", f"/cases/{tags['A']}/run")
    expected_a = "AUTO_CLEAR" if guard_ok else "NEEDS_REVIEW"
    check(f"route {expected_a}", a["decision"]["route"] == expected_a, a["decision"]["route"])
    check("classifier verdict BENIGN", not guard_ok or a["quarantine"]["classifier_verdict"] == "BENIGN",
          a["quarantine"]["classifier_verdict"])
    check_investigator(a, inv_ok)

    print("Case B (hostile memo, hero):")
    _, b = call(base, "POST", f"/cases/{tags['B']}/run")
    check("route NEEDS_REVIEW", b["decision"]["route"] == "NEEDS_REVIEW", b["decision"]["route"])
    check("regex flagged with spans", b["quarantine"]["regex_flagged"] and bool(b["quarantine"]["spans"]))
    check("classifier responded", not guard_ok or b["quarantine"]["classifier_verdict"] != "UNAVAILABLE",
          b["quarantine"]["classifier_verdict"])
    check_investigator(b, inv_ok)
    status, _ = call(base, "POST", f"/cases/{tags['B']}/commit", {"action": "CLEAR"})
    check("release without human refused (403)", status == 403, str(status))

    print("Case D (high value + watchlist):")
    _, d = call(base, "POST", f"/cases/{tags['D']}/run")
    check("route PENDING_APPROVAL", d["decision"]["route"] == "PENDING_APPROVAL", d["decision"]["route"])
    check_investigator(d, inv_ok)
    status, _ = call(base, "POST", f"/cases/{tags['D']}/commit", {"action": "HOLD_AND_BLOCK"})
    check("commit without approval refused (403)", status == 403, str(status))
    status, dec = call(base, "POST", f"/cases/{tags['D']}/decision",
                       {"decision": "APPROVE", "action": "HOLD_AND_BLOCK", "reason": "smoke test approval"})
    check("officer approval commits", status == 200 and dec.get("resolution") is not None, str(status))

    print("Audit log:")
    _, trail = call(base, "GET", f"/cases/{tags['D']}/audit")
    kinds = [e["kind"] for e in trail if e["kind"] != "STEP"]
    check("refusal, decision and commit recorded", kinds == ["COMMIT_REFUSED", "DECISION", "COMMIT"], str(kinds))
    _, v = call(base, "GET", "/audit/verify")
    check(f"hash chain verifies ({v.get('entries')} entries)", v.get("ok") is True and v.get("entries", 0) > 0,
          str(v.get("reason")))

    call(base, "POST", "/demo/reset")
    print("RESULT:", "ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
