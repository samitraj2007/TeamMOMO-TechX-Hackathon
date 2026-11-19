import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface Property {
  key: string;
  value: ReactNode;
  mono?: boolean;
}

/** Frontmatter-style key/value block, as at the top of an Obsidian note. */
export function PropertiesTable({ rows, className }: { rows: Property[]; className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[136px_1fr] rounded-panel border border-hairline/80 bg-bg/40 px-3 py-1", className)}>
      {rows.map((r, i) => (
        <div key={r.key} className="contents">
          <dt className={cx("py-1.5 pe-3 text-xs text-muted", i < rows.length - 1 && "border-b border-hairline/60")}>{r.key}</dt>
          <dd className={cx("min-w-0 py-1.5 text-sm text-text", r.mono && "num", i < rows.length - 1 && "border-b border-hairline/60")}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
