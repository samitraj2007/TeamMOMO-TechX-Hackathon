"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cx } from "@/lib/cx";
import { SPRING, useMotionOK } from "@/lib/motion";

/** Quick picks on a track; the selected pill slides between options. A value not in the list highlights nothing. */
export function SegmentedPicks<T extends string | number>({
  values,
  value,
  onPick,
  format = String,
  disabled,
  label,
  className,
}: {
  values: readonly T[];
  value: T;
  onPick: (v: T) => void;
  format?: (v: T) => string;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const id = useId();
  const motionOK = useMotionOK();
  return (
    <div role="group" aria-label={label}
      className={cx("inline-flex max-w-full flex-wrap gap-0.5 rounded-full border border-hairline bg-bg p-0.5", disabled && "opacity-60", className)}>
      {values.map((v) => {
        const on = v === value;
        return (
          <button key={String(v)} type="button" disabled={disabled} aria-pressed={on} onClick={() => onPick(v)}
            className="press num relative h-7 rounded-full px-2.5 text-xs outline-offset-2 disabled:cursor-not-allowed">
            {on && (motionOK
              ? <motion.span layoutId={`pick-${id}`} transition={SPRING.ui} className="absolute inset-0 rounded-full bg-text shadow-sheen-strong" />
              : <span className="absolute inset-0 rounded-full bg-text" />)}
            <span className={cx("relative transition-colors duration-150", on ? "text-bg" : "text-muted hover:text-text")}>{format(v)}</span>
          </button>
        );
      })}
    </div>
  );
}
