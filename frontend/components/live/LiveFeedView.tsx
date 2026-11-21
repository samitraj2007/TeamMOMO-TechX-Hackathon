"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState } from "react";
import {
  Button, Callout, CountUp, DataTable, EmptyState, ErrorState, Field, Input, LoadingState, Panel, RouteTag, SegmentedPicks, Tag,
  type Column,
} from "@/components/primitives";
import { AdminTokenField } from "@/components/shell/AdminTokenField";
import { useAdminToken } from "@/lib/adminToken";
import { ApiError, api, describeControlError } from "@/lib/api";
import { cx } from "@/lib/cx";
import { money, timestamp } from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import { SPRING, useMotionOK } from "@/lib/motion";
import { keys, useFeedStatus } from "@/lib/queries";
import type { FeedEvent, FeedKind, FeedLane, FeedRunSummary, FeedStatus } from "@/lib/types";
import { KIND_BG, MixBar } from "./MixBar";
import { SortingFloor } from "./SortingFloor";

const VOLUMES = [10, 25, 50, 100, 200];
const DURATIONS = [15, 30, 60, 120, 240];
const AI_RATES = [0, 2, 4, 6];
const KINDS: { kind: FeedKind; label: string; hint: string }[] = [
  { kind: "benign", label: "Benign", hint: "Rent, suppliers, salaries" },
  { kind: "high_value", label: "High value", hint: "Over 10,000 AED" },
  { kind: "hostile_memo", label: "Hostile memo", hint: "Prompt injection aimed at the AI" },
  { kind: "odd_device", label: "Odd device", hint: "Unverified device, new payee" },
  { kind: "foreign_currency", label: "Foreign currency", hint: "USD, EUR, GBP" },
];
type Mix = Record<FeedKind, number>;
const PRESETS: { id: string; label: string; mix: Mix }[] = [
  { id: "normal", label: "Normal day", mix: { benign: 70, high_value: 10, hostile_memo: 10, odd_device: 5, foreign_currency: 5 } },
  { id: "attack", label: "Attack wave", mix: { benign: 40, high_value: 5, hostile_memo: 45, odd_device: 5, foreign_currency: 5 } },
  { id: "highvalue", label: "High-value burst", mix: { benign: 40, high_value: 45, hostile_memo: 5, odd_device: 5, foreign_currency: 5 } },
  { id: "clean", label: "Clean traffic", mix: { benign: 100, high_value: 0, hostile_memo: 0, odd_device: 0, foreign_currency: 0 } },
];
const mixParts = (m: Mix) => KINDS.map((k) => ({ key: k.kind, label: k.label, value: m[k.kind], cls: KIND_BG[k.kind] }));

const LANE_LABEL: Record<FeedLane, string> = { gate: "Officer gate", review: "Review", ai: "AI lane" };
const LANE_TONE = { gate: "red", review: "amber", ai: "model" } as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
const fmtDuration = (s: number) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`);

export function LiveFeedView() {
  const status = useFeedStatus();
  const hydrated = useHydrated();
  const st = hydrated ? status.data : undefined;
  const token = useAdminToken();
  const qc = useQueryClient();
  const router = useRouter();
  const motionOK = useMotionOK();
  const [total, setTotal] = useState(25);
  const [duration, setDuration] = useState(30);
  const [aiRate, setAiRate] = useState(2);
  const [preset, setPreset] = useState("normal");
  const [mix, setMix] = useState<Mix>(PRESETS[0].mix);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Rows that arrived since the previous poll get a one-time highlight (derived during render, no effect).
  const [seen, setSeen] = useState<{ events: FeedEvent[] | undefined; fresh: Set<string> }>({ events: undefined, fresh: new Set() });
  if (st && st.events !== seen.events) {
    const before = new Set(seen.events?.map((e) => e.alert_id));
    setSeen({ events: st.events, fresh: seen.events ? new Set(st.events.filter((e) => !before.has(e.alert_id)).map((e) => e.alert_id)) : new Set() });
  }

  const max = st?.max_total ?? 500;
  const active = st?.state === "running" || st?.state === "draining";
  const mixSum = KINDS.reduce((a, k) => a + mix[k.kind], 0);
  const perSecond = total / duration;
  const aiShare = mixSum ? mix.benign / mixSum : 0;
  const aiExpected = Math.round(total * aiShare);
  const drainMin = aiRate ? aiExpected / aiRate : 0;

  async function control(action: "start" | "stop") {
    setBusy(true);
    setError(null);
    try {
      const next = action === "start"
        ? await api.feedStart(token, { total: clamp(total, 1, max), duration_s: clamp(duration, 10, 600), ai_per_min: clamp(aiRate, 0, 30), mix })
        : await api.feedStop(token);
      qc.setQueryData(keys.feed, next);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<FeedEvent>[] = [
    { key: "ts", header: "Received", width: "96px", mono: true, render: (r) => clock(r.ts) },
    { key: "alert", header: "Alert", width: "110px", mono: true, render: (r) => r.alert_id },
    { key: "amount", header: "Amount", width: "140px", align: "end", mono: true, render: (r) => money(r.amount, r.currency) },
    { key: "lane", header: "Lane", width: "120px", render: (r) => <Tag tone={LANE_TONE[r.lane]} variant="tint">{LANE_LABEL[r.lane]}</Tag> },
    {
      key: "route", header: "Route", width: "170px",
      render: (r) => r.ai_status === "queued" ? <Tag tone="muted" variant="dashed">Queued, not cleared</Tag>
        : r.ai_status === "failed" ? <Tag tone="red" variant="dashed">Pipeline error, not cleared</Tag>
        : <RouteTag route={r.route} />,
    },
    { key: "reasons", header: "Why (code)", width: "minmax(180px, 1fr)", render: (r) => <span className="num truncate text-xs text-muted" title={r.reasons.join(", ")}>{r.reasons.join(" · ") || "-"}</span> },
  ];

  const refused = error ? describeControlError(error) : null;
  const statusErr = status.isError ? describeControlError(status.error) : null;

  return (
    <div className="route-in flex flex-col gap-5 px-2 pb-8 pt-1">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.03em] text-text">Live feed</h1>
        <p className="max-w-2xl text-sm text-muted">
          A simulated bank streams flagged payments into MOMO. Code screens every alert the moment it lands and sends
          escalations straight to a person. Cases code would clear wait for the full AI pipeline; nothing is cleared without it.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <form
          onSubmit={(e) => { e.preventDefault(); void control(active ? "stop" : "start"); }}
          className="flex flex-col gap-5 rounded-sheet border border-hairline bg-surface p-5 shadow-card"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Feed setup</h2>
            {active && <span className="text-2xs text-muted">Locked while the feed runs</span>}
          </div>

          <Field label="Alerts" htmlFor="feed-total" hint={`1 to ${max.toLocaleString("en-US")}`}>
            <div className="flex flex-col gap-2">
              <Input id="feed-total" type="number" mono min={1} max={max} value={total} disabled={active}
                onChange={(e) => setTotal(clamp(Number(e.target.value), 1, max))} />
              <SegmentedPicks label="Alert count" values={VOLUMES.filter((v) => v <= max)} value={total} onPick={setTotal} disabled={active} />
            </div>
          </Field>
          <Field label="Over (seconds)" htmlFor="feed-duration" hint="10 s to 10 min">
            <div className="flex flex-col gap-2">
              <Input id="feed-duration" type="number" mono min={10} max={600} value={duration} disabled={active}
                onChange={(e) => setDuration(clamp(Number(e.target.value), 10, 600))} />
              <SegmentedPicks label="Duration" values={DURATIONS} value={duration} onPick={setDuration} format={fmtDuration} disabled={active} />
            </div>
          </Field>
          <Field label="AI lane (full pipeline runs per minute)" htmlFor="feed-ai" hint="0 to 30 · free-tier keys manage about 4">
            <div className="flex flex-col gap-2">
              <Input id="feed-ai" type="number" mono min={0} max={30} value={aiRate} disabled={active}
                onChange={(e) => setAiRate(clamp(Number(e.target.value), 0, 30))} />
              <SegmentedPicks label="AI lane rate" values={AI_RATES} value={aiRate} onPick={setAiRate} format={(v) => (v ? `${v}/min` : "Off")} disabled={active} />
            </div>
          </Field>

          <fieldset className="flex flex-col gap-3" disabled={active}>
            <legend className="mb-1 flex w-full items-center justify-between text-xs font-medium text-muted">
              Traffic mix {preset === "custom" && <Tag tone="neutral" variant="dashed">Custom</Tag>}
            </legend>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => {
                const on = preset === p.id;
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => { setPreset(p.id); setMix(p.mix); }}
                    className={cx("press relative flex flex-col gap-1.5 rounded-control border px-2.5 py-2 text-start text-xs transition-colors duration-150 disabled:opacity-60",
                      on ? "border-text bg-raised text-text" : "border-hairline bg-surface text-muted hover:border-hairline-strong hover:text-text")}>
                    <span className="font-medium">{p.label}</span>
                    <MixBar parts={mixParts(p.mix)} className="h-1" />
                  </button>
                );
              })}
            </div>
            <MixBar parts={mixParts(mix)} className="h-2.5" />
            <ul className="flex flex-col gap-1.5">
              {KINDS.map((k) => (
                <li key={k.kind} className="grid grid-cols-[10px_1fr_64px_38px] items-center gap-2">
                  <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", KIND_BG[k.kind])} />
                  <label htmlFor={`mix-${k.kind}`} className="min-w-0 text-sm text-text">
                    {k.label} <span className="block truncate text-2xs text-muted">{k.hint}</span>
                  </label>
                  <Input id={`mix-${k.kind}`} type="number" mono min={0} max={100} value={mix[k.kind]} className="h-8"
                    onChange={(e) => { setPreset("custom"); setMix({ ...mix, [k.kind]: clamp(Number(e.target.value), 0, 100) }); }} />
                  <span className="num text-end text-xs text-muted">{mixSum ? Math.round((mix[k.kind] / mixSum) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
            {mixSum === 0 && <p className="text-xs text-red-text">Give at least one kind a weight above 0.</p>}
          </fieldset>

          <AdminTokenField />

          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-hairline bg-hairline text-center">
            <PlanStat label="per second" value={perSecond.toFixed(perSecond < 1 ? 2 : 1)} />
            <PlanStat label="reach AI lane" value={aiRate ? `≈ ${aiExpected}` : "off"} />
            <PlanStat label="AI drain after" value={!aiRate ? "-" : drainMin < 1 ? "< 1 min" : `${Math.ceil(drainMin)} min`} />
          </dl>
          <p className="-mt-3 text-2xs text-muted">
            {total} alerts over {fmtDuration(duration)}.{" "}
            {aiRate ? "Code screens each one instantly; only the AI lane waits for the model." : "AI lane off: code still screens every alert, but nothing is cleared."}
          </p>

          <div className="flex items-center gap-3">
            {active ? (
              <Button type="submit" variant="danger" disabled={busy || !token}>Stop feed</Button>
            ) : (
              <Button type="submit" variant="solid" disabled={busy || !token || mixSum === 0}>Start feed</Button>
            )}
            {active && (
              <span className="inline-flex items-center gap-2 text-xs text-sage">
                <span className="relative flex h-2 w-2">
                  {motionOK && <span aria-hidden className="ping absolute inset-0 rounded-full bg-sage" />}
                  <span className="relative h-2 w-2 rounded-full bg-sage" />
                </span>
                Live
              </span>
            )}
            {hydrated && !token && <span className="text-xs text-muted">Enter the admin token first</span>}
          </div>
          {refused && (
            error instanceof ApiError
              ? <Callout kind="warn" title={refused.title}>{refused.body}</Callout>
              : <ErrorState error={error} />
          )}
        </form>

        <div className="flex min-w-0 flex-col gap-4">
          {!hydrated || status.isLoading ? <LoadingState label="Connecting to the feed" lines={3} />
            : statusErr ? <Callout kind="warn" title={statusErr.title}>{statusErr.body}</Callout>
            : st && <FeedBoard st={st} />}
        </div>
      </div>

      {st && (
        <DataTable
          label="Live alerts"
          rows={st.events}
          columns={columns}
          rowKey={(r) => r.alert_id}
          rowTone={(r) => r.lane === "gate" ? "red" : r.lane === "review" ? "amber" : r.route === "AUTO_CLEAR" ? "sage" : "muted"}
          rowClassName={(r) => (seen.fresh.has(r.alert_id) ? "row-fresh" : undefined)}
          animateRows={motionOK}
          onRowActivate={(r) => router.push(`/case/${r.alert_id}`)}
          height={420}
          empty={<EmptyState mascot={false} title="No alerts yet" body="Set up the feed and start it. The newest alerts arrive at the top; click one to open its case." />}
        />
      )}
      {st?.history && st.history.length > 0 && <RecentRuns runs={st.history} />}
    </div>
  );
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface px-2 py-2">
      <dt className="order-2 text-2xs text-muted">{label}</dt>
      <dd className="num order-1 text-sm font-semibold text-text">{value}</dd>
    </div>
  );
}

/** Alerts per second between consecutive polls, last 40 samples. Derived during render from the status stream. */
function useThroughput(st: FeedStatus): number[] {
  const [s, setS] = useState<{ at: number; received: number; pts: number[] }>({ at: st.elapsed_s, received: st.received, pts: [] });
  if (st.elapsed_s !== s.at || st.received !== s.received) {
    const restarted = st.received < s.received || st.elapsed_s < s.at;
    const dt = st.elapsed_s - s.at;
    const rate = !restarted && dt > 0 ? (st.received - s.received) / dt : 0;
    setS({ at: st.elapsed_s, received: st.received, pts: restarted ? [] : [...s.pts, rate].slice(-40) });
  }
  return s.pts;
}

function Sparkline({ pts }: { pts: number[] }) {
  const w = 120;
  const h = 28;
  if (pts.length < 2) return <svg aria-hidden width={w} height={h} />;
  const top = Math.max(0.5, ...pts);
  const step = w / (pts.length - 1);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(h - 2 - (v / top) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--color-sage)" opacity={0.1} />
      <path d={line} fill="none" stroke="var(--color-sage)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={h - 2 - (pts[pts.length - 1] / top) * (h - 6)} r="2.5" fill="var(--color-sage)" />
    </svg>
  );
}

function FeedBoard({ st }: { st: FeedStatus }) {
  const total = st.config?.total ?? 0;
  const aiDone = st.ai_done.AUTO_CLEAR + st.ai_done.NEEDS_REVIEW + st.ai_done.PENDING_APPROVAL;
  const pct = total ? st.received / total : 0;
  const pts = useThroughput(st);
  const stateTone = { idle: "muted", running: "sage", draining: "model", finished: "neutral", stopped: "amber" } as const;
  const stateText = {
    idle: "Idle", running: "Streaming", draining: "Feed done · AI lane draining", finished: "Finished", stopped: "Stopped",
  } as const;

  return (
    <>
      <div className="flex flex-col gap-2" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <motion.span key={st.state} initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING.ui}>
            <Tag tone={stateTone[st.state]} variant="tint">{stateText[st.state]}</Tag>
          </motion.span>
          <span className="num">{st.received.toLocaleString("en-US")} of {total.toLocaleString("en-US")} received · {Math.round(pct * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-hairline" role="progressbar" aria-label="Alerts received"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={st.received}>
          <div className="h-full origin-left rounded-full bg-text/70 transition-transform duration-500 ease-out" style={{ transform: `scaleX(${pct})` }} />
        </div>
        <span className="truncate text-end text-2xs text-muted">
          Simulator: {st.source === "llm" ? "its own model" : "built-in templates"}
          {st.sim_llm_enabled ? ` · ${st.sim_calls}/${st.sim_max_calls} model calls` : " · no simulator key set"}
          {st.sim_failures > 0 && ` · ${st.sim_failures} failed`}
          {st.dropped > 0 && ` · ${st.dropped} invalid dropped`}
        </span>
      </div>

      <SortingFloor st={st} />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-hairline bg-hairline sm:grid-cols-4">
        <Stat label="Received" value={<CountUp value={st.received} />} foot="every one screened by code" />
        <Stat label="Throughput" value={<span className="num">{st.rate_per_s.toFixed(2)}<span className="text-xs font-normal text-muted"> /s</span></span>}
          foot={<Sparkline pts={pts} />} />
        <Stat label="Elapsed" value={<span className="num">{Math.round(st.elapsed_s)}<span className="text-xs font-normal text-muted"> s</span></span>}
          foot={st.config ? `set ${fmtDuration(st.config.duration_s)}` : "-"} />
        <Stat label="Full pipeline runs" value={<CountUp value={aiDone} />} foot={st.ai_failed ? `${st.ai_failed} errored, not cleared` : "AI lane, rate-limited"} />
      </div>
    </>
  );
}

function Stat({ label, value, foot }: { label: string; value: React.ReactNode; foot: React.ReactNode }) {
  return (
    <div className="flex min-h-[92px] flex-col gap-1 bg-surface px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-semibold leading-7 tracking-[-0.02em] text-text">{value}</span>
      <span className="mt-auto text-2xs text-muted">{foot}</span>
    </div>
  );
}

function RecentRuns({ runs }: { runs: FeedRunSummary[] }) {
  return (
    <Panel title="Recent runs" tint="surface">
      <ul className="flex flex-col divide-y divide-hairline">
        {runs.map((r) => {
          const ai = r.ai_done.AUTO_CLEAR + r.ai_done.NEEDS_REVIEW + r.ai_done.PENDING_APPROVAL;
          return (
            <li key={r.started_at} className="grid grid-cols-1 items-center gap-x-5 gap-y-1.5 py-2.5 text-xs text-muted md:grid-cols-[auto_160px_1fr]">
              <div className="flex items-center gap-2">
                <Tag tone={r.state === "finished" ? "neutral" : "amber"} variant="tint">{r.state === "finished" ? "Finished" : "Stopped"}</Tag>
                <span className="num text-text">{timestamp(r.started_at)}</span>
              </div>
              <div className="flex flex-col gap-1">
                <MixBar className="h-1.5" parts={[
                  { key: "gate", label: "Officer gate", value: r.lanes.gate, cls: "bg-red" },
                  { key: "review", label: "Review", value: r.lanes.review, cls: "bg-amber" },
                  { key: "ai", label: "AI lane", value: r.lanes.ai, cls: "bg-model" },
                ]} />
                <span className="num text-2xs">gate {r.lanes.gate} · review {r.lanes.review} · AI {r.lanes.ai}</span>
              </div>
              <span className="num">
                {r.received}/{r.config.total} in {Math.round(r.elapsed_s)} s (set {fmtDuration(r.config.duration_s)}) · pipeline runs {ai} ·
                auto-cleared {r.ai_done.AUTO_CLEAR} · left queued {r.ai_left_queued}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
