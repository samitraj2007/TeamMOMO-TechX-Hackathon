# TEAM MOMO - TechX Hackathon Planning Pack

This pack is the full context for planning and building our hackathon project with an AI coding model inside Cursor.
Read order for the AI model: 00_KICKOFF_PROMPT -> MASTER_SPEC -> RULES -> docs/01..09.

## How to use
1. Create the repo (monorepo): `momo-sentinel/` with `/backend`, `/frontend`, `/docs`, `/data`.
2. Copy this pack: `MASTER_SPEC.md` and `RULES.md` at repo root, everything else into `/docs`.
3. Copy `RULES.md` into `.cursor/rules/momo.mdc` (add `alwaysApply: true` front matter) so every Cursor chat obeys it.
4. Open Cursor with the strongest planning model. Paste `docs/00_KICKOFF_PROMPT.md` as the first message. Attach the whole `/docs` folder.
5. The model must NOT write code first. It must (a) confirm understanding, (b) ask the open questions in `docs/09_OPEN_QUESTIONS_AND_ASSUMPTIONS.md`, (c) produce a phased build plan, (d) wait for our approval.
6. Build phase by phase. Commit and tag each phase that works.

## Files
| File | Purpose |
|---|---|
| MASTER_SPEC.md | Single source of truth: what we build and why |
| RULES.md | Non-negotiable engineering and safety rules for the AI |
| docs/00_KICKOFF_PROMPT.md | First prompt to paste into Cursor |
| docs/01_COMPETITION_CONTEXT.md | The hackathon, brief, judges, how we win |
| docs/02_PRODUCT_AND_FEATURES.md | Feature list with priorities and acceptance criteria |
| docs/03_BACKEND_AGENTS_SPEC.md | Architecture, pipeline, policy engine, agents, APIs |
| docs/04_DATA_AND_EVAL_SPEC.md | Synthetic dataset, Arabic matcher tests, evaluation |
| docs/05_FRONTEND_DESIGN_SPEC.md | UI structure, design principles, i18n/RTL |
| docs/06_DEPLOYMENT_SPEC.md | Free-tier hosting, env, demo reliability |
| docs/07_PITCH_AND_DEMO.md | 3-5 minute pitch, demo script, Q&A |
| docs/08_TASKS_MILESTONES.md | Phases, task board, roles |
| docs/09_OPEN_QUESTIONS_AND_ASSUMPTIONS.md | What we still need to confirm |
