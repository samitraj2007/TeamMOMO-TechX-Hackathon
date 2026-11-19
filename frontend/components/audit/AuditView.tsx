"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChainSweep } from "@/components/audit/ChainSweep";
import {
  DataTable, EmptyState, ErrorState, LoadingState, Select, Tag, type Column,
} from "@/components/primitives";
import { ApiError, api } from "@/lib/api";
import { shortHash, timestamp } from "@/lib/format";
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
  const caseId = picked || cases.data?.[0]?.alert_id || "";
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
    <div className="flex flex-col gap-5 p-5">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-base font-medium text-text">Case audit</h1>
            <p className="text-sm text-muted">Entries from GET /cases/{caseId || "{id}"}/audit. Verify checks the whole chain.</p>
          </div>
          <Select aria-label="Case" value={caseId} onChange={(e) => setPicked(e.target.value)} className="w-72" disabled={!cases.data}>
            {(cases.data ?? []).map((c) => (
              <option key={c.alert_id} value={c.alert_id}>
                {c.demo_tag ? `${c.demo_tag} · ` : ""}{c.alert_id}
              </option>
            ))}
          </Select>
        </div>
        {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
        {!caseId && cases.data && <EmptyState title="No cases to audit" body="The demo queue is empty, so there is no chain to open." />}
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
        {verify.data && (
          <p className="num text-xs text-muted">
            GET /audit/verify · {verify.data.ok ? "ok" : verify.data.reason} · {verify.data.entries} entries · {shortHash(verify.data.head_hash)}
          </p>
        )}
        {verify.data && !verify.data.ok && (
          <ErrorState error={new Error(`${verify.data.reason ?? "Chain failed"} at ${verify.data.first_bad_record_id ?? "unknown"}`)} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-text">Global audit</h2>
        {global.isLoading && <LoadingState label="Checking GET /audit" lines={2} />}
        {global.isError && <ErrorState error={global.error} onRetry={() => void global.refetch()} />}
        {global.data === null && (
          <EmptyState
            title="Needs GET /audit"
            body="The global table is not on this backend. Per-case audit and GET /audit/verify are live above."
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
