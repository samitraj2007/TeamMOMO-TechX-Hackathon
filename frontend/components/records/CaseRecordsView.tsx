"use client";

import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Callout, DataTable, EmptyState, ErrorState, Input, LoadingState, RouteTag, Select, Tag, type Column,
} from "@/components/primitives";
import { api, describeControlError, downloadBundle, downloadUrl, files } from "@/lib/api";
import { cx } from "@/lib/cx";
import { money, shortHash, timestamp } from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import type { CaseOrigin, CaseRecord, CaseStatus } from "@/lib/types";

const PAGE = 100;
const ORIGINS: { id: CaseOrigin | ""; label: string }[] = [
  { id: "", label: "All" },
  { id: "demo", label: "Demo cases" },
  { id: "api", label: "Your cases" },
  { id: "feed", label: "Live feed" },
  { id: "drill", label: "Drills" },
  { id: "manual", label: "Manual runs" },
  { id: "dataset", label: "Seed data" },
];
const ORIGIN_TONE: Record<CaseOrigin, "neutral" | "sage" | "model" | "amber" | "muted"> = {
  demo: "neutral", api: "sage", feed: "model", drill: "amber", manual: "neutral", dataset: "muted",
};
const STATUS: Record<CaseStatus, { label: string; tone: "muted" | "amber" | "sage" | "neutral" }> = {
  not_routed: { label: "Not routed", tone: "muted" },
  open: { label: "Open", tone: "amber" },
  resolved: { label: "Resolved", tone: "sage" },
  filed: { label: "Filed", tone: "neutral" },
};

const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cx("press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        on ? "border-text bg-text text-bg" : "border-hairline bg-surface text-text hover:border-hairline-strong")}>
      {children}
    </button>
  );
}

const btn = "press inline-flex h-9 items-center rounded-control border border-hairline-strong bg-surface px-3 text-sm text-text hover:bg-raised disabled:opacity-50";

export function CaseRecordsView() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<CaseOrigin | "">("");
  const [route, setRoute] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const filters = { q: q.trim() || undefined, origin: origin || undefined, route: route || undefined, status: status || undefined };
  const search = useQuery({
    queryKey: ["cases", "search", filters, offset],
    queryFn: () => api.searchCases({ ...filters, limit: PAGE, offset }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  const storage = useQuery({ queryKey: ["storage"], queryFn: api.storage, refetchInterval: 30_000 });
  const verify = useQuery({ queryKey: ["audit", "verify"], queryFn: () => api.verifyAudit() });
  const data = hydrated ? search.data : undefined;
  const rows = data?.items ?? [];
  const totalAll = Object.values(data?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  const setFilter = (fn: () => void) => { fn(); setOffset(0); };
  const toggle = (id: string) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.alert_id));

  async function bundle(ids: string[]) {
    setBusy(true);
    setError(null);
    try {
      await downloadBundle(ids);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function bundleMatching() {
    setBusy(true);
    setError(null);
    try {
      const all = await api.searchCases({ ...filters, limit: 200 });
      await downloadBundle(all.items.map((r) => r.alert_id));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<CaseRecord>[] = [
    {
      key: "pick", header: "", width: "36px",
      render: (r) => (
        <input type="checkbox" aria-label={`Select ${r.alert_id}`} checked={selected.has(r.alert_id)}
          onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onChange={() => toggle(r.alert_id)}
          className="h-4 w-4 accent-[var(--color-text)]" />
      ),
    },
    { key: "alert", header: "Case", width: "104px", mono: true, render: (r) => r.alert_id },
    { key: "origin", header: "Source", width: "112px", render: (r) => <Tag tone={ORIGIN_TONE[r.origin]} variant="tint">{r.demo_tag ? `Demo ${r.demo_tag}` : ORIGINS.find((o) => o.id === r.origin)?.label}</Tag> },
    { key: "amount", header: "Amount", width: "130px", align: "end", mono: true, render: (r) => money(r.amount, r.currency) },
    { key: "route", header: "Route", width: "150px", render: (r) => (r.route ? <RouteTag route={r.route} /> : <span className="text-muted">-</span>) },
    { key: "status", header: "Status", width: "104px", render: (r) => <Tag tone={STATUS[r.status].tone} variant="dashed">{STATUS[r.status].label}</Tag> },
    { key: "who", header: "Decided by", width: "minmax(140px, 1fr)", render: (r) => <span className="truncate text-xs text-muted">{r.decided_by ?? (r.status === "resolved" ? "code (auto)" : "-")}</span> },
    { key: "entries", header: "Log", width: "56px", align: "end", mono: true, render: (r) => r.audit_entries },
    { key: "last", header: "Last activity", width: "160px", mono: true, render: (r) => (r.last_activity ? timestamp(r.last_activity) : "-") },
    {
      key: "dl", header: "", width: "84px", align: "end",
      render: (r) => (
        <button type="button" title="Download evidence pack (.zip)" onClick={(e) => { e.stopPropagation(); downloadUrl(files.evidencePack(r.alert_id)); }}
          className="press rounded-control border border-hairline px-2 py-0.5 text-2xs text-text hover:bg-raised">.zip</button>
      ),
    },
  ];

  const refused = error ? describeControlError(error) : null;

  return (
    <div className="route-in flex flex-col gap-5 px-2 pb-8 pt-1">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.03em] text-text">Case records</h1>
        <p className="max-w-2xl text-sm text-muted">
          Every case MOMO has handled: the demo set, your own cases, live-feed alerts and resilience drills. Open any of
          them, or download evidence packs one by one or as a bundle.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-sheet border border-hairline bg-surface p-5 shadow-card">
          <h2 className="text-sm font-semibold text-text">Where it is stored</h2>
          {storage.data ? (
            <>
              <p className="num break-all text-sm text-text">{storage.data.database} <span className="text-muted">· {fmtBytes(storage.data.bytes)} · SQLite, schema v{storage.data.schema_version}</span></p>
              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-hairline bg-hairline text-center sm:grid-cols-6">
                {Object.entries(storage.data.tables).map(([t, n]) => (
                  <div key={t} className="flex flex-col bg-surface px-2 py-1.5">
                    <dd className="num order-1 text-sm font-semibold text-text">{n.toLocaleString("en-US")}</dd>
                    <dt className="order-2 truncate text-2xs text-muted" title={t}>{t.replace("_", " ")}</dt>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted">{storage.data.note}</p>
              {verify.data && (
                <p className="num text-xs text-muted">
                  Audit chain {verify.data.ok ? <span className="text-sage">intact</span> : <span className="text-red-text">{verify.data.reason}</span>} · head {shortHash(verify.data.head_hash)}
                </p>
              )}
            </>
          ) : storage.isError ? <ErrorState error={storage.error} /> : <LoadingState label="Reading storage" lines={2} />}
        </section>

        <section className="flex flex-col gap-3 rounded-sheet border border-hairline bg-surface p-5 shadow-card">
          <h2 className="text-sm font-semibold text-text">Downloads</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="text-text">Evidence pack per case</span><span className="block text-xs text-muted">SAR draft (.md and printable), audit (.csv, .jsonl), timeline, case data, manifest with SHA-256 hashes</span></span>
              <span className="text-xs text-muted">.zip button on each row</span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="text-text">Bundle</span><span className="block text-xs text-muted">The cases you tick, or everything matching the filters (up to 200), in one .zip with an index</span></span>
              <button type="button" className={btn} disabled={busy || !data?.total} onClick={() => void bundleMatching()}>
                Download matching ({Math.min(200, data?.total ?? 0)})
              </button>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="text-text">Full audit log</span><span className="block text-xs text-muted">Every entry, oldest first; check it against the chain head above</span></span>
              <span className="flex gap-2">
                <button type="button" className={btn} onClick={() => downloadUrl(files.auditExport("csv"))}>.csv</button>
                <button type="button" className={btn} onClick={() => downloadUrl(files.auditExport("jsonl"))}>.jsonl</button>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {ORIGINS.map((o) => (
            <Chip key={o.id || "all"} on={origin === o.id} onClick={() => setFilter(() => setOrigin(o.id))}>
              {o.label}
              <span className={cx("num text-2xs", origin === o.id ? "text-bg/70" : "text-muted")}>
                {o.id ? (data?.counts[o.id] ?? 0) : totalAll}
              </span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Search by case, transaction or customer ID" placeholder="Search ALT-, TXN- or CUS- ID" value={q} mono
            onChange={(e) => setFilter(() => setQ(e.target.value))} className="w-64" />
          <Select aria-label="Route" value={route} onChange={(e) => setFilter(() => setRoute(e.target.value))} className="w-48">
            <option value="">Any route</option>
            <option value="AUTO_CLEAR">Auto-clear</option>
            <option value="NEEDS_REVIEW">Needs review</option>
            <option value="PENDING_APPROVAL">Officer approval</option>
          </Select>
          <Select aria-label="Status" value={status} onChange={(e) => setFilter(() => setStatus(e.target.value))} className="w-40">
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <span className="num ms-auto text-xs text-muted">
            {data ? `${data.total.toLocaleString("en-US")} cases${data.total > PAGE ? ` · ${offset + 1}-${Math.min(offset + PAGE, data.total)}` : ""}` : ""}
          </span>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-panel border border-text/20 bg-raised px-4 py-2.5 text-sm" role="status">
            <span className="num font-medium text-text">{selected.size} selected</span>
            <button type="button" className={btn} disabled={busy || selected.size > 200} onClick={() => void bundle([...selected])}>
              {busy ? "Preparing…" : "Download bundle (.zip)"}
            </button>
            <button type="button" className="text-xs text-muted underline underline-offset-4" onClick={() => setSelected(new Set())}>Clear</button>
            {selected.size > 200 && <span className="text-xs text-red-text">A bundle holds at most 200 cases.</span>}
          </div>
        )}
        {refused && <Callout kind="warn" title={refused.title}>{refused.body}</Callout>}

        {search.isError ? <ErrorState error={search.error} onRetry={() => void search.refetch()} />
          : !data ? <LoadingState label="Loading cases" lines={4} />
          : (
            <>
              <div className="flex items-center gap-2 text-xs text-muted">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-text)]" checked={allOnPage}
                    onChange={() => setSelected((cur) => {
                      const next = new Set(cur);
                      rows.forEach((r) => (allOnPage ? next.delete(r.alert_id) : next.add(r.alert_id)));
                      return next;
                    })} />
                  Select this page
                </label>
              </div>
              <DataTable label="Case records" rows={rows} columns={columns} rowKey={(r) => r.alert_id} height={560}
                rowTone={(r) => (r.route === "PENDING_APPROVAL" ? "red" : r.route === "NEEDS_REVIEW" ? "amber" : r.route === "AUTO_CLEAR" ? "sage" : null)}
                onRowActivate={(r) => router.push(`/case/${r.alert_id}`)}
                empty={<EmptyState mascot={false} title="No cases match" body="Clear a filter, or run a case from Test your own case, the Live feed or a Resilience drill." />} />
              {data.total > PAGE && (
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className={btn} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
                  <button type="button" className={btn} disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</button>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}
