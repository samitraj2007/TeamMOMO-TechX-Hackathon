# 05 Frontend and Design Spec

Status: structure and principles fixed now; visual identity finalised after the backend is solid (team will gather reference UIs). Must NOT look vibe-coded.

## Stack
Next.js App Router, TypeScript strict, Tailwind with design tokens, shadcn/ui primitives (restyled), Framer Motion, TanStack Query, generated API types from OpenAPI, i18n (EN/AR) with RTL via `dir`, Recharts or visx for charts, react-force-graph/Cytoscape only if graph stretch is chosen. Frontend must work against fixtures (`/frontend/fixtures`) so it can be built in parallel before the API is ready.

## Screens
1. **/console** - three lanes (Auto-cleared, Needs review, Pending approval), counts, filters, search, seeded demo scenarios pinned. Role switcher: Analyst, Officer, Auditor.
2. **/case/[id]** - the centrepiece. Left: pipeline timeline with CODE/LLM/HUMAN badges and durations. Centre: tabs for Quarantine, Evidence, Report. Right: policy decision card with reason codes and the approval gate.
   - Quarantine panel: raw memo with malicious span highlighted, arrow to typed `MemoFacts`, classifier and regex verdicts, "reached the investigator? No".
   - Evidence panel: records with IDs; click a report sentence to open its source record.
   - Report: regulator template preview, citation chips, rejected-sentence counter.
   - Gate: Approve / Reject / More info, reason required on override, shows who and when.
3. **/audit** - log table, hash chain visual, Verify integrity button, tamper demo toggle (demo mode only), export.
4. **/eval** - scorecard: injection catch table by family, ablation (naive vs MOMO), unsafe auto-clears = 0, ROI panel, Arabic matcher table.
5. **/pitch** - animated deck inside same design system (see 07).

## Design principles
- Calm, dense, trustworthy "operations console" feel; information hierarchy over decoration. One accent colour for risk/attention, restrained palette, semantic colours for lanes.
- Typography: one strong sans for UI and a monospace for IDs/hashes; a proper Arabic typeface (e.g. IBM Plex Sans Arabic or Noto Kufi/Naskh) with correct sizing and line-height.
- Motion with purpose: step-by-step reveal of the pipeline during an investigation (the hero moment), highlight sweep over the injected span, subtle state transitions. Respect reduced motion.
- Visible agent/code separation: consistent CODE (solid, mono) vs LLM (outlined) vs HUMAN badges; a "what the model cannot do" card.
- States: loading skeletons, empty, error, rate-limited fallback banner ("using cached reasoning"). Never white-screen.
- Accessibility: contrast, focus rings, keyboard navigation for the approval gate.
- Avoid: generic purple gradients, glassmorphism overload, stock illustrations, emoji icons, lorem ipsum, unlabeled charts.

## Design deliverables from the planning model
Token file (colours, spacing, radii, type scale), component inventory, screen wireframes in ASCII or Mermaid, a motion spec for the hero moment, and a list of 5 reference-style directions for the team to choose from.
