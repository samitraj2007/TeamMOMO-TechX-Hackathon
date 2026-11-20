import type { ReactNode } from "react";
import { IconAlert, IconCheck, IconClose, IconLock } from "@/components/icons";
import { cx } from "@/lib/cx";
import {
  ACTOR_LABEL,
  ROUTE_LABEL,
  ROUTE_TONE,
  STATUS_TONE,
  TONE_BG,
  TONE_BORDER,
  TONE_TEXT,
  TONE_TINT,
  type ActorType,
  type Tone,
} from "@/lib/labels";
import type { Route } from "@/lib/types";

export type TagVariant = "outline" | "tint" | "solid" | "dashed" | "ink";

/** Square tag. Never a pill. */
export function Tag({
  tone = "neutral",
  variant = "outline",
  mono = false,
  className,
  title,
  children,
}: {
  tone?: Tone;
  variant?: TagVariant;
  mono?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-control border px-1.5 text-2xs font-medium uppercase tracking-[0.06em]",
        mono && "num normal-case tracking-normal",
        variant === "solid" && cx(TONE_BG[tone], TONE_BORDER[tone], "text-bg"),
        variant === "outline" && cx(TONE_BORDER[tone], TONE_TEXT[tone]),
        variant === "dashed" && cx(TONE_BORDER[tone], TONE_TEXT[tone], "border-dashed"),
        variant === "tint" && cx(TONE_TINT[tone], TONE_TEXT[tone], "border-transparent"),
        variant === "ink" && "border-text bg-text text-bg",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** CODE solid ink, MODEL outlined, HUMAN dashed: the separation is visible at a glance, without colour. */
export function ActorTag({ actor, className }: { actor: ActorType; className?: string }) {
  const variant: TagVariant = actor === "CODE" ? "ink" : actor === "LLM" ? "outline" : "dashed";
  const tone: Tone = actor === "CODE" ? "neutral" : actor === "LLM" ? "model" : "human";
  return (
    <Tag tone={tone} variant={variant} className={cx("num w-14 justify-center", className)}>
      {ACTOR_LABEL[actor]}
    </Tag>
  );
}

/** Each route has its own glyph (check, alert, lock) so it never relies on colour alone. */
const ROUTE_GLYPH: Record<Route, (size: number) => ReactNode> = {
  AUTO_CLEAR: (size) => <IconCheck size={size} />,
  NEEDS_REVIEW: (size) => <IconAlert size={size} />,
  PENDING_APPROVAL: (size) => <IconLock size={size} />,
};

export function RouteTag({ route, size = "sm" }: { route: Route | null; size?: "sm" | "lg" }) {
  if (!route) return <Tag tone="muted">Not run</Tag>;
  const tone = ROUTE_TONE[route];
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center overflow-hidden rounded-control border font-medium",
        TONE_TINT[tone],
        TONE_TEXT[tone],
        TONE_BORDER[tone],
        size === "lg" ? "h-8 gap-2 ps-2.5 pe-3 text-base" : "h-5 gap-1 ps-1.5 pe-2 text-2xs uppercase tracking-[0.06em]",
      )}
    >
      {ROUTE_GLYPH[route](size === "lg" ? 15 : 11)}
      {ROUTE_LABEL[route]}
    </span>
  );
}

/** Status mark by tone: filled square for done, hollow for waiting or skipped, a cross for failures. */
export function StatusMark({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "red") return <IconClose aria-hidden size={9} strokeWidth={2} className={cx("shrink-0", TONE_TEXT[tone], className)} />;
  const hollow = tone === "muted" || tone === "human";
  return (
    <span
      aria-hidden
      className={cx("h-1.5 w-1.5 shrink-0 rounded-[1px]", hollow ? cx("border", TONE_BORDER[tone]) : TONE_BG[tone], className)}
    />
  );
}

export function StatusTag({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.06em]", TONE_TEXT[tone])}>
      <StatusMark tone={tone} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-hairline-strong border-b-2 bg-raised px-1 text-2xs text-muted">
      {children}
    </kbd>
  );
}
