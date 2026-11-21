"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Drawer, ErrorState, LoadingState, RouteTag, Tag } from "@/components/primitives";
import { api, saveBlob } from "@/lib/api";
import { cx } from "@/lib/cx";
import { shortHash, timestamp } from "@/lib/format";
import type { AuditEntry, AuditVerify, Route } from "@/lib/types";

/**
 * One audit record in full: when and how long, who, which tool, what went in, what was decided, and its place in the
 * hash chain. Every payload value is shown as text (React escapes it); nothing here is interpreted as markup.
 */

type P = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const ROUTES = new Set(["AUTO_CLEAR", "NEEDS_REVIEW", "PENDING_APPROVAL"]);

const KIND_LABEL: Record<string, string> = {
  INGEST: "Case received", MANUAL_RUN: "Manual run", STEP: "Pipeline step", DECISION: "Human decision",
  DECISION_REFUSED: "Decision refused", COMMIT: "Resolution committed", COMMIT_REFUSED: "Commit refused",
  FILING: "Report filed", FILING_REFUSED: "Filing refused",
};
const STEP_LABEL: Record<string, string> = {
  received: "Alert received", quarantine_regex: "Quarantine · deterministic filter",
  quarantine_classifier: "Quarantine · injection classifier", evidence: "Evidence · KYC, devices, sanctions, velocity",
  investigator: "Investigator model", verifier: "Citation verifier", policy: "Policy engine (pure Python)",
  gate: "Approval gate", screen: "Live feed code screen", report: "SAR draft",
};
const ACTOR: Record<string, string> = { CODE: "Code", API: "Code (API)", LLM: "Model", HUMAN: "Person" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const kids = Array.isArray(children) ? children.filter(Boolean) : children;
  if (!kids || (Array.isArray(kids) && kids.length === 0)) return null;
  return (
    <section className="flex flex-col border-t border-hairline pt-3 has-[dl:empty]:hidden">
      <h3 className="mb-1 text-xs font-semibold text-text">{title}</h3>
      <dl className="flex flex-col">{kids}</dl>
    </section>
  );
}

function Ids({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => <span key={id} className="num rounded-full border border-hairline bg-raised px-2 py-0.5 text-2xs">{id}</span>)}
    </span>
  );
}

function Chips({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "amber" }) {
  if (!items.length) return null;
  return <span className="flex flex-wrap gap-1">{items.map((x) => <Tag key={x} tone={tone} variant="tint">{x}</Tag>)}</span>;
}

function ms(v: unknown): string | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0.01) return "< 0.01 ms";
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${n.toFixed(n < 10 ? 2 : 0)} ms`;
}

function Body({ e }: { e: AuditEntry }) {
  const p = e.payload as P;
  const [verify, setVerify] = useState<AuditVerify | "checking" | null>(null);
  const calls = Array.isArray(p.service_calls) ? (p.service_calls as P[]) : [];
  const route = str(p.route);
  const step = str(p.step);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="neutral" variant="tint">{KIND_LABEL[e.kind] ?? e.kind}</Tag>
        {step && <span className="text-sm font-medium text-text">{STEP_LABEL[step] ?? step}</span>}
        {str(p.status) && <Tag tone={p.status === "FLAGGED" || p.status === "FAILED" ? "amber" : "muted"} variant="dashed">{String(p.status)}</Tag>}
      </div>
      {str(p.summary) && <p className="rounded-control bg-raised px-3 py-2 text-sm text-text">{String(p.summary)}</p>}

      <Section title="When">
        <Row label="Time">{<span className="num">{timestamp(e.ts)}</span>}</Row>
        <Row label="Took">{ms(p.duration_ms) && <span className="num">{ms(p.duration_ms)}</span>}</Row>
        <Row label="Sequence">{<span className="num">#{e.seq} · {e.record_id}</span>}</Row>
        <Row label="Case">{e.alert_id && <Link href={`/case/${e.alert_id}`} className="num underline underline-offset-4">{e.alert_id}</Link>}</Row>
      </Section>

      <Section title="Who">
        <Row label="Actor">{ACTOR[e.actor] ?? e.actor}</Row>
        <Row label="Person">{str(p.user) ?? str(p.filed_by)}</Row>
        <Row label="Role">{str(p.role) && String(p.role).replace("_", " ").toLowerCase()}</Row>
        <Row label="Approved by">{str(p.approved_by)}</Row>
        <Row label="Approval">{str(p.approval_id) && <span className="num">{String(p.approval_id)}</span>}</Row>
        <Row label="Sent by">{str(p.source) && (p.source === "bank-feed-sim" ? "Live feed (simulated bank)" : p.source === "drill" ? "Resilience drill" : "API (Test your own case)")}</Row>
      </Section>

      <Section title="Tool">
        <Row label="Model">{str(p.model) && <span className="num">{String(p.provider ?? "")} · {String(p.model)}{p.cached ? " · cache" : ""}</span>}</Row>
        <Row label="Attempts">{list(p.attempts).length > 0 && <Chips items={list(p.attempts)} />}</Row>
        <Row label="Tokens">{typeof p.total_tokens === "number" && p.total_tokens > 0 && <span className="num">{p.total_tokens}</span>}</Row>
        <Row label="Prompt">{str(p.prompt_version)}</Row>
        {calls.length > 0 && (
          <div className="flex flex-col gap-1.5 py-1.5">
            <span className="text-xs text-muted">Service calls</span>
            <ul className="flex flex-col divide-y divide-hairline rounded-control border border-hairline">
              {calls.map((c, i) => (
                <li key={i} className="flex flex-col gap-1 px-3 py-2 text-xs">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cx("h-1.5 w-1.5 rounded-full", c.ok ? "bg-sage" : "bg-amber")} />
                    <span className="num font-medium text-text">{String(c.name)}</span>
                    {str(c.target) && <span className="text-muted">→ {String(c.target)}</span>}
                    <span className="num ms-auto text-muted">{ms(c.duration_ms)}</span>
                  </span>
                  <Ids ids={list(c.record_ids)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Input">
        <Row label="Transaction">{str(p.txn_id) && <span className="num">{String(p.txn_id)}</span>}</Row>
        <Row label="Amount">{typeof p.amount === "number" && <span className="num">{p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} {String(p.currency ?? "")}</span>}</Row>
        <Row label="Customer">{str(p.customer_id) && <span className="num">{String(p.customer_id)}{p.device_id ? ` · ${String(p.device_id)}` : ""}</span>}</Row>
        <Row label="Channel">{str(p.channel)}</Row>
        <Row label="Free text">{typeof p.memo_chars === "number" && `memo ${p.memo_chars} chars · payee ${String(p.payee_name_chars ?? 0)} chars (kept out of the log)`}</Row>
        <Row label="Records read">{list(p.record_ids).length > 0 && <Ids ids={list(p.record_ids)} />}</Row>
        <Row label="Signals">{list(p.signals).length > 0 && <Chips items={list(p.signals)} tone="amber" />}</Row>
        <Row label="Segments">{typeof p.segments === "object" && p.segments !== null && Object.keys(p.segments as P).length > 0 &&
          <span className="num">{Object.entries(p.segments as P).map(([k, v]) => `${k} ${String(v)}`).join(" · ")}</span>}</Row>
      </Section>

      <Section title="Decision">
        <Row label="Route">{route && ROUTES.has(route) && <RouteTag route={route as Route} />}</Row>
        <Row label="Code route">{str(p.code_route) && ROUTES.has(String(p.code_route)) && <RouteTag route={p.code_route as Route} />}</Row>
        <Row label="Lane">{str(p.lane)}</Row>
        <Row label="Reasons">{list(p.reasons).length > 0 && <Chips items={list(p.reasons)} />}</Row>
        <Row label="Model advice">{str(p.recommendation)}</Row>
        <Row label="Citations">{list(p.cited).length > 0 && <Ids ids={list(p.cited)} />}</Row>
        <Row label="Verifier">{typeof p.verifier_passed === "boolean" && (p.verifier_passed ? "passed" : "did not pass")}</Row>
        <Row label="Decision">{str(p.decision) && <span className="font-medium">{String(p.decision).replace("_", " ")}</span>}</Row>
        <Row label="Action">{str(p.action)}</Row>
        <Row label="Override">{typeof p.override === "boolean" && (p.override ? "yes, against the code route" : "no")}</Row>
        <Row label="Reason">{str(p.reason) && <span className="whitespace-pre-wrap">{String(p.reason)}</span>}</Row>
        <Row label="Refusal">{str(p.refusal) && <span>{String(p.refusal)}{str(p.detail) ? ` · ${String(p.detail)}` : ""}</span>}</Row>
        <Row label="Filing">{str(p.status) && e.kind === "FILING" && String(p.status)}</Row>
        <Row label="Report hash">{str(p.report_sha256) && <span className="num">{shortHash(String(p.report_sha256))}</span>}</Row>
        <Row label="Resolution">{str(p.resolution_id) && <span className="num">{String(p.resolution_id)}</span>}</Row>
      </Section>

      <Section title="Integrity">
        <Row label="Previous hash"><span className="num break-all text-xs">{e.prev_hash}</span></Row>
        <Row label="This hash"><span className="num break-all text-xs">{e.hash}</span></Row>
        <Row label="Chain">
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" className="press h-7 rounded-control border border-hairline-strong px-2.5 text-xs hover:bg-raised"
              onClick={async () => {
                setVerify("checking");
                try { setVerify(await api.verifyAudit(e.hash)); } catch { setVerify(null); }
              }}>
              Verify chain up to here
            </button>
            {verify === "checking" && <span className="text-xs text-muted">Checking…</span>}
            {verify && verify !== "checking" && (
              <span className={cx("text-xs", verify.ok ? "text-sage" : "text-red-text")}>
                {verify.ok ? `Intact: this hash is in the chain (${verify.entries} entries checked)` : `Failed: ${verify.reason ?? "chain broken"}`}
              </span>
            )}
          </span>
        </Row>
      </Section>

      <details className="rounded-control border border-hairline bg-raised px-3 py-2 text-xs">
        <summary className="cursor-pointer select-none text-muted">Raw record (JSON)</summary>
        <pre className="num mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-2xs text-text">{JSON.stringify(e, null, 2)}</pre>
      </details>
      <div>
        <button type="button" className="press h-8 rounded-control border border-hairline-strong px-3 text-xs hover:bg-raised"
          onClick={() => saveBlob(new Blob([JSON.stringify(e, null, 2)], { type: "application/json" }), `${e.record_id}.json`)}>
          Download entry (.json)
        </button>
      </div>
    </div>
  );
}

/** Pass the entry you already have, or just its record ID (e.g. from a notification). */
export function AuditEntrySheet({ entry, recordId, onClose }: { entry?: AuditEntry | null; recordId?: string | null; onClose: () => void }) {
  const id = entry?.record_id ?? recordId ?? null;
  const fetched = useQuery({ queryKey: ["audit", "entry", id], queryFn: () => api.auditEntry(id!), enabled: !entry && !!id });
  const e = entry ?? fetched.data;
  return (
    <Drawer open={!!id} onClose={onClose} width={520}
      title={<span className="num">{id ?? ""}</span>}>
      {e ? <Body key={e.record_id} e={e} /> : fetched.isError ? <ErrorState error={fetched.error} /> : <LoadingState label="Loading audit record" lines={4} />}
    </Drawer>
  );
}

/** One line per entry for tables: what happened, in code-written words. */
export function entryHeadline(e: AuditEntry): string {
  const p = e.payload as P;
  if (e.kind === "STEP") return `${STEP_LABEL[String(p.step)] ?? String(p.step)} · ${String(p.status ?? "")}`;
  if (e.kind === "DECISION") return `${String(p.decision ?? "").replace("_", " ")} by ${String(p.user ?? "?")} (${String(p.role ?? "").replace("_", " ").toLowerCase()})`;
  if (e.kind === "FILING") return `Filed by ${String(p.filed_by ?? "?")}, approved by ${String(p.approved_by ?? "?")}`;
  if (e.kind === "INGEST") return `Received ${String(p.txn_id ?? "")} · ${typeof p.amount === "number" ? p.amount.toLocaleString("en-US") : ""} ${String(p.currency ?? "")}`;
  if (e.kind === "COMMIT") return `Resolution ${String(p.action ?? "")}`.trim();
  return KIND_LABEL[e.kind] ?? e.kind;
}

/** Route written by this entry, if any (policy step or feed screen). */
export function entryRoute(e: AuditEntry): Route | null {
  const r = (e.payload as P).route;
  return typeof r === "string" && ROUTES.has(r) ? (r as Route) : null;
}

/** Duration in ms if the entry recorded one. */
export function entryMs(e: AuditEntry): string | null {
  return ms((e.payload as P).duration_ms);
}
