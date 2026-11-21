"use client";

import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { RecordProvider, type Backlink, type RecordSource } from "@/components/records/Records";
import {
  Amount, Button, Callout, ErrorState, LoadingState, RouteTag, Tag, Timestamp,
} from "@/components/primitives";
import { api } from "@/lib/api";
import { cx } from "@/lib/cx";
import { useCase, useReport, useRunCase, useTimeline } from "@/lib/queries";
import { DownloadMenu } from "./DownloadMenu";
import { LifecycleStepper } from "./Lifecycle";
import { RunStatus } from "./Resilience";
import type { CaseDetail, CaseTimeline, Report } from "@/lib/types";

export interface CaseData {
  id: string;
  detail: CaseDetail;
  timeline: ReturnType<typeof useTimeline>;
  report: ReturnType<typeof useReport>;
}

const CaseCtx = createContext<CaseData | null>(null);

/**
 * Wraps a case screen so it reads the case loaded by the surrounding /case/[id] layout. CaseFrame always renders
 * its child screen (Next validates every route segment for instant navigation, so the page segment must render even
 * while the case loads); the screen itself renders nothing until the case is there.
 */
export function caseScreen(Screen: (props: CaseData) => ReactNode) {
  return function CaseScreen() {
    const data = useContext(CaseCtx);
    return data ? <Screen {...data} /> : null;
  };
}

function backlinksFor(recordId: string, report: Report | undefined, timeline: CaseTimeline | undefined): Backlink[] {
  const out: Backlink[] = [];
  for (const s of report?.sentences ?? []) {
    if (s.record_ids.includes(recordId)) out.push({ where: `Report · ${s.section}`, text: s.accepted ? s.text : `Rejected (${s.reason})` });
  }
  for (const step of timeline?.steps ?? []) {
    if (step.record_ids.includes(recordId) || step.service_calls.some((c) => c.record_ids.includes(recordId))) {
      out.push({ where: `Timeline · ${step.step}`, text: step.summary });
    }
  }
  return out;
}

/**
 * Shared frame for every case screen: loads the case once, keeps the header and Run button in place, and
 * switches screens by URL (/case/[id], /quarantine, /evidence, /report, /decision). The layout persists across
 * those routes, so changing screen neither refetches nor loses the header.
 */
export function CaseFrame({ children }: { children: ReactNode }) {
  const id = decodeURIComponent(useParams<{ id: string }>().id ?? "");
  const detail = useCase(id);
  const timeline = useTimeline(id);
  const run = detail.data?.run ?? null;
  const report = useReport(id, run !== null);

  const source = useMemo<RecordSource>(() => ({
    key: `api-${id}`,
    getRecord: api.record,
    backlinks: (recordId) => backlinksFor(recordId, report.data, timeline.data),
  }), [id, report.data, timeline.data]);

  const data: CaseData | null = detail.data ? { id, detail: detail.data, timeline, report } : null;
  return (
    <CaseCtx.Provider value={data}>
      <RecordProvider source={source}>
        <div className="route-in flex flex-col gap-5 px-2 pb-8 pt-1">
          {detail.isPending && <LoadingState label={`Loading ${id}`} lines={5} />}
          {detail.isError && <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />}
          {detail.data && (
            <>
              <CaseHeader detail={detail.data} id={id} onRan={() => void detail.refetch()} />
              <CaseTabs id={id} detail={detail.data} />
            </>
          )}
          <div className="min-w-0">{children}</div>
        </div>
      </RecordProvider>
    </CaseCtx.Provider>
  );
}

function CaseHeader({ id, detail, onRan }: { id: string; detail: CaseDetail; onRan: () => void }) {
  const runMut = useRunCase(id);
  const run = detail.run;
  const s = detail.summary;
  return (
    <>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4 pb-1">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {s.demo_tag && (
              <span title={`Demo case ${s.demo_tag}`} className="num inline-flex h-5 w-5 items-center justify-center rounded-full bg-text text-[10px] font-semibold text-bg">
                {s.demo_tag}
              </span>
            )}
            <span className="num font-medium text-text">{s.alert_id}</span>
            <Tag tone="neutral" mono>{s.rule_id}</Tag>
          </div>
          <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.03em] text-text">{s.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <Amount value={s.amount} currency={s.currency} className="font-semibold text-text" />
            <span>{s.payee_name ?? "No payee name"}</span>
            <Timestamp iso={detail.ts} />
          </div>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <RouteTag route={run?.decision.route ?? s.last_route} size="lg" />
          <DownloadMenu alertId={id} hasRun={!!run} />
          <Button variant="solid" disabled={runMut.isPending} onClick={() => runMut.mutate(undefined, { onSuccess: onRan })}>
            {runMut.isPending ? "Running…" : run ? "Run again" : "Run investigation"}
          </Button>
        </div>
      </header>
      <RunStatus active={runMut.isPending} className="-mt-1" />
      <LifecycleStepper id={id} />
      {runMut.isError && <ErrorState error={runMut.error} onRetry={() => runMut.mutate(undefined, { onSuccess: onRan })} />}
      {run && run.investigator.status !== "ok" && run.investigator.status !== "citation_invalid" && (
        <Callout kind="warn" title="Failed closed to human review">
          No model gave a usable answer ({run.investigator.attempts.map((a) => `${a.provider} ${a.status.replace("_", " ")}`).join(", ") || run.investigator.status.replace("_", " ")}).
          Code did not loosen the route; a person decides this case.
        </Callout>
      )}
    </>
  );
}

const SCREENS = [
  { segment: null, path: "", label: "Pipeline" },
  { segment: "quarantine", path: "/quarantine", label: "Quarantine" },
  { segment: "evidence", path: "/evidence", label: "Evidence" },
  { segment: "report", path: "/report", label: "Report" },
  { segment: "decision", path: "/decision", label: "Decision" },
] as const;

function CaseTabs({ id, detail }: { id: string; detail: CaseDetail }) {
  const segment = useSelectedLayoutSegment();
  const run = detail.run;
  const resolution = detail.resolution ?? run?.resolution ?? null;
  const awaitingDecision = run !== null && run.decision.route !== "AUTO_CLEAR" && resolution === null;
  const counts: Record<string, number | undefined> = {
    quarantine: run?.quarantine.spans.length,
    evidence: run?.evidence.record_ids.length,
  };

  return (
    <nav aria-label="Case screens" className="flex gap-6 overflow-x-auto border-b border-hairline">
      {SCREENS.map((screen) => {
        const active = segment === screen.segment;
        const count = screen.segment ? counts[screen.segment] : undefined;
        return (
          <Link
            key={screen.label}
            href={`/case/${id}${screen.path}`}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 px-0.5 text-sm font-medium transition-colors duration-150",
              active ? "text-text" : "text-muted hover:text-text",
            )}
          >
            {screen.label}
            {count !== undefined && <span className="num text-2xs text-muted">{count}</span>}
            {screen.segment === "decision" && awaitingDecision && (
              <span role="img" aria-label="awaiting a decision" title="Awaiting a decision" className="h-1.5 w-1.5 rounded-full bg-amber" />
            )}
            {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-sage" />}
          </Link>
        );
      })}
    </nav>
  );
}
