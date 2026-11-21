"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/primitives";
import type { Tone } from "@/lib/labels";
import { useHealth } from "@/lib/queries";
import type { CaseRun, Health } from "@/lib/types";

/** Seconds since `active` turned true; 0 while idle. Ticks four times a second. */
export function useElapsed(active: boolean): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const id = setInterval(() => setMs(Date.now() - t0), 250);
    return () => {
      clearInterval(id);
      setMs(0);
    };
  }, [active]);
  return active ? ms / 1000 : 0;
}

function statusLine(s: number, h: Health | undefined): { text: string; tone: Tone } {
  const limit = h?.llm_timeout_s ?? 10;
  const secs = `${Math.floor(s)} s`;
  const drill = h?.fault_armed
    ? ` · drill armed: ${h.fault_armed.scope === "all" ? "full outage" : "main model"} ${h.fault_armed.mode.replace("_", " ")}`
    : "";
  if (s < limit) return { text: `Investigating · ${secs} · the main model has up to ${limit} s${drill}`, tone: "model" };
  if (h?.backup_model && s >= 2 * limit) {
    return { text: `Main and backup models both passed their ${limit} s limit · failing closed to human review · ${secs}`, tone: "amber" };
  }
  if (h?.backup_model) {
    return { text: `Main model passed its ${limit} s limit · trying the backup (${h.backup_model}) · ${secs}`, tone: "amber" };
  }
  return { text: `Main model passed its ${limit} s limit · no backup configured · failing closed to human review · ${secs}`, tone: "amber" };
}

/** A live line under a running action, so a slow model never looks like a frozen page. */
export function RunStatus({ active, className }: { active: boolean; className?: string }) {
  const s = useElapsed(active);
  const health = useHealth();
  if (!active) return null;
  const { text, tone } = statusLine(s, health.data);
  return (
    <p role="status" aria-live="polite" className={className}>
      <span className="inline-flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className={`h-1.5 w-1.5 animate-pulse rounded-full ${tone === "amber" ? "bg-amber" : "bg-model"}`} />
        <span className="num">{text}</span>
      </span>
    </p>
  );
}

const ATTEMPT_TONE: Record<string, Tone> = { ok: "sage", not_configured: "muted" };

/** The model path one investigation took: each provider tried, and what code did with the outcome. */
export function ProviderPath({ run }: { run: CaseRun }) {
  const inv = run.investigator;
  const failed = inv.status !== "ok" && inv.status !== "citation_invalid";
  const viaBackup = !failed && inv.provider && inv.provider !== "main";
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted">Model path</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {inv.cached ? (
          <Tag tone="neutral" variant="tint">Cache hit · {inv.model}</Tag>
        ) : inv.attempts.length === 0 ? (
          <Tag tone="muted" variant="dashed">{inv.status.replace("_", " ")}</Tag>
        ) : inv.attempts.map((a, i) => (
          <span key={`${a.provider}-${i}`} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-muted">→</span>}
            <Tag tone={ATTEMPT_TONE[a.status] ?? "amber"} variant={a.status === "not_configured" ? "dashed" : "tint"}
              title={a.model || undefined}>
              {a.provider} · {a.status.replace("_", " ")}{a.status !== "not_configured" ? ` · ${(a.duration_ms / 1000).toFixed(1)} s` : ""}
            </Tag>
            {a.injected && <Tag tone="neutral" variant="dashed" title="Staged with POST /demo/fault">injected drill</Tag>}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted">
        {failed
          ? "No model answered, so code failed closed: the case went to human review and nothing was auto-cleared."
          : viaBackup
            ? `The main model failed; the backup provider${inv.provider === "backup" ? "" : ` (${inv.provider})`} answered, and its findings went through the same citation verifier.`
            : inv.cached ? "Replayed from the cache; no provider call." : "Answered by the main model."}
      </p>
    </div>
  );
}
