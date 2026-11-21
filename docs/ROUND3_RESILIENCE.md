# Round 3: workload resilience

Round 3, area 2 asks for several inputs processed in a row, plus at least one delay or failure handled gracefully. It also asks for timeouts, retries, a fallback provider, and clear messages when something is slow or fails.

## What happens when the investigator model is slow or fails
| Situation | What the system does | Who decides |
|---|---|---|
| The main model has no answer within `LLM_TIMEOUT_S` (10 s) | It stops waiting and tries the backup provider once. | Code |
| The main model is rate-limited (429), unreachable or misconfigured | It goes straight to the backup. There are no retry storms on the live path (`max_retries=0`). | Code |
| The backup answers | Its findings pass through the same citation verifier and policy engine. The report names the provider. | Code verifies; the LLM only advises |
| No provider answers | `ALL_PROVIDERS_FAILED`: fail closed to **Needs review**. Nothing is auto-cleared, and a person decides. | Code |
| The model returns invalid JSON or uncited IDs | The answer is rejected and the case goes to review. Invalid output never fails over. | Code |
| The input is malformed | 422 with a field-level message. Nothing is stored and no agent sees it. | Code (Pydantic) |

Every provider attempt is in the audit log: provider, status, duration, and whether it was an injected drill.

## Backup provider: verified 2026-11-21
- **Configuration:** `BACKUP_LLM_*` is set to Google Gemini `gemini-3.5-flash-lite` through its OpenAI-compatible endpoint. It is a separate provider and a separate key from Groq.
- **Check:** `python scripts/check_backup.py --case <tag>` sends real calls to the backup alone, with the production prompt and strict JSON schema, and requires valid, fully cited output.
- **Result: 7 of 7 calls passed.**

  | Case | Calls | Recommendation | Latency |
  |---|---|---|---|
  | A, benign | 3 | CLEAR | 1.0–2.0 s |
  | B, hostile memo | 2 | REVIEW | 1.0–2.0 s |
  | D, high value / watchlist | 2 | BLOCK | 1.1–2.5 s |

  About 550–690 tokens per call.
- **Before the pitch:** run the check again. If it fails, the claim is void. Say "fails closed to human review" and list the backup as a pilot requirement.
- **Hosting:** set the same `BACKUP_LLM_*` variables on Render, or the deployed app has no backup.
- **Key guard:** a backup key that equals `GROQ_API_KEY` is refused at startup. A shared rate limit is not a fallback.

## Controlled failure drills (demo mode only)
`POST /demo/fault` needs `X-Admin-Token`, and returns 404 when demo mode is off. You can also use the **Resilience drill** panel on `/live`. A drill affects the next investigation only, then disarms itself.

| Drill | Effect | Expected result |
|---|---|---|
| Main model times out | The main call waits the real 10 s, then times out. | `main timeout (injected) → backup ok` |
| Main model is slow (6 s) | Delay, then a real main call. | Answered by main. The UI shows the wait. |
| Main model rate-limited | Immediate 429. | `main rate_limited → backup ok` |
| Full outage (main and backup) | Both time out, 10 s each. | `ALL_PROVIDERS_FAILED` → Needs review, nothing cleared |

Drills are marked **injected** in the provider attempts, the timeline and the audit log, so a staged failure is never shown as a real outage. Only the model call is affected; code checks, routing and approvals are unchanged.

## The UI never looks frozen
- **While a case runs:** a live status line under the Run button updates every second (`aria-live`). It shows these stages in turn:
  1. "Investigating · 7 s · the main model has up to 10 s"
  2. "Main model passed its 10 s limit · trying backup …"
  3. "Main and backup models both passed their 10 s limit · failing closed to human review"
  4. "Finished · opening ALT-…"
- **Case page:** a **Model path** panel under Decision shows each provider tried, with status and duration, then the outcome in plain words. A failed-closed case also gets a warning callout at the top.
- **Header:** the status pill reads `Groq + backup` (or `Groq`, with a hover note that there is no backup), plus `Drill armed` while a drill is pending.

## Batch run: `scripts/live_ingest.py`
```
python scripts/live_ingest.py                         # 5 events: clean, hostile payee, Arabic memo, missing device, malformed
python scripts/live_ingest.py --fault timeout --fault-at 2    # main model times out on event 2 → backup
python scripts/live_ingest.py --fault outage  --fault-at 1    # main + backup fail → fail closed to review
```
- **Readable failures:** each event prints one line. A failure prints an `ERROR` line, for example `HTTP 422 - customer_id: String should match pattern …`, `backend unreachable at …` or `no answer within 120 s`, and the batch continues.
- **Summary:** processed, failed closed and errored counts, the routes, and live tokens.
- **Fresh cases:** each run adds a nonce to the memos, so cases reach the model instead of the cache.
- **Exit code:** 0 unless an event other than the deliberately malformed one errored.

### Verified run, 2026-11-21, throwaway backend
```
-- armed: next investigation, main and backup providers -> timeout
 1 clean          route=NEEDS_REVIEW  path=[main timeout (injected) 10.0s -> backup timeout (injected) 10.0s]  reasons=ALL_PROVIDERS_FAILED  FAILED CLOSED -> human review
 2 hostile_payee  route=NEEDS_REVIEW  path=[main unavailable 0.1s -> backup ok 1.0s]  reasons=INJECTION_SIGNAL,LLM_RECOMMENDS_REVIEW
-- (earlier run) main timeout (injected) 10.0s -> backup ok 2.3s; malformed → HTTP 422, batch continued
```
Event 2's `main unavailable` was a **real** failure: `GROQ_MODEL_MAIN` in `.env` had a typo (`openai/gpt-oss-120bea`), so Groq answered 404 "model does not exist". The backup covered it. Fix the setting to `openai/gpt-oss-120b` before the pitch.

## Remaining limits (be honest on stage)
- **One backup, one attempt:** there is a single backup provider and no third tier. With both down, every case goes to human review, which is safe but slow for analysts.
- **Rate limits:** free-tier limits on both keys cap sustained AI throughput at a few investigations per minute. The live feed's code screen is not limited.
- **No queue:** a timed-out case is not retried automatically later. A person can press **Run again**.
- **Drill state:** drills live in memory per process, so a restart clears them.
