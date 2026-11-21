"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, ErrorState, Panel, RefusedState, Tag } from "@/components/primitives";
import { ApiError, api } from "@/lib/api";
import { keys, useHealth } from "@/lib/queries";
import type { FaultMode } from "@/lib/types";

const DRILLS: { mode: FaultMode; scope: "main" | "all"; label: string }[] = [
  { mode: "timeout", scope: "main", label: "Main model times out" },
  { mode: "slow", scope: "main", label: "Main model is slow (6 s)" },
  { mode: "rate_limited", scope: "main", label: "Main model rate-limited" },
  { mode: "timeout", scope: "all", label: "Full outage (main and backup)" },
];

/** Stage one controlled provider failure, then run a case to watch failover or fail-closed review. */
export function FaultDrill({ token, hydrated }: { token: string; hydrated: boolean }) {
  const health = useHealth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const h = hydrated ? health.data : undefined;
  const armed = h?.fault_armed ?? null;
  const limit = h?.llm_timeout_s ?? 10;

  async function arm(mode: FaultMode | "off", scope: "main" | "all" = "main") {
    setBusy(true);
    setError(null);
    try {
      await api.demoFault(token, mode, scope);
      await qc.invalidateQueries({ queryKey: keys.health });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Resilience drill" tint="surface">
      <div className="flex flex-col gap-3">
        <p className="max-w-[72ch] text-sm text-muted">
          Stages one failure on the next investigation only. A timeout waits the real {limit} s limit, then the
          backup provider is tried. A full outage fails the backup too, so code fails closed and the case goes to
          human review. Every drill is marked as injected in the audit log.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Backup provider</span>
          {h?.backup_model
            ? <Tag tone="sage" variant="tint">{h.backup_name ?? "backup"} · {h.backup_model}</Tag>
            : <Tag tone="amber" variant="dashed">Not configured: failures go to human review</Tag>}
          <span className="ms-2 text-muted">Drill</span>
          {armed
            ? <Tag tone="amber" variant="tint">Armed · {armed.scope === "all" ? "full outage, " : ""}{armed.mode.replace("_", " ")} · next {armed.remaining === 1 ? "investigation" : `${armed.remaining} investigations`}</Tag>
            : <Tag tone="muted" variant="dashed">Off</Tag>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DRILLS.map((d) => (
            <Button key={`${d.mode}-${d.scope}`} size="sm" variant="outline" disabled={busy || !(hydrated && token)} onClick={() => void arm(d.mode, d.scope)}>
              {d.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" disabled={busy || !armed || !(hydrated && token)} onClick={() => void arm("off")}>
            Disarm
          </Button>
          <Link href="/ingest" className="ms-auto text-sm text-text underline underline-offset-4">
            Run a new case to trigger it
          </Link>
        </div>
        {error instanceof ApiError && [403, 404, 422].includes(error.status)
          ? <RefusedState status={error.status} detail={error.message} />
          : error ? <ErrorState error={error} /> : null}
      </div>
    </Panel>
  );
}
