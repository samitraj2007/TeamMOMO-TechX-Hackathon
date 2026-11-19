# 02 Product and Features

Each feature: ID, priority, description, acceptance criteria (AC). Build in priority order. P0 first.

## P0
**F1 Synthetic dataset and mock services.** ~1,000 flagged transactions (about 900 false positives, 100 real fraud), customers, devices, watchlist (fictional), velocity logs; three services: `fetch_customer_kyc_and_devices()`, `check_sanctions_watchlist()`, `commit_case_resolution()`.
AC: deterministic seed; ground-truth labels; every record has a stable `record_id`; services return Pydantic models.

**F2 Quarantine and sanitizer.** Layer 1 deterministic (regex, Unicode normalisation, zero-width and homoglyph stripping, base64/hex detection, length caps). Layer 2 LLM/classifier verdict. Output: `MemoFacts` only.
AC: raw memo never passed to investigator; hostile examples (EN/AR) flagged; benign memo containing words like "ignore" not blocked; unit tests for each attack family; injection raises case risk (escalate), never clears it.

**F3 Policy engine (pure Python).** Rules decide route: AUTO_CLEAR, NEEDS_REVIEW, PENDING_APPROVAL.
AC: no LLM imports; thresholds from config (default 10,000 AED); watchlist hit or amount over threshold forces PENDING_APPROVAL; exactly-at-threshold behaviour tested; property test: no input with watchlist_hit=True or amount>threshold can return AUTO_CLEAR.

**F4 Investigator agent.** Bounded tool-calling loop (max steps), fixed tool allow-list, saves findings `{claim, record_ids, severity}`; drafts report from `regulator_sar_template.md`.
AC: step cap; schema-validated outputs; failure falls back to ESCALATE; works with cached responses.

**F5 Approval gate.** Compliance officer approves, rejects or requests more info; override requires reason; only then `commit_case_resolution()`.
AC: commit endpoint refuses without recorded approval for PENDING_APPROVAL cases; tested.

**F6 Core UI.** Queue with three lanes, case view with timeline, quarantine panel, evidence panel, report preview, approval gate.
AC: runs against fixtures and live backend; no crash on empty/failed states.

## P1
**F7 Arabic-aware name matcher.** Normalisation (diacritics, alef/ya/ta marbuta variants, "Al-" articles, bin/ibn/bint, compound names), transliteration key, token-order-insensitive fuzzy score via rapidfuzz, corroboration by DOB/nationality, explainable result with matched fields.
AC: test table of at least 40 EN/AR pairs including true matches, near-miss false hits (common names) and spelling variants; thresholds documented; results show "why matched".

**F8 Injection scorecard.** 30+ attacks across families: direct override, role-play, delimiter/markdown tricks, base64 and hex, Arabic and mixed-language, instruction hidden in invoice number, instruction in customer name or device label (indirect), plus benign lookalikes.
AC: script prints and saves catch rate, false-block rate, per family; displayed on /eval page.

**F9 Hash-chained audit log.** Append-only; every step recorded (actor type CODE/LLM/HUMAN, input/output hashes, model + prompt version, evidence IDs, timestamps UTC).
AC: `verify_chain` passes; UI "Verify integrity" button; demo path to tamper one row and see failure; export case file (JSON/PDF).

**F10 EN/AR UI with RTL.** Toggle persists; Arabic memos render correctly; layout mirrors.
AC: all P0 screens usable in both languages.

**F11 Citation verifier.** Rejects report sentences lacking valid record IDs; shows count of rejected claims.
AC: tested with injected hallucination.

**F12 Pitch route.** `/pitch` with animated slides, same design system.

## P2
**F13 QA lane.** Random sample (configurable, default 10%) of auto-clears routed to QA; miss logged.
**F14 Disagreement rule.** Regex filter and classifier disagree -> escalate.
**F15 Decision receipts.** Reason codes on every auto-clear, human-readable.
**F16 ROI panel.** Auto-clear rate, false-positive reduction vs baseline, minutes saved vs 18-minute baseline for 40 analysts, cost per case (0 when local), computed from real run results and labelled as simulation.

## P3 (only if ahead; pick one)
**F17a Mule/velocity graph** across the 1,000 transactions (NetworkX), highlighted cluster and suggested first hold.
**F17b Schema-drift resilience**: rename a field in a mock service mid-run; agent handles it, logs incident, escalates if unsafe.

## Explicitly cut
Customer 2FA outreach simulation; real auth; any paid API.
