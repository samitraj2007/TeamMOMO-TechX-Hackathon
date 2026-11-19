# RULES - MOMO Sentinel (non-negotiable)

DRAFT reconstructed from MASTER_SPEC and docs/01-09 (original RULES.md was missing). Team to approve.

## Safety architecture
1. Money decisions live in pure Python. `backend/app/policy/` must never import LLM, HTTP or agent code. Thresholds come from config (`AED_BLOCK_THRESHOLD`, default 10000).
2. Free text is untrusted. Memos, customer names, device labels, KYC notes and tool outputs pass through quarantine before anything else. Raw free text is NEVER placed in an LLM prompt for the investigator; it only reaches the UI for display and the injection classifier.
3. The LLM has no capability to block, release, file or commit. Only deterministic code, after recorded human approval where required, may call `commit_case_resolution()`.
4. The LLM may only make a route stricter, never looser. Route order: PENDING_APPROVAL > NEEDS_REVIEW > AUTO_CLEAR. Strictest wins.
5. Fail closed. Any LLM, classifier or tool failure, timeout or unparsable output routes to NEEDS_REVIEW (or stricter). Never to AUTO_CLEAR.
6. amount > threshold OR watchlist_hit => PENDING_APPROVAL. Exactly at threshold is not "over". Tested, including property tests.

## Models and providers
7. Never hardcode model names, endpoints or keys. Read them from env only:
   - Primary provider: `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL_MAIN`, `GROQ_MODEL_LIGHT`, `GROQ_MODEL_GUARD`.
   - Backup investigator provider (OpenAI-compatible, used only after the main model fails): `BACKUP_LLM_NAME`, `BACKUP_LLM_BASE_URL`, `BACKUP_LLM_API_KEY`, `BACKUP_LLM_MODEL`, `BACKUP_LLM_REASONING_EFFORT`. Leave `BACKUP_LLM_MODEL` empty to disable it. Prewarm never uses it; the demo cache holds main-model output only.
8. Keep prompts small (free tier is ~8K tokens/min). Every LLM call goes through the cache. `DEMO_MODE=replay` serves cache only and the UI shows a banner.
9. Tests never call the network. Mock the provider.

## Engineering
10. Small steps. Run and test each step. Commit per step; tag each green phase.
11. Never weaken, skip or delete a test to make it pass. Fix the code or raise it with the team.
12. No new dependencies without team approval. Approved list lives in `docs/DEPENDENCIES.md`.
13. Never commit secrets. `.env` is git-ignored; `.env.example` is the template.
14. Synthetic data only. Fictional watchlist names only; never real sanctioned persons.
15. Everything typed: Pydantic models on the backend, TypeScript strict on the frontend. Every evidence record has a stable `record_id`.
16. The UI must never white-screen: loading, empty, error and replay states for every panel.
17. If something threatens the demo, say so immediately and propose the cheapest safe cut. Never cut: quarantine, policy gate, approval gate, hero demo.
18. Make the CODE vs LLM vs HUMAN separation visible in the UI and in the audit trail.
