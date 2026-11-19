# Phase Plan

Source of truth for phases. Built from the approved "MOMO Sentinel phased plan" (which reflects the team's answers)
reconciled with [08_TASKS_MILESTONES.md](08_TASKS_MILESTONES.md). Where they differ, this file follows the approved plan;
the differences are listed at the bottom.

## Locked decisions
- **Demo:** 3-5 minute live prototype, morning slot, 20 Nov 2026. Run from the laptop with live Groq; the replay cache
  is filled in advance and is one switch away (`DEMO_MODE=replay`, visible banner).
- **Who builds:** one person drives Cursor; the other three work on content (memo text, Arabic review, script, video).
- **Models:** every model name comes from env (`GROQ_MODEL_MAIN`, `GROQ_MODEL_LIGHT`, `GROQ_MODEL_GUARD`). Free tier is
  tight (about 8K TPM on the large model): small prompts, cache every call, replay mode.
- **Stack:** Python 3.12, FastAPI, Pydantic v2, pydantic-settings, `openai` SDK (Groq/Gemini/Ollama), stdlib `sqlite3`;
  pytest + hypothesis. Next.js (App Router, TS strict), Tailwind, Node 22 LTS. Later, only when a phase needs them and
  after asking: rapidfuzz, shadcn/ui, TanStack Query, Motion, openapi-typescript, next-intl, Recharts.
- **Rules:** a green phase is tagged. Do not start a phase while the previous phase is failing.

## Phase 0 - Thin vertical slice (DONE, tag `phase-0-slice`)
Goal: something real to show on 20 Nov.
- Repo hygiene: `.gitignore` first, docs in `/docs`, `RULES.md` draft + `.cursor/rules/momo.mdc`, `.env.example`.
- Backend skeleton: env config, FastAPI `/health`, pytest.
- Deterministic 100-row dataset with ground truth; 5 hostile memos (EN override, fake `[SYSTEM]` tag, Arabic,
  base64, injection in a name field) and 3 benign trigger-word memos.
- Three mock services returning Pydantic models; `commit_case_resolution` refuses without approval.
- Quarantine: normalise, regex spans, Prompt Guard 2 (cached, replay, fail-closed), typed `MemoFacts`.
- Pure-Python policy engine, strictest-wins; threshold edge tests, hypothesis property tests, no-LLM-import test.
- API: cases list/detail/run/decision/commit, demo reset, CORS.
- One Next.js screen: raw memo highlight, quarantine card, decision card, approval gate, replay banner.
- `scripts/prewarm.py` (paced, 429 backoff), `scripts/smoke.py`, `scripts/demo.ps1`, 60-second script.

Exit: hostile memo caught, policy gate demonstrated, nothing crashes.

Demo cases: **A** 850 AED supplier, `AUTO_CLEAR`. **B (hero)** 3,500 AED with `[SYSTEM OVERRIDE ...]`, highlighted,
quarantined, `NEEDS_REVIEW`. **D** 48,000 AED watchlist alias, `PENDING_APPROVAL`, commit refused, officer approves
with a reason, commit succeeds. Q&A: Arabic hostile memo (C), `pytest` green including the property test.

## Phase 0 -> Phase 1 transition checklist
| # | Task | Owner |
|---|------|-------|
| T1 | Phase 0 exit criteria re-verified live (smoke) and offline (replay) | Driver |
| T2 | Full backend suite and frontend type-check green | Driver |
| T3 | Classifier cache prewarmed for all 100 cases, audited (no keys/headers), committed | Driver |
| T4 | No secret in tracked files or history; `.env` ignored | Driver |
| T5 | Phase 0 committed, tagged `phase-0-slice`, pushed to origin | Driver |
| T6 | Docs updated: this file, README status, known gaps recorded | Driver |
| T7 | Two timed rehearsals of the 60-second script (`docs/DEMO_SCRIPT.md`) | Team |
| T8 | Backup video recorded in replay mode | Team |
| T9 | Real schedule after 20 Nov supplied so Phase 1 hours can be mapped | Team |
| T10 | `RULES.md` draft approved (or edited) by the team | Team |

Status of this checklist is tracked in [Transition status](#transition-status) below.

## Phase 1 - Core P0 (about 9h)
Full 1,000-row dataset; investigator agent on `GROQ_MODEL_MAIN` (bounded tool loop, typed inputs only, low reasoning
effort, cached); evidence tools; report template plus citation verifier; full approval gate; console with three lanes;
basic audit log; naive-wrapper comparison (one cached `GROQ_MODEL_LIGHT` call on the raw hostile memo, shown only if
it really obeys, labelled honestly).

Exit: cases A, B and D run end to end.

## Phase 2 - Edge P1 (about 8h)
Arabic-aware matcher with 40+ table tests; injection scorecard (30+ attacks, EN and AR) including the honest Prompt
Guard Arabic gap; hash-chained audit log with tamper demo; EN/AR UI with RTL; `/eval` page; `/pitch` page.

Exit: proof table filled with real numbers.

## Phase 3 - Trust and polish P2 (about 5h)
QA lane, disagreement rule, decision receipts, ROI panel, design pass, error states.

## Phase 4 - Stretch P3 (optional)
One of: mule graph or schema drift. Only if Phase 3 is green.

## Phase 5 - Freeze (about 3h)
Feature freeze, smoke tests, deploy freeze, three rehearsals, Q&A prep.

## Cut order
- If behind on a phase: P3, ROI panel, disagreement rule, QA lane, decision receipts, then simplify UI motion.
- Phase 0 slice (demo night): live classifier calls (fall back to replay), step reveal, approve button, evidence detail.
- Never cut: quarantine, `MemoFacts`, policy gate, approval gate, cited report (from Phase 1), hero demo, passing tests.

## Differences between the approved plan and 08_TASKS_MILESTONES.md
This file follows the approved plan in every row.

| Topic | Approved plan | 08_TASKS_MILESTONES.md |
|-------|---------------|------------------------|
| Team setup | One Cursor driver; three on content | Four owners, one folder each (A backend, B data, C frontend, D pitch) |
| Phase 0 deployment | Run from the laptop; hosted deployment not shown on 20 Nov | "Deployed or runnable locally" |
| Phase 1 exit | A, B, D end to end | A, B, D end to end "on hosted and local" |
| Naive-wrapper comparison | Phase 1 (optional in Phase 0 if ahead) | "Ablation" in Phase 2 |
| Console | Three lanes in Phase 1 | "Queue and case UI" |
| Replay mode | Phase 0 (built) | Phase 3 |
| Hour estimates | Phase 1 ~9h, Phase 2 ~8h, Phase 3 ~5h, Phase 5 ~3h | None |
| Phase 0 tag | `v0-demo` (shipped as `v0-slice`, then `phase-0-slice` per the team's instruction) | "Tag each green phase" |
| Cut order | Adds a Phase 0 demo-night cut list | One global cut list |

Implementation deviations from the plan text (already built, intentional):
- Classifier cache is a committed JSON file (`backend/data/llm_cache.json`), not SQLite, so replay works from a clean
  clone and the cache can be audited in review.
- Extra pinned cases beyond A/B/D: C (Arabic), E (namesake), F (base64), G (payee-name injection), H (direct override),
  T (benign trigger word).
- Normalisation uses NFKD plus homoglyph folding (plan said NFKC) so diacritics can be stripped for Arabic matching.

## Transition status
Updated at the Phase 0 -> Phase 1 handoff, 19 Nov 2026.

| # | Status |
|---|--------|
| T1 | Done. `scripts/smoke.py` ALL PASS live (Groq) and in replay with no key (A auto-clear, B 403, D 403 then approve) |
| T2 | Done. `pytest` 128 passed; `npm run typecheck` clean |
| T3 | Done. 100/100 cases, 76 unique calls, 0 failures, 0 429s, 158 s; cache holds only hash/score/model/version/ts |
| T4 | Done. `.env` ignored and untracked; Groq key prefix absent from tracked files and all history |
| T5 | Done. `main`, `phase-0-slice` and `v0-slice` pushed to github.com/samitraj2007/TeamMOMO-TechX-Hackathon |
| T6 | Done. This file, README status, DEMO_SCRIPT (honest classifier line), 08 pointer, 09 Q6 |
| T7 | Open (human) |
| T8 | Open (human) |
| T9 | Open (human) |
| T10 | Open (human) |

### Known gaps carried into Phase 1
- **Prompt Guard misses two of our attacks.** Hero memo B scores 0.193 (below the 0.5 threshold) and the payee-name
  injection G scores 0.001; regex catches both, so routing is unaffected (strictest wins). C, F and H score 0.999.
  The demo script now says this out loud instead of claiming the classifier caught B. Do not tune the threshold to
  hide it; it is evidence for the scorecard in Phase 2.
- Prompt Guard sees each free-text field whole; a short prefix like "Payment for Invoice #992." dilutes the score.
  Scoring sentence-level chunks is a candidate fix to measure in Phase 2, not to ship blind.
- The 3-column `xl` layout has not been checked on a 1280 px+ screen; dev-mode hydration warning from browser
  extensions (use production mode for the demo).
- Investigator step is a `SKIPPED` placeholder; no report or citation verifier yet (Phase 1 by design).

### Proposed first step of Phase 1 (not started)
Investigator contract and replayable call, before any tool loop: define `InvestigatorInput` (MemoFacts + evidence
records only, no raw text) and `InvestigatorOutput` (recommendation, cited record IDs, summary), call
`GROQ_MODEL_MAIN` once per pinned case through the same JSON cache (prompt version, low reasoning effort, small
prompt), and test that (a) no raw free-text reaches the prompt, (b) the output can only make the route stricter,
(c) every cited ID exists in the evidence, (d) replay mode serves it offline. This exercises the 8K TPM limit early
and keeps cases A, B, D green at every commit.
