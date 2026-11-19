import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { TONE_BG, type Tone } from "@/lib/labels";

export type Tint = "bg" | "surface" | "raised";
const TINT: Record<Tint, string> = { bg: "bg-bg", surface: "bg-surface", raised: "bg-raised" };

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
    <header className={cx("flex h-8 shrink-0 items-center gap-2 border-b border-hairline px-3", className)}>
      {eyebrow}
      <h2 className="truncate text-2xs font-medium uppercase tracking-[0.08em] text-muted">{title}</h2>
      {actions && <div className="ms-auto flex items-center gap-1">{actions}</div>}
    </header>
  );
}

/** A bento cell. Depth comes from tint, never from shadow. */
export function Panel({
  title,
  eyebrow,
  actions,
  tint = "surface",
  padded = true,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  tint?: Tint;
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("flex min-w-0 flex-col border border-hairline", TINT[tint], className)}>
      {title !== undefined && <PanelHeader title={title} eyebrow={eyebrow} actions={actions} />}
      <div className={cx("min-h-0 flex-1", padded && "p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** KPI-style tile: label, a large value and a footnote, with an optional left accent bar. */
export function Tile({
  label,
  value,
  foot,
  tone,
  tint = "surface",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  tone?: Tone;
  tint?: Tint;
  className?: string;
}) {
  return (
    <div className={cx("relative flex min-w-0 flex-col gap-1 border border-hairline px-3 py-2", TINT[tint], className)}>
      {tone && <span aria-hidden className={cx("absolute inset-y-0 start-0 w-0.5", TONE_BG[tone])} />}
      <span className="text-2xs font-medium uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="num text-lg font-medium text-text">{value}</span>
      {foot && <span className="text-xs text-muted">{foot}</span>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-hairline", className)} />;
}
