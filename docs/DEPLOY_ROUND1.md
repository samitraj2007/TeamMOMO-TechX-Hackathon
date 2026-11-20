# Deploy Round 1 (`Round-1-FINAL`) — Vercel + Render (free tier)

Host the frozen Round 1 demo without touching local Round 2 work. Both platforms pull **only** branch `Round-1-FINAL` from GitHub.

| Piece | Platform | Notes |
|-------|----------|--------|
| Next.js UI | **Vercel** | Root directory `frontend` |
| FastAPI API | **Render** | `render.yaml` blueprint, `DEMO_MODE=replay` (no live Groq calls) |

## One-time setup

### 1 — Render (backend)

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect repo `samitraj2007/TeamMOMO-TechX-Hackathon`, branch **`Round-1-FINAL`**.
3. Apply blueprint (`render.yaml` creates `momo-sentinel-api`).
4. When prompted, set **`CORS_ORIGINS`** (required):  
   `https://YOUR-VERCEL-URL.vercel.app,http://localhost:3000`  
   (Add the Vercel URL after step 2; redeploy once if you created Render first.)
5. Copy the service URL, e.g. `https://momo-sentinel-api.onrender.com` — cold starts on free tier take ~30s.

No `GROQ_API_KEY` needed for replay; verdicts use committed `backend/data/llm_cache.json`.

### 2 — Vercel (frontend)

1. [vercel.com/new](https://vercel.com/new) → Import the same GitHub repo.
2. **Root Directory:** `frontend`  
3. **Production Branch:** `Round-1-FINAL` (Settings → Git).
4. **Environment variables** (Production):

   | Name | Value |
   |------|--------|
   | `NEXT_PUBLIC_API_BASE` | Your Render URL (no trailing slash) |

5. Deploy. Update Render `CORS_ORIGINS` if the Vercel hostname changed.

### 3 — Auto deploy

- Push to `Round-1-FINAL` → Vercel rebuilds; Render auto-deploys if enabled on the service.
- GitHub Action `round1-deploy.yml` runs pytest + `next build` on that branch (no secrets required).

## Smoke test

```text
curl https://YOUR-RENDER-URL/health
```

Open the Vercel URL → Queue → run a demo case. Expect `demo_mode: replay` in API health if exposed.

## Local Round 2

Stay on `round2-*` branches in your main folder. Deploy changes live only on `Round-1-FINAL` (use a [git worktree](https://git-scm.com/docs/git-worktree) if you need to patch deploy config without switching branches).

## Optional CLI

```powershell
cd frontend
npx vercel@latest link    # link to project, production branch Round-1-FINAL
npx vercel@latest --prod
```

Never commit `.env`, `GROQ_API_KEY`, or local `llm_cache.json` edits.