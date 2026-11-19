"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  Button, CountUp, DataTable, EmptyState, ErrorState, Input, LoadingState, RouteTag, SegmentedTabs, Select, Tag, Tile,
  type Column,
} from "@/components/primitives";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { ROUTE_TONE } from "@/lib/labels";
import { keys, useCases } from "@/lib/queries";
import type { CaseSummary, Route } from "@/lib/types";

type Lane = "all" | "unrun" | Route;
type Band = "all" | "under10" | "mid" | "over50";

interface RunProgress {
  done: number;
  total: number;
  current: string | null;
  error: unknown;
}

export function QueueView() {
  const cases = useCases(false);
  const router = useRouter();
  const qc = useQueryClient();
  const [lane, setLane] = useState<Lane>("all");
  const [rule, setRule] = useState("all");
  const [band, setBand] = useState<Band>("all");
  const [q, setQ] = useState("");
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const lock = useRef(false);

  const rows = useMemo(() => cases.data ?? [], [cases.data]);
  const rules = useMemo(() => [...new Set(rows.map((r) => r.rule_id))].sort(), [rows]);
  const counts = {
    total: rows.length,
    unrun: rows.filter((r) => !r.last_route).length,
    clear: rows.filter((r) => r.last_route === "AUTO_CLEAR").length,
    review: rows.filter((r) => r.last_route === "NEEDS_REVIEW").length,
    approval: rows.filter((r) => r.last_route === "PENDING_APPROVAL").length,
  };

  const filtered = rows.filter((r) => {
    if (lane === "unrun" && r.last_route) return false;
    if (lane !== "all" && lane !== "unrun" && r.last_route !== lane) return false;
    if (rule !== "all" && r.rule_id !== rule) return false;
    if (band === "under10" && r.amount >= 10_000) return false;
    if (band === "mid" && (r.amount < 10_000 || r.amount >= 50_000)) return false;
    if (band === "over50" && r.amount < 50_000) return false;
    const hay = `${r.alert_id} ${r.txn_id} ${r.title} ${r.payee_name ?? ""} ${r.demo_tag ?? ""}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  const running = progress !== null && progress.done < progress.total && !progress.error;

  async function runQueue() {
    if (lock.current || filtered.length === 0) return;
    lock.current = true;
    const targets = filtered;
    setProgress({ done: 0, total: targets.length, current: targets[0].alert_id, error: null });
    try {
      for (let i = 0; i < targets.length; i++) {
        const id = targets[i].alert_id;
        setProgress({ done: i, total: targets.length, current: id, error: null });
        try {
          await api.run(id);
          void qc.invalidateQueries({ queryKey: ["cases"] });
          void qc.invalidateQueries({ queryKey: keys.case(id) });
        } catch (e) {
          setProgress({ done: i, total: targets.length, current: id, error: e });
          return;
        }
      }
      setProgress({ done: targets.length, total: targets.length, current: null, error: null });
    } finally {
      lock.current = false;
      void qc.invalidateQueries({ queryKey: keys.verify });
    }
  }

  const columns: Column<CaseSummary>[] = [
    { key: "tag", header: "Tag", width: "52px", render: (r) => r.demo_tag ? <Tag tone="amber">{r.demo_tag}</Tag> : <span className="text-muted">—</span> },
    { key: "id", header: "Alert", width: "120px", mono: true, render: (r) => r.alert_id },
    { key: "title", header: "Title", width: "minmax(160px, 1.4fr)", render: (r) => <span className="truncate">{r.title}</span> },
    { key: "payee", header: "Payee", width: "minmax(120px, 1fr)", render: (r) => <span className="truncate text-muted">{r.payee_name ?? "—"}</span> },
    { key: "amount", header: "Amount", width: "130px", align: "end", mono: true, render: (r) => money(r.amount, r.currency) },
    { key: "rule", header: "Rule", width: "72px", mono: true, render: (r) => r.rule_id },
    { key: "route", header: "Route", width: "150px", render: (r) => <RouteTag route={r.last_route} /> },
  ];

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile label="Alerts" value={<CountUp value={counts.total} />} foot={`${counts.clear} auto-cleared`} />
        <Tile label="Not run" tone="muted" value={<CountUp value={counts.unrun} />} foot="Route appears after a run" />
        <Tile label="Needs review" tone="amber" value={<CountUp value={counts.review} />} />
        <Tile label="Pending approval" tone="red" value={<CountUp value={counts.approval} />} foot="Officer gate" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SegmentedTabs
          label="Lane"
          size="sm"
          value={lane}
          onChange={setLane}
          options={[
            { value: "all", label: "All", count: counts.total },
            { value: "unrun", label: "Not run", count: counts.unrun },
            { value: "AUTO_CLEAR", label: "Auto-clear", count: counts.clear },
            { value: "NEEDS_REVIEW", label: "Review", count: counts.review },
            { value: "PENDING_APPROVAL", label: "Approval", count: counts.approval },
          ]}
        />
        <Select aria-label="Rule" value={rule} onChange={(e) => setRule(e.target.value)} className="w-36">
          <option value="all">All rules</option>
          {rules.map((id) => <option key={id} value={id}>{id}</option>)}
        </Select>
        <SegmentedTabs
          label="Amount band"
          size="sm"
          value={band}
          onChange={setBand}
          options={[
            { value: "all", label: "Any amount" },
            { value: "under10", label: "< 10k" },
            { value: "mid", label: "10–50k" },
            { value: "over50", label: "≥ 50k" },
          ]}
        />
        <Input aria-label="Search the queue" placeholder="Search alert, title, payee" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <Button variant="accent" onClick={() => void runQueue()} disabled={running || filtered.length === 0}>
          {running ? `Running ${progress.current}` : "Run queue"}
        </Button>
      </div>

      {progress && (
        <div className="flex flex-col gap-1.5" role="status">
          <div className="flex justify-between text-xs text-muted">
            <span className="num">
              {progress.error
                ? `Stopped on ${progress.current}`
                : progress.current
                  ? `${progress.current} · ${progress.done + 1} of ${progress.total}`
                  : `Ran ${progress.done} of ${progress.total}`}
            </span>
            <span className="num">{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-control bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full bg-brass" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
          </div>
          {progress.error ? <ErrorState error={progress.error} /> : null}
        </div>
      )}

      {cases.isLoading && <LoadingState label="Loading the queue" />}
      {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
      {cases.data && cases.data.length === 0 && (
        <EmptyState title="No alerts in the demo queue" body="The demo set is empty. A reset would rebuild it; this screen will not invent rows." />
      )}
      {cases.data && cases.data.length > 0 && (
        <DataTable
          label="Alert queue"
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.alert_id}
          rowTone={(r) => (r.last_route ? ROUTE_TONE[r.last_route] : "muted")}
          onRowActivate={(r) => router.push(`/case/${r.alert_id}`)}
          height={560}
          empty={<EmptyState title="Nothing matches these filters" body="Widen the lane, rule or amount band." mascot={false} />}
        />
      )}
    </div>
  );
}
