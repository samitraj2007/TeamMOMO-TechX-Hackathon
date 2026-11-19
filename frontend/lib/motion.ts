"use client";

import { useReducedMotion } from "motion/react";

/** Durations in seconds (Motion units). Mirrors docs/UI_PLAN.md "Motion spec". */
export const DUR = { fast: 0.12, base: 0.18, slow: 0.32, count: 0.6, pulse: 0.4 } as const;

export const EASE = {
  out: [0.2, 0, 0, 1] as [number, number, number, number],
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
  linear: "linear" as const,
};

/** Spring presets: `ui` for controls and indicators, `soft` for cards and panes, `snappy` for presses. */
export const SPRING = {
  ui: { type: "spring", stiffness: 520, damping: 40, mass: 0.6 },
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 0.8 },
  snappy: { type: "spring", stiffness: 700, damping: 35 },
} as const;

export const STAGGER = { timelineStep: 0.09, serviceCall: 0.04, factRow: 0.08 } as const;

/** Airlock phases in seconds at 1x speed; total 6.0 s. */
export const AIRLOCK = {
  enter: [0, 0.6],
  scan: [0.6, 2.4],
  cut: [2.4, 3.4],
  facts: [3.4, 4.6],
  gate: [4.6, 5.4],
  deliver: [5.4, 6.0],
  total: 6.0,
} as const;

export type AirlockPhase = Exclude<keyof typeof AIRLOCK, "total">;
export const AIRLOCK_PHASES: AirlockPhase[] = ["enter", "scan", "cut", "facts", "gate", "deliver"];

/** True when animation should run (the user has not asked for reduced motion). */
export function useMotionOK(): boolean {
  return !useReducedMotion();
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0..1 progress of `t` through [a, b]. */
export const progress = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));

/** Cubic-bezier ease-out approximation used for time-driven (scrubbable) animation. */
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
