"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

/** Square segmented control; arrow keys move between segments. */
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
      className={cx("inline-flex border border-hairline bg-bg", className)}>
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
              "relative inline-flex items-center gap-1.5 border-e border-hairline last:border-e-0 transition-colors duration-[120ms]",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-sm",
              active ? "bg-raised text-text" : "text-muted hover:text-text",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="num text-2xs text-muted">{o.count}</span>}
            {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-sage" />}
          </button>
        );
      })}
    </div>
  );
}
