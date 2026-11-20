"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { MomoLockup } from "@/components/brand/MomoLockup";
import { Airlock } from "@/components/case/Airlock";
import { rawTextInInvestigator } from "@/components/case/CaseView";
import { CountUp } from "@/components/primitives";
import { int } from "@/lib/format";
import { useMotionOK } from "@/lib/motion";
import { useCase, useCases, useTransactions, useVerify } from "@/lib/queries";

const ACTORS = [
  {
    name: "Code",
    tone: "text-sage",
    body: "Quarantines the memo and decides the route. It is the only part that can block or release funds.",
  },
  {
    name: "Model",
    tone: "text-model",
    body: "Writes findings and must cite a record for each one. It can only make a route stricter.",
  },
  {
    name: "Human",
    tone: "text-human",
    body: "Approves before funds move or a report is filed. Filing without that approval is refused.",
  },
] as const;

const STEPS = [
  { title: "Quarantine", body: "Code reads the memo and cuts out anything trying to instruct the model. The raw text stays on this side of the gate." },
  { title: "Evidence", body: "Code fetches KYC, the device, sanctions and velocity. Names and free-text notes never enter the prompt." },
  { title: "Policy gate", body: "Code picks the route from the threshold and the evidence. The model cannot clear a case the code held." },
  { title: "Investigator", body: "The model writes cited findings. A finding without a real record is rejected, and the route only gets stricter." },
  { title: "Human approval", body: "A person approves before money is released or a report is filed. The filing itself is simulated." },
];

export function Landing() {
  const cases = useCases(false);
  const b = cases.data?.find((c) => c.demo_tag === "B");

  return (
    <div>
      <section className="flex min-h-[calc(100svh-56px)] flex-col items-center justify-center bg-text px-8 py-16 text-bg">
        <MomoLockup />
        <p className="mt-16 max-w-[42ch] text-center font-sans text-sm font-normal leading-5 tracking-normal text-bg">
          GulfHorizon: an autonomous fraud-triage agent that can&apos;t be talked into releasing funds
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/queue" className="press inline-flex h-9 items-center rounded-full bg-bg px-4 text-sm text-text">
            Open the queue
          </Link>
          {b && (
            <Link href={`/case/${b.alert_id}`} className="press inline-flex h-9 items-center rounded-full border border-brass px-4 text-sm text-bg">
              Watch Case B
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-[980px] grid-cols-1 gap-10 px-8 py-24 lg:grid-cols-3 lg:px-0">
        {ACTORS.map((actor) => (
          <p key={actor.name} className="text-sm leading-6 text-muted">
            <span className={`font-medium ${actor.tone}`}>{actor.name}. </span>
            {actor.body}
          </p>
        ))}
      </section>

      <Numbers />

      <section className="mx-auto max-w-[980px] px-8 py-8 lg:px-0" aria-label="Case B quarantine">
        <CaseBExhibit alertId={b?.alert_id ?? null} casesReady={!!cases.data} casesError={cases.isError} onRetry={() => void cases.refetch()} />
      </section>

      <Flow />

      <footer className="mx-auto mt-8 flex max-w-[980px] flex-col gap-1 border-t border-hairline px-8 py-8 lg:px-0">
        <p className="text-sm text-text">FinTech Fraud &amp; Compliance · University Track</p>
        <p className="text-sm text-muted">Team MOMO</p>
        <p className="mt-2 text-xs text-muted">synthetic data; filing is simulated</p>
      </footer>
    </div>
  );
}

function CaseBExhibit({
  alertId,
  casesReady,
  casesError,
  onRetry,
}: {
  alertId: string | null;
  casesReady: boolean;
  casesError: boolean;
  onRetry: () => void;
}) {
  const detail = useCase(alertId ?? "");
  if (casesError) {
    return (
      <p className="text-sm text-muted">
        The case list did not load.{" "}
        <button type="button" className="underline underline-offset-4" onClick={onRetry}>Retry</button>
      </p>
    );
  }
  if (!casesReady || (alertId && detail.isPending)) return <p className="text-sm text-muted">Loading Case B</p>;
  if (!alertId) return <p className="text-sm text-muted">Case B is not in the queue.</p>;
  if (detail.isError) {
    return (
      <p className="text-sm text-muted">
        Case B did not load.{" "}
        <button type="button" className="underline underline-offset-4" onClick={() => void detail.refetch()}>Retry</button>
      </p>
    );
  }
  const run = detail.data?.run;
  const memo = detail.data?.raw_fields.memo ?? "";
  if (!run || !memo) {
    return (
      <p className="text-sm text-muted">
        Case B has not been run.{" "}
        <Link href={`/case/${alertId}`} className="underline underline-offset-4 hover:text-text">Open Case B</Link>
      </p>
    );
  }
  return (
    <Airlock
      exhibit
      memo={memo}
      spans={run.quarantine.spans}
      facts={run.quarantine.memo_facts}
      rawReceived={rawTextInInvestigator(run, detail.data?.raw_fields ?? {})}
    />
  );
}

function Numbers() {
  const txns = useTransactions();
  const verify = useVerify();
  if (txns.isPending || verify.isPending) return <p className="mx-auto max-w-[980px] px-8 text-sm text-muted lg:px-0">Loading live counts</p>;
  if (txns.isError || verify.isError || !txns.data || !verify.data) {
    return (
      <p className="mx-auto max-w-[980px] px-8 text-sm text-muted lg:px-0">
        Live counts are not available.{" "}
        <button type="button" className="underline underline-offset-4" onClick={() => { void txns.refetch(); void verify.refetch(); }}>
          Retry
        </button>
      </p>
    );
  }
  const rows = txns.data;
  const figures = [
    { label: "Transactions", value: rows.length },
    { label: "Alerts", value: rows.filter((r) => r.alerted).length },
    { label: "Auto-cleared", value: rows.filter((r) => r.last_route === "AUTO_CLEAR").length },
    { label: "Sent to humans", value: rows.filter((r) => r.last_route === "NEEDS_REVIEW" || r.last_route === "PENDING_APPROVAL").length },
    { label: "Audit events", value: verify.data.entries },
  ];
  return (
    <section className="mx-auto flex max-w-[980px] flex-wrap gap-x-10 gap-y-6 px-8 lg:px-0" aria-label="Live counts">
      {figures.map((fig) => (
        <p key={fig.label} className="flex flex-col">
          <span className="text-2xs uppercase tracking-[0.14em] text-muted">{fig.label}</span>
          <span className="num mt-1 text-xl text-text"><CountUp value={fig.value} format={int} /></span>
        </p>
      ))}
    </section>
  );
}

function Flow() {
  const motionOK = useMotionOK();
  return (
    <section className="mx-auto max-w-[980px] px-8 py-24 lg:px-0">
      <h2 className="text-sm text-muted">How a case flows</h2>
      <ol className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            initial={motionOK ? { opacity: 0, y: 12 } : false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: motionOK ? i * 0.06 : 0, ease: [0.2, 0, 0, 1] }}
          >
            <h3 className="text-sm font-medium text-text">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
