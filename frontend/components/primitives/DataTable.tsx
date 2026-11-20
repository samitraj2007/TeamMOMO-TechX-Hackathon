"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { TONE_BG, type Tone } from "@/lib/labels";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** CSS grid track, e.g. "120px" or "1fr". */
  width: string;
  align?: "start" | "end" | "center";
  mono?: boolean;
  render: (row: T) => ReactNode;
}

const ROW = 40;
const OVERSCAN = 8;

/**
 * Dense table with a sticky header, a left status bar per row and windowed rendering (fixed 40px rows),
 * so 1,000 rows stay cheap. Arrow keys move focus between rows; Enter activates.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowTone,
  onRowActivate,
  height = 480,
  label,
  empty,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowTone?: (row: T) => Tone | null;
  onRowActivate?: (row: T) => void;
  height?: number;
  label: string;
  empty?: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const template: CSSProperties = { gridTemplateColumns: columns.map((c) => c.width).join(" ") };

  const bodyHeight = height - ROW;
  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + bodyHeight) / ROW) + OVERSCAN);
  const visible = rows.slice(first, last);

  function onKey(e: KeyboardEvent<HTMLDivElement>, index: number, row: T) {
    if (e.key === "Enter" && onRowActivate) {
      e.preventDefault();
      onRowActivate(row);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = Math.max(0, Math.min(rows.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
    const el = scroller.current;
    if (!el) return;
    if (next * ROW < el.scrollTop) el.scrollTop = next * ROW;
    if ((next + 1) * ROW > el.scrollTop + bodyHeight) el.scrollTop = (next + 1) * ROW - bodyHeight;
    requestAnimationFrame(() => el.querySelector<HTMLElement>(`[data-row="${next}"]`)?.focus());
  }

  const align = (a?: Column<T>["align"]) => (a === "end" ? "justify-end text-end" : a === "center" ? "justify-center" : "");

  return (
    <div role="table" aria-label={label} aria-rowcount={rows.length + 1}
      className={cx("sheet flex flex-col overflow-hidden rounded-panel border border-hairline bg-surface", className)}>
      <div role="row" style={template}
        className="grid h-10 shrink-0 items-center border-b border-hairline ps-4 pe-3">
        {columns.map((c) => (
          <div key={c.key} role="columnheader"
            className={cx("flex min-w-0 px-1.5 text-xs font-medium text-muted", align(c.align))}>
            {c.header}
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="p-3">{empty}</div>
      ) : (
        <div ref={scroller} style={{ height: bodyHeight }} className="relative overflow-y-auto"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: rows.length * ROW }} className="relative">
            {visible.map((row, i) => {
              const index = first + i;
              const tone = rowTone?.(row);
              return (
                <div
                  key={rowKey(row)}
                  role="row"
                  aria-rowindex={index + 2}
                  data-row={index}
                  tabIndex={onRowActivate ? (index === 0 ? 0 : -1) : undefined}
                  onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                  onKeyDown={(e) => onKey(e, index, row)}
                  style={{ ...template, top: index * ROW, height: ROW }}
                  className={cx(
                    "absolute inset-x-0 grid items-center border-b border-hairline/60 ps-4 pe-3 text-sm outline-none transition-colors duration-150",
                    onRowActivate && "cursor-pointer hover:bg-raised focus-visible:bg-raised focus-visible:outline-offset-[-2px]",
                  )}
                >
                  {tone && <span aria-hidden className={cx("absolute inset-y-2.5 start-1.5 w-[3px] rounded-full", TONE_BG[tone])} />}
                  {columns.map((c) => (
                    <div key={c.key} role="cell"
                      className={cx("flex min-w-0 items-center truncate px-1.5", c.mono && "num", align(c.align))}>
                      {c.render(row)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
