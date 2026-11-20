"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChainSweep } from "@/components/audit/ChainSweep";
import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { Airlock } from "@/components/case/Airlock";
import { GateLock } from "@/components/case/GateLock";
import { PipelineTimeline } from "@/components/case/PipelineTimeline";
import {
  IconAudit, IconCases, IconEval, IconFile, IconGate, IconIngest, IconPlay, IconQueue, IconReplay, IconSearch, IconTransactions,
} from "@/components/icons";
import {
  ActorTag, Amount, Banner, Button, Callout, CountUp, DataTable, Drawer, EmptyState, ErrorState, ExpandableCards, Field, Hash,
  IconButton, Input, Kbd, LiftCard, LoadingState, Panel, PropertiesTable, RefusedState, RouteTag, SegmentedTabs, Select, Skeleton,
  StatusTag, SuccessButton, Tag, TextArea, Tile, Timestamp, Toggle, Tooltip, type Column,
} from "@/components/primitives";
import { RecordChip, RecordChips, RecordProvider } from "@/components/records/Records";
import { AppShell } from "@/components/shell/AppShell";
import { CommandPalette, type Command } from "@/components/shell/CommandPalette";
import type { NavItem } from "@/components/shell/nav";
import { Workspace } from "@/components/shell/Workspace";
import { ApiError } from "@/lib/api";
import { contrast } from "@/lib/contrast";
import { int } from "@/lib/format";
import {
  AIRLOCK_FIXTURES, CHAIN_FIXTURE, FIXTURE_NOTICE, TIMELINE_FIXTURE, TRANSACTIONS_FIXTURE, fixtureRecordSource, verifyChainFixture,
} from "@/lib/fixtures/styleguide";
import { t } from "@/lib/i18n";
import { ROUTE_TONE } from "@/lib/labels";
import { usePrefs } from "@/lib/prefs";
import { INKS, SURFACES } from "@/lib/tokens";
import type { Role, TransactionSummary } from "@/lib/types";

const HEAD = "9f2c4e1ab7d03e55c1a9f0b2d7e6c4a18b3f5e2d9c0a7b6e1f4d3c2b1a0b07d";

function Section({ id, title, note, children, className }: { id: string; title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`flex scroll-mt-16 flex-col gap-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-h`} className="shrink-0 text-lg font-medium text-text">{title}</h2>
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
      <div className="sticky top-0 z-30 px-4 pt-2">
        <Banner floating tone="amber" actions={<FixtureLabel>fixtures</FixtureLabel>}>
          <span className="font-medium">{FIXTURE_NOTICE}</span>
        </Banner>
      </div>
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-16 px-8 pb-24 pt-10">
        <Hero />
        <MascotStates />
        <Colour />
        <TypeAndShape />
        <Controls />
        <CardsAndFeedback />
        <States />
        <RecordsAndTable />
        <Investigation />
        <ShellDemo />
      </div>
    </RecordProvider>
  );
}

function Hero() {
  return (
    <div className="relative grid grid-cols-12 items-start">
      <Panel stacked glow="sage" tint="raised" className="col-span-7 col-start-1 z-[1]" bodyClassName="p-8">
        <div className="flex items-start gap-6">
          <Mascot state="approved" size={84} avatar />
          <div className="flex flex-col gap-2">
            <span className="text-2xs font-medium uppercase tracking-[0.14em] text-muted">GulfHorizon · MOMO Sentinel</span>
            <h1 className="text-xl font-medium text-text">Obsidian Ledger, revision 1</h1>
            <p className="max-w-xl text-sm text-muted">
              Deep forest and moss with a warm undertone. Boxy panels with soft 6px corners, layered sheets instead of a spreadsheet grid,
              one brass accent for risk and focus, and real interaction: springs, drag, scrub, shared layout. Every value here is fixture data.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <ActorTag actor="CODE" /><ActorTag actor="LLM" /><ActorTag actor="HUMAN" />
              <span className="text-xs text-muted">the model can only make a route stricter</span>
            </div>
          </div>
        </div>
      </Panel>
      <div className="col-span-6 col-start-7 -ms-6 mt-14 flex flex-col gap-3 ps-0">
        <div className="flex gap-3">
          <LiftCard className="flex-[1.2] px-5 py-4">
            <Tile label="Open alerts" value={<CountUp value={143} />} foot="of 1,000 transactions" tone="amber" tint="overlay" className="border-0 bg-transparent p-0 shadow-none" />
          </LiftCard>
          <LiftCard className="mt-6 flex-1 px-5 py-4">
            <Tile label="Held" value={<CountUp value={12} />} foot="human gate" tone="red" className="border-0 bg-transparent p-0 shadow-none" />
          </LiftCard>
        </div>
        <LiftCard className="ms-10 me-4 px-5 py-4">
          <Tile label="Investigator tokens" value={<CountUp value={16526} />} foot="curated prewarm · hover to tilt" tone="sage" className="border-0 bg-transparent p-0 shadow-none" />
        </LiftCard>
      </div>
    </div>
  );
}

const MASCOT_STATES: { state: MascotState; title: string; use: string }[] = [
  { state: "idle", title: "Idle", use: "Logo, empty states, airlock before a run" },
  { state: "scanning", title: "Scanning", use: "Loading, airlock scan (lens sweep)" },
  { state: "alert", title: "Alert", use: "Injection neutralized" },
  { state: "approved", title: "Approved", use: "Typed facts passed the gate" },
];

function MascotStates() {
  return (
    <Section id="mascot" title="Mascot" note={<>Four states; small and purposeful. Reduced motion keeps only the marks.</>}>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
        {MASCOT_STATES.map((m, i) => (
          <LiftCard key={m.state} className={`flex items-center gap-4 px-5 py-4 ${i % 2 ? "mb-6" : ""}`}>
            <Mascot state={m.state} size={i === 3 ? 64 : 52} avatar />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text">{m.title}</span>
              <span className="text-xs text-muted">{m.use}</span>
            </div>
          </LiftCard>
        ))}
        <div className="flex items-center gap-3 rounded-panel border border-dashed border-hairline-strong px-4 py-3">
          <Mascot size={24} /><Mascot size={32} /><Mascot size={40} avatar />
          <span className="text-xs text-muted">24 / 32 / 40px</span>
        </div>
      </div>
    </Section>
  );
}

function Colour() {
  return (
    <Section id="tokens" title="Colour" note="Live WCAG 2.x ratios against bg / surface / raised. Green ≥ 4.5 (AA text); amber ≥ 3 (UI only).">
      <div className="grid grid-cols-12 items-start gap-6">
        <div className="relative col-span-5 h-[300px]">
          {SURFACES.map((s, i) => (
            <div key={s.name}
              className="sheet absolute flex w-[62%] flex-col justify-end rounded-panel border border-hairline-strong p-3"
              style={{ background: s.hex, left: `${i * 7}%`, top: i * 40, height: 140, zIndex: i }}>
              <span className="text-xs text-text">{s.name}</span>
              <span className="num text-2xs text-muted">{s.hex}</span>
            </div>
          ))}
        </div>
        <Panel padded={false} className="col-span-7 mt-4">
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_56px_56px_56px] items-center gap-2 border-b border-hairline px-4 py-2 text-2xs uppercase tracking-[0.1em] text-muted">
            <span>Ink</span><span>Use</span><span className="text-end">bg</span><span className="text-end">surf.</span><span className="text-end">raised</span>
          </div>
          {INKS.map((c) => (
            <div key={c.name} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_56px_56px_56px] items-center gap-2 border-b border-hairline/50 px-4 py-2 last:border-b-0">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-hairline-strong" style={{ background: c.hex }} />
                <span className="text-sm" style={{ color: c.hex }}>{c.name}</span>
                <span className="num truncate text-2xs text-muted">{c.hex}</span>
              </span>
              <span className="truncate text-xs text-muted">{c.use}</span>
              <span className="text-end"><Ratio fg={c.hex} bg={SURFACES[0].hex} /></span>
              <span className="text-end"><Ratio fg={c.hex} bg={SURFACES[1].hex} /></span>
              <span className="text-end"><Ratio fg={c.hex} bg={SURFACES[2].hex} /></span>
            </div>
          ))}
        </Panel>
      </div>
    </Section>
  );
}

function TypeAndShape() {
  const sizes = [["2xs", "11/16", "text-2xs"], ["xs", "12/16", "text-xs"], ["sm", "13/20", "text-sm"], ["base", "14/20", "text-base"], ["md", "16/24", "text-md"], ["lg", "20/28", "text-lg"], ["xl", "28/36", "text-xl"]] as const;
  return (
    <Section id="type" title="Type and shape" note="Geist (UI), JetBrains Mono with tabular numerals (data), IBM Plex Sans Arabic. Panels 6px, controls 3px.">
      <div className="grid grid-cols-12 items-start gap-5">
        <Panel title="Scale · Geist" className="col-span-5">
          <div className="flex flex-col gap-1.5">
            {sizes.map(([name, metric, cls]) => (
              <div key={name} className="flex items-baseline gap-3">
                <span className="num w-16 shrink-0 text-2xs text-muted">{name} {metric}</span>
                <span className={`${cls} truncate text-text`}>Payment held pending approval</span>
              </div>
            ))}
          </div>
        </Panel>
        <div className="col-span-4 mt-10 flex flex-col gap-4">
          <Panel title="Data · JetBrains Mono" tint="raised">
            <div className="num flex flex-col gap-1 text-sm text-text">
              <span>TXN-00412 · ALT-0093 · AUD-000418</span>
              <span>1,048,500.00 AED · 0O 1lI</span>
              <span className="text-muted">9f2c4e1a…b07d · 2026-11-18 10:12:04</span>
            </div>
          </Panel>
          <Panel title="Arabic · IBM Plex Sans Arabic" className="-ms-8">
            <p dir="rtl" lang="ar" className="ar text-text">
              تم إيقاف التحويل بانتظار موافقة مسؤول الامتثال. المبلغ <span className="num" dir="ltr">48,500.00 AED</span>
            </p>
          </Panel>
        </div>
        <Panel title="Shape and depth" className="col-span-3 -mt-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <div className="flex flex-col items-center gap-1"><div className="h-10 w-14 rounded-control border border-hairline-strong bg-raised" /><span className="num text-2xs text-muted">3px</span></div>
              <div className="flex flex-col items-center gap-1"><div className="sheet h-14 w-20 rounded-panel border border-hairline-strong bg-raised" /><span className="num text-2xs text-muted">6px</span></div>
            </div>
            <div className="relative isolate mx-2 mb-4 h-16">
              <div className="sheet relative h-full rounded-panel border border-hairline-strong bg-raised" />
              <span className="absolute inset-x-3 -bottom-[7px] top-3 -z-10 rounded-panel border border-hairline bg-surface" />
              <span className="absolute inset-x-6 -bottom-[14px] top-6 -z-20 rounded-panel border border-hairline/70 bg-bg" />
            </div>
            <span className="text-xs text-muted">Tint, a top-edge highlight, stacked sheets. No drop shadows.</span>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

function Controls() {
  const [tab, setTab] = useState<"quarantine" | "evidence" | "report">("quarantine");
  const [filter, setFilter] = useState<"all" | "alerted" | "not">("all");
  const [notify, setNotify] = useState(true);
  const [strict, setStrict] = useState(false);
  return (
    <Section id="controls" title="Controls" note="Press scale, brass focus ring (Tab through), success tick, sliding indicators.">
      <div className="grid grid-cols-12 items-start gap-5">
        <Panel title="Buttons" className="col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="solid" icon={<IconPlay size={14} />}>Run pipeline</Button>
            <Button variant="accent" icon={<IconGate size={14} />}>Approve and commit</Button>
            <Button variant="outline">Request more info</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Hold and block</Button>
            <Button variant="solid" disabled>Disabled</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SuccessButton onAction={() => new Promise((r) => setTimeout(r, 500))} icon={<IconFile size={14} />} doneLabel="Filed">File report</SuccessButton>
            <SuccessButton variant="ghost" size="sm" onAction={() => Promise.reject(new Error("fixture failure"))}>Try a failing action</SuccessButton>
            <IconButton label="Search"><IconSearch /></IconButton>
            <Tooltip label="Tooltips appear after 400 ms"><Button size="sm" variant="ghost">Hover me</Button></Tooltip>
          </div>
        </Panel>
        <Panel title="Tabs and toggles" tint="raised" className="col-span-5 mt-8">
          <div className="flex flex-col gap-3">
            <SegmentedTabs label="Case view" value={tab} onChange={setTab}
              options={[{ value: "quarantine", label: "Quarantine", count: 4 }, { value: "evidence", label: "Evidence", count: 5 }, { value: "report", label: "Report" }]} />
            <SegmentedTabs size="sm" label="Filter" value={filter} onChange={setFilter}
              options={[{ value: "all", label: "All" }, { value: "alerted", label: "Alerted" }, { value: "not", label: "Not alerted" }]} />
            <label className="flex items-center gap-3 text-sm text-text"><Toggle checked={notify} onChange={setNotify} label="Notify on hold" /> Notify on hold</label>
            <label className="flex items-center gap-3 text-sm text-text"><Toggle checked={strict} onChange={setStrict} label="Strict replay" /> Strict replay</label>
          </div>
        </Panel>
        <Panel title="Tags and routes" className="col-span-4 -mt-2">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2"><RouteTag route="AUTO_CLEAR" /><RouteTag route="NEEDS_REVIEW" /><RouteTag route="PENDING_APPROVAL" /></div>
            <RouteTag route="PENDING_APPROVAL" size="lg" />
            <div className="flex flex-wrap items-center gap-3">{["DONE", "FLAGGED", "DEGRADED", "WAITING", "REFUSED"].map((s) => <StatusTag key={s} status={s} />)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone="sage">outline</Tag><Tag tone="amber" variant="tint">tint</Tag><Tag tone="red" variant="solid">solid</Tag><Tag tone="human" variant="dashed">dashed</Tag><Tag tone="model" mono>prompt v3</Tag>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted"><Kbd>Ctrl</Kbd><Kbd>K</Kbd> command palette</div>
          </div>
        </Panel>
        <Panel title="Form" className="col-span-8 mt-6">
          <div className="grid grid-cols-3 gap-4">
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

function CardsAndFeedback() {
  const [role, setRole] = useState<Role>("ANALYST");
  const [reason, setReason] = useState("");
  const [tampered, setTampered] = useState(false);
  const unlocked = role === "COMPLIANCE_OFFICER" && reason.trim().length >= 12;
  return (
    <Section id="cards" title="Cards and feedback" note={<>Shared-layout expand, approval gate pulse, hash-chain sweep. <FixtureLabel /></>}>
      <div className="grid grid-cols-12 items-start gap-6">
        <div className="col-span-7 flex flex-col gap-3">
          <span className="text-xs text-muted">Click a card to expand it in place (layoutId); Esc or × collapses.</span>
          <ExpandableCards className="h-[220px]" items={[
            { id: "a", title: "Code route", summary: "Needs review", tone: "amber", detail: "R-NP-02 new-payee rule over 10,000 AED. The threshold lives in policy code, not the prompt." },
            { id: "b", title: "Model view", summary: "Recommends BLOCK", tone: "model", detail: "Three findings, every one citing evidence IDs. It may make the route stricter, never looser." },
            { id: "c", title: "Final route", summary: "Pending approval", tone: "red", detail: "Strictest route wins: PENDING_APPROVAL > NEEDS_REVIEW > AUTO_CLEAR. A compliance officer must decide." },
          ]} />
          <Panel title="Hash-chain verify" className="ms-8 mt-2" actions={
            <label className="flex items-center gap-2 text-2xs text-muted"><Toggle checked={tampered} onChange={setTampered} label="Tamper one link (fixture)" /> tamper a link</label>
          }>
            <ChainSweep links={CHAIN_FIXTURE} onVerify={() => verifyChainFixture(tampered)} />
          </Panel>
        </div>
        <GateLock className="col-span-5 mt-10" unlocked={unlocked} title="Approval gate"
          detail={unlocked ? "Unlocked: officer with a recorded reason" : "Needs a compliance officer and a reason (12+ characters)"}>
          <SegmentedTabs<Role> size="sm" label="Role" value={role} onChange={setRole}
            options={[{ value: "ANALYST", label: "Analyst" }, { value: "COMPLIANCE_OFFICER", label: "Compliance officer" }]} />
          <Field label="Reason" htmlFor="sg-reason" hint="Fixture logic for the styleguide; the backend enforces the real gate.">
            <TextArea id="sg-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this payment safe to release, or why block it?" />
          </Field>
          <Button variant={unlocked ? "accent" : "outline"} disabled={!unlocked} icon={<IconGate size={14} />}>Approve</Button>
        </GateLock>
      </div>
    </Section>
  );
}

function States() {
  return (
    <Section id="states" title="States" note="Loading and empty use the guard; errors name the cause; refusals quote the gate.">
      <div className="grid grid-cols-12 items-start gap-5">
        <LoadingState className="col-span-5" label="Loading case ALT-F0001" />
        <EmptyState className="col-span-7 mt-6" title="No alerts in this view" body="Every transaction in this filter was cleared by rules or has not been run." action={<Button size="sm" variant="outline">Show all</Button>} />
        <ErrorState className="col-span-6 -mt-2" error={new ApiError(0, "fetch failed: connect ECONNREFUSED 127.0.0.1:8000")} onRetry={() => undefined} />
        <RefusedState className="col-span-6 mt-4" status={409} detail="Filing requires an APPROVE decision by a COMPLIANCE_OFFICER." auditId={<span className="num">AUD-F0042</span>} />
        <div className="col-span-8 col-start-3 flex flex-col gap-2">
          <Callout kind="note" title="Policy">Thresholds are code; the model may only make a route stricter.</Callout>
          <Callout kind="warn">Classifier degraded; routed to review (fail closed).</Callout>
          <Callout kind="refused" title="Filing refused">No compliance-officer approval on record.</Callout>
        </div>
        <Panel title="Inline skeleton" className="col-span-3 -mt-6"><Skeleton lines={4} /></Panel>
      </div>
    </Section>
  );
}

function RecordsAndTable() {
  const [open, setOpen] = useState<TransactionSummary | null>(null);
  const columns: Column<TransactionSummary>[] = useMemo(() => [
    { key: "txn", header: "Transaction", width: "120px", mono: true, render: (r) => r.txn_id },
    { key: "alert", header: "Alert", width: "104px", mono: true, render: (r) => r.alert_id ?? <span className="text-muted">-</span> },
    { key: "payee", header: "Payee", width: "minmax(0,1fr)", render: (r) => r.payee_name ?? <span className="text-muted">-</span> },
    { key: "amount", header: "Amount", width: "140px", align: "end", render: (r) => <Amount value={r.amount} /> },
    { key: "ts", header: "Time (GST)", width: "152px", render: (r) => <Timestamp iso={r.ts} /> },
    { key: "route", header: "Route", width: "132px", render: (r) => (r.alerted ? <RouteTag route={r.last_route} /> : <Tag tone="muted">Not alerted</Tag>) },
  ], []);
  return (
    <Section id="records" title="Records and tables" note={<>Hover a chip to preview, click for the drawer. 1,000 windowed rows; arrows and Enter. <FixtureLabel /></>}>
      <div className="grid grid-cols-12 items-start gap-5">
        <Panel tint="raised" className="col-span-5 z-[1] mt-6" glow="brass">
          <p className="text-sm leading-7 text-text">
            The payee on <RecordChip id="TXN-F0001" /> is a possible match to <RecordChip id="WL-F0003" />. The customer{" "}
            <RecordChip id="CUS-F0001" /> paid from an unverified device <RecordChip id="DEV-F0001" />, with <RecordChips ids={["VEL-F0001"]} />{" "}
            showing three new payees in 24 hours. A missing record shows its error: <RecordChip id="TXN-F9999" />.
          </p>
        </Panel>
        <div className="col-span-8 col-start-5 -ms-4">
          <DataTable label="Fixture transactions" rows={TRANSACTIONS_FIXTURE} columns={columns} rowKey={(r) => r.txn_id}
            rowTone={(r) => (r.last_route ? ROUTE_TONE[r.last_route] : null)} onRowActivate={setOpen} height={340} />
        </div>
      </div>
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={<span className="num">{open?.txn_id}</span>}>
        {open && (
          <PropertiesTable rows={[
            { key: "alert_id", value: open.alert_id ?? "-", mono: true },
            { key: "amount", value: <Amount value={open.amount} /> },
            { key: "payee", value: open.payee_name ?? "-" },
            { key: "route", value: <RouteTag route={open.last_route} /> },
            { key: "head", value: <Hash value={HEAD} /> },
          ]} />
        )}
      </Drawer>
    </Section>
  );
}

function Investigation() {
  const [key, setKey] = useState(0);
  const [which, setWhich] = useState<keyof typeof AIRLOCK_FIXTURES>("en");
  const f = AIRLOCK_FIXTURES[which];
  return (
    <Section id="airlock" title="Investigation" note={<>Scrub the timeline (drag the rail, or focus it and use ↑ ↓). Drag the memo into the gate. <FixtureLabel /></>}>
      <div className="grid grid-cols-12 items-start gap-6">
        <Panel title="Pipeline timeline" className="col-span-5" actions={
          <Button size="sm" variant="ghost" icon={<IconReplay size={12} />} onClick={() => setKey((k) => k + 1)}>Replay reveal</Button>
        }>
          <PipelineTimeline steps={TIMELINE_FIXTURE} revealKey={key} renderRecords={(ids) => <RecordChips ids={ids} />} />
        </Panel>
        <div className="col-span-7 mt-12 flex flex-col gap-3">
          <SegmentedTabs label="Airlock fixture" value={which} onChange={setWhich}
            options={(Object.keys(AIRLOCK_FIXTURES) as (keyof typeof AIRLOCK_FIXTURES)[]).map((k) => ({ value: k, label: AIRLOCK_FIXTURES[k].label }))} />
          <div className="relative isolate mb-4">
            <span aria-hidden className="absolute inset-x-4 -bottom-2 top-4 -z-10 rounded-panel border border-hairline bg-surface/80" />
            <span aria-hidden className="absolute inset-x-8 -bottom-4 top-8 -z-20 rounded-panel border border-hairline/70 bg-bg" />
            <Airlock key={which} memo={f.memo} spans={f.spans} facts={f.facts} rawReceived={0} />
          </div>
        </div>
      </div>
    </Section>
  );
}

function ShellDemo() {
  const { lang } = usePrefs();
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

  const nav = (id: string, label: string, icon: ReactNode, meta?: ReactNode): NavItem => ({ id, label, icon, meta, onSelect: () => setActive(id) });
  const tree: NavItem[] = [
    nav("queue", t("queue", lang), <IconQueue size={16} />, int(143)),
    nav("transactions", t("transactions", lang), <IconTransactions size={16} />, int(1000)),
    {
      id: "cases",
      label: t("cases", lang),
      icon: <IconCases size={16} />,
      children: [
        { ...nav("ALT-F0001", "Falcon Ridge Trading", null, "F"), hint: "ALT-F0001", status: "red" },
        { ...nav("ALT-F0008", "Oasis Grid Utilities", null, "G"), hint: "ALT-F0008", status: "amber" },
      ],
    },
    nav("audit", t("audit", lang), <IconAudit size={16} />),
    nav("eval", t("eval", lang), <IconEval size={16} />),
    nav("ingest", t("ingest", lang), <IconIngest size={16} />),
  ];
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
    const id = q.toUpperCase();
    return m[1] === "TXN"
      ? [{ id: `run-${id}`, group: "From your input", label: `Run pipeline on ${id}`, run: () => setLast(`Run ${id}`) }]
      : [{ id: `open-${id}`, group: "From your input", label: `Open case ${id}`, run: () => setLast(`Open ${id}`) }];
  };

  return (
    <Section id="shell" title="App shell" note={<>One collapsible sidebar with the role switch, animated case tabs, draggable and resizable panes. Language, demo speed and live status sit in the site header. <FixtureLabel /></>}>
      <div className="sheet h-[620px] overflow-hidden rounded-panel border border-hairline-strong bg-bg/80">
        <AppShell
          className="h-full"
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
          role={role}
          onRoleChange={setRole}
        >
          <Workspace
            initial={{ summary: 0.28, evidence: 0.42, decision: 0.3 }}
            panes={[
              { id: "summary", title: "Summary", minWidth: 180, content: (
                <div className="flex flex-col gap-3">
                  <Tile label="Active pane" value={<span className="text-md">{tab}</span>} foot={`sidebar: ${active}`} tint="raised" />
                  <Tile label="Last command" value={<span className="text-sm">{last}</span>} foot={<span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd> or type TXN-F0042</span>} tone="sage" tint="raised" />
                </div>
              ) },
              { id: "evidence", title: "Evidence", minWidth: 240, content: (
                <div className="flex flex-col gap-3">
                  <PropertiesTable rows={[
                    { key: "customer", value: <RecordChip id="CUS-F0001" /> },
                    { key: "device", value: <RecordChip id="DEV-F0001" /> },
                    { key: "watchlist", value: <RecordChip id="WL-F0003" /> },
                    { key: "velocity", value: <RecordChip id="VEL-F0001" /> },
                  ]} />
                  <span className="text-xs text-muted">Drag a pane by its grip to reorder; drag the dividers to resize.</span>
                </div>
              ) },
              { id: "decision", title: "Decision", minWidth: 200, content: (
                <div className="flex flex-col gap-3">
                  <RouteTag route="PENDING_APPROVAL" size="lg" />
                  <span className="text-xs text-muted">Role: {role === "COMPLIANCE_OFFICER" ? "Compliance officer" : "Analyst"}</span>
                  <EmptyState mascot={false} title="Screens arrive in step 3" body="Real pages mount here: queue, case, transactions, audit, eval." />
                </div>
              ) },
            ]}
          />
        </AppShell>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} dynamic={dynamic} />
    </Section>
  );
}
