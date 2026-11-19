# 08 Tasks and Milestones

Dates: today 19 Nov 2026 (Thu). First demo 20 Nov 2026. Remaining schedule unknown; the planning model must map phases to the real schedule once the team provides it.

## Roles (placeholder - confirm names)
- A Backend/Agents: pipeline, policy, quarantine, LLM layer.
- B Data/Eval: dataset generator, Arabic matcher, red-team set, scorecard, ROI.
- C Frontend: console, case view, audit, eval pages, i18n/RTL.
- D Pitch/Design: design system, `/pitch`, demo script, deployment, QA of the story.
Each person owns a folder. D also owns the smoke test and the backup video.

## Phase 0 - Thin vertical slice (target: before the 20 Nov demo)
Goal: something real to show tomorrow.
- Repo scaffold, `.env.example`, RULES in Cursor.
- 100-row mini dataset with 5 hostile memos and 3 mock services.
- Quarantine (regex layer + one LLM/classifier call) with unit tests.
- Policy engine with tests (10,000 AED and watchlist).
- One UI screen: case view showing raw memo -> quarantine -> decision.
- Deployed or runnable locally; 60-second demo script.
Exit: hostile memo caught, policy gate demonstrated, nothing crashes.

## Phase 1 - Core complete (P0)
Full 1,000-row dataset; investigator agent; evidence tools; report + verifier; approval gate and commit; queue and case UI; audit log basics.
Exit: cases A, B, D run end to end on hosted and local.

## Phase 2 - Edge (P1)
Arabic matcher + tests; injection scorecard and ablation; hash-chained audit with tamper demo; EN/AR UI; `/eval` page; pitch route.
Exit: proof table filled with real numbers.

## Phase 3 - Trust and polish (P2)
QA lane, disagreement rule, decision receipts, ROI panel; design pass (no vibe-coded look); error states; replay mode.

## Phase 4 - Stretch (P3, optional)
One of: mule graph OR schema drift. Only if Phase 3 is done and stable.

## Phase 5 - Freeze and rehearse
Feature freeze; smoke tests; backup video; three rehearsals; Q&A prep; deploy freeze before the slot.

## Working agreement
- Daily short sync; blockers surfaced immediately.
- Tag each green phase. Do not start a phase with a failing previous phase.
- If behind schedule, cut in this order: P3, ROI panel, disagreement rule, QA lane, decision receipts, then simplify UI motion. Never cut: quarantine, policy gate, cited report, approval gate, hero demo.
