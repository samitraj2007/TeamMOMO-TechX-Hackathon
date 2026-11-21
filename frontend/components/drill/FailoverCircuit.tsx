"use client";

import { motion } from "motion/react";
import { cx } from "@/lib/cx";
import { ROUTE_LABEL } from "@/lib/labels";
import { useMotionOK } from "@/lib/motion";
import type { CaseRun, FaultMode, Route } from "@/lib/types";

/**
 * Failover circuit: case → main model → (backup model) → code verifier → route.
 * While a drill runs it follows the armed failure and the real elapsed time (the same stages RunStatus prints);
 * once the result arrives it is redrawn from the actual provider attempts, so the picture always ends on the truth.
 */

type NodeState = "idle" | "active" | "ok" | "fail" | "off";
type WireState = "off" | "live" | "ok" | "fail";
type WireId = "caseMain" | "mainVerify" | "mainBackup" | "backupVerify" | "verifyRoute" | "failClosed";

interface NodeView {
  s: NodeState;
  sub: string;
  /** 0..1 of the time limit, for the countdown ring. */
  p?: number;
  injected?: boolean;
}
export interface CircuitView {
  main: NodeView;
  backup: NodeView;
  verify: NodeView;
  wires: Record<WireId, WireState>;
  route: Route | null;
  closing: boolean;
}

const RATE_HIT_S = 0.4;
const W: Record<WireId, string> = {
  caseMain: "M86 74 H174",
  mainVerify: "M226 74 H398",
  mainBackup: "M200 104 C200 132 312 112 312 140",
  backupVerify: "M338 166 C384 166 424 146 424 100",
  verifyRoute: "M450 74 H520",
  failClosed: "M312 192 V204 H580 V96",
};

const offWires = (): Record<WireId, WireState> =>
  ({ caseMain: "off", mainVerify: "off", mainBackup: "off", backupVerify: "off", verifyRoute: "off", failClosed: "off" });

/** What the drill should look like `t` seconds into the run, from the armed settings. */
export function predictCircuit(t: number, o: { failure: FaultMode | "none"; scope: "main" | "all"; delay: number; limit: number; hasBackup: boolean }): CircuitView {
  const { failure, scope, delay, limit, hasBackup } = o;
  const wires = offWires();
  wires.caseMain = "live";
  const mainFailAt = failure === "timeout" ? limit : failure === "rate_limited" ? RATE_HIT_S : null;
  const main: NodeView =
    mainFailAt !== null && t >= mainFailAt
      ? { s: "fail", sub: failure === "timeout" ? `timeout · ${limit.toFixed(0)} s` : "429 rate-limited", p: failure === "timeout" ? 1 : 0, injected: true }
      : { s: "active", sub: failure === "slow" ? `slowed ${delay} s · ${Math.floor(t)} s` : `thinking · ${Math.floor(t)} s`, p: Math.min(1, t / limit), injected: failure !== "none" };
  let backup: NodeView = { s: "idle", sub: hasBackup ? "standing by" : "not configured" };
  let closing = false;
  if (main.s === "fail") {
    wires.caseMain = "ok";
    wires.mainBackup = "fail";
    const bt = t - (mainFailAt ?? 0);
    const backupFailAt = scope === "all" ? (failure === "timeout" ? limit : RATE_HIT_S) : null;
    if (!hasBackup) {
      backup = { s: "fail", sub: "not configured" };
      closing = true;
    } else if (backupFailAt !== null && bt >= backupFailAt) {
      backup = { s: "fail", sub: failure === "timeout" ? `timeout · ${limit.toFixed(0)} s` : "429 rate-limited", p: failure === "timeout" ? 1 : 0, injected: true };
      closing = true;
    } else {
      backup = { s: "active", sub: `taking over · ${Math.floor(bt)} s`, p: Math.min(1, bt / limit), injected: scope === "all" };
    }
    if (closing) wires.failClosed = "live";
  }
  return { main, backup, verify: { s: "idle", sub: "citations, policy" }, wires, route: null, closing };
}

/** The circuit as it actually happened, from the investigator's provider attempts. */
export function actualCircuit(run: CaseRun): CircuitView {
  const inv = run.investigator;
  const wires = offWires();
  wires.caseMain = "ok";
  const label = (a: CaseRun["investigator"]["attempts"][number]) =>
    a.status === "not_configured" ? "not configured" : `${a.status.replace("_", " ")} · ${(a.duration_ms / 1000).toFixed(1)} s`;
  const mainA = inv.attempts.find((a) => a.provider === "main") ?? inv.attempts[0];
  const backA = inv.attempts.find((a) => a !== mainA);
  const answered = inv.status === "ok" || inv.status === "citation_invalid";
  const verify: NodeView = answered
    ? { s: inv.status === "ok" ? "ok" : "fail", sub: inv.status === "ok" ? "checked" : "citations rejected" }
    : { s: "off", sub: "bypassed" };

  let main: NodeView;
  let backup: NodeView = { s: "off", sub: "not needed" };
  if (inv.cached || !mainA) {
    main = { s: answered ? "ok" : "fail", sub: inv.cached ? "cache hit" : inv.status.replace("_", " ") };
  } else {
    main = { s: mainA.status === "ok" ? "ok" : "fail", sub: label(mainA), injected: mainA.injected, p: mainA.status === "timeout" ? 1 : undefined };
    if (backA) backup = { s: backA.status === "ok" ? "ok" : "fail", sub: label(backA), injected: backA.injected, p: backA.status === "timeout" ? 1 : undefined };
  }
  if (main.s === "ok") {
    wires.mainVerify = "ok";
  } else {
    wires.mainBackup = "fail";
    if (backup.s === "ok") wires.backupVerify = "ok";
  }
  if (answered) wires.verifyRoute = verify.s === "ok" ? "ok" : "fail";
  else wires.failClosed = "fail";
  return { main, backup, verify, wires, route: run.decision.route, closing: !answered };
}

const NODE_STROKE: Record<NodeState, string> = {
  idle: "var(--color-hairline-strong)",
  active: "var(--color-model)",
  ok: "var(--color-sage)",
  fail: "var(--color-amber)",
  off: "var(--color-hairline)",
};
const WIRE_STROKE: Record<WireState, string> = {
  off: "var(--color-hairline-strong)",
  live: "var(--color-model)",
  ok: "var(--color-sage)",
  fail: "var(--color-amber)",
};
const ROUTE_FILL: Record<Route, string> = { AUTO_CLEAR: "var(--color-sage)", NEEDS_REVIEW: "var(--color-amber)", PENDING_APPROVAL: "var(--color-red)" };

export function FailoverCircuit({ view, caseLabel, className }: { view: CircuitView; caseLabel: string; className?: string }) {
  const motionOK = useMotionOK();
  return (
    <div className={cx("overflow-x-auto", className)}>
      <svg viewBox="0 0 648 222" className="h-auto w-full min-w-[440px]" role="img"
        aria-label={`Main model ${view.main.sub}; backup ${view.backup.sub}; verifier ${view.verify.sub}${view.route ? `; route ${ROUTE_LABEL[view.route]}` : ""}`}>
        {/* wires */}
        {(Object.keys(W) as WireId[]).map((id) => {
          const s = view.wires[id];
          return (
            <g key={id}>
              <path d={W[id]} fill="none" stroke={WIRE_STROKE[s]} strokeWidth={s === "off" ? 1.25 : 2} strokeLinecap="round"
                strokeDasharray={s === "off" ? "3 5" : undefined} className={cx(s === "live" && motionOK && "wire-live")}
                style={{ transition: "stroke 300ms ease-out" }} />
              {s === "live" && motionOK && (
                <circle r="4" fill="var(--color-model)">
                  <animateMotion dur={id === "failClosed" ? "1.4s" : "0.9s"} repeatCount="indefinite" path={W[id]} />
                </circle>
              )}
            </g>
          );
        })}
        {view.closing && (
          <text x="446" y="216" textAnchor="middle" className="fill-amber text-[11px]">fail closed: no model answered</text>
        )}

        {/* case */}
        <g transform="translate(46 74)">
          <rect x="-40" y="-20" width="80" height="40" rx="10" fill="var(--color-raised)" stroke="var(--color-hairline-strong)" />
          <text y="4" textAnchor="middle" className="fill-text text-[12px] font-medium">Case</text>
          <text y="44" textAnchor="middle" className="num fill-muted text-[11px]">{caseLabel}</text>
        </g>

        <Node x={200} y={74} title="Main model" v={view.main} motionOK={motionOK} />
        <Node x={312} y={166} title="Backup model" v={view.backup} motionOK={motionOK} below={false} />
        <Node x={424} y={74} title="Code verifier" v={view.verify} motionOK={motionOK} square />

        {/* route stamp */}
        <g transform="translate(580 74)">
          {view.route ? (
            <motion.g key={view.route} initial={motionOK ? { scale: 1.7, rotate: -14, opacity: 0 } : false}
              animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}>
              <rect x="-58" y="-22" width="116" height="44" rx="10" fill="none" stroke={ROUTE_FILL[view.route]} strokeWidth="2.5" />
              <rect x="-53" y="-17" width="106" height="34" rx="7" fill={ROUTE_FILL[view.route]} opacity="0.12" />
              <text y="5" textAnchor="middle" style={{ fill: ROUTE_FILL[view.route] }} className="text-[13px] font-semibold">{ROUTE_LABEL[view.route]}</text>
            </motion.g>
          ) : (
            <g>
              <rect x="-58" y="-22" width="116" height="44" rx="10" fill="none" stroke="var(--color-hairline-strong)" strokeDasharray="4 4" />
              <text y="5" textAnchor="middle" className={cx("fill-muted text-[12px]", motionOK && "blink")}>{view.closing ? "to review…" : "route…"}</text>
            </g>
          )}
          <text y="44" textAnchor="middle" className="fill-muted text-[11px]">decided by code</text>
        </g>
      </svg>
    </div>
  );
}

function Node({ x, y, title, v, motionOK, square = false, below = true }: {
  x: number; y: number; title: string; v: NodeView; motionOK: boolean; square?: boolean; below?: boolean;
}) {
  const C = 2 * Math.PI * 29;
  const stroke = NODE_STROKE[v.s];
  const shake = v.s === "fail" && motionOK;
  return (
    <g transform={`translate(${x} ${y})`} opacity={v.s === "off" ? 0.55 : 1}>
      <motion.g key={`${title}-${v.s}`} initial={shake ? { x: 0 } : false} animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.45 }}>
        {v.p !== undefined && (
          <>
            <circle r="29" fill="none" stroke="var(--color-hairline)" strokeWidth="3" />
            <circle r="29" fill="none" stroke={v.s === "fail" ? "var(--color-amber)" : "var(--color-model)"} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - v.p)} transform="rotate(-90)"
              style={{ transition: "stroke-dashoffset 260ms linear" }} />
          </>
        )}
        {square
          ? <rect x="-22" y="-22" width="44" height="44" rx="12" fill="var(--color-surface)" stroke={stroke} strokeWidth="2" style={{ transition: "stroke 300ms" }} />
          : <circle r="22" fill="var(--color-surface)" stroke={stroke} strokeWidth="2" style={{ transition: "stroke 300ms" }} />}
        <Glyph s={v.s} motionOK={motionOK} />
      </motion.g>
      <text x={below ? 0 : -36} y={below ? 48 : -2} textAnchor={below ? "middle" : "end"} className="fill-text text-[12px] font-medium">{title}</text>
      <text x={below ? 0 : -36} y={below ? 63 : 13} textAnchor={below ? "middle" : "end"} className="num fill-muted text-[11px]">
        {v.sub}{v.injected ? " · drill" : ""}
      </text>
    </g>
  );
}

function Glyph({ s, motionOK }: { s: NodeState; motionOK: boolean }) {
  if (s === "ok") {
    return (
      <motion.path d="M-8 0 L-2.5 6 L8.5 -6" fill="none" stroke="var(--color-sage)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        initial={motionOK ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} />
    );
  }
  if (s === "fail") {
    return <path d="M-6.5 -6.5 L6.5 6.5 M6.5 -6.5 L-6.5 6.5" stroke="var(--color-amber)" strokeWidth="3" strokeLinecap="round" />;
  }
  if (s === "active") {
    return (
      <g className={cx(motionOK && "spin")} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <path d="M0 -9 A9 9 0 0 1 9 0" fill="none" stroke="var(--color-model)" strokeWidth="3" strokeLinecap="round" />
        <circle r="9" fill="none" stroke="var(--color-model)" strokeOpacity="0.18" strokeWidth="3" />
      </g>
    );
  }
  return <circle r="3.5" fill="var(--color-hairline-strong)" />;
}
