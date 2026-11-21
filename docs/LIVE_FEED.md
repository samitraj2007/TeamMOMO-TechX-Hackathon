# Live feed: simulated production traffic

MOMO Sentinel has no real bank to connect to, so a simulator plays the bank's legacy alerting system. It streams flagged payments into MOMO through the same ingest contract (`IngestIn`) as the public API, and MOMO handles them as it would live traffic.

## How traffic flows
1. **Simulated bank.** The simulator uses its own model on a second key (`SIM_LLM_*`) to write batches of realistic seed alerts: suppliers, rent, school fees, salaries, Arabic memos, high-value transfers and hostile memos aimed at an AI reviewer.
   - Code expands the seeds to the requested volume: a customer and their verified device from the bank's roster, a jittered amount, and the current time.
   - Every payload is validated like any API call.
   - With no simulator key, or if the simulator's model fails, built-in templates keep the feed flowing.
2. **Code screen, for every alert, with no model call.** It gathers evidence (KYC, devices, sanctions for customer and payee, 24h velocity), runs the regex quarantine on every free-text field, and asks the unchanged policy engine for a route.
   - **Officer gate:** over 10,000 AED, or a watchlist hit.
   - **Review:** an injection signal, an unverified device, abnormal velocity, or a non-AED currency.
   - **AI lane:** cases code would clear. These are **not** cleared yet.
3. **AI lane, at a fixed rate.** It runs the full pipeline (Prompt Guard, investigator, citation verifier, policy) on queued cases. Only this lane can auto-clear.
   - Free-tier model limits allow only a few full runs a minute, so a queue builds.
   - A queued case stays not cleared, which is fail-safe back-pressure.

Code escalations are final because a model can only tighten a route, never loosen it.

## Controls
`/live` in the console, or the API:

| Call | Notes |
|---|---|
| `POST /feed/start` `{"total": 25, "duration_s": 30, "ai_per_min": 2, "mix": {"benign": 40, "hostile_memo": 45, ...}}` | Needs `X-Admin-Token`. `total` is capped by `FEED_MAX_TOTAL` (default 500); `duration_s` must be 10 to 600, `ai_per_min` 0 to 30, and each `mix` weight 0 to 100 (optional; the default is a normal day). |
| `POST /feed/stop` | Needs `X-Admin-Token`. Queued cases stay unrouted. |
| `GET /feed/status` | Counts, lanes, rate, the last 200 events (IDs, amounts and reason codes only, never memo or payee text) and the last 5 finished runs. |
| `GET /demo/check` | Checks the admin token; changes nothing. |

**The `/live` screen:**
- **Left, Feed setup:**
  - **Alerts:** a number, with quick picks 10, 25, 50, 100 and 200.
  - **Over:** 10 s to 10 min, with quick picks 15 s, 30 s, 1 min, 2 min and 4 min.
  - **AI lane:** runs per minute.
  - **Traffic mix:** Normal day, Attack wave, High-value burst or Clean traffic, or your own weight per kind.
  - **Admin token:** entered once per tab, and shared with the Resilience drill screen.
- **Right:** the live monitor.
- **Below:** the alert table and recent runs.

`/demo/reset` stops a running feed before it rebuilds the database. Feed alerts are unlabelled, so `/eval` never scores them.

## Environment
| Variable | Default | Purpose |
|---|---|---|
| `SIM_LLM_API_KEY` | empty (template mode) | The simulator's **own** Groq key. If it is the same as `GROQ_API_KEY`, the simulator refuses to use it. |
| `SIM_LLM_MODEL` | `openai/gpt-oss-20b` | |
| `SIM_LLM_BASE_URL` | Groq | Any OpenAI-compatible endpoint. |
| `SIM_LLM_MAX_CALLS` | 8 | A hard cap per run: about 24 seeds per call, refreshed every 45 s. |
| `FEED_MAX_TOTAL` | 500 | The maximum alerts per run. |
| `DEMO_ADMIN_TOKEN` | required | Start and stop use it, the same as reset. |

## Running it in the 7-minute pitch
1. Reset with the admin token, then open `/live`.
2. Start **25–50 alerts over 30 s** with **Attack wave** and the AI lane at **2–4/min**.
3. As the lanes fill, point out:
   - code handled every alert instantly;
   - gate and review cases went straight to a person;
   - the AI lane works within its budget, and nothing clears without it.
4. Click a gate row to open the case: its timeline shows the code screen and reasons. Click a review row with an `INJECTION_SIGNAL` and run the investigation to show the quarantine airlock. Click an auto-cleared row to show the full cited report.
5. Finish on `/audit` with **Verify chain**.

## What it costs on free-tier keys
- **Simulator key:** at most `SIM_LLM_MAX_CALLS` requests per run, about 3–5K tokens each.
- **Main key:**
  - About `ai_per_min × minutes` investigator calls, roughly 2K tokens each.
  - Prompt Guard calls for new free text. Repeated memos and payees hit the cache.
  - At 4/min over 4 minutes that is about 16–20 investigations.

## Hosting notes (Render free)
- **Process:** the feed runs as threads inside the web service, because the free tier has no background workers.
- **State:** the feed state is in memory and the disk is ephemeral. Both are fine for a demo; a restart loses only the feed counters.
- **Sleep:** Render free sleeps after 15 minutes idle, so open the site a minute before the pitch.
- **Replay mode:** with `DEMO_MODE=replay`, AI-lane cases miss the cache and fail closed to review. Use live mode to show auto-clears.

## Tests
`backend/tests/test_feed.py` runs offline with fakes and covers:
- **Generator:** validation, the same-key guard, the call budget and the template fallback.
- **Screen:** the code-only lanes, no model calls, and no text in the audit log.
- **Runner:** lane totals; only AI-lane cases reach the model; with no AI lane nothing clears; stopping.
- **Endpoints:** the token guard, demo-off, the volume cap, one run at a time, and no free text in the status.
- **Eval:** feed traffic is never scored.
