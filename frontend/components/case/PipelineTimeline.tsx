"use client";

import { motion } from "motion/react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { IconClose, IconPause, IconPlay } from "@/components/icons";
import { ActorTag, Button, StatusTag, Timestamp } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { duration } from "@/lib/format";
import { CALL_LABEL, STATUS_TONE, STEP_LABEL, TONE_BG, TONE_BORDER } from "@/lib/labels";
import { DUR, EASE, SPRING, STAGGER, useMotionOK } from "@/lib/motion";
import { usePrefs } from "@/lib/prefs";
import type { TimelineCall, TimelineStep } from "@/lib/types";

const plainIds = (ids: string[]) => <span className="num text-2xs text-muted">{ids.join(", ")}</span>;

/**
 * Audit-backed pipeline timeline. Every row is a hash-chained audit entry; service calls nest under their step.
 * Scrub: drag along the rail, click a node, or focus the rail and use arrow keys; later steps dim.
 * The staggered reveal runs when `revealKey` changes (a new run), never on refetch.
 */
export function PipelineTimeline({
  steps,
  revealKey,
  renderRecords = plainIds,
  onStepChange,
  className,
}: {
  steps: TimelineStep[];
  revealKey?: string | number;
  renderRecords?: (ids: string[]) => ReactNode;
  onStepChange?: (step: TimelineStep) => void;
  className?: string;
}) {
  const motionOK = useMotionOK();
  const { demoSpeed } = usePrefs();
  const n = steps.length;
  const [cursor, setCursorRaw] = useState(n - 1);
  const [playing, setPlaying] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const [centers, setCenters] = useState<number[]>([]);
  const at = Math.min(cursor, n - 1);

  const setCursor = (i: number) => {
    const c = Math.max(0, Math.min(n - 1, i));
    setCursorRaw(c);
    if (steps[c]) onStepChange?.(steps[c]);
  };

  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => setCenters(nodes.current.slice(0, n).map((nd) => (nd ? nd.offsetTop + nd.offsetHeight / 2 : 0)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, revealKey]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setCursorRaw((c) => {
        if (c >= n - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 650 / demoSpeed);
    return () => clearInterval(timer);
  }, [playing, n, demoSpeed]);

  function nearest(clientY: number) {
    const top = list.current?.getBoundingClientRect().top ?? 0;
    const y = clientY - top;
    let best = 0;
    centers.forEach((c, i) => {
      if (Math.abs(c - y) < Math.abs(centers[best] - y)) best = i;
    });
    return best;
  }

  function onScrubDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
    setCursor(nearest(e.clientY));
  }
  function onScrubMove(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setCursor(nearest(e.clientY));
  }
  function onKey(e: KeyboardEvent) {
    const map: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: n - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    setPlaying(false);
    setCursor(map[e.key]);
  }

  const play = () => {
    if (at >= n - 1) setCursorRaw(0);
    setPlaying((p) => !p);
  };

  const multiRun = new Set(steps.map((s) => s.run)).size > 1;
  const current = steps[at];
  const showRunHeader = (i: number) => multiRun && (i === 0 || steps[i].run !== steps[i - 1].run);

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={play} icon={playing ? <IconPause size={12} /> : <IconPlay size={12} />}>
          {playing ? "Pause" : at >= n - 1 ? "Replay steps" : "Play"}
        </Button>
        <span className="num text-xs text-muted">Step {at + 1} of {n}</span>
        {current && <span className="truncate text-xs text-text">{STEP_LABEL[current.step] ?? current.step}</span>}
      </div>
      <ol key={revealKey} ref={list} className="relative">
        {/* The spine: rail, teal progress fill, and the scrub zone. */}
        <span aria-hidden className="absolute bottom-3 start-[9px] top-3 w-[2px] rounded-full bg-hairline" />
        <motion.span aria-hidden className="absolute start-[9px] top-3 w-[2px] origin-top rounded-full bg-sage"
          animate={{ height: Math.max(0, (centers[at] ?? 0) - 12) }} transition={SPRING.soft} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Scrub the investigation"
          aria-valuemin={1}
          aria-valuemax={n}
          aria-valuenow={at + 1}
          aria-valuetext={current ? `${STEP_LABEL[current.step] ?? current.step}, ${current.status}` : undefined}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onKeyDown={onKey}
          className="absolute inset-y-0 start-0 z-10 w-5 cursor-ns-resize touch-none rounded-full hover:bg-sage/5"
        />
        {steps.map((s, i) => {
          // Node shape follows the step status: filled when done, hollow when waiting or skipped, a cross on failure.
          const tone = STATUS_TONE[s.status] ?? "muted";
          const failed = tone === "red";
          const hollow = tone === "muted" || tone === "human";
          const future = i > at;
          const isCurrent = i === at;
          return (
            <Fragment key={s.audit_id}>
              {showRunHeader(i) && (
                <li aria-hidden className="mb-1 ms-7 flex items-center gap-2 text-xs font-medium text-muted">
                  Run <span className="num">{s.run}</span>
                  <span className="h-px flex-1 bg-hairline" />
                </li>
              )}
              <motion.li
                initial={motionOK ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: future ? 0.32 : 1, y: 0 }}
                transition={{ opacity: { duration: DUR.base }, y: { duration: DUR.base, ease: EASE.out, delay: i * STAGGER.timelineStep } }}
                className="relative grid grid-cols-[20px_1fr] gap-x-3 pb-3 last:pb-0"
              >
                <span className="relative flex justify-center pt-2">
                  <motion.span
                    ref={(el) => {
                      nodes.current[i] = el;
                    }}
                    aria-hidden
                    animate={{ scale: isCurrent ? 1.25 : 1 }}
                    transition={SPRING.ui}
                    className={cx(
                      "relative z-[1] flex h-3 w-3 items-center justify-center rounded-full border-[1.5px] bg-surface",
                      future ? "border-hairline-strong" : TONE_BORDER[tone],
                      isCurrent && "ring-4 ring-sage/15",
                    )}
                  >
                    {!future && failed && <IconClose size={7} strokeWidth={2.5} className="text-red-text" />}
                    {!future && !failed && !hollow && <span className={cx("absolute inset-[2px] rounded-full", TONE_BG[tone])} />}
                  </motion.span>
                </span>
                <div
                  onClick={() => {
                    setPlaying(false);
                    setCursor(i);
                  }}
                  className={cx(
                    "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-panel border px-3 py-2.5 text-start transition-colors duration-150",
                    isCurrent ? "border-sage/25 bg-sage/[0.05]" : "border-transparent hover:bg-raised",
                  )}
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <ActorTag actor={s.actor_type} />
                    <span className="truncate text-sm font-medium text-text">{STEP_LABEL[s.step] ?? s.step}</span>
                    <StatusTag status={s.status} />
                    <span className="num ms-auto text-2xs text-muted">{duration(s.duration_ms)}</span>
                  </span>
                  {s.summary && <span className="text-xs text-muted">{s.summary}</span>}
                  {s.service_calls.length > 0 && (
                    <ServiceCalls calls={s.service_calls} baseDelay={i * STAGGER.timelineStep} motionOK={motionOK} renderRecords={renderRecords} />
                  )}
                  {s.service_calls.length === 0 && s.record_ids.length > 0 && <span>{renderRecords(s.record_ids)}</span>}
                  <span className="flex items-center gap-2 text-2xs text-muted">
                    <span className="num">{s.audit_id}</span>
                    <Timestamp iso={s.ts} />
                  </span>
                </div>
              </motion.li>
            </Fragment>
          );
        })}
      </ol>
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
    <span className="flex flex-col gap-0.5 rounded-control border border-hairline/70 bg-raised px-2.5 py-1.5">
      {calls.map((c, i) => (
        <motion.span
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
          <span aria-hidden className="h-1 overflow-hidden rounded-full bg-hairline">
            <motion.span className={cx("block h-full rounded-full", c.ok ? "bg-sage" : "bg-red")}
              initial={motionOK ? { width: 0 } : false}
              animate={{ width: `${Math.max(4, (c.duration_ms / max) * 100)}%` }}
              transition={{ duration: 0.24, ease: EASE.out, delay: baseDelay + 0.1 }} />
          </span>
          <span className="num text-end text-2xs text-muted">{duration(c.duration_ms)}</span>
        </motion.span>
      ))}
    </span>
  );
}
