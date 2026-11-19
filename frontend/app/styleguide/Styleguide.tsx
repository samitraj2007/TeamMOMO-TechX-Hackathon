"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Airlock } from "@/components/case/Airlock";
import { PipelineTimeline } from "@/components/case/PipelineTimeline";
import {
  IconAudit, IconCases, IconEval, IconGate, IconIngest, IconPlay, IconQueue, IconReplay, IconSearch, IconTransactions,
} from "@/components/icons";
import {
  ActorTag, Amount, Banner, Button, Callout, CountUp, DataTable, Drawer, EmptyState, ErrorState, Field, Hash, IconButton,
  Input, Kbd, Panel, PropertiesTable, RefusedState, RouteTag, SegmentedTabs, Select, Skeleton, StatusTag, Tag, TextArea,
  Tile, Timestamp, Tooltip, type Column,
} from "@/components/primitives";
import { RecordChip, RecordChips, RecordProvider } from "@/components/records/Records";
import { AppShell } from "@/components/shell/AppShell";
import { CommandPalette, useCommandHotkey, type Command } from "@/components/shell/CommandPalette";
import type { NavItem } from "@/components/shell/nav";
import type { StatusInfo } from "@/components/shell/StatusBar";
import { ApiError } from "@/lib/api";
import { contrast } from "@/lib/contrast";
import { amount, int } from "@/lib/format";
import {
  AIRLOCK_FIXTURES, FIXTURE_NOTICE, TIMELINE_FIXTURE, TRANSACTIONS_FIXTURE, fixtureRecordSource,
} from "@/lib/fixtures/styleguide";
import { ROUTE_TONE } from "@/lib/labels";
import type { Role, TransactionSummary } from "@/lib/types";

const SURFACES = [
  { name: "bg", hex: "#0A0E0C" },
  { name: "surface", hex: "#0F1512" },
  { name: "raised", hex: "#141C17" },
  { name: "overlay", hex: "#19231D" },
  { name: "hairline", hex: "#213028" },
  { name: "hairline-strong", hex: "#2E4237" },
];

const INKS = [
  { name: "text", hex: "#D6E0D9", use: "body text" },
  { name: "muted", hex: "#7B8B82", use: "labels, secondary" },
  { name: "sage", hex: "#6E9B83", use: "CODE · positive" },
  { name: "amber", hex: "#C9A24A", use: "review" },
  { name: "red", hex: "#B5524A", use: "bars, borders, fills" },
  { name: "red-text", hex: "#D27A70", use: "small red text" },
  { name: "model", hex: "#7C9DB8", use: "MODEL actor" },
  { name: "human", hex: "#C8B47A", use: "HUMAN actor" },
];

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex items-baseline gap-3">
        <h2 id={`${id}-h`} className="shrink-0 text-md font-medium text-text">{title}</h2>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function FixtureLabel({ children = "fixture" }: { children?: ReactNode }) {
  return <Tag tone="amber" variant="dashed">{children}</Tag>;
}

function Ratio({ fg, bg }: { fg: string; bg: string }) {
  const r = contrast(fg, bg);
  const tone = r >= 4.5 ? "text-sage" : r >= 3 ? "text-amber" : "text-red-text";
  return (
    <span className={`num text-2xs ${tone}`} title={r >= 4.5 ? "AA text" : r >= 3 ? "AA large text / UI only" : "fails AA"}>
      {r.toFixed(2)}
    </span>
  );
}

export function Styleguide() {
  return (
    <RecordProvider source={fixtureRecordSource}>
      <div className="sticky top-0 z-30">
        <Banner tone="amber" actions={<FixtureLabel>fixtures</FixtureLabel>}>
          <span className="font-medium">{FIXTURE_NOTICE}</span>
        </Banner>
      </div>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-6 py-6">
        <header className="flex flex-col gap-1">
          <span className="text-2xs font-medium uppercase tracking-[0.08em] text-muted">GulfHorizon · MOMO Sentinel</span>
          <h1 className="text-xl font-medium text-text">Obsidian Ledger · design system</h1>
          <p className="max-w-3xl text-sm text-muted">
            Sharp, dense, calm. Radius 0 to 2px, 1px hairlines, a 4px grid, depth from surface tint only. Every value on this
            page is fixture data; console screens read the backend.
          </p>
        </header>
        <Tokens />
        <Typography />
        <SpacingAndShape />
        <Controls />
        <Surfaces />
        <States />
        <RecordsDemo />
        <TableDemo />
        <TimelineDemo />
        <AirlockDemo />
        <ShellDemo />
      </div>
    </RecordProvider>
  );
}

function Tokens() {
  return (
    <Section id="tokens" title="Colour tokens" note="Ratios are live WCAG 2.x contrast against bg / surface / raised. Green ≥ 4.5 (AA text), amber ≥ 3 (UI and large text only).">
      <div className="grid grid-cols-6 gap-px border border-hairline bg-hairline">
        {SURFACES.map((s) => (
          <div key={s.name} className="flex flex-col bg-surface">
            <div className="h-14 border-b border-hairline" style={{ background: s.hex }} />
            <div className="flex flex-col px-2 py-1.5">
              <span className="text-xs text-text">{s.name}</span>
              <span className="num text-2xs text-muted">{s.hex}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="border border-hairline">
        <div className="grid grid-cols-[180px_1fr_72px_72px_72px] items-center gap-2 border-b border-hairline-strong bg-raised px-3 py-1.5 text-2xs uppercase tracking-[0.08em] text-muted">
          <span>Ink</span><span>Use</span><span className="text-end">on bg</span><span className="text-end">surface</span><span className="text-end">raised</span>
        </div>
        {INKS.map((c) => (
          <div key={c.name} className="grid grid-cols-[180px_1fr_72px_72px_72px] items-center gap-2 border-b border-hairline px-3 py-1.5 last:border-b-0">
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-3 w-3 border border-hairline-strong" style={{ background: c.hex }} />
              <span className="text-sm" style={{ color: c.hex }}>{c.name}</span>
              <span className="num text-2xs text-muted">{c.hex}</span>
            </span>
            <span className="text-xs text-muted">{c.use}</span>
            <span className="text-end"><Ratio fg={c.hex} bg="#0A0E0C" /></span>
            <span className="text-end"><Ratio fg={c.hex} bg="#0F1512" /></span>
            <span className="text-end"><Ratio fg={c.hex} bg="#141C17" /></span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        <span className="text-red-text">red-text</span> carries small red copy; base <span className="num">red</span> is reserved for bars, borders
        and fills where 3:1 suffices.
      </p>
    </Section>
  );
}

function Typography() {
  const sizes = [
    ["2xs", "11 / 16", "text-2xs"], ["xs", "12 / 16", "text-xs"], ["sm", "13 / 20", "text-sm"], ["base", "14 / 20", "text-base"],
    ["md", "16 / 24", "text-md"], ["lg", "20 / 28", "text-lg"], ["xl", "28 / 36", "text-xl"],
  ] as const;
  return (
    <Section id="type" title="Typography" note="Geist for UI, JetBrains Mono with tabular, slashed-zero numerals for data, IBM Plex Sans Arabic for Arabic. All self-hosted.">
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <Panel title="Scale · Geist">
          <div className="flex flex-col gap-1.5">
            {sizes.map(([name, metric, cls]) => (
              <div key={name} className="flex items-baseline gap-3">
                <span className="num w-20 shrink-0 text-2xs text-muted">{name} {metric}</span>
                <span className={`${cls} text-text`}>Payment held pending approval</span>
              </div>
            ))}
          </div>
        </Panel>
        <div className="flex flex-col gap-2">
          <Panel title="Data · JetBrains Mono">
            <div className="num flex flex-col gap-1 text-sm text-text">
              <span>TXN-00412 · ALT-0093 · AUD-000418</span>
              <span>1,048,500.00 AED · 0O 1lI</span>
              <span className="text-muted">9f2c4e1a…b07d · 2026-11-18 10:12:04</span>
            </div>
          </Panel>
          <Panel title="Arabic · IBM Plex Sans Arabic">
            <p dir="rtl" lang="ar" className="ar text-text">
              تم إيقاف التحويل بانتظار موافقة مسؤول الامتثال. المبلغ <span className="num" dir="ltr">48,500.00 AED</span>
            </p>
          </Panel>
        </div>
      </div>
    </Section>
  );
}

function SpacingAndShape() {
  return (
    <Section id="space" title="Grid, radius, lines" note="4px grid. Radius 0 to 2px. No shadows; depth from tint.">
      <div className="grid grid-cols-3 gap-2">
        <Panel title="4px steps">
          <div className="flex items-end gap-2">
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1">
                <div className="w-3 bg-sage/60" style={{ height: n * 4 }} />
                <span className="num text-2xs text-muted">{n * 4}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Radius">
          <div className="flex items-center gap-3">
            {[["0", "rounded-none"], ["1px", "rounded-xs"], ["2px", "rounded-sm"]].map(([l, c]) => (
              <div key={l} className="flex flex-col items-center gap-1">
                <div className={`h-10 w-14 border border-hairline-strong bg-raised ${c}`} />
                <span className="num text-2xs text-muted">{l}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Depth by tint">
          <div className="flex border border-hairline">
            {["bg-bg", "bg-surface", "bg-raised", "bg-overlay"].map((c) => (
              <div key={c} className={`flex h-10 flex-1 items-end border-e border-hairline p-1 last:border-e-0 ${c}`}>
                <span className="num text-2xs text-muted">{c.slice(3)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Section>
  );
}

function Controls() {
  const [tab, setTab] = useState<"quarantine" | "evidence" | "report">("quarantine");
  return (
    <Section id="controls" title="Controls and tags">
      <div className="grid grid-cols-2 gap-2">
        <Panel title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="solid" icon={<IconPlay size={14} />}>Run pipeline</Button>
            <Button variant="outline">Request more info</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger" icon={<IconGate size={14} />}>Hold and block</Button>
            <Button variant="solid" disabled>Disabled</Button>
            <Button size="sm" variant="outline" icon={<IconReplay size={12} />}>Small</Button>
            <IconButton label="Search"><IconSearch /></IconButton>
            <Tooltip label="Tooltips appear after 400 ms"><Button size="sm" variant="ghost">Hover me</Button></Tooltip>
          </div>
        </Panel>
        <Panel title="Segmented tabs">
          <div className="flex flex-col gap-2">
            <SegmentedTabs label="Case view" value={tab} onChange={setTab}
              options={[{ value: "quarantine", label: "Quarantine", count: 4 }, { value: "evidence", label: "Evidence", count: 5 }, { value: "report", label: "Report" }]} />
            <SegmentedTabs size="sm" label="Filter" value="all" onChange={() => undefined}
              options={[{ value: "all", label: "All" }, { value: "alerted", label: "Alerted" }, { value: "not", label: "Not alerted", disabled: true }]} />
          </div>
        </Panel>
        <Panel title="Actors · routes · status">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><ActorTag actor="CODE" /><ActorTag actor="LLM" /><ActorTag actor="HUMAN" />
              <span className="text-xs text-muted">CODE solid, MODEL outline, HUMAN dashed</span></div>
            <div className="flex items-center gap-2"><RouteTag route="AUTO_CLEAR" /><RouteTag route="NEEDS_REVIEW" /><RouteTag route="PENDING_APPROVAL" /><RouteTag route={null} /></div>
            <RouteTag route="PENDING_APPROVAL" size="lg" />
            <div className="flex flex-wrap items-center gap-3">
              {["DONE", "FLAGGED", "DEGRADED", "SKIPPED", "WAITING", "REFUSED"].map((s) => <StatusTag key={s} status={s} />)}
            </div>
          </div>
        </Panel>
        <Panel title="Tags · keys">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="sage">outline</Tag><Tag tone="amber" variant="tint">tint</Tag><Tag tone="red" variant="solid">solid</Tag>
              <Tag tone="human" variant="dashed">dashed</Tag><Tag tone="model" mono>prompt v3</Tag><Tag tone="muted">muted</Tag>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted"><Kbd>Ctrl</Kbd><Kbd>K</Kbd> command palette</div>
          </div>
        </Panel>
        <Panel title="Form" className="col-span-2">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Customer" htmlFor="sg-cus" hint="Existing synthetic customer ID"><Input id="sg-cus" mono defaultValue="CUS-F0001" /></Field>
            <Field label="Channel" htmlFor="sg-ch"><Select id="sg-ch" defaultValue="web"><option value="mobile">mobile</option><option value="web">web</option><option value="branch">branch</option></Select></Field>
            <Field label="Amount (AED)" htmlFor="sg-amt" error="Amount must be positive"><Input id="sg-amt" mono aria-invalid="true" defaultValue="-10" /></Field>
            <Field label="Memo" htmlFor="sg-memo" hint="Free text is quarantined; only typed facts reach a model." className="col-span-3">
              <TextArea id="sg-memo" defaultValue="Invoice INV-2026-0277 office supplies" />
            </Field>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

function Surfaces() {
  return (
    <Section id="surfaces" title="Bento surfaces, KPIs, callouts, properties" note={<FixtureLabel />}>
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Open alerts" value={<CountUp value={143} />} foot="of 1,000 transactions" tone="amber" />
        <Tile label="Auto-cleared" value={<CountUp value={71} />} foot="code route, no model veto" tone="sage" />
        <Tile label="Held for approval" value={<CountUp value={12} />} foot="human gate" tone="red" />
        <Tile label="Investigator tokens" value={<CountUp value={16526} />} foot="curated prewarm" tint="raised" />
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <div className="flex flex-col gap-2">
          <Callout kind="note" title="Policy">Thresholds are code; the model may only make a route stricter.</Callout>
          <Callout kind="model">The investigator saw typed MemoFacts and cited evidence IDs only.</Callout>
          <Callout kind="warn">Classifier degraded; routed to review (fail closed).</Callout>
          <Callout kind="danger">Possible watchlist match on payee.</Callout>
          <Callout kind="refused" title="Filing refused">No compliance-officer approval on record.</Callout>
        </div>
        <Panel title="Report frontmatter">
          <PropertiesTable rows={[
            { key: "case_id", value: "ALT-F0001", mono: true },
            { key: "route", value: <RouteTag route="PENDING_APPROVAL" /> },
            { key: "amount", value: <Amount value={48500} /> },
            { key: "created", value: <Timestamp iso="2026-11-18T06:12:04Z" /> },
            { key: "report_sha256", value: <Hash value="9f2c4e1ab7d03e55c1a9f0b2d7e6c4a18b3f5e2d9c0a7b6e1f4d3c2b1a0b07d" /> },
            { key: "template", value: "v2 · EN", mono: true },
          ]} />
        </Panel>
      </div>
    </Section>
  );
}

function States() {
  return (
    <Section id="states" title="States" note="Loading is static (no shimmer). Errors name the cause; refusals quote the gate.">
      <div className="grid grid-cols-2 gap-2">
        <Panel title="Loading"><Skeleton lines={4} /></Panel>
        <EmptyState title="No alerts in this view" body="Every transaction in this filter was cleared by rules or has not been run." action={<Button size="sm" variant="outline">Show all</Button>} />
        <ErrorState error={new ApiError(0, "fetch failed: connect ECONNREFUSED 127.0.0.1:8000")} onRetry={() => undefined} />
        <RefusedState status={409} detail="Filing requires an APPROVE decision by a COMPLIANCE_OFFICER." auditId={<span className="num">AUD-F0042</span>} />
      </div>
      <div className="border border-hairline">
        <Banner tone="amber">Replay mode: responses are served from cache; uncached investigator calls fail closed to review.</Banner>
        <Banner tone="red">Audit chain broken at AUD-F0042 (PREV_HASH_MISMATCH).</Banner>
        <Banner tone="sage" actions={<Button size="sm" variant="ghost">Dismiss</Button>}>Chain verified · 418 entries.</Banner>
      </div>
    </Section>
  );
}

function RecordsDemo() {
  return (
    <Section id="records" title="Record links" note={<>Hover to preview, click to open the drawer with backlinks. <FixtureLabel /></>}>
      <Panel>
        <p className="text-sm leading-7 text-text">
          The payee on <RecordChip id="TXN-F0001" /> is a possible match to <RecordChip id="WL-F0003" />. The customer{" "}
          <RecordChip id="CUS-F0001" /> paid from an unverified device <RecordChip id="DEV-F0001" />, with{" "}
          <RecordChips ids={["VEL-F0001"]} /> showing three new payees in 24 hours. A missing record shows its error:{" "}
          <RecordChip id="TXN-F9999" />.
        </p>
      </Panel>
    </Section>
  );
}

function TableDemo() {
  const [open, setOpen] = useState<TransactionSummary | null>(null);
  const columns: Column<TransactionSummary>[] = useMemo(() => [
    { key: "txn", header: "Transaction", width: "120px", mono: true, render: (r) => r.txn_id },
    { key: "alert", header: "Alert", width: "104px", mono: true, render: (r) => r.alert_id ?? <span className="text-muted">-</span> },
    { key: "rule", header: "Rule", width: "88px", mono: true, render: (r) => r.rule_id ?? <span className="text-muted">none</span> },
    { key: "payee", header: "Payee", width: "minmax(0,1fr)", render: (r) => r.payee_name ?? <span className="text-muted">-</span> },
    { key: "amount", header: "Amount", width: "140px", align: "end", render: (r) => <Amount value={r.amount} /> },
    { key: "ts", header: "Time (GST)", width: "152px", render: (r) => <Timestamp iso={r.ts} /> },
    { key: "route", header: "Route", width: "132px", render: (r) => (r.alerted ? <RouteTag route={r.last_route} /> : <Tag tone="muted">Not alerted</Tag>) },
  ], []);
  return (
    <Section id="table" title="Data table" note={<>1,000 rows, windowed. Arrow keys move, Enter opens. <FixtureLabel /></>}>
      <DataTable
        label="Fixture transactions"
        rows={TRANSACTIONS_FIXTURE}
        columns={columns}
        rowKey={(r) => r.txn_id}
        rowTone={(r) => (r.last_route ? ROUTE_TONE[r.last_route] : null)}
        onRowActivate={setOpen}
        height={360}
      />
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={<span className="num">{open?.txn_id}</span>}>
        {open && (
          <PropertiesTable rows={[
            { key: "alert_id", value: open.alert_id ?? "-", mono: true },
            { key: "amount", value: <Amount value={open.amount} /> },
            { key: "payee", value: open.payee_name ?? "-" },
            { key: "route", value: <RouteTag route={open.last_route} /> },
          ]} />
        )}
      </Drawer>
    </Section>
  );
}

function TimelineDemo() {
  const [key, setKey] = useState(0);
  const total = TIMELINE_FIXTURE.reduce((s, x) => s + (x.duration_ms ?? 0), 0);
  return (
    <Section id="timeline" title="Pipeline timeline" note={<>Reveal runs once per run, not on refetch. <FixtureLabel /></>}>
      <Panel title="Timeline" tint="surface" className="max-w-2xl"
        actions={<>
          <span className="num text-2xs text-muted">{amount(total)} ms total</span>
          <Button size="sm" variant="ghost" icon={<IconReplay size={12} />} onClick={() => setKey((k) => k + 1)}>Replay reveal</Button>
        </>}>
        <PipelineTimeline steps={TIMELINE_FIXTURE} revealKey={key} renderRecords={(ids) => <RecordChips ids={ids} />} />
      </Panel>
    </Section>
  );
}

function AirlockDemo() {
  const [which, setWhich] = useState<keyof typeof AIRLOCK_FIXTURES>("en");
  const f = AIRLOCK_FIXTURES[which];
  return (
    <Section id="airlock" title="Quarantine airlock" note={<>About 6 s at 1×, replayable, scrubbable. Reduced motion shows the end state. <FixtureLabel /></>}>
      <SegmentedTabs label="Airlock fixture" value={which} onChange={setWhich}
        options={(Object.keys(AIRLOCK_FIXTURES) as (keyof typeof AIRLOCK_FIXTURES)[]).map((k) => ({ value: k, label: AIRLOCK_FIXTURES[k].label }))} />
      <Airlock key={which} memo={f.memo} spans={f.spans} facts={f.facts} />
    </Section>
  );
}

function ShellDemo() {
  const [sidebar, setSidebar] = useState(true);
  const [active, setActive] = useState("queue");
  const [tabs, setTabs] = useState([
    { id: "queue", label: "Queue", closable: false },
    { id: "ALT-F0001", label: "ALT-F0001", mono: true, closable: true },
    { id: "ALT-F0008", label: "ALT-F0008", mono: true, closable: true },
  ]);
  const [tab, setTab] = useState("ALT-F0001");
  const [role, setRole] = useState<Role>("COMPLIANCE_OFFICER");
  const [palette, setPalette] = useState(false);
  const [last, setLast] = useState("nothing yet");
  const openPalette = useCallback(() => setPalette(true), []);
  useCommandHotkey(openPalette);

  const nav = (id: string, label: string, icon: ReactNode, meta?: ReactNode): NavItem => ({ id, label, icon, meta, onSelect: () => setActive(id) });
  const ribbon = [
    nav("queue", "Queue", <IconQueue />), nav("transactions", "Transactions", <IconTransactions />), nav("cases", "Cases", <IconCases />),
    nav("audit", "Audit", <IconAudit />), nav("eval", "Eval", <IconEval />), nav("ingest", "Test your own case", <IconIngest />),
  ];
  const tree: NavItem[] = [
    { ...nav("queue", "Queue", <IconQueue size={14} />, 143) },
    { ...nav("transactions", "Transactions", <IconTransactions size={14} />, int(1000)) },
    {
      id: "cases", label: "Cases", icon: <IconCases size={14} />,
      children: [nav("ALT-F0001", "ALT-F0001 · held", null), nav("ALT-F0008", "ALT-F0008 · review", null)],
    },
    { ...nav("audit", "Audit", <IconAudit size={14} />) },
    { ...nav("eval", "Eval", <IconEval size={14} />) },
  ];
  const status: StatusInfo = {
    backend: "ok", provider: "Groq live", providerTone: "sage", cases: 143,
    chain: { ok: true, head: "AUD-F0418", entries: 418, headHash: "9f2c4e1ab7d03e55c1a9f0b2d7e6c4a18b3f5e2d9c0a7b6e1f4d3c2b1a0b07d" },
  };
  const commands: Command[] = [
    { id: "go-queue", group: "Navigate", label: "Open queue", run: () => setLast("Open queue") },
    { id: "go-txn", group: "Navigate", label: "Open transactions", run: () => setLast("Open transactions") },
    { id: "go-audit", group: "Navigate", label: "Open audit · verify chain", run: () => setLast("Open audit") },
    { id: "case-1", group: "Cases", label: "ALT-F0001 · Falcon Ridge Trading", hint: "held", keywords: "alt", run: () => setLast("ALT-F0001") },
    { id: "case-8", group: "Cases", label: "ALT-F0008 · Oasis Grid Utilities", hint: "review", keywords: "alt", run: () => setLast("ALT-F0008") },
  ];
  const dynamic = (q: string): Command[] => {
    const m = q.toUpperCase().match(/^(TXN|ALT)-[A-Z0-9]+$/);
    if (!m) return [];
    return m[1] === "TXN"
      ? [{ id: `run-${q}`, group: "From your input", label: `Run pipeline on ${q.toUpperCase()}`, run: () => setLast(`Run ${q.toUpperCase()}`) }]
      : [{ id: `open-${q}`, group: "From your input", label: `Open case ${q.toUpperCase()}`, run: () => setLast(`Open ${q.toUpperCase()}`) }];
  };

  return (
    <Section id="shell" title="App shell" note={<>Ribbon, sidebar tree, pane tabs, status bar, Ctrl+K palette. <FixtureLabel /></>}>
      <div className="h-[560px] border border-hairline-strong bg-bg">
        <AppShell
          className="h-full"
          ribbon={ribbon}
          tree={tree}
          activeId={active}
          sidebarOpen={sidebar}
          onToggleSidebar={() => setSidebar((s) => !s)}
          onOpenPalette={openPalette}
          tabs={tabs}
          activeTab={tab}
          onSelectTab={setTab}
          onCloseTab={(id) => {
            setTabs((ts) => ts.filter((x) => x.id !== id));
            if (tab === id) setTab("queue");
          }}
          status={status}
          role={role}
          onRoleChange={setRole}
          banner={<Banner tone="amber" actions={<FixtureLabel />}>Shell preview with fixture navigation; nothing here calls the backend.</Banner>}
        >
          <div className="grid h-full grid-cols-[1fr_1fr_1fr] grid-rows-[auto_1fr] gap-2">
            <Tile label="Active pane" value={tab} foot={`sidebar: ${active}`} />
            <Tile label="Role" value={role === "COMPLIANCE_OFFICER" ? "Officer" : "Analyst"} foot="from status bar" tone="human" />
            <Tile label="Last command" value={<span className="text-sm">{last}</span>} foot={<span className="flex items-center gap-1">Press <Kbd>Ctrl</Kbd><Kbd>K</Kbd> or type TXN-F0042</span>} tone="sage" />
            <Panel title="Workspace" className="col-span-3" tint="bg">
              <EmptyState title="Screens arrive in step 3" body="The console layout will mount real pages here: queue, case, transactions, audit, eval." />
            </Panel>
          </div>
        </AppShell>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} dynamic={dynamic} />
    </Section>
  );
}
