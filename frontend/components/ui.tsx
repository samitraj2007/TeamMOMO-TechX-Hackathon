import type { ReactNode } from "react";
import type { Actor, Route } from "@/lib/types";

export function ActorBadge({ actor }: { actor: Actor }) {
  const style = {
    CODE: "bg-fg text-ink border-fg font-mono",
    LLM: "border-llm text-llm bg-transparent",
    HUMAN: "border-human text-human bg-transparent",
  }[actor];
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] font-semibold tracking-wider ${style}`}>
      {actor}
    </span>
  );
}

export const ROUTE_LABEL: Record<Route, string> = {
  AUTO_CLEAR: "Auto-cleared",
  NEEDS_REVIEW: "Needs review",
  PENDING_APPROVAL: "Pending approval",
};

const ROUTE_STYLE: Record<Route, string> = {
  AUTO_CLEAR: "text-clear border-clear/50 bg-clear/10",
  NEEDS_REVIEW: "text-review border-review/50 bg-review/10",
  PENDING_APPROVAL: "text-approve border-approve/50 bg-approve/10",
};

export function RouteChip({ route, large = false }: { route: Route; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded border font-semibold ${ROUTE_STYLE[route]} ${
        large ? "px-3 py-1.5 text-base" : "px-1.5 py-px text-[11px]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ROUTE_LABEL[route]}
    </span>
  );
}

export function RouteDot({ route }: { route: Route | null }) {
  const c = route ? { AUTO_CLEAR: "bg-clear", NEEDS_REVIEW: "bg-review", PENDING_APPROVAL: "bg-approve" }[route] : "bg-line";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${c}`} />;
}

export function Panel({
  title,
  actor,
  aside,
  children,
  className = "",
}: {
  title: string;
  actor?: Actor;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-md border border-line bg-panel ${className}`}>
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        {actor && <ActorBadge actor={actor} />}
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
        <div className="ml-auto">{aside}</div>
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded border border-dashed border-line text-sm text-faint">
      {children}
    </div>
  );
}

export function KV({ k, children, mono = true }: { k: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr] gap-3 border-b border-line/60 py-1.5 text-[13px] last:border-0">
      <span className="text-muted">{k}</span>
      <span className={mono ? "font-mono text-fg" : "text-fg"}>{children}</span>
    </div>
  );
}

export const aed = (n: number) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED`;
