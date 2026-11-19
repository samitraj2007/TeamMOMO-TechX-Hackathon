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
    <dl className={cx("grid grid-cols-[136px_1fr] border-t border-hairline", className)}>
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <dt className="border-b border-hairline py-1.5 pe-3 text-xs text-muted">{r.key}</dt>
          <dd className={cx("min-w-0 border-b border-hairline py-1.5 text-sm text-text", r.mono && "num")}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
