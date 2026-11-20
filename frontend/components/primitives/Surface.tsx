import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { TONE_BG, type Tone } from "@/lib/labels";

export type Tint = "bg" | "surface" | "raised" | "overlay";
const TINT: Record<Tint, string> = { bg: "bg-bg", surface: "bg-surface", raised: "bg-raised", overlay: "bg-overlay" };
export type Glow = "brass" | "sage" | "red";

export function PanelHeader({
  title,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex min-h-11 shrink-0 items-center gap-2 border-b border-hairline/70 px-4", className)}>
      {eyebrow}
      <h2 className="truncate text-sm font-semibold tracking-[-0.01em] text-text">{title}</h2>
      {actions && <div className="ms-auto flex items-center gap-1">{actions}</div>}
    </header>
  );
}

/** Kept for API compatibility. The system no longer draws coloured glows. */
export function GlowBehind({ tone, className }: { tone: Glow; className?: string }) {
  void tone;
  void className;
  return null;
}

/** Kept for API compatibility. Depth now comes from the card elevation. */
export function StackedSheets() {
  return null;
}

/** A card: 12px radius, hairline, soft resting elevation, an optional titled header. */
export function Panel({
  title,
  eyebrow,
  actions,
  tint = "surface",
  padded = true,
  stacked = false,
  glow,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  tint?: Tint;
  padded?: boolean;
  stacked?: boolean;
  glow?: Glow;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  void stacked;
  void glow;
  return (
    <section className={cx("relative isolate flex min-w-0 flex-col", className)}>
      <div className={cx("sheet relative flex min-h-0 flex-1 flex-col rounded-panel border border-hairline", TINT[tint])}>
        {title !== undefined && <PanelHeader title={title} eyebrow={eyebrow} actions={actions} />}
        <div className={cx("min-h-0 flex-1", padded && "p-4", bodyClassName)}>{children}</div>
      </div>
    </section>
  );
}

/**
 * Summary tile in the manner of a widget: a small labelled status, a large tabular value, a footnote.
 * With `onSelect` it becomes a toggle button (pressed state from `active`).
 */
export function Tile({
  label,
  value,
  foot,
  tone,
  tint = "surface",
  className,
  onSelect,
  active = false,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  tone?: Tone;
  tint?: Tint;
  className?: string;
  onSelect?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-xs font-medium text-muted">
        {tone && <span aria-hidden className={cx("h-2 w-2 rounded-full", TONE_BG[tone])} />}
        {label}
      </span>
      <span className="num text-[28px] font-semibold leading-9 tracking-[-0.02em] text-text">{value}</span>
      {foot ? <span className="text-xs text-muted">{foot}</span> : <span aria-hidden className="h-4" />}
    </>
  );
  const shell = cx(
    "relative flex min-w-0 flex-col gap-1 rounded-sheet border px-4 pb-3.5 pt-3.5 text-start",
    TINT[tint],
    active ? "border-sage/45 shadow-[0_0_0_3px_rgb(47_93_78/0.1)]" : "sheet border-hairline",
    className,
  );
  if (!onSelect) return <div className={shell}>{body}</div>;
  return (
    <button type="button" aria-pressed={active} onClick={onSelect} className={cx(shell, "press hover:border-hairline-strong")}>
      {body}
    </button>
  );
}

/** The top of every console page: a title, one line of context, optional actions on the trailing edge. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.03em] text-text">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-hairline", className)} />;
}
