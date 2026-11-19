# MOMO Sentinel

AI fraud investigator a bank can trust with attacker-written text. The model investigates; the code decides; every step is provable.

TechX Hackathon (IEEE SIU Dubai), Domain 1: FinTech Fraud & Compliance. Team MOMO. Synthetic data, simulation only.

- Spec: [MASTER_SPEC.md](MASTER_SPEC.md) - Rules: [RULES.md](RULES.md) - Docs: [docs/](docs/) - Phases: [docs/PHASE_PLAN.md](docs/PHASE_PLAN.md)

**Status:** Phase 0 (thin vertical slice) green and tagged `phase-0-slice`. Phase 1 not started.

## Run locally (Windows PowerShell)

```powershell
# backend
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
copy .env.example .env   # then fill GROQ_API_KEY
python -m backend.data.generate
python -m pytest backend
uvicorn backend.app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## Demo day

```powershell
python scripts/prewarm.py --all    # fills backend/data/llm_cache.json via Prompt Guard (needs GROQ_API_KEY); paced, retries 429s; commit it
powershell -ExecutionPolicy Bypass -File scripts\demo.ps1   # backend + production frontend
python scripts/smoke.py            # must print ALL PASS
```

No internet: set `DEMO_MODE=replay` in `.env` and restart the backend; verdicts come from the committed cache and the UI shows a banner. If the classifier is unavailable and there is no cache, every case fails closed to human review (by design).

Script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).
