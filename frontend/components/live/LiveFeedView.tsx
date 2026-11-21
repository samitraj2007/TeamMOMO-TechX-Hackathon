"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button, CountUp, DataTable, EmptyState, ErrorState, Field, Input, LoadingState, PageHeader, Panel, RefusedState, RouteTag,
  SegmentedTabs, Tag, Tile, type Column,
} from "@/components/primitives";
import { ApiError, api } from "@/lib/api";
import { FaultDrill } from "./FaultDrill";
import { cx } from "@/lib/cx";
import { money, timestamp } from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import { keys, useFeedStatus } from "@/lib/queries";
import type { FeedEvent, FeedLane, FeedStatus } from "@/lib/types";

const VOLUMES = [50, 100, 200, 500];
const DURATIONS = [{ value: "120", label: "2 min" }, { value: "240", label: "4 min" }, { value: "360", label: "6 min" }];
const AI_RATES = [{ value: "0", label: "Off" }, { value: "2", label: "2/min" }, { value: "4", label: "4/min" }, { value: "6", label: "6/min" }];
const TOKEN_KEY = "momo.adminToken";

const LANE_LABEL: Record<FeedLane, string> = { gate: "Officer gate", review: "Review", ai: "AI lane" };
const LANE_TONE = { gate: "red", review: "amber", ai: "model" } as const;

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveToken(value: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, value);
  } catch {}
}

export function LiveFeedView() {
  const status = useFeedStatus();
  const hydrated = useHydrated();
  const st = hydrated ? status.data : undefined;
  const qc = useQueryClient();
  const router = useRouter();
  const [total, setTotal] = useState(200);
  const [duration, setDuration] = useState("240");
  const [aiRate, setAiRate] = useState("4");
  // Read once on the client; the field shows it only after hydration, so server and client render the same.
  const [token, setToken] = useState(() => (typeof window === "undefined" ? "" : readToken()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const max = st?.max_total ?? 500;
  const active = st?.state === "running" || st?.state === "draining";

  async function control(action: "start" | "stop") {
    setBusy(true);
    setError(null);
    saveToken(token);
    try {
      const next = action === "start"
        ? await api.feedStart(token, { total: Math.min(total, max), duration_s: Number(duration), ai_per_min: Number(aiRate) })
        : await api.feedStop(token);
      qc.setQueryData(keys.feed, next);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<FeedEvent>[] = [
    { key: "ts", header: "Received", width: "150px", mono: true, render: (r) => timestamp(r.ts) },
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

  return (
    <div className="route-in flex flex-col gap-5 px-2 pb-8 pt-1">
      <PageHeader
        title="Live feed"
        description="A simulated bank system streams flagged payments into MOMO. Code screens every alert the moment it lands and sends escalations straight to a person. Cases code would clear wait for the full AI pipeline, at the rate a free-tier model allows; nothing is cleared without it."
      />

      <Panel title="Simulated bank feed" tint="surface">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
          <Field label="Alerts" htmlFor="feed-total" hint={`Up to ${max.toLocaleString("en-US")} per run`}>
            <div className="flex items-center gap-2">
              <Input id="feed-total" type="number" mono min={1} max={max} value={total} disabled={active} className="w-24"
                onChange={(e) => setTotal(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
              <SegmentedTabs label="Quick volume" size="sm" value={String(total)}
                onChange={(v) => !active && setTotal(Number(v))}
                options={VOLUMES.filter((v) => v <= max).map((v) => ({ value: String(v), label: String(v), disabled: active }))} />
            </div>
          </Field>
          <Field label="Over" htmlFor="feed-duration">
            <SegmentedTabs label="Duration" size="sm" value={duration} onChange={(v) => !active && setDuration(v)}
              options={DURATIONS.map((d) => ({ ...d, disabled: active }))} />
          </Field>
          <Field label="AI lane" htmlFor="feed-ai" hint="Full pipeline runs per minute">
            <SegmentedTabs label="AI lane rate" size="sm" value={aiRate} onChange={(v) => !active && setAiRate(v)}
              options={AI_RATES.map((d) => ({ ...d, disabled: active }))} />
          </Field>
          <Field label="Admin token" htmlFor="feed-token" hint="Kept in this tab only">
            <Input id="feed-token" type="password" autoComplete="off" value={hydrated ? token : ""} onChange={(e) => setToken(e.target.value)} className="w-44" />
          </Field>
          <div className="ms-auto flex gap-2">
            {active ? (
              <Button variant="danger" disabled={busy || !(hydrated && token)} onClick={() => void control("stop")}>Stop feed</Button>
            ) : (
              <Button variant="solid" disabled={busy || !(hydrated && token)} onClick={() => void control("start")}>Start feed</Button>
            )}
          </div>
        </div>
        {error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 409 || error.status === 422)
          ? <RefusedState className="mt-4" status={error.status} detail={error.message} />
          : error ? <ErrorState className="mt-4" error={error} /> : null}
      </Panel>

      <FaultDrill token={token} hydrated={hydrated} />

      {!hydrated || status.isLoading ? <LoadingState label="Connecting to the feed" lines={3} />
        : status.isError && status.error instanceof ApiError && status.error.status === 404
          ? <EmptyState title="This backend has no live feed" body="The running backend is older than this frontend. Restart it from the current branch and the feed controls connect here." />
        : status.isError ? <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        : st && <FeedBoard st={st} columns={columns} onOpen={(id) => router.push(`/case/${id}`)} />}
    </div>
  );
}

function FeedBoard({ st, columns, onOpen }: { st: FeedStatus; columns: Column<FeedEvent>[]; onOpen: (id: string) => void }) {
  const total = st.config?.total ?? 0;
  const aiDone = st.ai_done.AUTO_CLEAR + st.ai_done.NEEDS_REVIEW + st.ai_done.PENDING_APPROVAL;
  const pct = total ? Math.round((st.received / total) * 100) : 0;
  const stateTone = { idle: "muted", running: "sage", draining: "model", finished: "neutral", stopped: "amber" } as const;
  const stateText = {
    idle: "Idle", running: "Streaming", draining: "Feed done · AI lane draining", finished: "Finished", stopped: "Stopped",
  } as const;

  const segments = [
    { key: "gate", label: "Officer gate (code)", value: st.lanes.gate, cls: "bg-red" },
    { key: "review", label: "Review (code)", value: st.lanes.review, cls: "bg-amber" },
    { key: "clear", label: "Auto-cleared (full pipeline)", value: st.ai_done.AUTO_CLEAR, cls: "bg-sage" },
    { key: "human", label: "Sent to a person (full pipeline)", value: st.ai_done.NEEDS_REVIEW + st.ai_done.PENDING_APPROVAL, cls: "bg-model" },
    { key: "queued", label: "Queued, not cleared", value: st.ai_queue + st.ai_failed, cls: "bg-hairline-strong" },
  ];
  const sum = Math.max(1, segments.reduce((a, s) => a + s.value, 0));

  return (
    <>
      <div className="flex flex-col gap-2" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <Tag tone={stateTone[st.state]} variant="tint">{stateText[st.state]}</Tag>
          <span className="num">{st.received.toLocaleString("en-US")} of {total.toLocaleString("en-US")} received · {pct}%</span>
          <span className="num">{st.rate_per_s.toFixed(2)} alerts/s · {Math.round(st.elapsed_s)} s</span>
          <span className="ms-auto">
            Simulator: {st.source === "llm" ? "its own model" : "built-in templates"}
            {st.sim_llm_enabled ? ` · ${st.sim_calls}/${st.sim_max_calls} model calls` : " · no simulator key set"}
            {st.sim_failures > 0 && ` · ${st.sim_failures} failed`}
            {st.dropped > 0 && ` · ${st.dropped} invalid dropped`}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-hairline" role="progressbar" aria-label="Alerts received"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={st.received}>
          <div className="h-full rounded-full bg-text/70 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile label="Received" tone="neutral" value={<CountUp value={st.received} />} foot="Every one screened by code" />
        <Tile label="Officer gate" tone="red" value={<CountUp value={st.lanes.gate} />} foot="Over threshold or watchlist hit" />
        <Tile label="Review" tone="amber" value={<CountUp value={st.lanes.review} />} foot="Injection, device, velocity, currency" />
        <Tile label="AI lane queued" tone="muted" value={<CountUp value={st.ai_queue} />} foot={`${aiDone} run through the full pipeline`} />
        <Tile label="Auto-cleared" tone="sage" value={<CountUp value={st.ai_done.AUTO_CLEAR} />} foot="Only after the full pipeline" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-hairline" aria-hidden>
          {segments.map((s) => s.value > 0 && (
            <div key={s.key} className={cx("h-full transition-[width] duration-500 ease-out", s.cls)} style={{ width: `${(s.value / sum) * 100}%` }} />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className={cx("h-2 w-2 rounded-full", s.cls)} />
              {s.label} <span className="num text-text">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <DataTable
        label="Live alerts"
        rows={st.events}
        columns={columns}
        rowKey={(r) => r.alert_id}
        rowTone={(r) => r.lane === "gate" ? "red" : r.lane === "review" ? "amber" : r.route === "AUTO_CLEAR" ? "sage" : "muted"}
        onRowActivate={(r) => onOpen(r.alert_id)}
        height={440}
        empty={<p className="text-sm text-muted">No alerts yet. Start the feed; the newest arrive at the top.</p>}
      />
    </>
  );
}
