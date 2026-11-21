# Deploy (main) — Vercel + Render free tier

Production ships from GitHub branch **`main`**.

| Piece | Platform | Notes |
|-------|----------|--------|
| Next.js UI | **Vercel** | Root directory `frontend` |
| FastAPI API | **Render** | `render.yaml`, prefer `DEMO_MODE=replay` for demos |

## Render

1. Connect repo → branch **`main`** (Blueprint or Web Service).
2. Build: `pip install --upgrade pip && pip install -r backend/requirements.txt`
3. Start: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
4. Health: `/health`
5. Env: `DEMO_MODE=replay`, `APP_ENV=prod`, `DB_PATH` / `CACHE_PATH` as in `.env.example`, and **`CORS_ORIGINS`** = `https://YOUR-VERCEL.vercel.app,http://localhost:3000`

## Vercel

1. Import repo → **Root Directory:** `frontend`
2. **Production Branch:** `main`
3. Env **`NEXT_PUBLIC_API_BASE`** = Render URL (no trailing slash)
4. Redeploy after env changes

## Smoke

```text
curl https://YOUR-RENDER-URL/health
```

Open the Vercel URL → Queue / Live / Drill. First Render hit after idle can take ~30–60s on free tier.

Never commit `.env` or secrets. Local `llm_cache.json` edits stay uncommitted unless intentionally prewarming for replay.
