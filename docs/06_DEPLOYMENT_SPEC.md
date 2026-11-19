# 06 Deployment Spec (free tier, minimal bugs)

## Targets
- Backend: Render free web service (FastAPI). Notes from research: 750 free instance hours per workspace per month; free services spin down after about 15 minutes idle, so the first request is slow. Railway only offers a small trial credit and Fly.io has no free allowance for new accounts, so Render is the default.
- Frontend: Vercel free (Next.js).
- DB: SQLite file, re-seeded on boot by `data/generate.py` (deterministic). Render free disk is ephemeral, so state resets on redeploy; this is acceptable and makes demos reproducible. `POST /demo/reset` re-seeds on demand. If persistence is needed later, evaluate Render free Postgres (check expiry terms).
- LLM: Groq API key (primary), Gemini key (backup), Ollama on a team laptop (offline fallback).
- Demo plan: show on laptop for speed (local backend + local frontend + Ollama or cached replay), with hosted URLs as proof of deployment and as fallback.

## Environment variables
```
APP_ENV=prod|dev
DEMO_MODE=live|replay
AED_BLOCK_THRESHOLD=10000
QA_SAMPLE_RATE=0.10
GROQ_API_KEY=
GROQ_MODEL_MAIN=openai/gpt-oss-120b
GROQ_MODEL_LIGHT=openai/gpt-oss-20b
GROQ_MODEL_GUARD=meta-llama/llama-prompt-guard-2-86m
GUARD_THRESHOLD=0.5
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
LLM_PROVIDER_CHAIN=groq,gemini,ollama
CORS_ORIGINS=https://<vercel-domain>
```
Never commit keys. `.env.example` committed. Keys stored in Render/Vercel dashboards.

## Reliability checklist
- `/health` endpoint; pre-demo wake-up ping (and a free uptime pinger to reduce cold starts if allowed).
- Cached LLM responses for every demo case; `DEMO_MODE=replay` switch; visible banner when replay is active.
- Rate-limit handling: provider fallback, exponential backoff, queue; never block the UI.
- Pre-computed evaluation results committed as JSON.
- Docker or `render.yaml` build tested from a clean clone. Pin Python and Node versions.
- Smoke test script `scripts/smoke.sh` hitting health, one auto-clear case, one injection case, one approval flow.
- Recorded backup demo video of the full flow.
- Freeze: no deploys in the final hours before the demo slot.

## CI-lite
GitHub Actions optional: run pytest and frontend type-check on push. Skip if time-constrained.

## Free-tier limits to verify early (they change)
Groq model list and per-model limits in console; Gemini free quotas in AI Studio (published figures conflict across sources); Render free service limits; Vercel free limits.
