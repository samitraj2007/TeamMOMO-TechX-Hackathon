"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HighlightedText } from "@/components/HighlightedText";
import { ActorBadge, KV, Panel, Placeholder, RouteChip, RouteDot, aed } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { CaseDetail, CaseRun, CaseSummary, Health, Step } from "@/lib/types";

const STEP_MS = 650;
const FIELD_LABEL: Record<string, string> = {
  memo: "Wire memo",
  payee_name: "Payee name",
  device_label: "Device label",
  kyc_note: "KYC note",
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function CaseScreen({ id }: { id: string }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [run, setRun] = useState<CaseRun | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [h, c, d] = await Promise.all([api.health(), api.cases(), api.caseDetail(id)]);
        if (cancelled) return;
        setHealth(h);
        setCases(c);
        setDetail(d);
        setRun(d.run);
        setRevealed(d.run ? d.run.steps.length : 0);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (!run || revealed >= run.steps.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [run, revealed]);

  async function onRun() {
    setRunning(true);
    setRun(null);
    setRevealed(0);
    try {
      const r = await api.run(id);
      setRun(r);
      setRevealed(prefersReducedMotion() ? r.steps.length : 1);
      const [c, d] = await Promise.all([api.cases(), api.caseDetail(id)]);
      setCases(c);
      setDetail(d);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function onReset() {
    try {
      await api.reset();
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const idx = (key: string) => (run ? run.steps.findIndex((s) => s.key === key) : -1);
  const shown = (key: string) => run !== null && idx(key) >= 0 && revealed > idx(key);
  const done = run !== null && revealed >= run.steps.length;

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar health={health} onReset={onReset} />
      {health?.demo_mode === "replay" && (
        <Banner tone="llm">Replay mode · classifier verdicts served from the recorded cache, no live model calls</Banner>
      )}
      {health && health.demo_mode === "live" && !health.guard_live && (
        <Banner tone="review">
          Injection classifier offline (no API key / model). Cases fail closed to human review.
        </Banner>
      )}
      {error && (
        <Banner tone="approve">
          {error}
          <button className="ml-3 underline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </Banner>
      )}

      <div className="flex flex-1">
        <CaseRail cases={cases} activeId={id} />

        <main className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <CaseHeader detail={detail} running={running} onRun={onRun} />
          <Timeline run={run} revealed={revealed} running={running} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_auto_1.1fr_auto_1fr]">
            <RawPanel detail={detail} run={run} showSpans={shown("quarantine_regex")} />
            <Arrow active={shown("quarantine_regex")} />
            <QuarantinePanel run={run} showFacts={shown("quarantine_regex")} showClassifier={shown("quarantine_classifier")} />
            <Arrow active={shown("policy")} />
            <DecisionPanel
              id={id}
              run={run}
              detail={detail}
              show={shown("policy")}
              showGate={done}
              onChanged={() => setReloadKey((k) => k + 1)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
            <EvidencePanel run={run} show={shown("evidence")} />
            <CannotDoCard threshold={health?.threshold_aed ?? 10000} />
          </div>
        </main>
      </div>
    </div>
  );
}

function TopBar({ health, onReset }: { health: Health | null; onReset: () => void }) {
  return (
    <header className="flex items-center gap-4 border-b border-line bg-panel px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold tracking-[0.2em] text-fg">MOMO</span>
        <span className="text-sm font-medium tracking-wide text-muted">Sentinel</span>
      </div>
      <span className="text-xs text-faint">Gulf Horizon · Fraud triage console · synthetic data, simulation</span>
      <div className="ml-auto flex items-center gap-3 text-[11px] text-muted">
        {health ? (
          <>
            <span className="font-mono">mode={health.demo_mode}</span>
            <span className="font-mono">guard={health.guard_live ? "live" : "offline"}</span>
            <span className="font-mono">cache={health.cache_entries}</span>
            <span className="font-mono">threshold={health.threshold_aed.toLocaleString()} AED</span>
          </>
        ) : (
          <span>connecting…</span>
        )}
        <button
          onClick={onReset}
          className="rounded border border-line px-2 py-1 text-muted hover:border-muted hover:text-fg"
        >
          Reset demo
        </button>
      </div>
    </header>
  );
}

function Banner({ tone, children }: { tone: "llm" | "review" | "approve"; children: React.ReactNode }) {
  const cls = { llm: "border-llm/40 bg-llm/10 text-llm", review: "border-review/40 bg-review/10 text-review", approve: "border-approve/40 bg-approve/10 text-approve" }[tone];
  return <div className={`border-b px-5 py-2 text-[13px] ${cls}`}>{children}</div>;
}

function CaseRail({ cases, activeId }: { cases: CaseSummary[] | null; activeId: string }) {
  return (
    <nav className="w-64 shrink-0 border-r border-line bg-panel/60 p-3">
      <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Pinned demo cases</div>
      {!cases && <div className="px-2 text-sm text-faint">Loading…</div>}
      <ul className="flex flex-col gap-1">
        {cases?.map((c) => (
          <li key={c.alert_id}>
            <Link
              href={`/case/${c.alert_id}`}
              className={`flex items-center gap-2.5 rounded px-2 py-2 text-[13px] ${
                c.alert_id === activeId ? "bg-panel-2 text-fg ring-1 ring-line" : "text-muted hover:bg-panel-2/60 hover:text-fg"
              }`}
            >
              <span className="w-4 font-mono text-[11px] text-faint">{c.demo_tag}</span>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <RouteDot route={c.last_route} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CaseHeader({ detail, running, onRun }: { detail: CaseDetail | null; running: boolean; onRun: () => void }) {
  const s = detail?.summary;
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
      <div>
        <div className="font-mono text-[11px] text-faint">
          {s ? `${s.alert_id} · ${s.txn_id} · rule ${s.rule_id}` : "—"}
        </div>
        <h1 className="mt-1 text-xl font-semibold text-fg">{s?.title ?? "Loading case…"}</h1>
      </div>
      {s && (
        <div className="flex gap-6 text-[13px]">
          <div>
            <div className="text-faint">Amount</div>
            <div className="font-mono text-fg">{aed(s.amount)}</div>
          </div>
          <div>
            <div className="text-faint">Channel / origin</div>
            <div className="font-mono text-fg">
              {detail?.channel} · {detail?.country}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={onRun}
        disabled={running || !detail}
        className="ml-auto rounded-md bg-fg px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-white disabled:opacity-50"
      >
        {running ? "Running…" : detail?.run ? "Re-run investigation" : "Run investigation"}
      </button>
    </div>
  );
}

function stepTone(s: Step) {
  return {
    DONE: "text-clear",
    FLAGGED: "text-approve",
    DEGRADED: "text-review",
    SKIPPED: "text-faint",
    WAITING: "text-human",
    FAILED: "text-approve",
  }[s.status];
}

function Timeline({ run, revealed, running }: { run: CaseRun | null; revealed: number; running: boolean }) {
  if (!run) {
    return (
      <div className="rounded-md border border-dashed border-line px-4 py-3 text-[13px] text-faint">
        {running ? "Investigating…" : "Pipeline idle. Run the investigation to watch each step: CODE, LLM and HUMAN actors are labelled."}
      </div>
    );
  }
  return (
    <ol className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {run.steps.map((s, i) => (
        <li
          key={s.key}
          className={`rounded-md border border-line bg-panel px-3 py-2 transition-opacity ${i < revealed ? "reveal opacity-100" : "opacity-25"}`}
        >
          <div className="flex items-center gap-2">
            <ActorBadge actor={s.actor} />
            <span className={`ml-auto font-mono text-[10px] ${stepTone(s)}`}>{s.status}</span>
          </div>
          <div className="mt-1.5 text-[12px] font-medium leading-tight text-fg">{s.label}</div>
          <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{s.summary}</div>
          <div className="mt-1 font-mono text-[10px] text-faint">{s.duration_ms} ms</div>
        </li>
      ))}
    </ol>
  );
}

function Arrow({ active }: { active: boolean }) {
  return (
    <div className="hidden items-center xl:flex" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" className={active ? "text-muted" : "text-line"}>
        <path d="M4 12h14m-5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}

function RawPanel({ detail, run, showSpans }: { detail: CaseDetail | null; run: CaseRun | null; showSpans: boolean }) {
  const spans = run?.quarantine.spans ?? [];
  const fields = Object.entries(detail?.raw_fields ?? {}).filter(([, v]) => v);
  return (
    <Panel
      title="Raw input · untrusted"
      aside={<span className="text-[11px] text-approve/80">attacker-controllable</span>}
    >
      {!detail ? (
        <Placeholder>Loading…</Placeholder>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map(([field, value]) => {
            const fieldSpans = spans.filter((s) => s.field === field);
            const primary = field === "memo" || field === "payee_name";
            return (
              <div key={field}>
                <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-faint">
                  {FIELD_LABEL[field] ?? field}
                  {showSpans && fieldSpans.length > 0 && (
                    <span className="normal-case tracking-normal text-approve">
                      {Array.from(new Set(fieldSpans.map((s) => s.code))).join(" · ")}
                    </span>
                  )}
                </div>
                <p
                  dir="auto"
                  className={`whitespace-pre-wrap break-words rounded border border-line bg-ink px-3 py-2 font-mono leading-relaxed ${
                    primary ? "text-[14px] text-fg" : "text-[12px] text-muted"
                  }`}
                >
                  <HighlightedText text={value ?? ""} spans={fieldSpans} show={showSpans} />
                </p>
              </div>
            );
          })}
          <p className="text-[11px] text-faint">Displayed to humans only. Never placed in any model prompt.</p>
        </div>
      )}
    </Panel>
  );
}

function QuarantinePanel({ run, showFacts, showClassifier }: { run: CaseRun | null; showFacts: boolean; showClassifier: boolean }) {
  const q = run?.quarantine;
  const f = q?.memo_facts;
  return (
    <Panel title="Quarantine → MemoFacts" actor="CODE" aside={<ActorBadge actor="LLM" />}>
      {!q || !f || !showFacts ? (
        <Placeholder>Free text is converted to typed facts here</Placeholder>
      ) : (
        <div className="reveal flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Verdict
              label="Deterministic filter"
              actor="CODE"
              value={q.regex_flagged ? "INJECTION" : "CLEAN"}
              bad={q.regex_flagged}
            />
            {showClassifier ? (
              <Verdict
                label="Prompt Guard classifier"
                actor="LLM"
                value={q.classifier_verdict}
                bad={q.classifier_verdict !== "BENIGN"}
                detail={classifierDetail(q.classifier)}
              />
            ) : (
              <div className="rounded border border-dashed border-line" />
            )}
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-faint">
              MemoFacts · the only input the investigator receives
            </div>
            <div className="rounded border border-line bg-ink px-3 py-1">
              <KV k="invoice_refs">{f.invoice_refs.length ? f.invoice_refs.join(", ") : "[]"}</KV>
              <KV k="claimed_purpose">{f.claimed_purpose}</KV>
              <KV k="language">{f.language}</KV>
              <KV k="injection_detected">
                <span className={f.injection_detected ? "text-approve" : "text-clear"}>{String(f.injection_detected)}</span>
              </KV>
              <KV k="injection_signals">
                {f.injection_signals.length === 0 ? (
                  "[]"
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {f.injection_signals.map((s) => (
                      <span key={`${s.code}-${s.field}-${s.layer}`} className="rounded bg-approve/10 px-1 text-[11px] text-approve">
                        {s.code}@{s.field}
                        <span className="text-faint"> {s.layer}</span>
                      </span>
                    ))}
                  </span>
                )}
              </KV>
              <KV k="classifier_status">{f.classifier_status}</KV>
              <KV k="raw_hash">{f.raw_hash.slice(0, 16)}…</KV>
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-clear/40 bg-clear/10 px-3 py-2">
            <span className="text-[13px] text-fg">Raw text reached the investigator?</span>
            <span className="font-mono text-sm font-bold text-clear">NO</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

function classifierDetail(vs: CaseRun["quarantine"]["classifier"]) {
  return vs
    .map((v) => `${v.field}: ${v.score === null ? v.status : v.score.toFixed(3)}${v.cached ? " (cached)" : ""}`)
    .join(" · ");
}

function Verdict({ label, actor, value, bad, detail }: { label: string; actor: "CODE" | "LLM"; value: string; bad: boolean; detail?: string }) {
  return (
    <div className={`reveal rounded border px-3 py-2 ${bad ? "border-approve/50 bg-approve/10" : "border-clear/40 bg-clear/5"}`}>
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <ActorBadge actor={actor} />
        {label}
      </div>
      <div className={`mt-1 font-mono text-sm font-bold ${bad ? "text-approve" : "text-clear"}`}>{value}</div>
      {detail && <div className="mt-0.5 font-mono text-[10px] leading-snug text-faint">{detail}</div>}
    </div>
  );
}

function DecisionPanel({
  id,
  run,
  detail,
  show,
  showGate,
  onChanged,
}: {
  id: string;
  run: CaseRun | null;
  detail: CaseDetail | null;
  show: boolean;
  showGate: boolean;
  onChanged: () => void;
}) {
  return (
    <Panel title="Policy decision" actor="CODE" aside={<span className="font-mono text-[10px] text-faint">policy/engine.py</span>}>
      {!run || !show ? (
        <Placeholder>Pure-Python policy decides the route</Placeholder>
      ) : (
        <div className="reveal flex flex-col gap-4">
          <RouteChip route={run.decision.route} large />
          <ul className="flex flex-col gap-1.5">
            {run.decision.reasons.map((r) => (
              <li key={r.code} className="text-[13px]">
                <span className="font-mono text-[12px] text-fg">{r.code}</span>
                <span className="text-muted"> · {r.detail}</span>
              </li>
            ))}
          </ul>
          {showGate && <GatePanel key={`${id}-${run.total_ms}`} id={id} run={run} detail={detail} onChanged={onChanged} />}
        </div>
      )}
    </Panel>
  );
}

function GatePanel({ id, run, detail, onChanged }: { id: string; run: CaseRun; detail: CaseDetail | null; onChanged: () => void }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const resolution = detail?.resolution ?? run.resolution;
  const approval = detail?.approval;

  async function tryCommit(action: "CLEAR" | "HOLD_AND_BLOCK") {
    setRefusal(null);
    try {
      await api.commit(id, action);
      onChanged();
    } catch (e) {
      setRefusal(errorMessage(e));
    }
  }

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    setErr(null);
    try {
      await api.decide(id, { decision, action: "HOLD_AND_BLOCK", reason });
      onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (resolution) {
    return (
      <div className="reveal rounded border border-line bg-ink px-3 py-2 text-[13px]">
        <div className="flex items-center gap-2">
          <ActorBadge actor={resolution.approval_id ? "HUMAN" : "CODE"} />
          <span className="font-semibold text-fg">Committed: {resolution.action}</span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted">
          {resolution.record_id}
          {resolution.approval_id && ` · approval ${resolution.approval_id}`}
        </div>
        {approval && (
          <div className="mt-1 text-[12px] text-muted">
            {approval.actor} ({approval.role}): “{approval.reason}”
          </div>
        )}
      </div>
    );
  }

  if (run.decision.route === "NEEDS_REVIEW") {
    return (
      <div className="reveal flex flex-col gap-2 rounded border border-review/40 bg-review/5 px-3 py-3">
        <div className="flex items-center gap-2 text-[13px] text-fg">
          <ActorBadge actor="HUMAN" /> Escalated to analyst. Funds are <b>not</b> released.
        </div>
        <button
          onClick={() => tryCommit("CLEAR")}
          className="self-start rounded border border-line px-3 py-1.5 text-[12px] text-muted hover:border-approve hover:text-approve"
        >
          Try to release funds without a human
        </button>
        {refusal && <Refusal text={refusal} />}
      </div>
    );
  }

  return (
    <div className="reveal flex flex-col gap-2.5 rounded border border-approve/40 bg-approve/5 px-3 py-3">
      <div className="flex items-center gap-2 text-[13px] text-fg">
        <ActorBadge actor="HUMAN" /> Held. Compliance officer approval required before commit.
      </div>
      <button
        onClick={() => tryCommit("HOLD_AND_BLOCK")}
        className="self-start rounded border border-line px-3 py-1.5 text-[12px] text-muted hover:border-approve hover:text-approve"
      >
        Commit block without approval
      </button>
      {refusal && <Refusal text={refusal} />}
      {approval && approval.decision !== "APPROVE" && (
        <div className="text-[12px] text-muted">
          Last decision: {approval.decision} by {approval.actor} · “{approval.reason}”
        </div>
      )}
      <label className="mt-1 text-[11px] uppercase tracking-wider text-faint" htmlFor="reason">
        Officer reason (required)
      </label>
      <textarea
        id="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="e.g. Alias + DOB match WL-002; amount above threshold"
        className="rounded border border-line bg-ink px-2 py-1.5 text-[13px] text-fg placeholder:text-faint"
      />
      <div className="flex gap-2">
        <button
          disabled={busy || reason.trim().length < 3}
          onClick={() => decide("APPROVE")}
          className="rounded bg-approve px-3 py-1.5 text-[13px] font-semibold text-ink disabled:opacity-40"
        >
          Approve hold &amp; block
        </button>
        <button
          disabled={busy || reason.trim().length < 3}
          onClick={() => decide("REJECT")}
          className="rounded border border-line px-3 py-1.5 text-[13px] text-muted disabled:opacity-40"
        >
          Reject
        </button>
      </div>
      {err && <Refusal text={err} />}
    </div>
  );
}

function Refusal({ text }: { text: string }) {
  return (
    <div className="reveal rounded border border-approve/50 bg-ink px-2 py-1.5 font-mono text-[11px] text-approve">
      REFUSED BY CODE · {text}
    </div>
  );
}

function EvidencePanel({ run, show }: { run: CaseRun | null; show: boolean }) {
  const ev = run?.evidence;
  const matches = [...(ev?.sanctions_customer?.matches ?? []), ...(ev?.sanctions_payee?.matches ?? [])];
  return (
    <Panel title="Evidence · mock bank systems" actor="CODE">
      {!ev || !show ? (
        <Placeholder>KYC, devices, sanctions and velocity records with IDs</Placeholder>
      ) : (
        <div className="reveal grid grid-cols-1 gap-x-8 md:grid-cols-2">
          <div>
            <KV k="customer">
              {ev.kyc ? `${ev.kyc.customer.record_id} · ${ev.kyc.customer.segment}` : "unavailable"}
            </KV>
            <KV k="device">
              {ev.kyc ? (
                <span className={ev.kyc.device_known_and_verified ? "text-clear" : "text-approve"}>
                  {ev.kyc.txn_device.record_id} · {ev.kyc.device_known_and_verified ? "verified" : "UNVERIFIED"}
                </span>
              ) : (
                "unavailable"
              )}
            </KV>
            <KV k="velocity 24h">
              {ev.velocity
                ? `${ev.velocity.record_id} · ${ev.velocity.txn_count_24h} txns · ${ev.velocity.new_payees_24h} new payees · ${Math.round(ev.velocity.amount_24h).toLocaleString()} AED`
                : "unavailable"}
            </KV>
          </div>
          <div>
            <KV k="sanctions">
              <span
                className={
                  ev.sanctions_customer?.band === "HIT" ? "text-approve" : ev.sanctions_customer?.band === "POSSIBLE" ? "text-review" : "text-clear"
                }
              >
                {ev.sanctions_customer?.band ?? "unavailable"}
              </span>
            </KV>
            {matches.map((m) => (
              <KV key={m.watchlist_id + m.screened_name} k={m.watchlist_id}>
                {m.listed_name} · via {m.matched_on} · DOB {m.dob_match === null ? "n/a" : m.dob_match ? "match" : "differs"} · {m.band}
              </KV>
            ))}
            <KV k="record ids">
              <span className="text-[11px] text-muted">{ev.record_ids.join(" ")}</span>
            </KV>
          </div>
        </div>
      )}
    </Panel>
  );
}

function CannotDoCard({ threshold }: { threshold: number }) {
  const items = [
    "Read raw memo, name, device or KYC text",
    "Block, release, file or commit anything",
    "Lower a route the policy engine set",
    `Clear a case above ${threshold.toLocaleString()} AED or with a watchlist hit`,
  ];
  return (
    <Panel title="What the model cannot do" actor="LLM">
      <ul className="flex flex-col gap-2">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-[13px] text-fg">
            <span className="font-mono text-approve">✕</span>
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-faint">Enforced in code: the model is given no such functions.</p>
    </Panel>
  );
}
