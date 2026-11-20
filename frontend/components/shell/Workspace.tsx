"use client";

import { Reorder, useDragControls } from "motion/react";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { SPRING } from "@/lib/motion";

export interface WorkspacePane {
  id: string;
  title: ReactNode;
  content: ReactNode;
  /** Minimum width in px. */
  minWidth?: number;
  actions?: ReactNode;
}

const GAP = 12;

/**
 * Horizontal workspace: drag a pane's header grip to reorder, drag the divider (or focus it and use arrow keys) to resize.
 * Sizes are fractions of the row and always sum to 1.
 */
export function Workspace({ panes, initial, className }: { panes: WorkspacePane[]; initial?: Record<string, number>; className?: string }) {
  const row = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState(() => panes.map((p) => p.id));
  const [sizes, setSizes] = useState<Record<string, number>>(() => initial ?? Object.fromEntries(panes.map((p) => [p.id, 1 / panes.length])));
  const [resizing, setResizing] = useState(false);
  const byId = Object.fromEntries(panes.map((p) => [p.id, p]));

  function resize(left: string, right: string, deltaFrac: number, base: Record<string, number>) {
    const width = (row.current?.clientWidth ?? 1000) - GAP * (order.length - 1);
    const minL = (byId[left].minWidth ?? 200) / width;
    const minR = (byId[right].minWidth ?? 200) / width;
    const total = base[left] + base[right];
    const l = Math.min(total - minR, Math.max(minL, base[left] + deltaFrac));
    setSizes({ ...base, [left]: l, [right]: total - l });
  }

  function startDrag(e: PointerEvent<HTMLDivElement>, left: string, right: string) {
    e.preventDefault();
    const startX = e.clientX;
    const base = sizes;
    const width = (row.current?.clientWidth ?? 1000) - GAP * (order.length - 1);
    const dir = document.dir === "rtl" ? -1 : 1;
    setResizing(true);
    const move = (ev: globalThis.PointerEvent) => resize(left, right, (dir * (ev.clientX - startX)) / width, base);
    const up = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onKey(e: KeyboardEvent, left: string, right: string) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    resize(left, right, e.key === "ArrowRight" ? 0.02 : -0.02, sizes);
  }

  return (
    <Reorder.Group as="div" axis="x" values={order} onReorder={setOrder} ref={row}
      className={cx("flex h-full min-h-0", className)} style={{ gap: GAP }}>
      {order.map((id, i) => (
        <PaneItem key={id} pane={byId[id]} size={sizes[id]} resizing={resizing}
          divider={i < order.length - 1 ? { onPointerDown: (e) => startDrag(e, id, order[i + 1]), onKeyDown: (e) => onKey(e, id, order[i + 1]), value: sizes[id] } : null} />
      ))}
    </Reorder.Group>
  );
}

function PaneItem({
  pane,
  size,
  resizing,
  divider,
}: {
  pane: WorkspacePane;
  size: number;
  resizing: boolean;
  divider: { onPointerDown: (e: PointerEvent<HTMLDivElement>) => void; onKeyDown: (e: KeyboardEvent) => void; value: number } | null;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={pane.id}
      dragListener={false}
      dragControls={controls}
      transition={resizing ? { duration: 0 } : SPRING.soft}
      whileDrag={{ scale: 1.01, zIndex: 5 }}
      style={{ flexBasis: `calc(${size * 100}% - ${GAP}px)`, flexGrow: 1, flexShrink: 1 }}
      className="relative flex min-w-0"
    >
      <section className="sheet flex min-w-0 flex-1 flex-col overflow-hidden rounded-panel border border-hairline bg-surface">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-hairline/80 px-2">
          <div
            role="button"
            tabIndex={-1}
            aria-label="Drag to reorder pane"
            onPointerDown={(e) => controls.start(e)}
            className="press flex h-7 cursor-grab touch-none items-center gap-2 rounded-control px-1.5 text-muted hover:bg-raised hover:text-text active:cursor-grabbing"
          >
            <GripIcon />
            <span className="text-xs font-medium">{pane.title}</span>
          </div>
          {pane.actions && <div className="ms-auto flex items-center gap-1">{pane.actions}</div>}
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{pane.content}</div>
      </section>
      {divider && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          aria-valuenow={Math.round(divider.value * 100)}
          tabIndex={0}
          onPointerDown={divider.onPointerDown}
          onKeyDown={divider.onKeyDown}
          className="group absolute -end-[10px] inset-y-6 z-10 flex w-2 cursor-col-resize touch-none justify-center rounded-control outline-none"
        >
          <span className="h-full w-px bg-hairline transition-colors duration-150 group-hover:bg-brass/70 group-focus-visible:bg-brass group-active:bg-brass" />
        </div>
      )}
    </Reorder.Item>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden fill="currentColor">
      {[2, 7, 12].flatMap((y) => [<rect key={`a${y}`} x="1" y={y - 1} width="2" height="2" rx="0.5" />, <rect key={`b${y}`} x="6" y={y - 1} width="2" height="2" rx="0.5" />])}
    </svg>
  );
}
