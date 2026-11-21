import { cx } from "@/lib/cx";
import type { FeedKind } from "@/lib/types";

/** Kind colours, from the existing tokens. Shared by the mix editor, presets and the sorting floor. */
export const KIND_BG: Record<FeedKind, string> = {
  benign: "bg-sage",
  high_value: "bg-red",
  hostile_memo: "bg-amber",
  odd_device: "bg-model",
  foreign_currency: "bg-muted/45",
};

export interface MixPart {
  key: string;
  value: number;
  cls: string;
  label?: string;
}

/** A stacked share bar. Segments grow/shrink smoothly when the values change. */
export function MixBar({ parts, className, title }: { parts: MixPart[]; className?: string; title?: string }) {
  const sum = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className={cx("flex h-2 w-full gap-px overflow-hidden rounded-full bg-hairline", className)} title={title}
      role="img" aria-label={title ?? parts.map((p) => `${p.label ?? p.key} ${sum ? Math.round((p.value / sum) * 100) : 0}%`).join(", ")}>
      {parts.map((p) => (
        <span key={p.key} className={cx("h-full min-w-0 transition-[flex-grow] duration-500 ease-out", p.cls)}
          style={{ flexGrow: sum ? p.value : 0, flexBasis: 0 }} />
      ))}
    </div>
  );
}
