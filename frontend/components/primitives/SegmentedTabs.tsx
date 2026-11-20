"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { SPRING } from "@/lib/motion";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

/**
 * Segmented control whose indicator slides between options (shared layoutId). Arrow keys move.
 * `underline` draws page-level tabs: a 2px teal bar under the active option instead of a boxed segment.
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  variant = "segment",
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  variant?: "segment" | "underline";
  label: string;
  className?: string;
}) {
  const underline = variant === "underline";
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);

  function onKey(e: KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = (e.key === "ArrowRight") !== (document.dir === "rtl") ? 1 : -1;
    const i = enabled.findIndex((o) => o.value === value);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey}
      className={cx(
        underline ? "flex gap-5 border-b border-hairline" : "inline-flex gap-0.5 rounded-control border border-hairline bg-bg/70 p-0.5",
        className,
      )}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative inline-flex items-center gap-1.5",
              underline ? "-mb-px h-9 px-0.5 text-sm font-medium" : cx("press rounded-xs", size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-sm"),
              active ? "text-text" : "text-muted hover:text-text",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${uid}`}
                transition={SPRING.ui}
                aria-hidden
                className={underline
                  ? "absolute inset-x-0 bottom-0 h-0.5 bg-sage"
                  : "absolute inset-0 -z-0 rounded-xs border border-hairline-strong bg-raised shadow-sheen"}
              />
            )}
            <span className="relative">{o.label}</span>
            {o.count !== undefined && <span className="num relative text-2xs text-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
