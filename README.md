# MOMO Sentinel

AI fraud investigator a bank can trust with attacker-written text. The model investigates; the code decides; every step is provable.

TechX Hackathon (IEEE SIU Dubai), Domain 1: FinTech Fraud & Compliance. Team MOMO. Synthetic data, simulation only.

- Spec: [MASTER_SPEC.md](MASTER_SPEC.md) - Rules: [RULES.md](RULES.md) - Docs: [docs/](docs/)

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

Demo safety: `python scripts/prewarm.py` fills the classifier cache; set `DEMO_MODE=replay` to run from cache only.
