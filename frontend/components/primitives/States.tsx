import type { ReactNode } from "react";
import { IconAlert, IconLock, IconReplay } from "@/components/icons";
import { ApiError, errorMessage } from "@/lib/api";
import { cx } from "@/lib/cx";
import { TONE_BG, TONE_TEXT, TONE_TINT, type Tone } from "@/lib/labels";
import { Button } from "./Button";

/** Static placeholder blocks: no shimmer, nothing moves while loading. */
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 border border-hairline bg-raised" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action, className }: { title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("hatch-muted flex flex-col items-start gap-2 border border-dashed border-hairline-strong p-4", className)}>
      <span className="text-sm font-medium text-text">{title}</span>
      {body && <span className="text-sm text-muted">{body}</span>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const unreachable = error instanceof ApiError && error.status === 0;
  return (
    <div role="alert" className={cx("relative flex flex-col gap-2 border border-hairline bg-red/12 p-4 ps-5", className)}>
      <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-red" />
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
    <div role="alert" className={cx("hatch relative flex flex-col gap-1 border border-red/60 bg-red/12 p-3 ps-4", className)}>
      <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-red" />
      <span className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.08em] text-red-text">
        <IconLock size={14} /> Refused by code{status ? ` · ${status}` : ""}
      </span>
      <span className="text-sm text-text">{detail}</span>
      {auditId && <span className="text-xs text-muted">Recorded in the audit chain as {auditId}</span>}
    </div>
  );
}

export function Banner({ tone = "amber", children, actions }: { tone?: Tone; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className={cx("relative flex min-h-8 items-center gap-3 border-b border-hairline px-4 ps-5 text-sm", TONE_TINT[tone])}>
      <span aria-hidden className={cx("absolute inset-y-0 start-0 w-0.5", TONE_BG[tone])} />
      <span className={TONE_TEXT[tone]}>{children}</span>
      {actions && <span className="ms-auto flex items-center gap-2">{actions}</span>}
    </div>
  );
}
