"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { Airlock } from "@/components/case/Airlock";
import { rawTextInInvestigator } from "@/components/case/CaseView";
import { CountUp, EmptyState, ErrorState, LoadingState } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { int } from "@/lib/format";
import { useMotionOK } from "@/lib/motion";
import { useCase, useCases, useTransactions, useVerify } from "@/lib/queries";

const ACTORS = [
  {
    name: "Code",
    tone: "text-sage",
    mark: "bg-sage",
    offset: "lg:mt-0",
    body: "Quarantines the memo and decides the route. It is the only part that can block or release funds.",
  },
  {
    name: "Model",
    tone: "text-model",
    mark: "bg-model",
    offset: "lg:mt-8",
    body: "Writes findings and must cite a record for each one. It can only make a route stricter.",
  },
  {
    name: "Human",
    tone: "text-human",
    mark: "bg-human",
    offset: "lg:mt-3",
    body: "Approves before funds move or a report is filed. Filing without that approval is refused.",
  },
] as const;

const STEPS = [
  { n: "01", title: "Quarantine", body: "Code reads the memo and cuts out anything trying to instruct the model. The raw text stays on this side of the gate." },
  { n: "02", title: "Evidence", body: "Code fetches KYC, the device, sanctions and velocity. Names and free-text notes never enter the prompt." },
  { n: "03", title: "Policy gate", body: "Code picks the route from the threshold and the evidence. The model cannot clear a case the code held." },
  { n: "04", title: "Investigator", body: "The model writes cited findings. A finding without a real record is rejected, and the route only gets stricter." },
  { n: "05", title: "Human approval", body: "A person approves before money is released or a report is filed. The filing itself is simulated." },
];

const linkSolid =
  "press inline-flex h-10 items-center rounded-search border border-sage bg-sage px-4 text-sm font-medium text-bg hover:bg-[#186640]";
const linkQuiet =
  "press inline-flex h-10 items-center rounded-search border border-hairline-strong bg-surface px-4 text-sm font-medium text-text shadow-sheen hover:bg-raised";

export function Landing() {
  const cases = useCases(false);
  const b = cases.data?.find((c) => c.demo_tag === "B");

  return (
    <div className="pb-6">
      <section className="mx-auto grid max-w-[1180px] grid-cols-1 items-end gap-10 px-6 pt-16 lg:grid-cols-12 lg:px-10 lg:pt-20">
        <div className="lg:col-span-7">
          <p className="text-2xs font-medium uppercase tracking-[0.18em] text-sage">Payment triage</p>
          <h1 className="mt-5 max-w-[13ch] text-[64px] font-medium leading-[1.02] tracking-[-0.045em] text-text">
            An autonomous fraud-triage agent that can&apos;t be talked into releasing funds.
          </h1>
          <p className="mt-6 max-w-[46ch] text-md leading-7 text-muted">
            Every payment memo is untrusted. Code quarantines it and decides the route. Only typed facts reach the model, and a person still approves before money moves.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/queue" className={linkSolid}>Open the queue</Link>
            {b ? (
              <Link href={`/case/${b.alert_id}`} className={linkQuiet}>Watch Case B</Link>
            ) : (
              <span className={`${linkQuiet} cursor-not-allowed opacity-40`} aria-disabled="true">Watch Case B</span>
            )}
          </div>
        </div>
        <p className="max-w-[28ch] text-sm leading-6 text-muted lg:col-span-4 lg:col-start-9 lg:mb-3">
          The model has no block, release, file or commit. If it fails, the case goes to a person.
        </p>
      </section>

      <section className="relative mx-auto mt-14 max-w-[1080px] px-6 lg:ms-[max(1.5rem,calc((100%-1180px)/2+2.5rem))] lg:me-10 lg:px-0" aria-label="Case B quarantine">
        <div aria-hidden className="absolute -end-3 top-6 -z-10 h-[88%] w-[96%] rounded-search border border-hairline bg-raised" />
        <CaseBExhibit alertId={b?.alert_id ?? null} casesReady={!!cases.data} casesError={cases.isError} onRetry={() => void cases.refetch()} />
      </section>

      <section className="mx-auto mt-24 grid max-w-[1180px] grid-cols-1 gap-4 px-6 lg:grid-cols-3 lg:px-10">
        {ACTORS.map((actor) => (
          <article key={actor.name} className={`sheet rounded-search border border-hairline bg-surface px-5 py-6 ${actor.offset}`}>
            <span className={`inline-flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.16em] ${actor.tone}`}>
              <span aria-hidden className={`h-1.5 w-1.5 ${actor.mark}`} />
              {actor.name}
            </span>
            <p className="mt-4 text-sm leading-6 text-text">{actor.body}</p>
          </article>
        ))}
      </section>

      <Numbers />

      <Flow />

      <footer className="mx-auto mt-24 flex max-w-[1180px] flex-col gap-1 border-t border-hairline px-6 py-8 lg:px-10">
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
  if (casesError) return <ErrorState error={new Error("The case list did not load.")} onRetry={onRetry} />;
  if (!casesReady || (alertId && detail.isPending)) return <LoadingState label="Loading Case B" />;
  if (!alertId) return <EmptyState title="Case B is not in the queue" body="The demo list has no case tagged B, so there is nothing to play." />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const run = detail.data?.run;
  const memo = detail.data?.raw_fields.memo ?? "";
  if (!run || !memo) {
    return (
      <EmptyState
        title="Case B has not been run"
        body="The airlock plays the real quarantine result. Run the case and this loop fills in."
        action={<Link href={`/case/${alertId}`} className={linkQuiet}>Open Case B</Link>}
      />
    );
  }
  return (
    <Airlock
      exhibit
      className="rounded-search"
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
  if (txns.isPending || verify.isPending) return <div className="mx-auto mt-20 max-w-[1180px] px-6 lg:px-10"><LoadingState label="Loading live counts" lines={2} /></div>;
  if (txns.isError || verify.isError || !txns.data || !verify.data) {
    return (
      <div className="mx-auto mt-20 max-w-[1180px] px-6 lg:px-10">
        <EmptyState
          title="Live counts are not available"
          body="Transactions and the audit chain did not both load. This row stays empty rather than showing stand-in numbers."
          action={
            <button type="button" className={linkQuiet} onClick={() => { void txns.refetch(); void verify.refetch(); }}>
              Retry
            </button>
          }
        />
      </div>
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
    <section className="mx-auto mt-20 grid max-w-[1180px] grid-cols-2 gap-px overflow-hidden rounded-search border border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-5" aria-label="Live counts">
      {figures.map((fig, i) => (
        <div key={fig.label} className={cx("px-5 py-5", i === 2 ? "bg-raised" : "bg-surface")}>
          <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted">{fig.label}</p>
          <p className="num mt-2 text-xl font-medium text-text"><CountUp value={fig.value} format={int} /></p>
        </div>
      ))}
    </section>
  );
}

function Flow() {
  const motionOK = useMotionOK();
  return (
    <section className="mx-auto mt-24 max-w-[1180px] px-6 lg:px-10">
      <h2 className="max-w-[16ch] text-lg font-medium tracking-[-0.03em] text-text">How a case flows</h2>
      <ol className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.n}
            initial={motionOK ? { opacity: 0, y: 18 } : false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: motionOK ? i * 0.08 : 0, ease: [0.2, 0, 0, 1] }}
            className={i === 1 || i === 3 ? "lg:mt-6" : undefined}
          >
            <span className="num text-2xs text-sage">{step.n}</span>
            <h3 className="mt-2 text-sm font-medium text-text">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
