"use client";

import { animate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconCopy } from "@/components/icons";
import { cx } from "@/lib/cx";
import { amount, shortHash, timestamp } from "@/lib/format";
import { DUR, EASE, useMotionOK } from "@/lib/motion";

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("num", className)}>{children}</span>;
}

export function Amount({ value, currency = "AED", className }: { value: number; currency?: string; className?: string }) {
  return (
    <span className={cx("num whitespace-nowrap", className)}>
      {amount(value)} <span className="text-muted">{currency}</span>
    </span>
  );
}

export function Timestamp({ iso, className }: { iso: string | null | undefined; className?: string }) {
  return (
    <time dateTime={iso ?? undefined} className={cx("num whitespace-nowrap text-muted", className)} title="Gulf Standard Time (UTC+4)">
      {timestamp(iso)}
    </time>
  );
}

/** Shortened hash; click copies the full value. */
export function Hash({ value, head = 8, tail = 4, className }: { value: string; head?: number; tail?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={value}
      aria-label={`Copy hash ${value}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className={cx("num inline-flex items-center gap-1 text-muted hover:text-text", className)}
    >
      {shortHash(value, head, tail)}
      {copied ? <IconCheck size={12} className="text-sage" /> : <IconCopy size={12} />}
    </button>
  );
}

/** Counts from 0 to `value` once per mount (600 ms, ease-out). Reduced motion shows the value directly. */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const motionOK = useMotionOK();
  const [animated, setShown] = useState(0);
  const from = useRef(0);
  const shown = motionOK ? animated : value;

  useEffect(() => {
    if (!motionOK) return;
    const controls = animate(from.current, value, {
      duration: DUR.count,
      ease: EASE.out,
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, motionOK]);

  return <span className={cx("num", className)}>{format(shown)}</span>;
}
