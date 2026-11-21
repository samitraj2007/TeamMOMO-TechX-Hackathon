"use client";

import { useState, type ReactNode } from "react";
import { RecordChips } from "@/components/records/Records";
import {
  ActorTag, Button, Callout, EmptyState, ErrorState, Field, Hash, LoadingState, Panel, PropertiesTable,
  RefusedState, RouteTag, StatusTag, Tag, TextArea, Timestamp,
} from "@/components/primitives";
import { useConsoleRole } from "@/components/shell/ConsoleFrame";
import { useActorName } from "@/lib/actor";
import { ApiError } from "@/lib/api";
import { amount } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { useCommit, useDecide, useFileReport, useLifecycle, useReport } from "@/lib/queries";
import type { Action, Approval, CaseDetail, CaseRun, Route, Span } from "@/lib/types";
import { Airlock } from "./Airlock";
import { caseScreen } from "./CaseFrame";
import { ProviderPath } from "./Resilience";
import { GateLock } from "./GateLock";
import { SignedInAs } from "./SignedInAs";
import { PipelineTimeline } from "./PipelineTimeline";

const INPUT_KEYS = new Set(["case_id", "memo_facts", "evidence", "policy"]);

/**
 * How many raw free-text fields appear inside the investigator input.
 * Null when the response has no investigator input, or its shape is not the typed contract,
 * so the screen does not claim "0" on its own.
 */
export function rawTextInInvestigator(run: CaseRun, raw: Record<string, string | null>): number | null {
  const input = run.investigator_input as unknown as Record<string, unknown> | null;
  if (!input || typeof input !== "object") return null;
  if (Object.keys(input).some((k) => !INPUT_KEYS.has(k))) return null;
  const blob = JSON.stringify(input);
  let found = 0;
  for (const value of Object.values(raw)) {
    const text = value?.trim();
    if (text && text.length >= 16 && blob.includes(text)) found += 1;
  }
  return found;
}

// ---- Case screens. Each one is its own route under /case/[id]; CaseFrame supplies the data. ----

/** /case/[id]: the audit timeline at full width, with the code decision beside it on wide screens. */
export const PipelineScreen = caseScreen(({ detail, timeline }) => {
  const run = detail.run;
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] 2xl:gap-5">
      <Panel title="Pipeline" tint="surface">
        {timeline.isPending ? <LoadingState label="Loading the audit timeline" lines={4} />
          : timeline.isError ? <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
          : timeline.data.steps.length === 0 ? <EmptyState title="No audit steps yet" body="Run the investigation to write the first steps." />
          : <PipelineTimeline steps={timeline.data.steps} revealKey={run?.total_ms ?? "idle"} renderRecords={(ids) => <RecordChips ids={ids} />} />}
      </Panel>
      <div className="xl:sticky xl:top-0">
        <DecisionSummary run={run} />
      </div>
    </div>
  );
});

export const QuarantineScreen = caseScreen(({ detail }) => (
  <Quarantine detail={detail} rawCount={detail.run ? rawTextInInvestigator(detail.run, detail.raw_fields) : null} />
));

export const EvidenceScreen = caseScreen(({ detail }) => <Evidence run={detail.run} />);

export const ReportScreen = caseScreen(({ report, detail }) => <ReportPane report={report} hasRun={detail.run !== null} />);

export const DecisionScreen = caseScreen(({ id, detail }) => <DecisionRail id={id} detail={detail} />);

function DecisionSummary({ run }: { run: CaseRun | null }) {
  return (
    <Panel title="Decision" tint="surface">
      {!run ? <EmptyState mascot={false} title="Waiting for a run" body="Policy decides only after the pipeline runs." /> : (
        <div className="flex flex-col gap-3">
          <RouteTag route={run.decision.route} size="lg" />
          <ul className="flex flex-col gap-1.5">
            {run.decision.reasons.map((r) => (
              <li key={r.code} className="text-sm">
                <span className="num text-text">{r.code}</span>
                <span className="text-muted"> · {r.detail}</span>
              </li>
            ))}
            {run.decision.reasons.length === 0 && <li className="text-sm text-muted">No reason codes. Code route {run.code_route}.</li>}
          </ul>
          <span className="num text-2xs text-muted">threshold {amount(run.decision.threshold_aed)} AED · gate {run.gate}</span>
          <div className="border-t border-hairline pt-3">
            <ProviderPath run={run} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function Quarantine({ detail, rawCount }: { detail: CaseDetail; rawCount: number | null }) {
  const run = detail.run;
  const memo = detail.raw_fields.memo ?? "";
  if (!run) {
    return <EmptyState title="Not run yet" body="Run the investigation. The raw memo stays on this side of the gate; only typed MemoFacts can cross." />;
  }
  const memoSpans = run.quarantine.spans.filter((s) => s.field === "memo");
  const other = run.quarantine.spans.filter((s) => s.field !== "memo");
  return (
    <div className="flex flex-col gap-3">
      <Airlock memo={memo} spans={memoSpans} facts={run.quarantine.memo_facts} rawReceived={rawCount} />
      {other.length > 0 && <OtherSpans raw={detail.raw_fields} spans={other} />}
      <Panel title="Classifier" tint="surface">
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <Tag tone={run.quarantine.classifier_verdict === "BENIGN" ? "sage" : run.quarantine.classifier_verdict === "INJECTION" ? "red" : "amber"}>
            {run.quarantine.classifier_verdict}
          </Tag>
          <span className="num text-xs text-muted">{run.quarantine.duration_ms.toFixed(0)} ms</span>
        </div>
        <ul className="flex flex-col gap-1">
          {run.quarantine.classifier.map((v) => (
            <li key={v.field} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="num text-muted">{v.field}</span>
              <StatusTag status={v.status} />
              <span className="num text-text">{v.score === null ? "-" : v.score.toFixed(3)}</span>
              <span className="text-muted">{v.segments_scanned}/{v.segments_total} segments{v.cached ? " · cached" : ""}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function OtherSpans({ raw, spans }: { raw: Record<string, string | null>; spans: Span[] }) {
  const fields = [...new Set(spans.map((s) => s.field))];
  return (
    <Panel title="Other flagged fields" tint="surface">
      {fields.map((field) => {
        const text = raw[field] ?? "";
        const mine = spans.filter((s) => s.field === field);
        return (
          <p key={field} className="text-sm leading-6 text-text">
            <span className="num me-2 text-2xs text-muted">{field}</span>
            <Highlighted text={text} spans={mine} />
          </p>
        );
      })}
    </Panel>
  );
}

function Highlighted({ text, spans }: { text: string; spans: Span[] }) {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let cursor = 0;
  ordered.forEach((s, i) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    out.push(<mark key={i} className="bg-red/25 text-red-text" title={s.code}>{text.slice(s.start, s.end)}</mark>);
    cursor = s.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

function Evidence({ run }: { run: CaseRun | null }) {
  if (!run) return <EmptyState title="No evidence yet" body="Evidence is gathered when the investigation runs." />;
  const ev = run.evidence;
  const matches = [...(ev.sanctions_customer?.matches ?? []), ...(ev.sanctions_payee?.matches ?? [])];
  return (
    <div className="flex flex-col gap-3">
      {!ev.complete && <Callout kind="warn">Evidence is incomplete. The case fails closed to review.</Callout>}
      <Panel title="Bank records" tint="surface" padded={false}>
        <PropertiesTable rows={[
          { key: "customer", value: ev.kyc ? <span>{ev.kyc.customer.record_id} · {ev.kyc.customer.segment}</span> : "unavailable" },
          { key: "device", value: ev.kyc?.txn_device ? <span className={ev.kyc.device_known_and_verified ? "text-sage" : "text-red-text"}>{ev.kyc.txn_device.record_id} · {ev.kyc.device_known_and_verified ? "verified" : "unverified"}</span> : "unavailable" },
          { key: "sanctions", value: ev.sanctions_payee?.band ?? ev.sanctions_customer?.band ?? "unavailable" },
          { key: "velocity", value: ev.velocity ? `${ev.velocity.txn_count_24h} txns · ${ev.velocity.new_payees_24h} new payees · ${amount(ev.velocity.amount_24h)}` : "unavailable" },
          { key: "records", value: <RecordChips ids={ev.record_ids} max={8} /> },
        ]} />
      </Panel>
      {matches.length > 0 && (
        <Panel title="Watchlist matches" tint="surface">
          <ul className="flex flex-col gap-2">
            {matches.map((m) => (
              <li key={m.watchlist_id + m.screened_name} className="flex flex-wrap items-center gap-2 text-sm">
                <RecordChips ids={[m.watchlist_id]} />
                <span className="text-text">{m.listed_name}</span>
                <Tag tone={m.band === "HIT" ? "red" : "amber"}>{m.band}</Tag>
                <span className="text-xs text-muted">via {m.matched_on}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Investigator" tint="surface">
        <div className="mb-2 flex items-center gap-2">
          <ActorTag actor="LLM" />
          <StatusTag status={run.investigator.status} />
          {run.investigator.output && <span className="text-sm text-text">{run.investigator.output.recommendation} · {run.investigator.output.confidence.toFixed(2)}</span>}
        </div>
        {run.investigator.output?.findings.map((f) => (
          <div key={f.code + f.record_ids.join()} className="flex flex-col gap-1 border-t border-hairline/70 py-2">
            <span className="num text-xs text-muted">{f.code}</span>
            <span className="text-sm text-text">{f.note}</span>
            <RecordChips ids={f.record_ids} />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function ReportPane({ report, hasRun }: { report: ReturnType<typeof useReport>; hasRun: boolean }) {
  if (!hasRun) return <EmptyState title="No report yet" body="The report is built after the investigation runs." />;
  if (report.isPending) return <LoadingState label="Building the report" />;
  if (report.isError) {
    const err = report.error;
    if (err instanceof ApiError && (err.status === 403 || err.status === 409)) {
      return <RefusedState status={err.status} detail={err.message} />;
    }
    return <ErrorState error={err} onRetry={() => void report.refetch()} />;
  }
  const r = report.data;
  return (
    <Panel title="Suspicious activity report" tint="surface" className="wrap-anywhere"
      actions={<Tag tone={r.verifier_passed ? "sage" : "amber"} variant="tint">{r.verifier_passed ? "Verifier passed" : "Verifier failed"}</Tag>}>
      <p className="mb-3 text-xs text-muted">
        <span className="num">{r.template_version}</span> · {r.accepted} accepted · {r.rejected} rejected
        {r.llm_rejected > 0 && <span className="text-red-text"> · {r.llm_rejected} model sentences rejected</span>}
      </p>
      <Markdown source={r.markdown} />
    </Panel>
  );
}

/** Mirrors the backend: an override needs at least this many characters of reason; any decision needs 3. */
const OVERRIDE_MIN_REASON = 20;
const MIN_REASON = 3;
const ACTION_RANK: Record<Action, number> = { CLEAR: 0, ESCALATE: 1, HOLD_AND_BLOCK: 2 };

/** Same rule as case_resolution.is_override: Reject always; Approve when it is less strict than the proposal. */
function isOverride(route: Route, decision: Approval["decision"], action?: Action): boolean {
  if (decision === "REJECT") return true;
  const proposed: Action = route === "PENDING_APPROVAL" ? "HOLD_AND_BLOCK" : route === "NEEDS_REVIEW" ? "ESCALATE" : "CLEAR";
  return decision === "APPROVE" && action !== undefined && ACTION_RANK[action] < ACTION_RANK[proposed];
}

const DECISION_TONE = { APPROVE: "sage", REJECT: "red", MORE_INFO: "amber", ESCALATE: "model" } as const;
const STATUS_TEXT = {
  COMMITTED: "Approved and committed.",
  REJECTED: "Rejected. Nothing was committed, so the case stays open and the code route stands.",
  AWAITING_INFO: "More information requested. The case stays open.",
  ESCALATED: "Escalated. A compliance officer must now approve or reject; nothing was committed.",
} as const;

function DecisionHistory({ decisions }: { decisions: Approval[] }) {
  return (
    <Panel title="Human decisions" tint="surface" actions={<span className="num text-2xs text-muted">{decisions.length}</span>}>
      {decisions.length === 0 ? (
        <p className="text-sm text-muted">No human decision recorded yet.</p>
      ) : (
        <ol className="flex flex-col">
          {decisions.map((d) => (
            <li key={d.record_id} className="flex flex-col gap-1.5 border-t border-hairline/70 py-2.5 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={DECISION_TONE[d.decision]}>{d.decision}</Tag>
                {d.action && <Tag tone="neutral" mono>{d.action}</Tag>}
                {d.override && <Tag tone="amber" variant="tint">override</Tag>}
                <RecordChips ids={[d.record_id]} />
              </div>
              <span className="text-xs text-muted">
                <span className="num text-text">{d.actor}</span> ({d.role === "COMPLIANCE_OFFICER" ? "compliance officer" : "analyst"}) · <Timestamp iso={d.ts} />
              </span>
              <blockquote className="border-s-2 border-hairline-strong ps-3 text-sm text-text wrap-anywhere">
                {d.reason}
              </blockquote>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** A decision button that stays visible when not allowed: disabled with the reason, plus a demo path that sends the
 * request anyway so the backend refusal (and its audit entry) can be shown live. */
function Act({ label, variant, allowed, blocked, ready, notReady, busy, onRun }: {
  label: string; variant: "key" | "danger" | "outline" | "solid"; allowed: boolean; blocked: string | null;
  ready: boolean; notReady: string; busy: boolean; onRun: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Button variant={variant} disabled={busy || !allowed || !ready} title={!allowed ? blocked ?? undefined : !ready ? notReady : undefined}
        onClick={onRun}>
        {label}
      </Button>
      {!allowed && blocked && (
        <span className="max-w-[260px] text-2xs text-muted">
          {blocked}{" "}
          <button type="button" disabled={busy || !ready} onClick={onRun}
            className="underline underline-offset-4 hover:text-text disabled:opacity-50">Try anyway (demo)</button>
        </span>
      )}
    </div>
  );
}

const ACTION_WORD: Record<Action, string> = { CLEAR: "clear", ESCALATE: "escalate", HOLD_AND_BLOCK: "hold and block" };

function DecisionRail({ id, detail }: { id: string; detail: CaseDetail }) {
  const { role } = useConsoleRole();
  const actor = useActorName(role);
  const run = detail.run;
  const lifecycle = useLifecycle(id).data;
  const decide = useDecide(id);
  const commit = useCommit(id);
  const file = useFileReport(id);
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<ApiError | null>(null);
  const [filing, setFiling] = useState<{ id: string; hash: string } | null>(null);
  const resolution = detail.resolution ?? run?.resolution ?? null;
  const decisions = detail.decisions ?? (detail.approval ? [detail.approval] : []);
  const latest = decisions.filter((d) => d.decision !== "ESCALATE").at(-1) ?? null;
  const step = (sid: string) => lifecycle?.steps.find((s) => s.id === sid);
  const analystStep = step("analyst_review");
  const officerStep = step("officer_approval");
  const filedStep = step("filed");
  const escalated = (lifecycle?.escalated_by.length ?? 0) > 0;
  const officerAction: Action | undefined = run
    ? run.decision.route === "PENDING_APPROVAL" ? "HOLD_AND_BLOCK" : escalated ? "ESCALATE" : "CLEAR"
    : undefined;
  const trimmed = reason.trim().length;
  const needs = (decision: Approval["decision"], action?: Action) =>
    run && isOverride(run.decision.route, decision, action) ? OVERRIDE_MIN_REASON : MIN_REASON;
  const sameAsEscalator = role === "COMPLIANCE_OFFICER" && !!lifecycle?.escalated_by.includes(actor.toLowerCase());
  const officerBlocked = role !== "COMPLIANCE_OFFICER"
    ? "Needs a compliance officer: switch role above."
    : sameAsEscalator ? "Four-eyes: you escalated this case, so another officer must decide." : null;
  const lengthHint = (n: number) => `Needs a reason of at least ${n} characters`;

  function onFail(e: unknown) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 409 || e.status === 422)) setRefusal(e);
  }

  async function onDecide(decision: Approval["decision"], action?: Action) {
    setRefusal(null);
    try {
      await decide.mutateAsync({ decision, action, reason: reason.trim(), role, actor });
      setReason("");
    } catch (e) {
      onFail(e);
    }
  }

  const reasonField = (
    <Field label="Reason" htmlFor={`reason-${id}`}
      hint={`${trimmed} characters. Clearing a case the code flagged, and rejecting, are overrides and need ${OVERRIDE_MIN_REASON}.`}>
      <TextArea id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Field>
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2 2xl:gap-5">
      <SignedInAs lifecycle={lifecycle?.route ? lifecycle : null} />
      <DecisionSummary run={run} />

      {run && run.decision.route !== "AUTO_CLEAR" && (
        <GateLock unlocked={resolution !== null} title={resolution ? `Committed · ${resolution.action}` : officerStep?.state === "current" ? "Officer approval" : "Analyst review"}
          detail={resolution ? `${resolution.record_id}${resolution.approval_id ? ` · ${resolution.approval_id}` : ""}` : `Signing as ${actor}`}>
          {resolution ? (
            latest && <p className="text-sm text-muted">Committed on {latest.record_id} by {latest.actor}. Later decisions are refused.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {latest && latest.decision !== "APPROVE" && (
                <Callout kind="note" title={latest.decision === "REJECT" ? "Rejected, still open" : "Waiting for information"}>
                  {latest.actor} recorded {latest.decision} on {latest.record_id}. Nothing was committed, so the case can still be decided.
                </Callout>
              )}
              {reasonField}

              {analystStep?.state === "current" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">Analyst review: clear the case yourself, or hand it to a compliance officer.</span>
                  <div className="flex flex-wrap gap-2">
                    <Act label="Clear case" variant="key" allowed blocked={null} busy={decide.isPending}
                      ready={trimmed >= needs("APPROVE", "CLEAR")} notReady={lengthHint(needs("APPROVE", "CLEAR"))}
                      onRun={() => void onDecide("APPROVE", "CLEAR")} />
                    <Act label="Escalate to compliance officer" variant="solid" allowed blocked={null} busy={decide.isPending}
                      ready={trimmed >= MIN_REASON} notReady={lengthHint(MIN_REASON)}
                      onRun={() => void onDecide("ESCALATE")} />
                  </div>
                </div>
              )}

              {officerStep?.state === "current" && officerAction && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">
                    Officer approval: approve the action ({ACTION_WORD[officerAction]}) or reject it.
                    {escalated && ` Escalated by ${lifecycle?.escalated_by.join(", ")}.`}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Act label={`Approve action (${ACTION_WORD[officerAction]})`} variant="key" allowed={!officerBlocked} blocked={officerBlocked}
                      busy={decide.isPending} ready={trimmed >= needs("APPROVE", officerAction)} notReady={lengthHint(needs("APPROVE", officerAction))}
                      onRun={() => void onDecide("APPROVE", officerAction)} />
                    <Act label="Reject" variant="danger" allowed={!officerBlocked} blocked={officerBlocked}
                      busy={decide.isPending} ready={trimmed >= needs("REJECT")} notReady={lengthHint(needs("REJECT"))}
                      onRun={() => void onDecide("REJECT")} />
                  </div>
                </div>
              )}

              <Button size="sm" variant="ghost" className="w-fit" onClick={() => {
                setRefusal(null);
                void commit.mutateAsync(run.decision.route === "PENDING_APPROVAL" ? "HOLD_AND_BLOCK" : "CLEAR").catch(onFail);
              }}>
                {run.decision.route === "PENDING_APPROVAL" ? "Commit block without approval (demo)" : "Release without a decision (demo)"}
              </Button>
              {decide.data && !refusal && (
                <p role="status" className="text-xs text-muted">
                  {decide.data.approval.record_id}: {STATUS_TEXT[decide.data.status]}
                </p>
              )}
            </div>
          )}
          {refusal && <RefusedState status={refusal.status} detail={refusal.message} />}
        </GateLock>
      )}

      {run?.decision.route === "AUTO_CLEAR" && (
        <Callout kind="note" title="Auto-cleared">Code committed this case. No analyst or officer action is required.</Callout>
      )}

      {!run && (resolution || decisions.length > 0) && (
        <Callout kind="note" title="Decided before runs were stored">
          {resolution ? `Committed ${resolution.action} on ${resolution.record_id}. ` : `${decisions.length} decision(s) on record, not committed. `}
          The investigation snapshot from that run was not kept, so run again to rebuild the report and evidence pack.
          The decisions below and the audit log are unchanged.
        </Callout>
      )}

      {(run || decisions.length > 0) && <DecisionHistory decisions={decisions} />}

      <Panel title="Regulatory report" tint="surface" className="surface-key rounded-panel">
        {!run ? <span className="text-sm text-muted">Opens after a run.</span> : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              Submitting sends the SAR to the regulator (simulated). Code allows it only after a compliance officer
              approval, and only for an officer; the report hash goes into the audit log.
            </p>
            {filedStep?.state === "done" ? (
              <p className="text-sm text-text">Filed by {filedStep.by}{filedStep.record_id ? ` as ${filedStep.record_id}` : ""}.</p>
            ) : (
              <Act label="Submit report to regulator (simulated)" variant="key"
                allowed={filedStep?.state === "current" && role === "COMPLIANCE_OFFICER"}
                blocked={filedStep?.state !== "current" ? (filedStep?.note ?? "Needs a compliance officer approval first.") : "Needs a compliance officer: switch role above."}
                ready busy={file.isPending} notReady=""
                onRun={() => {
                  setRefusal(null);
                  void file.mutateAsync({ actor, role }).then((f) => setFiling({ id: f.filing_id, hash: f.report_sha256 })).catch(() => undefined);
                }} />
            )}
            {filing && (
              <p className="flex flex-col gap-1 text-xs text-muted">
                <span>Filed as <span className="num text-text">{filing.id}</span></span>
                <Hash value={filing.hash} />
              </p>
            )}
            {file.isError && file.error instanceof ApiError && (file.error.status === 403 || file.error.status === 409) && (
              <RefusedState status={file.error.status} detail={file.error.message} />
            )}
            {file.isError && !(file.error instanceof ApiError && (file.error.status === 403 || file.error.status === 409)) && (
              <ErrorState error={file.error} />
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
