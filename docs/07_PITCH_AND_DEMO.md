# 07 Pitch and Demo (3-5 minutes MAX)

Target length 4:00 with buffer. Pitch and live demo are one story, not two.

## Story arc
1. **Hook (20s):** "Gulf Horizon: 9 false alarms for every real fraud case, 40 analysts, 18 minutes a case. AI could fix that - but a memo can tell the AI to release the money." Show the hostile memo.
2. **Our answer (20s):** "MOMO Sentinel: the model investigates, the code decides, every step is provable."
3. **Hero demo (90s):** the injection caught live. Raw memo -> highlighted span -> quarantine -> typed MemoFacts -> classifier + regex verdict -> case escalated. Then the same transaction through a naive agent (ablation) shows it releasing funds.
4. **Core flow (50s):** evidence gathered (KYC/device, Arabic-aware sanctions match), cited report, high-value case hits the code gate; officer approves; commit logged.
5. **Proof (30s):** one table: injection catch rate, unsafe auto-clears = 0, false-positive reduction, minutes saved, cost per case $0. Tamper check on the audit log (5s).
6. **Why it matters and what is next (20s):** real bank demand, Gulf-specific Arabic screening, path to production (structured ISO 20022 fields, real integrations, human oversight).
7. **Close (10s):** one-line pitch.

## Demo cases (pre-seeded, pinned)
A. Benign false positive, auto-cleared with decision receipt.
B. Hostile memo (English) on a small payment - quarantined, escalated.
C. Hostile memo (Arabic) - same.
D. High-value fraud with watchlist alias match - cited report, approval gate, commit.
E. Benign lookalike (common-name near-match) - correctly NOT flagged.
Only use A, B, D live; C and E available for Q&A.

## Pitch deck (`/pitch` route)
Slides: problem, hostile memo reveal, solution architecture (CODE vs LLM split), hero demo cue, proof table, market/why now, roadmap, team. Animated with Framer Motion, same design system. Max 8 slides. Keyboard navigation. Offline-capable (no external fonts or CDNs at demo time).

## Likely judge questions and answers
- "What stops a smarter attack?" Structural defense: the investigator never receives raw text; actions are allow-listed; high-value actions need human approval; scorecard shows tested families; we are honest that no filter is perfect, which is why capability limits exist.
- "How do you know auto-clearing is safe?" Policy engine rules, zero unsafe auto-clears by test, QA lane sample, decision receipts.
- "Is this explainable to a regulator?" Cited report, audit chain, replay, human decision recorded.
- "Why Arabic matching?" Gulf bank reality; name variants cause false and missed hits.
- "Does it scale / cost?" Deterministic code does most work; LLM only for investigation and narrative; free tier/local models; batch offline.
- "Business model?" Sell as an assistant layer for bank compliance teams and fintechs; per-case or per-seat pricing; reduces analyst hours.
- "Data?" Synthetic; no real customer data; fictional watchlist.
- "What failed / limits?" Be honest: synthetic data, small model limits, needs real integrations and validation.

## Rehearsal plan
Three full rehearsals with a timer; one with hosted backend cold; one offline on laptop; one where the LLM provider is killed to show fallback. Prepare the 60-second version in case time is cut.
