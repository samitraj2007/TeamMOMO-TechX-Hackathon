# 01 Competition Context

## Event
- TechX hackathon, organised through IEEE SIU Dubai (arena page: techx.ieeesiudubai.com/arena - could not be opened by our research tool; team to confirm details).
- Track: Domain 1 - FinTech Fraud & Compliance - University Track. Project title in brief: "GulfHorizon - Autonomous Banking Fraud Triage & Compliance Agent".
- Duration: described to us as a two-day hackathon. First demo: 20 Nov 2026. Full schedule: to be pasted by team (see open questions).
- Team: MOMO, 4 members, Dubai-based university students. Main build is done through AI-assisted ("vibe") coding in Cursor.

## Judges (from earlier research notes; verify against official page)
- Sajna Samad, Manager of AI Solution Engineering at Inception42 (G42 group): AI governance, human-in-the-loop controls for enterprise and government. Expect questions on oversight, auditability, safety.
- Nick Sgobba, AI venture architect, former IBM Senior Inventor: expect questions on market, novelty, defensibility.
Design the pitch to answer both: governance proof for the first, real demand and edge for the second.

## What judges will see in the brief's own words
The organisers state good projects show "a clear, undeniable separation between what the Agent (LLM) does and what tool (traditional code) does." Our UI and pitch must make this separation visible (CODE/LLM badges, policy engine panel, "agent has no block function" statement).

## What every other team will probably build
The brief nearly dictates the architecture: sanitizer agent -> investigator agent -> KYC/watchlist tools -> code threshold gate -> approval screen -> report. Assume 80% of teams reach a version of this. It is table stakes.

## How we separate from the pack
1. Structural injection defense (quarantine to typed MemoFacts) plus a measured red-team scorecard in English and Arabic.
2. Arabic-aware sanctions matching relevant to a Gulf bank.
3. Evidence verifier: unsupported claims are rejected.
4. Hash-chained, replayable audit log with a tamper-check demo.
5. QA lane and decision receipts for auto-clears (answers "how do you know auto-clearing is safe?").
6. Honest metrics on a labelled synthetic set including benign lookalikes.

## Real-world grounding to use in the pitch (verify before quoting)
- Rule-based AML monitoring commonly produces 85-95% false positives; analysts review roughly 50-100 alerts a day; industry cost estimates per false-positive alert are cited around USD 30-60 (vendor/analyst figures, treat as indicative).
- OWASP lists prompt injection (including indirect, via tool output) as a top LLM risk; guidance: separate instructions from data, sanitise, allow-list actions, require human approval for high-impact actions.
- ISO 20022 retains an unstructured remittance field (up to 140 characters), so free-text risk persists.
- Arabic names have many valid Latin spellings; screening errors occur in both directions (missed hits and false hits). Regulators have fined banks over name-variant screening failures.
- Fraud/AML mule chains often move money beyond the first account; fraud and AML teams are often siloed (relevant to optional graph stretch).

## Risks to winning
Scope creep; free-tier LLM rate limits (Groq free plan about 8K tokens/min on the larger model); cold start of free hosting; LLM nondeterminism in live demo; UI that looks generic; pitch that explains tech instead of telling a story.
