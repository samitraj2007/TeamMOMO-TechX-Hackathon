import type { ReactNode } from "react";
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

export type TagVariant = "outline" | "tint" | "solid" | "dashed";

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
        className,
      )}
    >
      {children}
    </span>
  );
}

/** CODE solid, MODEL outlined, HUMAN dashed: the separation is visible at a glance. */
export function ActorTag({ actor, className }: { actor: ActorType; className?: string }) {
  const variant: TagVariant = actor === "CODE" ? "solid" : actor === "LLM" ? "outline" : "dashed";
  const tone: Tone = actor === "CODE" ? "sage" : actor === "LLM" ? "model" : "human";
  return (
    <Tag tone={tone} variant={variant} className={cx("num w-14 justify-center", className)}>
      {ACTOR_LABEL[actor]}
    </Tag>
  );
}

export function RouteTag({ route, size = "sm" }: { route: Route | null; size?: "sm" | "lg" }) {
  if (!route) return <Tag tone="muted">Not run</Tag>;
  const tone = ROUTE_TONE[route];
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center overflow-hidden rounded-control border border-transparent ps-2.5 pe-2 font-medium",
        TONE_TINT[tone],
        TONE_TEXT[tone],
        size === "lg" ? "h-8 text-base" : "h-5 text-2xs uppercase tracking-[0.06em]",
      )}
    >
      <span aria-hidden className={cx("absolute inset-y-0 start-0 w-0.5", TONE_BG[tone])} />
      {ROUTE_LABEL[route]}
    </span>
  );
}

export function StatusTag({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.06em]", TONE_TEXT[tone])}>
      <span aria-hidden className={cx("h-1.5 w-1.5", TONE_BG[tone])} />
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
