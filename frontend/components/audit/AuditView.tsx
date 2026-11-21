"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AuditEntrySheet, entryHeadline, entryMs, entryRoute } from "@/components/audit/AuditEntrySheet";
import { ChainSweep } from "@/components/audit/ChainSweep";
import {
  DataTable, EmptyState, ErrorState, LoadingState, RouteTag, Select, Tag, type Column,
} from "@/components/primitives";
import { ApiError, api, downloadUrl, files } from "@/lib/api";
import { shortHash, timestamp } from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import { ACTOR_LABEL, type ActorType } from "@/lib/labels";
import { useCaseAudit, useVerify } from "@/lib/queries";
import type { AuditEntry } from "@/lib/types";

const ACTORS = new Set<string>(["CODE", "LLM", "HUMAN"]);
const KINDS = ["", "INGEST", "STEP", "DECISION", "COMMIT", "FILING", "FILING_REFUSED", "COMMIT_REFUSED", "MANUAL_RUN"];
const ORIGIN_LABEL: Record<string, string> = { demo: "Demo", api: "Your case", feed: "Feed", drill: "Drill", manual: "Manual", dataset: "Seed" };

function actorLabel(actor: string): string {
  return ACTORS.has(actor) ? ACTOR_LABEL[actor as ActorType] : actor === "API" ? "Code (API)" : actor;
}

/** GET /audit is optional on older backends. A 404 means the global table is not available. */
function useGlobalAudit(kind: string) {
  return useQuery({
    queryKey: ["audit", "global", kind],
    queryFn: async () => {
      try {
        return await api.globalAudit({ kind: kind || undefined, limit: 300 });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    refetchInterval: 15_000,
  });
}

export function AuditView() {
  const hydrated = useHydrated();
  // Every case with audit activity (demo, your own, feed, drill), newest first, so test runs are one pick away.
  const cases = useQuery({ queryKey: ["cases", "search", "audit-picker"], queryFn: () => api.searchCases({ limit: 300 }) });
  const caseList = hydrated ? cases.data?.items.filter((c) => c.audit_entries > 0 || c.origin === "demo") : undefined;
  const [picked, setPicked] = useState<string>("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const caseId = picked || caseList?.[0]?.alert_id || "";
  const audit = useCaseAudit(caseId);
  const verify = useVerify();
  const global = useGlobalAudit(kind);
  const entries = audit.data ?? [];

  const columns = (withCase: boolean): Column<AuditEntry>[] => [
    { key: "seq", header: "Seq", width: "64px", mono: true, render: (r) => r.seq },
    { key: "ts", header: "Time", width: "160px", mono: true, render: (r) => timestamp(r.ts) },
    ...(withCase ? [{ key: "case", header: "Case", width: "104px", mono: true, render: (r: AuditEntry) => r.alert_id ?? "-" }] : []),
    { key: "kind", header: "Kind", width: "120px", render: (r) => <Tag tone="neutral">{r.kind}</Tag> },
    { key: "what", header: "What happened", width: "minmax(220px, 1fr)", render: (r) => <span className="truncate" title={entryHeadline(r)}>{entryHeadline(r)}</span> },
    { key: "route", header: "Route", width: "150px", render: (r) => { const route = entryRoute(r); return route ? <RouteTag route={route} /> : <span className="text-muted">-</span>; } },
    { key: "actor", header: "Actor", width: "96px", render: (r) => actorLabel(r.actor) },
    { key: "took", header: "Took", width: "84px", align: "end", mono: true, render: (r) => entryMs(r) ?? "-" },
    { key: "hash", header: "Hash", width: "110px", mono: true, render: (r) => shortHash(r.hash) },
  ];

  return (
    <div className="route-in flex flex-col gap-6 px-2 pb-8 pt-1">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.03em] text-text">Case audit</h1>
            <p className="max-w-2xl text-sm text-muted">
              Every step, decision and filing for one case, in order. Click a row for the full record: time taken, tool,
              input, decision and who approved it. All cases are in <Link href="/records" className="underline underline-offset-4">Case records</Link>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Case" value={caseId} onChange={(e) => setPicked(e.target.value)} className="w-80" disabled={!caseList}>
              {(caseList ?? []).map((c) => (
                <option key={c.alert_id} value={c.alert_id}>
                  {c.alert_id} · {c.demo_tag ? `demo ${c.demo_tag}` : ORIGIN_LABEL[c.origin]}{c.route ? ` · ${c.route.replace("_", " ").toLowerCase()}` : ""}
                </option>
              ))}
            </Select>
            {caseId && (
              <button type="button" onClick={() => downloadUrl(files.caseAuditCsv(caseId))}
                className="press h-9 rounded-control border border-hairline-strong bg-surface px-3 text-sm hover:bg-raised">Audit .csv</button>
            )}
          </div>
        </div>
        {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
        {!caseId && caseList && <EmptyState title="No cases to audit" body="Run a case first. Each step writes an entry." />}
        {caseId && audit.isLoading && <LoadingState label={`Loading audit for ${caseId}`} />}
        {caseId && audit.isError && <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />}
        {audit.data && audit.data.length === 0 && (
          <EmptyState title="No audit entries for this case" body="Run the investigation. Each step writes an entry." />
        )}
        {audit.data && audit.data.length > 0 && (
          <DataTable label={`Audit for ${caseId}`} rows={entries} columns={columns(false)} rowKey={(r) => r.record_id} height={380}
            onRowActivate={setOpen} />
        )}
        <ChainSweep
          links={entries.map((e) => ({ record_id: e.record_id, hash: e.hash }))}
          onVerify={async () => {
            const result = await api.verifyAudit();
            return { ok: result.ok, first_bad_record_id: result.first_bad_record_id };
          }}
        />
        {hydrated && verify.data && (
          <p className="num text-xs text-muted">
            Chain {verify.data.ok ? "intact" : verify.data.reason} · {verify.data.entries} entries · head {shortHash(verify.data.head_hash)}
          </p>
        )}
        {hydrated && verify.data && !verify.data.ok && (
          <ErrorState error={new Error(`${verify.data.reason ?? "Chain failed"} at ${verify.data.first_bad_record_id ?? "unknown"}`)} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-text">Global audit</h2>
            <p className="text-sm text-muted">The latest 300 entries across every case, newest first. Exports contain the whole log.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="w-48">
              {KINDS.map((k) => <option key={k} value={k}>{k || "All kinds"}</option>)}
            </Select>
            <button type="button" onClick={() => downloadUrl(files.auditExport("csv"))}
              className="press h-9 rounded-control border border-hairline-strong bg-surface px-3 text-sm hover:bg-raised">Full log .csv</button>
            <button type="button" onClick={() => downloadUrl(files.auditExport("jsonl"))}
              className="press h-9 rounded-control border border-hairline-strong bg-surface px-3 text-sm hover:bg-raised">.jsonl</button>
          </div>
        </div>
        {global.isLoading && <LoadingState label="Loading the audit log" lines={2} />}
        {global.isError && <ErrorState error={global.error} onRetry={() => void global.refetch()} />}
        {global.data === null && (
          <EmptyState title="This backend has no global audit route" body="Restart the backend so it serves GET /audit." />
        )}
        {global.data && (
          <DataTable label="Global audit" rows={global.data} columns={columns(true)} rowKey={(r) => r.record_id} height={460}
            onRowActivate={setOpen} empty={<EmptyState title="No entries" mascot={false} />} />
        )}
      </section>

      <AuditEntrySheet entry={open} onClose={() => setOpen(null)} />
    </div>
  );
}
