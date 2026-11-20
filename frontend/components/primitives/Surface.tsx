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
    <header className={cx("flex min-h-10 shrink-0 items-center gap-2 border-b border-hairline/80 px-4", className)}>
      {eyebrow}
      <h2 className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{title}</h2>
      {actions && <div className="ms-auto flex items-center gap-1">{actions}</div>}
    </header>
  );
}

/** Soft blurred glow placed behind an active element. */
export function GlowBehind({ tone, className }: { tone: Glow; className?: string }) {
  return <span aria-hidden className={cx("pointer-events-none absolute -inset-4 -z-10", `glow-${tone}`, className)} />;
}

/** Two tinted sheets peeking out below a key card. */
export function StackedSheets() {
  return (
    <>
      <span aria-hidden className="absolute inset-x-3 -bottom-[7px] top-3 -z-10 rounded-panel border border-hairline bg-surface/90" />
      <span aria-hidden className="absolute inset-x-6 -bottom-[14px] top-6 -z-20 rounded-panel border border-hairline/70 bg-bg/90" />
    </>
  );
}

/** A panel: 6px radius, hairline, tint plus top-edge highlight. Optional glow and stacked-sheet depth. */
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
  return (
    <section className={cx("relative isolate flex min-w-0 flex-col", stacked && "mb-3.5", className)}>
      {glow && <GlowBehind tone={glow} />}
      {stacked && <StackedSheets />}
      <div className={cx("sheet relative flex min-h-0 flex-1 flex-col rounded-panel border border-hairline", TINT[tint])}>
        {title !== undefined && <PanelHeader title={title} eyebrow={eyebrow} actions={actions} />}
        <div className={cx("min-h-0 flex-1", padded && "p-4", bodyClassName)}>{children}</div>
      </div>
    </section>
  );
}

/** KPI-style tile: label, a large value and a footnote, with an optional accent mark. */
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
    <div className={cx("sheet relative flex min-w-0 flex-col gap-1 rounded-panel border border-hairline px-4 py-3", TINT[tint], className)}>
      {tone && <span aria-hidden className={cx("absolute bottom-3 start-0 top-3 w-0.5 rounded-e-sm", TONE_BG[tone])} />}
      <span className="text-2xs font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className="num text-lg font-medium text-text">{value}</span>
      {foot && <span className="text-xs text-muted">{foot}</span>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-hairline", className)} />;
}
