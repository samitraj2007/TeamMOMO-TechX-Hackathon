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

/** Rounded chip for labels and statuses. Sentence case; mono for ids. */
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
        "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-2xs font-medium",
        mono && "num",
        variant === "solid" && cx(TONE_BG[tone], TONE_BORDER[tone], "text-bg"),
        variant === "outline" && cx(TONE_BORDER[tone], TONE_TEXT[tone], tone === "neutral" || tone === "muted" ? "border-hairline-strong" : "border-current/30"),
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

/**
 * Who acted. CODE solid ink, MODEL outlined slate, HUMAN dashed ochre: the separation reads without colour.
 * A squarer 6px chip, so actor marks never look like status pills.
 */
export function ActorTag({ actor, className }: { actor: ActorType; className?: string }) {
  return (
    <span
      className={cx(
        "num inline-flex h-5 w-[52px] shrink-0 items-center justify-center rounded-sm border text-[10px] font-semibold tracking-[0.06em]",
        actor === "CODE" && "border-text bg-text text-bg",
        actor === "LLM" && "border-model/60 text-model",
        actor === "HUMAN" && "border-dashed border-human text-human",
        className,
      )}
    >
      {ACTOR_LABEL[actor]}
    </span>
  );
}

/** Each route has its own glyph (check, alert, lock) so it never relies on colour alone. */
const ROUTE_GLYPH: Record<Route, (size: number) => ReactNode> = {
  AUTO_CLEAR: (size) => <IconCheck size={size} />,
  NEEDS_REVIEW: (size) => <IconAlert size={size} />,
  PENDING_APPROVAL: (size) => <IconLock size={size} />,
};

export function RouteTag({ route, size = "sm" }: { route: Route | null; size?: "sm" | "lg" }) {
  if (!route) {
    return (
      <span
        className={cx(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-hairline-strong text-muted",
          size === "lg" ? "h-8 px-3 text-sm" : "h-[22px] px-2 text-2xs font-medium",
        )}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-current" />
        Not run
      </span>
    );
  }
  const tone = ROUTE_TONE[route];
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center rounded-full font-medium",
        TONE_TINT[tone],
        TONE_TEXT[tone],
        size === "lg" ? "h-8 gap-2 ps-2.5 pe-3.5 text-sm" : "h-[22px] gap-1 ps-1.5 pe-2 text-2xs",
      )}
    >
      {ROUTE_GLYPH[route](size === "lg" ? 15 : 11)}
      {ROUTE_LABEL[route]}
    </span>
  );
}

/** Status mark by tone: a check for done, a ring for waiting or skipped, a cross for failures, a dot otherwise. */
export function StatusMark({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "red") return <IconClose aria-hidden size={10} strokeWidth={2} className={cx("shrink-0", TONE_TEXT[tone], className)} />;
  if (tone === "sage") return <IconCheck aria-hidden size={11} strokeWidth={2} className={cx("shrink-0", TONE_TEXT[tone], className)} />;
  const hollow = tone === "muted" || tone === "human";
  return (
    <span
      aria-hidden
      className={cx("h-1.5 w-1.5 shrink-0 rounded-full", hollow ? cx("border", TONE_BORDER[tone]) : TONE_BG[tone], className)}
    />
  );
}

/** "STEP_DONE" reads as "Step done". */
export const sentence = (s: string) => {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function StatusTag({ status }: { status: string }) {
  // Pipeline statuses are upper case, classifier statuses lower case ("ok", "cache_miss").
  const tone = STATUS_TONE[status] ?? STATUS_TONE[status.toUpperCase()] ?? "muted";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs font-medium", TONE_TEXT[tone])}>
      <StatusMark tone={tone} />
      {sentence(status)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="num inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-hairline-strong bg-surface px-1 text-2xs text-muted shadow-sheen">
      {children}
    </kbd>
  );
}
