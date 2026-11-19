"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ActorTag, StatusTag, Timestamp } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { duration } from "@/lib/format";
import { ACTOR_TONE, CALL_LABEL, STEP_LABEL, TONE_BG, TONE_BORDER } from "@/lib/labels";
import { DUR, EASE, STAGGER, useMotionOK } from "@/lib/motion";
import type { TimelineCall, TimelineStep } from "@/lib/types";

const plainIds = (ids: string[]) => <span className="num text-2xs text-muted">{ids.join(", ")}</span>;

/**
 * Audit-backed pipeline timeline. Every row is a hash-chained audit entry; service calls nest under their step.
 * The staggered reveal runs when `revealKey` changes (a new run), never on refetch.
 */
export function PipelineTimeline({
  steps,
  revealKey,
  renderRecords = plainIds,
  className,
}: {
  steps: TimelineStep[];
  revealKey?: string | number;
  renderRecords?: (ids: string[]) => ReactNode;
  className?: string;
}) {
  const motionOK = useMotionOK();
  const runs = new Map<number, TimelineStep[]>();
  for (const s of steps) runs.set(s.run, [...(runs.get(s.run) ?? []), s]);
  let order = 0;

  return (
    <div key={revealKey} className={cx("flex flex-col gap-3", className)}>
      {[...runs.entries()].map(([run, items]) => (
        <section key={run} aria-label={`Run ${run}`} className="flex flex-col">
          {runs.size > 1 && (
            <div className="mb-1 flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.08em] text-muted">
              Run <span className="num">{run}</span>
              <span aria-hidden className="h-px flex-1 bg-hairline" />
            </div>
          )}
          <ol className="relative">
            <span aria-hidden className="absolute bottom-2 start-[5px] top-2 w-px bg-hairline-strong" />
            {items.map((s) => {
              const delay = order++ * STAGGER.timelineStep;
              return (
                <motion.li
                  key={s.audit_id}
                  initial={motionOK ? { opacity: 0, y: 4 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.base, ease: EASE.out, delay }}
                  className="relative grid grid-cols-[12px_1fr] gap-x-3 pb-3 last:pb-0"
                >
                  <span
                    aria-hidden
                    className={cx("relative z-[1] mt-1.5 h-[11px] w-[11px] border bg-bg", TONE_BORDER[ACTOR_TONE[s.actor_type]])}
                  >
                    <span className={cx("absolute inset-[3px]", TONE_BG[ACTOR_TONE[s.actor_type]])} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <ActorTag actor={s.actor_type} />
                      <span className="truncate text-sm font-medium text-text">{STEP_LABEL[s.step] ?? s.step}</span>
                      <StatusTag status={s.status} />
                      <span className="num ms-auto text-2xs text-muted">{duration(s.duration_ms)}</span>
                    </div>
                    {s.summary && <p className="text-xs text-muted">{s.summary}</p>}
                    {s.service_calls.length > 0 && (
                      <ServiceCalls calls={s.service_calls} baseDelay={delay} motionOK={motionOK} renderRecords={renderRecords} />
                    )}
                    {s.service_calls.length === 0 && s.record_ids.length > 0 && <div>{renderRecords(s.record_ids)}</div>}
                    <div className="flex items-center gap-2 text-2xs text-muted">
                      <span className="num">{s.audit_id}</span>
                      <Timestamp iso={s.ts} />
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ServiceCalls({
  calls,
  baseDelay,
  motionOK,
  renderRecords,
}: {
  calls: TimelineCall[];
  baseDelay: number;
  motionOK: boolean;
  renderRecords: (ids: string[]) => ReactNode;
}) {
  const max = Math.max(1, ...calls.map((c) => c.duration_ms));
  return (
    <ul className="flex flex-col border-s border-hairline ps-2">
      {calls.map((c, i) => (
        <motion.li
          key={`${c.name}-${i}`}
          initial={motionOK ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: DUR.base, ease: EASE.out, delay: baseDelay + (i + 1) * STAGGER.serviceCall }}
          className="grid grid-cols-[minmax(0,1fr)_72px_56px] items-center gap-2 py-0.5"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cx("num text-xs", c.ok ? "text-text" : "text-red-text")}>
              {CALL_LABEL[c.name] ?? c.name}
              {!c.ok && " · failed"}
            </span>
            {c.target && <span className="num truncate text-2xs text-muted">{c.target}</span>}
            {c.record_ids.length > 0 && renderRecords(c.record_ids)}
          </span>
          <span aria-hidden className="h-1 bg-hairline">
            <span className={cx("block h-full", c.ok ? "bg-sage" : "bg-red")} style={{ width: `${Math.max(4, (c.duration_ms / max) * 100)}%` }} />
          </span>
          <span className="num text-end text-2xs text-muted">{duration(c.duration_ms)}</span>
        </motion.li>
      ))}
    </ul>
  );
}
