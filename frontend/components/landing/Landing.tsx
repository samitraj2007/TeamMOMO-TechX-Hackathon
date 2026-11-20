"use client";

import { motion, useScroll, useSpring } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Airlock } from "@/components/case/Airlock";
import { rawTextInInvestigator } from "@/components/case/CaseView";
import { Reveal } from "@/components/landing/Reveal";
import { ActorTag } from "@/components/primitives";
import type { ActorType } from "@/lib/labels";
import { useMotionOK } from "@/lib/motion";
import { useCase, useCases } from "@/lib/queries";

/** Hero entrance delay, read by the .rise keyframe in globals.css. */
const rise = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as CSSProperties;

/** Shared hover/press feedback for landing links: quick ease-out, a 2% press, the arrow nudges forward. */
const PRESS = "transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-[0.98]";

/** Facts below come from RULES.md, docs/02 and the live pipeline (STEP_LABEL); nothing here is a statistic. */
const STEPS: { n: string; title: string; actor: ActorType; body: string }[] = [
  {
    n: "01",
    title: "Quarantine",
    actor: "CODE",
    body: "Every free-text field (memo, payee name, device label, KYC note) is normalised and scanned in code: zero-width and homoglyph stripping, base64 and hex detection, injection patterns.",
  },
  {
    n: "02",
    title: "Injection classifier",
    actor: "LLM",
    body: "A classifier scores each field. It can raise a case's risk, never lower it. If it fails or times out, the case fails closed to human review.",
  },
  {
    n: "03",
    title: "Evidence",
    actor: "CODE",
    body: "KYC, devices, the sanctions watchlist and 24-hour velocity are fetched by code. Every record carries a stable ID.",
  },
  {
    n: "04",
    title: "Investigator",
    actor: "LLM",
    body: "The model receives typed MemoFacts, never the raw memo. Its findings must cite record IDs; uncited report sentences are rejected by the citation verifier.",
  },
  {
    n: "05",
    title: "Policy engine",
    actor: "CODE",
    body: "Pure Python decides the route. Over the configured threshold (10,000 AED here) or a watchlist hit forces pending approval. The model can make a route stricter, never looser.",
  },
  {
    n: "06",
    title: "Human gate",
    actor: "HUMAN",
    body: "Where approval is required, a compliance officer decides with a recorded reason. The backend refuses to commit without it, and every step is written to a hash-chained audit log.",
  },
];

const ROUTES: { href: string; label: string; note: string }[] = [
  { href: "/queue", label: "Queue", note: "Flagged cases, three lanes" },
  { href: "/transactions", label: "Transactions", note: "All synthetic transactions; run any one" },
  { href: "/audit", label: "Audit", note: "Per-case log and chain verification" },
  { href: "/ingest", label: "Test your own case", note: "Write an unseen memo and run it" },
];

const PROOF = ["Synthetic data, simulation", "Policy in pure Python", "Model cannot release funds", "Hash-chained audit", "EN / عربي"];

const noopSubscribe = () => () => {};

export function Landing() {
  const cases = useCases(false);
  // The server render has no case list; read it only after hydration so the first client render matches.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const list = hydrated ? cases.data : undefined;
  const b = list?.find((c) => c.demo_tag === "B");

  return (
    <div>
      {/* Hero: charcoal and type-led. The mascot stands on the first node of the spine, which drops into the fact strip. */}
      <section className="palette-charcoal relative overflow-hidden bg-bg text-text">
        <div className="mx-auto grid min-h-[calc(100svh-56px-53px)] w-full max-w-[1240px] gap-y-12 px-5 pt-14 sm:px-8 lg:grid-cols-12 lg:gap-x-8 lg:pt-0">
          <div className="flex flex-col justify-center pb-14 lg:col-span-8 lg:pb-14 lg:pt-10">
            <p className="rise font-mono text-[11px] uppercase tracking-[0.18em] text-muted" style={rise(0)}>
              MOMO Sentinel <span className="text-sage">/</span> payment triage
            </p>
            <h1 className="mt-6 text-[clamp(2.75rem,1.2rem+4.8vw,5.5rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-text">
              <span className="rise block" style={rise(80)}>The model</span>
              <span className="rise block" style={rise(160)}>investigates.</span>
              <span className="rise block text-sage" style={rise(260)}>The code decides.</span>
            </h1>
            <p className="rise mt-8 max-w-[30rem] text-[15px] leading-7 text-muted" style={rise(380)}>
              MOMO triages flagged payments for a bank. Attacker-written text is quarantined in code, the model sees only typed
              facts, and funds move only after a pure-Python policy check and, where required, a recorded human approval.
            </p>
            <div className="rise mt-8 flex flex-wrap items-center gap-3" style={rise(460)}>
              <Link
                href="/queue"
                className={`group inline-flex h-12 items-center gap-2.5 rounded-md bg-text px-6 text-sm font-medium text-bg hover:bg-text/90 ${PRESS}`}
              >
                Open the queue <Arrow />
              </Link>
              {b && (
                <Link
                  href={`/case/${b.alert_id}`}
                  className={`group inline-flex h-12 items-center gap-2.5 rounded-md border border-hairline-strong px-6 text-sm font-medium text-text hover:border-sage hover:text-sage ${PRESS}`}
                >
                  Watch Case B <Arrow />
                </Link>
              )}
            </div>
          </div>

          <figure className="rise relative flex flex-col items-center justify-end lg:col-span-4" style={rise(300)}>
            <Image
              src="/brand/momo-mascot.png"
              alt="MOMO, the guard mascot, holding a shield with a padlock"
              width={1024}
              height={1024}
              priority
              className="aspect-square h-auto w-full max-w-[14rem] object-contain sm:max-w-[18rem] lg:max-w-[22rem]"
            />
            <span aria-hidden className="h-14 w-[2px] bg-sage" />
            <span aria-hidden className="absolute -bottom-[5px] z-[1] h-2.5 w-2.5 rounded-[2px] bg-sage" />
          </figure>
        </div>

        <div className="relative border-t border-hairline">
          <ul className="mx-auto flex w-full max-w-[1240px] flex-wrap gap-x-7 gap-y-2 px-5 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-muted sm:px-8">
            {PROOF.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span aria-hidden className="h-1 w-1 bg-sage" />
                <span className={p.includes("عربي") ? "normal-case" : undefined}>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Mechanism: the spine. The heading holds while the steps scroll; the teal line draws with reading progress. */}
      <section aria-labelledby="mechanism" className="mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-8">
          <Reveal className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              <span className="text-sage">01</span> / The pipeline
            </p>
            <h2 id="mechanism" className="mt-5 text-[clamp(2.25rem,1.3rem+2.8vw,3.75rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-text">
              How a hostile memo is stopped.
            </h2>
            <p className="mt-6 max-w-sm text-[15px] leading-7 text-muted">
              Six stages, each labelled by who acts: deterministic code, the model, or a human. Every case screen shows the same
              spine, read live from its audit log.
            </p>
          </Reveal>

          <Spine />
        </div>
      </section>

      {/* Live exhibit: real Case B data, all states preserved. */}
      <section aria-labelledby="exhibit" className="border-y border-hairline bg-surface">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-8 lg:py-28">
          <Reveal className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                <span className="text-sage">02</span> / Live · Case B
              </p>
              <h2 id="exhibit" className="mt-5 max-w-2xl text-[clamp(2rem,1.2rem+2.4vw,3.25rem)] font-semibold leading-[1] tracking-[-0.045em] text-text">
                An injected memo, held at the gate.
              </h2>
            </div>
            {b && (
              <Link href={`/case/${b.alert_id}`} className={`group inline-flex items-center gap-2 text-sm font-medium text-sage ${PRESS}`}>
                <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-300 ease-out group-hover:bg-[length:100%_1px]">
                  Open the full case
                </span>
                <Arrow />
              </Link>
            )}
          </Reveal>
          <Reveal delay={0.08}>
            <CaseBExhibit alertId={b?.alert_id ?? null} casesReady={!!list} casesError={hydrated && cases.isError} onRetry={() => void cases.refetch()} />
          </Reveal>
        </div>
      </section>

      {/* Ordinary navigation into the console. */}
      <nav aria-label="Console" className="mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-8 lg:py-28">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span className="text-sage">03</span> / Into the console
          </p>
        </Reveal>
        <ul className="mt-8 border-t border-hairline">
          {ROUTES.map((r, i) => (
            <li key={r.href} className="border-b border-hairline">
              <Reveal delay={i * 0.06} y={12}>
                <RouteLink href={r.href} label={r.label} note={r.note} />
              </Reveal>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted sm:px-8">
          <span>Team MOMO · TechX Hackathon</span>
          <span>Synthetic data · simulation only</span>
        </div>
      </footer>
    </div>
  );
}

function Spine() {
  const list = useRef<HTMLOListElement>(null);
  const motionOK = useMotionOK();
  const { scrollYProgress } = useScroll({ target: list, offset: ["start 75%", "end 55%"] });
  const draw = useSpring(scrollYProgress, { stiffness: 140, damping: 32, restDelta: 0.001 });

  return (
    <ol ref={list} className="relative lg:col-span-8">
      <span aria-hidden className="absolute bottom-10 start-[5px] top-10 w-[2px] bg-hairline" />
      <motion.span
        aria-hidden
        className="absolute bottom-10 start-[5px] top-10 w-[2px] origin-top bg-sage"
        style={motionOK ? { scaleY: draw } : undefined}
      />
      {STEPS.map((s) => (
        <li key={s.n} className="relative border-b border-hairline last:border-b-0">
          <span aria-hidden className="absolute start-0 top-[36px] z-[1] h-3 w-3 rounded-[2px] border-2 border-sage bg-bg" />
          <Reveal y={16} className="grid gap-x-8 gap-y-3 py-7 ps-10 md:grid-cols-[14rem_1fr]">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-sage">{s.n}</span>
              <h3 className="text-xl font-semibold tracking-[-0.025em] text-text">{s.title}</h3>
            </div>
            <div className="flex flex-col items-start gap-3">
              <ActorTag actor={s.actor} />
              <p className="max-w-[34rem] text-[15px] leading-7 text-muted">{s.body}</p>
            </div>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}

function RouteLink({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <Link href={href} className="group relative flex flex-wrap items-baseline gap-x-8 gap-y-1 py-6 outline-offset-4">
      <span
        aria-hidden
        className="absolute inset-y-3 start-0 w-[2px] origin-center scale-y-0 bg-sage transition-transform duration-300 ease-out group-hover:scale-y-100 group-focus-visible:scale-y-100"
      />
      <span className="text-[clamp(1.5rem,1.1rem+1.4vw,2.25rem)] font-semibold tracking-[-0.035em] text-text transition-[color,transform] duration-300 ease-out group-hover:translate-x-4 group-hover:text-sage group-focus-visible:translate-x-4 group-active:scale-[0.99]">
        {label}
      </span>
      <span className="text-sm text-muted transition-transform duration-300 ease-out group-hover:translate-x-4 group-focus-visible:translate-x-4">{note}</span>
      <span className="ms-auto text-muted transition-colors duration-200 group-hover:text-sage">
        <Arrow />
      </span>
    </Link>
  );
}

/** Arrow that nudges forward when its parent `group` is hovered or focused. */
function Arrow(): ReactNode {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="transition-transform duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1 rtl:-scale-x-100"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
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
