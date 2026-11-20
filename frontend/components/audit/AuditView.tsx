"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChainSweep } from "@/components/audit/ChainSweep";
import {
  DataTable, EmptyState, ErrorState, LoadingState, Select, Tag, type Column,
} from "@/components/primitives";
import { ApiError, api } from "@/lib/api";
import { shortHash, timestamp } from "@/lib/format";
import { useHydrated } from "@/lib/hydrated";
import { ACTOR_LABEL, type ActorType } from "@/lib/labels";
import { useCaseAudit, useCases, useVerify } from "@/lib/queries";
import type { AuditEntry } from "@/lib/types";

const ACTORS = new Set<string>(["CODE", "LLM", "HUMAN"]);

function actorLabel(actor: string): string {
  return ACTORS.has(actor) ? ACTOR_LABEL[actor as ActorType] : actor;
}

/** GET /audit is optional. A 404 means the global table is not available; any other failure is an error. */
function useGlobalAudit() {
  return useQuery({
    queryKey: ["audit", "global"],
    queryFn: async () => {
      try {
        return await api.globalAudit();
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

export function AuditView() {
  const cases = useCases(false);
  const [picked, setPicked] = useState<string>("");
  // The header fetches the case list and chain status too, so either can be cached before this page hydrates.
  // Render them only after hydration; see useHydrated.
  const hydrated = useHydrated();
  const caseList = hydrated ? cases.data : undefined;
  const caseId = picked || caseList?.[0]?.alert_id || "";
  const audit = useCaseAudit(caseId);
  const verify = useVerify();
  const global = useGlobalAudit();
  const entries = audit.data ?? [];

  const columns: Column<AuditEntry>[] = [
    { key: "seq", header: "Seq", width: "64px", mono: true, render: (r) => r.seq },
    { key: "id", header: "Record", width: "120px", mono: true, render: (r) => r.record_id },
    { key: "ts", header: "Time", width: "168px", mono: true, render: (r) => timestamp(r.ts) },
    { key: "kind", header: "Kind", width: "160px", render: (r) => <Tag tone="neutral">{r.kind}</Tag> },
    { key: "actor", header: "Actor", width: "100px", render: (r) => actorLabel(r.actor) },
    { key: "hash", header: "Hash", width: "minmax(140px, 1fr)", mono: true, render: (r) => shortHash(r.hash) },
  ];

  return (
    <div className="route-in flex flex-col gap-6 px-2 pb-8 pt-1">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.03em] text-text">Case audit</h1>
            <p className="text-sm text-muted">Entries from GET /cases/{caseId || "{id}"}/audit. Verify checks the whole chain.</p>
          </div>
          <Select aria-label="Case" value={caseId} onChange={(e) => setPicked(e.target.value)} className="w-72" disabled={!caseList}>
            {(caseList ?? []).map((c) => (
              <option key={c.alert_id} value={c.alert_id}>
                {c.demo_tag ? `${c.demo_tag} · ` : ""}{c.alert_id}
              </option>
            ))}
          </Select>
        </div>
        {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
        {!caseId && caseList && <EmptyState title="No cases to audit" body="The demo queue is empty, so there is no chain to open." />}
        {caseId && audit.isLoading && <LoadingState label={`Loading audit for ${caseId}`} />}
        {caseId && audit.isError && <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />}
        {audit.data && audit.data.length === 0 && (
          <EmptyState title="No audit entries for this case" body="Run the investigation. Each step writes an entry." />
        )}
        {audit.data && audit.data.length > 0 && (
          <DataTable label={`Audit for ${caseId}`} rows={entries} columns={columns} rowKey={(r) => r.record_id} height={360} />
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
            GET /audit/verify · {verify.data.ok ? "ok" : verify.data.reason} · {verify.data.entries} entries · {shortHash(verify.data.head_hash)}
          </p>
        )}
        {hydrated && verify.data && !verify.data.ok && (
          <ErrorState error={new Error(`${verify.data.reason ?? "Chain failed"} at ${verify.data.first_bad_record_id ?? "unknown"}`)} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-text">Global audit</h2>
        {global.isLoading && <LoadingState label="Checking GET /audit" lines={2} />}
        {global.isError && <ErrorState error={global.error} onRetry={() => void global.refetch()} />}
        {global.data === null && (
          <EmptyState
            title="No global audit table on this backend"
            body="The backend does not serve GET /audit. Per-case audit and the chain check above cover the whole log."
          />
        )}
        {global.data && (
          <DataTable
            label="Global audit"
            rows={global.data}
            columns={columns}
            rowKey={(r) => r.record_id}
            height={420}
            empty={<EmptyState title="GET /audit returned no entries" mascot={false} />}
          />
        )}
      </section>
    </div>
  );
}
