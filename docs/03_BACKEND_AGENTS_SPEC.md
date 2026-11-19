# 03 Backend and Agents Spec

## Layout
```
backend/
  app/
    main.py            # FastAPI app, routers, CORS, health
    config.py          # env settings, thresholds
    db.py              # sqlite connection, seed on boot
    schemas/           # Pydantic models (alerts, MemoFacts, Finding, Report, Decision, AuditEvent)
    services/          # kyc_devices.py, sanctions.py, case_resolution.py  (mock "bank systems")
    security/          # regex_filter.py, normalise.py, classifier.py, quarantine.py
    matching/          # arabic_names.py
    policy/engine.py   # PURE PYTHON, no LLM imports
    agents/            # llm.py (provider chain + cache), investigator.py, verifier.py, report.py
    audit/log.py       # hash-chained log
    api/               # routers: alerts, cases, approvals, audit, eval, health
  data/generate.py     # deterministic synthetic data
  eval/                # red-team set, scorecard runner
  tests/
```

## Pipeline (state machine per case)
RECEIVED -> QUARANTINED -> EVIDENCE_GATHERED -> INVESTIGATED -> POLICY_DECIDED -> one of {AUTO_CLEARED, NEEDS_REVIEW, PENDING_APPROVAL} -> RESOLVED.
Each transition writes an audit event with actor_type in {CODE, LLM, HUMAN}.

1. **Quarantine (CODE + LLM classifier).** Input: raw memo and all free-text fields. Output `MemoFacts`: `invoice_refs[]`, `claimed_purpose` (enum), `language`, `injection_detected`, `injection_signals[]`, `raw_hash`. Raw text stored separately for display only in the UI quarantine panel; never in any prompt.
2. **Evidence (CODE).** Calls `fetch_customer_kyc_and_devices()`, `check_sanctions_watchlist()` (uses Arabic-aware matcher), velocity query. Each returns records with `record_id`.
3. **Investigator (LLM).** Receives only typed objects. Tool allow-list: read-only evidence tools plus `save_finding`. No tool for blocking, releasing or filing. Max N steps (default 8), timeout, schema-validated output.
4. **Verifier (CODE).** Every sentence of the drafted report must reference existing `record_id`s; otherwise the sentence is rejected and logged.
5. **Policy engine (CODE).** Inputs: amount, currency (AED), watchlist result, device verification, velocity flags, injection flags, LLM recommendation, verifier status. Output: route + reason codes.
6. **Gate (HUMAN).** PENDING_APPROVAL waits for officer. `commit_case_resolution()` only after approval.

## Policy rules (defaults, configurable)
- PENDING_APPROVAL if amount > 10,000 AED OR watchlist_hit OR LLM/analysis says confirmed fraud with block recommended.
- AUTO_CLEAR only if ALL: amount <= threshold; no watchlist hit and no "possible match" band; device known and verified; velocity normal; no injection signal; verifier passed; LLM recommends clear.
- NEEDS_REVIEW otherwise (including any injection flag, any disagreement between regex and classifier, any LLM/tool failure).
- LLM may only move a case toward stricter routes. Test this as a property.
- QA lane: with probability p (default 0.10, seeded) an AUTO_CLEAR is also queued for human QA.

## LLM provider layer (`llm.py`)
- OpenAI-compatible client; provider chain: Groq -> Gemini Flash -> Ollama (qwen3). Timeout 20s, 1 retry, fallback on 429/5xx.
- Cache: SQLite table keyed by hash(model, prompt version, inputs); `DEMO_MODE=replay` serves cache only, giving deterministic demos.
- Keep prompts short: free-tier limits are tight (Groq larger model about 8K tokens/min, 1K requests/day; verify in console). Batch evaluation runs offline and results are saved to JSON.
- Prompts versioned in files; version recorded in audit log.
- Injection classifier: Llama Prompt Guard 2 (Groq) if available; treat as classifier returning label/score; always combine with regex; log both verdicts.

## API (initial)
- `GET /health`
- `GET /alerts?lane=` list; `POST /alerts/{id}/investigate` (SSE stream `/cases/{id}/events`)
- `GET /cases/{id}` details: memo facts, evidence, findings, report, route
- `POST /cases/{id}/decision` {approve|reject|more_info, reason, actor}
- `GET /cases/{id}/audit` and `GET /audit/verify`
- `GET /eval/scorecard` and `GET /eval/roi`
- `POST /demo/reset` re-seed
All responses typed; OpenAPI exported to `/docs/openapi.json` for frontend type generation.

## Report template
`regulator_sar_template.md` with sections: Case summary, Subject(s), Transaction details, Evidence table (record IDs), Red flags and rationale, Screening results, Injection/quarantine note, Recommendation, Human decision and approver, Audit reference (hash). Placeholders filled by code from findings; LLM writes only the narrative paragraphs, constrained to cited findings.

## Testing priorities
1. Policy engine property tests. 2. Quarantine attack families. 3. Arabic matcher table. 4. Audit chain. 5. Commit refuses without approval. 6. Golden cases (15-20) end to end.
