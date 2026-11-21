"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { AuditEntrySheet } from "@/components/audit/AuditEntrySheet";
import { RecordChips } from "@/components/records/Records";
import { cx } from "@/lib/cx";
import { timestamp } from "@/lib/format";
import { useLifecycle } from "@/lib/queries";
import type { LifecycleStep, LifecycleWho } from "@/lib/types";

/**
 * Investigated → Analyst review → Officer approval → Report filed. The state comes from GET /cases/{id}/lifecycle,
 * which code derives from approvals, resolutions and the audit log; the screen never re-derives the rules.
 */

export const WHO_LABEL: Record<LifecycleWho, string> = {
  ANALYST: "an analyst",
  COMPLIANCE_OFFICER: "a compliance officer",
  CODE: "code",
};

const DOT: Record<LifecycleStep["state"], string> = {
  done: "border-sage bg-sage text-white",
  current: "border-text bg-surface text-text",
  upcoming: "border-hairline-strong bg-surface text-muted",
  skipped: "border-dashed border-hairline-strong bg-surface text-muted",
  not_needed: "border-dashed border-hairline-strong bg-surface text-muted",
};
const STATE_TEXT: Record<LifecycleStep["state"], string> = {
  done: "Done", current: "Now", upcoming: "Later", skipped: "Skipped", not_needed: "Not needed",
};

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LifecycleStepper({ id }: { id: string }) {
  const q = useLifecycle(id);
  const [entry, setEntry] = useState<string | null>(null);
  const lc = q.data;
  if (!lc) return null;

  return (
    <nav aria-label="Case lifecycle" className="rounded-panel border border-hairline bg-surface px-4 py-3">
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-0">
        {lc.steps.map((s, i) => {
          const muted = s.state === "skipped" || s.state === "not_needed" || s.state === "upcoming";
          const next = lc.steps[i + 1];
          return (
            <li key={s.id} aria-current={s.state === "current" ? "step" : undefined}
              className="relative flex min-w-0 gap-2.5 sm:flex-col sm:gap-2 sm:pe-4">
              <div className="flex items-center sm:w-full">
                <motion.span layout
                  className={cx("relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold", DOT[s.state])}
                  initial={false} animate={{ scale: s.state === "done" ? [1.15, 1] : 1 }} transition={{ duration: 0.25 }}>
                  {s.state === "done" ? <Check /> : i + 1}
                  {s.state === "current" && <span aria-hidden className="absolute inset-[-4px] rounded-full border border-text/25" />}
                </motion.span>
                {next && (
                  <span aria-hidden className="ms-2 hidden h-px flex-1 bg-hairline sm:block">
                    <motion.span className="block h-px origin-left bg-sage" initial={false}
                      animate={{ scaleX: s.state === "done" && next.state !== "upcoming" ? 1 : 0 }} transition={{ duration: 0.35 }} />
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={cx("text-sm font-medium", muted ? "text-muted" : "text-text")}>{s.label}</span>
                  <span className={cx("text-2xs", s.state === "current" ? "text-text" : "text-muted")}>{STATE_TEXT[s.state]}</span>
                </span>
                {s.state === "current" && s.who_can_act && (
                  <span className="w-fit rounded-full bg-text px-2 py-0.5 text-2xs font-medium text-bg">
                    Needs {WHO_LABEL[s.who_can_act]}
                  </span>
                )}
                {s.by && <span className="truncate text-xs text-text" title={s.by}>{s.by}</span>}
                {s.ts && <span className="num text-2xs text-muted">{timestamp(s.ts)}</span>}
                {s.note && <span className="text-xs text-muted">{s.note}</span>}
                {s.record_id && (s.record_id.startsWith("AUD-") ? (
                  <button type="button" onClick={() => setEntry(s.record_id)}
                    className="num w-fit text-2xs text-muted underline underline-offset-4 hover:text-text">{s.record_id}</button>
                ) : <RecordChips ids={[s.record_id]} />)}
              </div>
            </li>
          );
        })}
      </ol>
      <AuditEntrySheet recordId={entry} onClose={() => setEntry(null)} />
    </nav>
  );
}
