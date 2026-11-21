"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { CountUp } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { useMotionOK } from "@/lib/motion";
import type { FeedEvent, FeedStatus } from "@/lib/types";

/**
 * The sorting floor: every alert the bank sends is a token that passes the code screen and lands in its lane.
 * Tokens are spawned only for alerts the API actually reported (diffed by alert_id between polls); counts come
 * straight from the status, so the picture never claims more than the backend did.
 */

type Bin = "gate" | "review" | "ai" | "clear" | "human";
const BINS: { id: Bin; label: string; hint: string; bg: string; text: string }[] = [
  { id: "gate", label: "Officer gate", hint: "Code · over threshold or watchlist", bg: "bg-red", text: "text-red-text" },
  { id: "review", label: "Review", hint: "Code · injection, device, velocity, currency", bg: "bg-amber", text: "text-amber" },
  { id: "ai", label: "AI lane queue", hint: "Waiting for the full pipeline · not cleared", bg: "bg-model", text: "text-model" },
  { id: "clear", label: "Auto-cleared", hint: "Only after the full pipeline", bg: "bg-sage", text: "text-sage" },
  { id: "human", label: "To a person", hint: "Full pipeline asked for a human", bg: "bg-text/70", text: "text-text" },
];

const MAX_TOKENS = 24;
const POLL_MS = 1500;
const FLY_S = 1.35;
const HOP_S = 0.75;

interface Token {
  key: string;
  from: "src" | "ai";
  to: Bin;
  /** Extra wait before release, so a hop follows its own arrival. */
  after?: number;
}
type Points = Record<"src" | "scan" | Bin, { x: number; y: number }>;

function binFor(e: FeedEvent): Bin {
  if (e.lane === "gate") return "gate";
  if (e.lane === "review") return "review";
  if (e.ai_status === "done") return e.route === "AUTO_CLEAR" ? "clear" : "human";
  return "ai";
}

export function SortingFloor({ st }: { st: FeedStatus }) {
  const motionOK = useMotionOK();
  const box = useRef<HTMLDivElement>(null);
  const [pts, setPts] = useState<Points | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [pops, setPops] = useState<Record<Bin, number>>({ gate: 0, review: 0, ai: 0, clear: 0, human: 0 });
  const [alarm, setAlarm] = useState(false);
  const seen = useRef<Map<string, string | null> | null>(null);
  const timers = useRef<number[]>([]);

  // Measure anchor centres relative to the floor, on mount and on resize.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const out = {} as Points;
      for (const k of ["src", "scan", ...BINS.map((x) => x.id)] as (keyof Points)[]) {
        const a = el.querySelector<HTMLElement>(`[data-anchor="${k}"]`);
        if (!a) return;
        const r = a.getBoundingClientRect();
        out[k] = { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
      }
      setPts(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Diff each poll against what we have already shown, and release new tokens spread across the poll interval.
  useEffect(() => {
    const prev = seen.current;
    const next = new Map(st.events.map((e) => [e.alert_id, e.ai_status] as const));
    seen.current = next;
    if (!prev || !motionOK || document.visibilityState === "hidden") return; // first load: show state, don't replay it
    const fresh: Token[] = [];
    for (const e of [...st.events].reverse()) {
      if (!prev.has(e.alert_id)) {
        fresh.push({ key: `in-${e.alert_id}`, from: "src", to: e.lane });
        if (e.lane === "ai" && e.ai_status === "done") fresh.push({ key: `hop-${e.alert_id}`, from: "ai", to: binFor(e), after: FLY_S * 1000 });
      } else if (prev.get(e.alert_id) === "queued" && e.ai_status === "done") {
        fresh.push({ key: `hop-${e.alert_id}`, from: "ai", to: binFor(e) });
      }
    }
    if (!fresh.length) return;
    const gap = POLL_MS / Math.max(1, fresh.length);
    fresh.forEach((t, i) => {
      const id = window.setTimeout(() => {
        setTokens((cur) => (cur.length >= MAX_TOKENS ? cur : [...cur, t]));
      }, i * gap + (t.after ?? 0));
      timers.current.push(id);
    });
  }, [st.events, motionOK]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const land = useCallback((t: Token) => {
    setTokens((cur) => cur.filter((x) => x.key !== t.key));
    setPops((p) => ({ ...p, [t.to]: p[t.to] + 1 }));
    if (t.to === "gate") {
      setAlarm(true);
      timers.current.push(window.setTimeout(() => setAlarm(false), 900));
    }
  }, []);

  const running = st.state === "running";
  const mascot: MascotState = alarm ? "alert" : running || st.state === "draining" ? "scanning" : st.state === "finished" ? "approved" : "idle";
  const counts: Record<Bin, number> = {
    gate: st.lanes.gate,
    review: st.lanes.review,
    ai: st.ai_queue + st.ai_failed,
    clear: st.ai_done.AUTO_CLEAR,
    human: st.ai_done.NEEDS_REVIEW + st.ai_done.PENDING_APPROVAL,
  };
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div ref={box} className="relative isolate overflow-hidden rounded-sheet border border-hairline bg-surface p-4 shadow-card sm:p-5">
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.6fr)] items-center gap-3 sm:gap-5">
        {/* Source: the bank */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span data-anchor="src" className="relative grid h-11 w-11 place-items-center rounded-full border border-hairline-strong bg-raised">
            {running && motionOK && <span aria-hidden className="ping absolute inset-0 rounded-full border border-sage/50" />}
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 text-text" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 10 12 4l9 6M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3 20h18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-xs font-medium text-text">Bank feed</span>
          <span className="num text-2xs text-muted">{st.received}/{st.config?.total ?? 0} sent</span>
        </div>

        {/* The code screen */}
        <div className="relative flex flex-col items-center gap-2">
          <span data-anchor="scan"
            className={cx("relative grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-[18px] border bg-raised transition-colors duration-300",
              alarm ? "border-red/60" : running ? "border-sage/50" : "border-hairline-strong")}>
            <Mascot state={mascot} size={40} />
            {(running || st.state === "draining") && motionOK && (
              <span aria-hidden className="scan-sweep absolute inset-x-1 top-1/2 h-[2px] rounded-full bg-sage/70 shadow-[0_0_12px_2px] shadow-sage/40" />
            )}
          </span>
          <span className="text-xs font-medium text-text">Code screen</span>
          <span className="text-center text-2xs text-muted">Every alert, before any model</span>
        </div>

        {/* Lanes */}
        <ul className="flex flex-col gap-2">
          {BINS.map((b) => (
            <li key={b.id} className={cx("flex items-center gap-2.5", (b.id === "clear" || b.id === "human") && "ps-4")} title={b.hint}>
              <span data-anchor={b.id} className={cx("relative h-2.5 w-2.5 shrink-0 rounded-full", b.bg)}>
                <AnimatePresence>
                  {pops[b.id] > 0 && motionOK && (
                    <motion.span key={pops[b.id]} aria-hidden className={cx("absolute inset-0 rounded-full", b.bg)}
                      initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 3, opacity: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }} />
                  )}
                </AnimatePresence>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs text-text">{b.label}</span>
                  <motion.span key={pops[b.id]} initial={motionOK && pops[b.id] ? { scale: 1.3 } : false} animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 600, damping: 18 }} className={cx("num origin-right text-sm font-semibold", b.text)}>
                    <CountUp value={counts[b.id]} />
                  </motion.span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-hairline">
                  <div className={cx("h-full origin-left rounded-full transition-transform duration-500 ease-out", b.bg)}
                    style={{ transform: `scaleX(${counts[b.id] / max})` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Wires: bank → screen → each lane, AI lane → its outcomes. */}
      {pts && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full">
          {wires(pts).map((d, i) => (
            <path key={i} d={d} fill="none" stroke="var(--color-hairline-strong)" strokeWidth="1.25" strokeLinecap="round"
              strokeDasharray={running && motionOK ? undefined : "3 5"} className={cx(running && motionOK && "wire-live")} />
          ))}
        </svg>
      )}

      {/* Tokens in flight */}
      {motionOK && pts && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {tokens.map((t) => <TokenDot key={t.key} t={t} pts={pts} onLand={land} />)}
        </div>
      )}
    </div>
  );
}

function wires(p: Points): string[] {
  const out = [`M${p.src.x + 24} ${p.src.y} L${p.scan.x - 32} ${p.scan.y}`];
  for (const b of ["gate", "review", "ai"] as const) {
    const t = p[b];
    const mx = (p.scan.x + 32 + t.x) / 2;
    out.push(`M${p.scan.x + 32} ${p.scan.y} C${mx} ${p.scan.y} ${mx} ${t.y} ${t.x - 8} ${t.y}`);
  }
  for (const b of ["clear", "human"] as const) {
    const t = p[b];
    out.push(`M${p.ai.x} ${p.ai.y + 6} L${p.ai.x} ${t.y} L${t.x - 7} ${t.y}`);
  }
  return out;
}

const TOKEN_BG: Record<Bin, string> = { gate: "bg-red", review: "bg-amber", ai: "bg-model", clear: "bg-sage", human: "bg-text/70" };

function TokenDot({ t, pts, onLand }: { t: Token; pts: Points; onLand: (t: Token) => void }) {
  const end = pts[t.to];
  const r = 5;
  if (t.from === "ai") {
    const a = pts.ai;
    return (
      <motion.span className={cx("absolute start-0 top-0 h-2.5 w-2.5 rounded-full", TOKEN_BG[t.to])}
        initial={{ x: a.x - r, y: a.y - r, scale: 0.6, opacity: 0 }}
        animate={{ x: [a.x - r, a.x - r - 14, end.x - r], y: [a.y - r, (a.y + end.y) / 2 - r, end.y - r], scale: [0.6, 1.15, 0.8], opacity: [0, 1, 1] }}
        transition={{ duration: HOP_S, ease: "easeInOut" }}
        onAnimationComplete={() => onLand(t)} />
    );
  }
  const s = pts.src;
  const c = pts.scan;
  return (
    <motion.span className="absolute start-0 top-0 h-2.5 w-2.5"
      initial={{ x: s.x - r, y: s.y - r, opacity: 0, scale: 0.5 }}
      animate={{
        x: [s.x - r, c.x - r, c.x - r, end.x - r],
        y: [s.y - r, c.y - r, c.y - r, end.y - r],
        opacity: [0, 1, 1, 1],
        scale: [0.5, 1, 1.35, 0.85],
      }}
      transition={{ duration: FLY_S, times: [0, 0.4, 0.55, 1], ease: ["easeOut", "linear", "easeIn"] }}
      onAnimationComplete={() => onLand(t)}>
      {/* Lane colour under a neutral shell that dissolves at the scanner. */}
      <span className={cx("absolute inset-0 rounded-full", TOKEN_BG[t.to])} />
      <motion.span className="absolute inset-0 rounded-full bg-muted"
        initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} transition={{ duration: FLY_S, times: [0, 0.45, 0.55] }} />
    </motion.span>
  );
}
