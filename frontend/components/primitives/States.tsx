import type { ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { IconAlert, IconLock, IconReplay } from "@/components/icons";
import { ApiError, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { TONE_BG, TONE_TEXT, TONE_TINT, type Tone } from "@/lib/labels";
import { Button } from "./Button";

/** Static placeholder blocks: no shimmer. */
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 rounded-xs bg-raised" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

/** Loading with the guard scanning. Use for whole-panel loads; Skeleton for inline ones. */
export function LoadingState({ label = "Loading", lines = 3, className }: { label?: ReactNode; lines?: number; className?: string }) {
  return (
    <div aria-busy="true" className={cx("flex items-start gap-4 rounded-panel border border-hairline/70 bg-surface/60 p-4", className)}>
      <Mascot state="scanning" size={44} avatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
        <span className="text-sm text-muted">{label}</span>
        <Skeleton lines={lines} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  mascot = true,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  mascot?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start gap-4 rounded-panel border border-dashed border-hairline-strong bg-surface/40 p-5", className)}>
      {mascot && <Mascot state="idle" size={48} avatar />}
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <span className="text-sm font-medium text-text">{title}</span>
        {body && <span className="text-sm text-muted">{body}</span>}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const unreachable = error instanceof ApiError && error.status === 0;
  return (
    <div role="alert" className={cx("sheet relative flex flex-col gap-2 overflow-hidden rounded-panel border border-red/40 bg-red/10 p-4 ps-5", className)}>
      <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-red" />
      <span className="flex items-center gap-2 text-sm font-medium text-red-text">
        <IconAlert size={14} />
        {unreachable ? "Backend unreachable" : "Request failed"}
      </span>
      <span className="num text-xs text-text">{errorMessage(error)}</span>
      {onRetry && (
        <Button size="sm" variant="outline" icon={<IconReplay size={12} />} onClick={onRetry} className="self-start">
          Retry
        </Button>
      )}
    </div>
  );
}

/** A gate said no (403/409). Shows the backend's own reason; the refusal is already in the audit chain. */
export function RefusedState({ detail, status, auditId, className }: { detail: string; status?: number; auditId?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cx("hatch relative flex flex-col gap-1 overflow-hidden rounded-panel border border-red/50 bg-red/10 p-4 ps-5", className)}>
      <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-red" />
      <span className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.1em] text-red-text">
        <IconLock size={14} /> Refused by code{status ? ` · ${status}` : ""}
      </span>
      <span className="text-sm text-text">{detail}</span>
      {auditId && <span className="text-xs text-muted">Recorded in the audit chain as {auditId}</span>}
    </div>
  );
}

export function Banner({
  tone = "amber",
  children,
  actions,
  floating = false,
}: {
  tone?: Tone;
  children: ReactNode;
  actions?: ReactNode;
  /** Rounded, detached banner (for use inside the workspace) instead of a full-width strip. */
  floating?: boolean;
}) {
  return (
    <div className={cx("relative flex min-h-9 items-center gap-3 overflow-hidden px-4 ps-5 text-sm", TONE_TINT[tone],
      floating ? "rounded-panel border border-hairline" : "border-b border-hairline")}>
      <span aria-hidden className={cx("absolute inset-y-0 start-0 w-[3px]", TONE_BG[tone])} />
      <span className={TONE_TEXT[tone]}>{children}</span>
      {actions && <span className="ms-auto flex items-center gap-2">{actions}</span>}
    </div>
  );
}
