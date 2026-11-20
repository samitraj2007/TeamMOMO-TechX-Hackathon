"use client";

import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRef, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Airlock } from "@/components/case/Airlock";
import { rawTextInInvestigator } from "@/components/case/CaseView";
import { HeroField } from "@/components/landing/HeroField";
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
      <Hero caseB={b?.alert_id ?? null} />

      {/* The page rises over the fold like a sheet: paper with a rounded leading edge. */}
      <div className="relative z-[2] -mt-8 rounded-t-[32px] bg-bg pt-10">
      {/* Plain facts about the build, on paper. Nothing here is a statistic. */}
      <ul aria-label="About this demo" className="mx-auto flex w-full max-w-[1240px] flex-wrap justify-center gap-x-8 gap-y-2 px-5 pt-4 text-sm text-muted sm:px-8">
        {PROOF.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sage" />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      {/* Mechanism: the spine. The heading holds while the steps scroll; the teal line draws with reading progress. */}
      <section aria-labelledby="mechanism" className="mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-8">
          <Reveal className="lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
            <h2 id="mechanism" className="scroll-mt-24 text-[clamp(2.25rem,1.3rem+2.8vw,3.75rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-text">
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
      <section aria-labelledby="exhibit" className="mx-3 rounded-[28px] bg-surface shadow-card sm:mx-5">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-24 sm:px-8 lg:py-28">
          <Reveal className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <span className="inline-flex h-7 items-center gap-2 rounded-full border border-hairline px-3 text-xs font-medium text-muted">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sage" />
                Live from the backend: Case B
              </span>
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
          <h2 className="text-[clamp(2rem,1.2rem+2.4vw,3.25rem)] font-semibold leading-[1] tracking-[-0.045em] text-text">Open the console.</h2>
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
          <span>Team MOMO, TechX Hackathon</span>
          <span>Synthetic data. Simulation only.</span>
        </div>
      </footer>
      </div>
    </div>
  );
}

/**
 * The graphite fold: the mascot and the name, centred, one line of copy, two ways in.
 * Entrance (CSS, so it runs before hydration and reduced motion skips it): light 0 ms, mascot 120 ms,
 * letters from 380 ms 70 ms apart, copy 800 ms, buttons 900 ms, particles from about 1.1 s.
 * Scrolling away lifts and fades the content; the pointer shifts the mascot by at most 6 px.
 */
function Hero({ caseB }: { caseB: string | null }) {
  const ref = useRef<HTMLElement>(null);
  const motionOK = useMotionOK();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const lift = useTransform(scrollYProgress, [0, 1], motionOK ? [0, -90] : [0, 0]);
  const fade = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 20 });
  const sy = useSpring(py, { stiffness: 120, damping: 20 });

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (!motionOK || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 12);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 12);
  }

  return (
    <section
      ref={ref}
      onPointerMove={onPointerMove}
      className="palette-charcoal relative isolate -mt-14 flex min-h-[100svh] flex-col overflow-hidden bg-bg pt-14 text-text"
    >
      <div aria-hidden className="hero-light hero-glow absolute inset-0" />
      <div aria-hidden className="hero-perf absolute inset-0" />
      <HeroField />

      <motion.div style={{ y: lift, opacity: fade }} className="relative z-[1] flex flex-1 flex-col items-center justify-center px-5 pb-24 pt-6 text-center">
        <motion.div style={{ x: sx, y: sy }}>
          <Image
            src="/brand/momo-mascot.png"
            alt="MOMO, the guard mascot, holding a shield with a padlock"
            width={1024}
            height={1024}
            priority
            className="hero-mascot aspect-square h-auto w-[clamp(8.5rem,min(16vw,27svh),17rem)] object-contain"
          />
        </motion.div>
        <h1 aria-label="MOMO" className="mt-1 flex text-[clamp(4rem,min(12vw,19svh),10.5rem)] font-bold leading-[0.86] tracking-[-0.065em] text-text">
          {["M", "O", "M", "O"].map((l, i) => (
            <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.04em] pe-[0.02em]">
              <span className="hero-letter inline-block" style={rise(380 + i * 70)}>{l}</span>
            </span>
          ))}
        </h1>
        <p className="rise mt-5 max-w-xl text-[17px] leading-7 text-muted" style={rise(800)}>
          Payment triage where the model investigates and the code decides.
        </p>
        <div className="rise mt-8 flex flex-wrap items-center justify-center gap-3" style={rise(900)}>
          <Link href="/queue" className={`inline-flex h-11 items-center rounded-full bg-text px-6 text-sm font-medium text-bg hover:bg-text/90 ${PRESS}`}>
            Open the console
          </Link>
          {caseB && (
            <Link href={`/case/${caseB}`} className={`inline-flex h-11 items-center rounded-full border border-hairline-strong px-6 text-sm font-medium text-text hover:border-text/60 ${PRESS}`}>
              Watch Case B
            </Link>
          )}
        </div>
      </motion.div>

      <a
        href="#mechanism"
        aria-label="Scroll to how a hostile memo is stopped"
        className="rise absolute inset-x-0 bottom-8 z-[1] mx-auto flex w-10 justify-center rounded-full py-1"
        style={rise(1300)}
      >
        <span aria-hidden className="relative h-9 w-px overflow-hidden bg-hairline-strong">
          <span className="hero-cue absolute inset-x-0 top-0 h-3 bg-text/70" />
        </span>
      </a>
    </section>
  );
}

function Spine() {
  const list = useRef<HTMLOListElement>(null);
  const motionOK = useMotionOK();
  const { scrollYProgress } = useScroll({ target: list, offset: ["start 75%", "end 55%"] });
  const draw = useSpring(scrollYProgress, { stiffness: 140, damping: 32, restDelta: 0.001 });

  return (
    <ol ref={list} className="relative lg:col-span-8">
      <span aria-hidden className="absolute bottom-10 start-[5px] top-10 w-[2px] rounded-full bg-hairline" />
      <motion.span
        aria-hidden
        className="absolute bottom-10 start-[5px] top-10 w-[2px] origin-top rounded-full bg-sage"
        style={motionOK ? { scaleY: draw } : undefined}
      />
      {STEPS.map((s) => (
        <li key={s.n} className="relative border-b border-hairline last:border-b-0">
          <span aria-hidden className="absolute start-0 top-[36px] z-[1] h-3 w-3 rounded-full border-2 border-sage bg-bg" />
          <Reveal y={16} className="grid gap-x-8 gap-y-3 py-7 ps-10 md:grid-cols-[14rem_1fr]">
            <div className="flex items-baseline gap-3">
              <span className="num text-sm font-medium text-muted">{Number(s.n)}</span>
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
        className="absolute inset-y-3 start-0 w-[2px] origin-center scale-y-0 rounded-full bg-sage transition-transform duration-300 ease-out group-hover:scale-y-100 group-focus-visible:scale-y-100"
      />
      <span className="text-[clamp(1.5rem,1.1rem+1.4vw,2.25rem)] font-semibold tracking-[-0.035em] text-text transition-[color,transform] duration-300 ease-out group-hover:translate-x-4 group-hover:text-sage group-focus-visible:translate-x-4 group-active:scale-[0.99]">
        {label}
      </span>
      <span className="text-sm text-muted transition-transform duration-300 ease-out group-hover:translate-x-4 group-focus-visible:translate-x-4">{note}</span>
      <span aria-hidden className="ms-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition-colors duration-200 group-hover:border-sage group-hover:text-sage">
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
