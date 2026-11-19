# GulfHorizon UI plan: "Obsidian Ledger"

A deep forest-and-moss operations console in the spirit of Obsidian community themes (Minimal, Things, Primary, Blue Topaz, Sanctum): calm, warm and fluid, with boxy panels that are not locked to a visible grid, and real interactive behaviour. This document is the step 1 deliverable, revised after the step 2 review (see "Revision 1"). Step 2 builds the design system and `/styleguide`; step 3 builds the screens. Each step stops for review.

Hard rules (revision 1, superseding the original radius and grid rules):
- Radius 6px on panels and cards, 3px on controls and tags. No pills, no capsule badges, no circle buttons; the only circle is the mascot avatar.
- 1px hairline borders. Depth from surface tint, a faint inner highlight on the top edge, and a very subtle blurred glow behind active elements. No heavy drop shadows.
- Gradients only as soft tints within one hue family. No emoji.
- Monospace with tabular numerals for IDs, amounts, hashes and timestamps; self-hosted fonts; EN and AR with RTL for memo and report panels; WCAG AA for text; `prefers-reduced-motion` respected everywhere.
- Frontend only: never import the engine or change backend code. Real data only; fixtures appear only on `/styleguide`, labelled.

## Revision 1 (step 2 review)
- **Problems fixed:** the first pass was too grid-like and rigid, its colours read as flat grey-green with near-white text, the mascot was missing, and it had too little interactive behaviour.
- **Layout:** panels of varied width and height, slight overlaps and offsets, and a layered "stacked sheet" on key cards. Spacing is generous but uneven. Content still aligns inside each panel; the arrangement must not read as a spreadsheet. The visible 8px backdrop grid is removed.
- **Mascot:** `public/brand/momo-mascot.png`, used as the logo in the rail, in loading and empty states, and as the guide at the quarantine airlock (see "Mascot").
- **Interactions:** Motion springs throughout (see "Interaction spec").

## What exists today
- **API client:** [frontend/lib/api.ts](../frontend/lib/api.ts) covers:
  - health, cases, case detail, run, decide, commit;
  - transactions, runTransaction, timeline, fileReport, reset.
- **Routes on the backend but not yet in the client:**
  - `GET /records/{id}`, `GET /cases/{id}/report`, `GET /cases/{id}/audit`;
  - `GET /audit/verify`, `POST /cases/ingest`.
- **Types:** [frontend/lib/types.ts](../frontend/lib/types.ts) mirrors the backend, with drift to fix in step 2:
  - `Health` lacks `investigator_model`, `investigator_live` and `backup_model`, and `demo_mode` lacks `off`;
  - `Approval` lacks `action` and `override`;
  - `Evidence` lacks `calls`.
- **Current UI:** [frontend/components/CaseScreen.tsx](../frontend/components/CaseScreen.tsx) (655 lines) plus `ui.tsx` and `HighlightedText.tsx`. Step 3 replaces them; the span-merge logic gets reused.
- **Styling and dependencies:**
  - Tailwind v4 with `@theme` tokens in [frontend/app/globals.css](../frontend/app/globals.css).
  - Next 16.4. Per [frontend/AGENTS.md](../frontend/AGENTS.md), read `node_modules/next/dist/docs/` before writing code, especially for `next/font/local` and route groups.
  - Approved but not installed ([DEPENDENCIES.md](DEPENDENCIES.md)): `motion` and `@tanstack/react-query`. These are the only packages step 2 adds.
  - No icon library: a small inline SVG icon set.
  - No markdown library: a renderer for the subset the report template uses (h1/h2, blockquote, table, list, inline code and `[ID]` citations).

## API gaps (tell, don't fake)
1. **`/eval` scorecard:** there's no eval endpoint and no eval output file, and the API deliberately withholds the ground-truth labels. The screen shows a "needs `GET /eval`" blocked state until the backend adds it.
2. **Global `/audit` table and its verify sweep:** only per-case audit and `/audit/verify` (head hash and count) exist. A global table needs `GET /audit?limit&offset`. Until then the screen shows verify status plus a per-case chain view.
3. **Queue KPIs:** `last_route` is held in memory, is null until each case is run, and clears when the backend restarts.
   - A "Run queue" action calls the real `POST /cases/{id}/run` one case at a time, with progress shown. This is safe in replay mode; in live mode it is rate-limited.
   - A persisted route on `/cases` would remove the problem; that needs a backend change.
4. **"Cited by" across cases** (for example, every case citing WL-007): no endpoint. Backlinks within one case are built from report sentences, investigator findings and timeline record IDs.
5. **Arabic report:** the SAR template is English only. Memo, raw-field and record panels get `dir="auto"` and RTL. A full Arabic report needs a backend template.
6. **Entity graph counterparties:** one payee per case and no cross-case counterparty IDs, so mule-graph correlation needs a backend endpoint. A graph for a single case is buildable from the evidence data.

## Information architecture
```mermaid
flowchart LR
  ribbon[IconRibbon] --> sidebar[SidebarTree]
  sidebar --> queue["/queue"]
  sidebar --> txns["/transactions"]
  sidebar --> cases["Cases tree: demo A-T, recent"]
  sidebar --> auditPage["/audit"]
  sidebar --> evalPage["/eval"]
  cases --> casePage["/case/id"]
  queue --> casePage
  txns -->|"run this transaction"| casePage
  palette["Ctrl+K palette"] --> casePage
  palette --> txns
  ingestPage["/ingest Test your own case"] --> casePage
```
- **Shell:**
  - Icon ribbon, 44px.
  - Collapsible sidebar tree, 224px.
  - Pane tabs, 32px: open cases and pages, like Obsidian tabs.
  - Workspace.
  - Status bar, 24px. It shows:
    - backend health;
    - provider (Groq live, backup, or replay, from `/health`);
    - audit chain (`/audit/verify`, polled every 30 seconds);
    - case count;
    - role switcher (Analyst / Officer), which the decision endpoint needs.
- **`/` redirects to `/queue`.** The Reset button appears only when `NEXT_PUBLIC_DEV_TOOLS=1`, in the palette and status bar, and asks for the admin token.
- **Labels:** the backend's `LLM` actor is displayed as `MODEL` everywhere.

## Layout and shape (revision 1)
- **Spacing and borders:**
  - Spacing still comes from the 4px scale, but gaps vary deliberately (8, 12, 20, 28px) so the arrangement breathes.
  - Panel padding 12 to 16px. 1px hairline borders.
  - Radius: `rounded-panel` 6px for panels, cards, drawers and popovers; `rounded-control` 3px for buttons, inputs, tags and tabs.
- **Composition:**
  - Panels of varied width and height. Key cards may overlap a neighbour by 12 to 24px or sit offset by a few pixels, and the most important card in a view gets the stacked-sheet treatment (two tinted sheets peeking out behind it).
  - Workspace panes are draggable (reorder) and resizable; the rail collapses.
  - Depth: surface tint (bg, then surface, then raised, then overlay), a 1px inner highlight along the top edge, and a soft blurred glow behind the active element only.
- **Case screen** at 1440px or wider: timeline 320px, centre flexible, decision rail 344px. Below 1280px the timeline collapses into a drawer.
```
+--------------------------------------------------------------------------------+
| tabs: [ALT-00033 x] [Queue] [Transactions]                                     |
+-----------------+------------------------------------------+-------------------+
| PIPELINE        | [Quarantine] [Evidence] [Report]         | DECISION          |
| received   CODE | +--------------------------------------+ | route  reasons    |
| regex      CODE | | AIRLOCK raw -> scanner -> tray       | | code vs final     |
| classifier MODEL| |        -> MemoFacts -> gate -> inv   | +-------------------+
| evidence   CODE | +------------------+-------------------+ | APPROVAL GATE     |
|  - kyc  0.4ms   | | regex verdicts   | classifier/segs   | | role, reason      |
|  - sanctions    | +------------------+-------------------+ +-------------------+
| investigator    | | MemoFacts table  | raw fields (RTL)  | | FILING GATE       |
| verifier / gate | +--------------------------------------+ | hash, cited IDs   |
+-----------------+------------------------------------------+-------------------+
| status: backend ok | replay | chain ok AUD-000412 | 100 cases | role: Officer   |
+--------------------------------------------------------------------------------+
```
- **Queue:** KPI strip (4 tiles with count-ups) above a toolbar (lane segmented tabs, rule, amount band, search) above a dense table. Each row has a left status bar in its route colour and a demo-tag pin.
- **Transactions:** a toolbar (search; alerted / not alerted / all segments; currency; amount range; sort) over a virtual-scroll table of all 1,000 rows from a single `limit=1000` call. Each row has a "Run" action. Rows without a rule-raised alert get a "Not alerted by rules" tag.

## Tokens (revision 2)
Green is the accent, not the field. Surfaces are warm paper (bg `#F3F4F1`, surface `#FFFFFF`, raised `#F7F8F6`). Text is near-black `#1C211E`. Sage `#1F7A4D` is the only green, for the active mark, positive status and CODE. Brass, model, human and red-text are darkened so they stay AA on white. The backdrop grain drifts slowly and stops under `prefers-reduced-motion`. Console controls stay 6px / 3px; the header search and the landing use 12px.

## Tokens (revision 1)
- **Colours:** deep forest and moss with a slight warm undertone. Superseded by revision 2 above.
  - Base: bg `#0B100D`, surface `#111A14`, raised `#17231B`, overlay `#1D2B22`, hairline `#24342A`, hairline-strong `#33473A`.
  - Text: warm off-white `#E4E8DD`; muted sage-grey `#97A496`.
  - One warm accent, brass `#CFA65A`, for risk, review and focus rings.
  - Actors: sage `#7FA88E` (CODE and positive), steel-blue `#86A5BF` (MODEL), sand `#D0BC86` (HUMAN).
  - Red `#B5524A` for bars, borders and fills; `red-text #D27A70` for small red text.
  - The styleguide prints live contrast ratios for every ink on bg, surface and raised; every text ink passes AA (4.5:1).
- **Type:**
  - Geist for UI at 12, 13 (base), 14, 16, 20 and 28px.
  - JetBrains Mono with tabular numerals for IDs, amounts, hashes and timestamps.
  - IBM Plex Sans Arabic for Arabic, with a +2px size bump and 1.7 line height.
  - All self-hosted as woff2 files in `frontend/app/fonts/` (OFL licence files included) and loaded with `next/font/local`. No CDN and no font package.
- **Backdrop** (app background only):
  - static SVG noise grain at 3% opacity;
  - two very soft moss and deep-teal radial tints; no visible grid.

## Mascot
- **Asset:** `frontend/public/brand/momo-mascot.png` (the team's hand-drawn guard holding a lock shield).
- **Where:** the logo at the top of the rail; the loading state (scanning) and the empty state (idle); the guide at the quarantine airlock.
- **States:** `idle` (still), `scanning` (a lens sweep across the glasses and a slight lean), `alert` (one short shake and a red mark, when an injection is neutralised) and `approved` (one nod and a sage tick, once typed facts pass the gate). Each state carries a one-line caption at the airlock.
- **Restraint:** small (24 to 72px) and only where it explains something. With reduced motion it shows the state mark without movement.

## Component inventory
- **Shell:** `Ribbon`, `SidebarTree`, `PaneTabs`, `StatusBar`, `CommandPalette` (Ctrl+K: jump to an ALT or TXN ID, run a transaction, open a page).
- **Primitives:**
  - `Panel` and `Tile` (bento cells, three surface tints);
  - `Button` (solid, outline, ghost; square corners);
  - `SegmentedTabs`;
  - `Field`, `Select`, `TextArea`;
  - `DataTable` (sticky header, virtual rows, left status bar);
  - `Tag`, `ActorTag` (CODE solid, MODEL outlined, HUMAN dashed) and `RouteTag`;
  - `Kbd`;
  - `Callout` (note, warn, danger, refused);
  - `PropertiesTable` (frontmatter style);
  - `Num` (mono, tabular), `Hash` (shortened, copy on click), `CountUp`;
  - `Skeleton`, `EmptyState`, `ErrorState`, `RefusedState`, `Banner` (replay or degraded);
  - `Drawer`, `HoverCard`, `Tooltip`.
- **Records:** `RecordChip` (link style), `RecordPreview` (hover, `GET /records/{id}`, cached), `RecordDrawer` (raw record, withheld columns noted, Backlinks within the case).
- **Case:**
  - `PipelineTimeline` (from `/cases/{id}/timeline`, grouped by run), `Airlock`, `QuarantinePanel`, `EvidencePanel`;
  - `ReportDocument` (properties table, callouts, citation chips, rejected-sentence counter);
  - `DecisionCard`, `ApprovalGate`, `FilingGate`;
  - `EntityGraph` (P2, hand-rolled SVG force layout).
- **Other screens:** `KpiStrip`, `QueueTable`, `TxnToolbar`, `TxnTable`, `ChainTable`, `VerifySweep`, `IngestForm`.

## State handling
- **Every data view** has four explicit states:
  - loading: static skeleton blocks, no shimmer;
  - empty: what is missing and the action that fills it, such as "Not run yet: Run case";
  - error: the `ApiError` status and message, a retry button, and "backend unreachable" taken from the status bar's health check;
  - refused: a 403 from decide, commit or file shows the backend's detail in a `refused` callout, with a link to the new audit entry. A 409 shows the conflict ("already filed as AUD-...").
- **Degraded:** if the investigator status is not `ok`, or the classifier is degraded or hits the segment cap, show a "Failed closed to human review" callout. Replay mode shows a persistent banner.
- **Server state:** TanStack Query caches it, with no refetch on window focus. Mutations invalidate case, timeline, report and audit. Nothing is fetched on the server; the pages are client components.

## Motion spec
- **Tokens:**
  - durations: fast 120ms, base 180ms, slow 320ms;
  - easings: `out` cubic-bezier(0.2,0,0,1), `inOut` cubic-bezier(0.4,0,0.2,1), linear for the scanner.
  - Everything goes through `lib/motion.ts`, which reads `useReducedMotion`. Reduced motion means a duration of 0 and the final state rendered directly.
- **Airlock** (6.0s at 1x; speed 0.5x / 1x / 2x; Replay button):
  - 0.0–0.6s: raw memo slides in from the left (x -24 to 0, fade, `out`).
  - 0.6–2.4s: a hairline scanner sweeps (linear). As it reaches each span, the span flashes red for 160ms.
  - 2.4–3.4s: flagged spans are cut out and drop into the "Neutralized" tray (layout animation, 320ms). The tray count counts up.
  - 3.4–4.6s: typed MemoFacts rows assemble at an 80ms stagger.
  - 4.6–5.4s: the gate's two hairline doors part, and the facts move to the investigator box.
  - 5.4–6.0s: "raw text received by investigator: 0" settles with a single pulse.
  - The spans are real raw-text offsets from `quarantine.spans` (mapped back from normalised text by the backend).
- **Pipeline timeline:**
  - Steps reveal at a 90ms stagger (fade, y 4 to 0, 180ms). Service-call rows follow at a 40ms stagger, and duration bars grow over 240ms.
  - This plays only on a new run, not on refetch.
- **Other motion:**
  - KPI count-ups: 600ms, `out`, once per mount.
  - Verify sweep: each row lights in sequence at 24ms per row, capped at 1.2s total. Valid rows get a sage left bar; the sweep stops red at the first bad row.
  - Gate unlock: one 400ms sage outline pulse.
  - Drawer: 180ms slide plus fade. HoverCard: 120ms fade after a 250ms delay.

## Interaction spec (revision 1; Motion springs, all disabled or reduced to instant under reduced motion)
- **Cards:** lift 2px and tilt at most 3 degrees towards the pointer on hover. Expandable panels open with shared-layout transitions (`layoutId`).
- **Workspace:** panes reorder by dragging their header and resize by dragging the divider; the rail collapses to icons and expands to labels.
- **Tabs:** segmented tabs and pane tabs slide their indicator between options (`layoutId`).
- **Pipeline timeline:** scrubbable; drag along the rail, or use the arrow keys, to step through the investigation, with later steps dimmed. A Play control steps through at demo speed.
- **Airlock:** drag the memo card into the gate, or press "Send through gate", to run it; speed control; replay; the mascot guides each phase.
- **Records:** chips with hover preview cards and a side drawer; the Ctrl+K palette.
- **Preferences:** EN/AR toggle for chrome strings and a global "demo speed" (0.5x, 1x, 2x) used by the airlock and the timeline player.
- **Feedback:** number count-ups, a hash-chain verify sweep, one pulse when the approval gate unlocks, and micro-feedback on every control (press scale, brass focus ring, success tick).
- **Still never:** bounce on data, parallax, looping decoration.

## File and folder plan (frontend only; no backend changes)
- `app/fonts/*.woff2` plus OFL licences; `lib/fonts.ts`.
- `app/globals.css`: frozen `@theme` tokens, backdrop, focus rings, reduced-motion rules.
- `app/(console)/layout.tsx`: the shell. Pages under it: `queue/`, `case/[id]/`, `transactions/`, `audit/`, `eval/`, `ingest/`.
- `app/styleguide/page.tsx`: every component, plus the airlock alone, using fixtures only.
- `components/shell/*`, `components/primitives/*`, `components/records/*`, `components/case/*`, `components/queue/*`, `components/transactions/*`, `components/audit/*`, `components/icons.tsx`.
- `lib/api.ts` (add the missing routes), `lib/types.ts` (fix drift), `lib/queries.ts` (query hooks).
- `lib/format.ts` (AED amounts, timestamps, hash shortening), `lib/motion.ts`, `lib/markdown.ts`, `lib/i18n.ts` (a small EN/AR dictionary for chrome strings).
- `lib/fixtures/*`: imported only by `/styleguide`, never by a screen.

## Step 2 and step 3 outline (each stops for review)
- **Step 2:**
  - Install `motion` and `@tanstack/react-query`, add the fonts, and freeze the tokens.
  - Build the primitives, shell and record components, plus the airlock and timeline on fixtures, and `/styleguide`.
  - Run `npm run typecheck` and commit "UI 2/3: design system and styleguide".
  - Report what to screenshot.
- **Step 3**, one commit per screen in this order, each followed by a type-check and a screenshot list:
  1. `/case/[id]`
  2. `/queue`
  3. `/transactions`
  4. `/audit`
  5. `/eval` (blocked state until the endpoint exists)
  6. `/ingest`
  7. P2: entity graph, Arabic polish, ROI strip
  - The old `CaseScreen`, `ui` and `HighlightedText` components are removed when `/case/[id]` replaces them.
