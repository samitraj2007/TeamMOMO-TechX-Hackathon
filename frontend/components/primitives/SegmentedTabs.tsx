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

/** Segmented control whose indicator slides between options (shared layoutId). Arrow keys move. */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label: string;
  className?: string;
}) {
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
      className={cx("inline-flex gap-0.5 rounded-control border border-hairline bg-bg/70 p-0.5", className)}>
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
              "press relative inline-flex items-center gap-1.5 rounded-xs",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-sm",
              active ? "text-text" : "text-muted hover:text-text",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${uid}`}
                transition={SPRING.ui}
                aria-hidden
                className="absolute inset-0 -z-0 rounded-xs border border-hairline-strong bg-raised shadow-sheen"
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
