"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { IconCheck, IconHash } from "@/components/icons";
import { SuccessButton } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { shortHash } from "@/lib/format";
import { EASE, useMotionOK } from "@/lib/motion";

export interface ChainLink {
  record_id: string;
  hash: string;
}

export interface SweepResult {
  ok: boolean;
  first_bad_record_id: string | null;
}

/**
 * Hash-chain verify sweep. `onVerify` returns the verifier's verdict (from GET /audit/verify on screens);
 * each link then lights in sequence (24 ms per link, capped at 1.2 s) and the sweep stops red at the first bad link.
 */
export function ChainSweep({ links, onVerify, className }: { links: ChainLink[]; onVerify: () => Promise<SweepResult>; className?: string }) {
  const motionOK = useMotionOK();
  const [result, setResult] = useState<SweepResult | null>(null);
  const [cursor, setCursor] = useState(-1);

  const stopAt = result ? (result.first_bad_record_id ? links.findIndex((l) => l.record_id === result.first_bad_record_id) : links.length - 1) : -1;

  useEffect(() => {
    if (!result) return;
    const step = Math.min(24, 1200 / Math.max(1, links.length));
    const timer = setInterval(() => {
      setCursor((c) => {
        if (c >= stopAt) {
          clearInterval(timer);
          return c;
        }
        return c + 1;
      });
    }, motionOK ? step : 0);
    return () => clearInterval(timer);
  }, [result, stopAt, links.length, motionOK]);

  async function verify() {
    setResult(null);
    setCursor(-1);
    const r = await onVerify();
    setResult(r);
    const sweepMs = motionOK ? Math.min(1200, links.length * 24) + 120 : 0;
    await new Promise((res) => setTimeout(res, sweepMs));
    if (!r.ok) throw new Error("chain broken");
  }

  const done = result !== null && cursor >= stopAt;
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <SuccessButton onAction={verify} icon={<IconHash size={14} />} doneLabel="Chain verified" variant="accent">Verify chain</SuccessButton>
        <span aria-live="polite" className={cx("text-xs", !done ? "text-muted" : result?.ok ? "text-sage" : "text-red-text")}>
          {!result ? `${links.length} entries` : !done ? "Verifying…" : result.ok ? `All ${links.length} links verified` : `Broken at ${result.first_bad_record_id}`}
        </span>
      </div>
      <ol className="flex flex-wrap items-center gap-y-2">
        {links.map((l, i) => {
          const lit = i <= cursor;
          const bad = lit && result && !result.ok && i === stopAt;
          return (
            <li key={l.record_id} className="flex items-center">
              {i > 0 && <span aria-hidden className={cx("h-px w-3 transition-colors duration-150", lit ? (bad ? "bg-red" : "bg-sage/70") : "bg-hairline-strong")} />}
              <motion.span
                title={`${l.record_id} · ${l.hash}`}
                animate={lit && motionOK ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                // A tween, not a spring: Motion springs accept only two keyframes and throw on this three-step pulse.
                transition={motionOK ? { duration: 0.28, ease: EASE.out } : { duration: 0 }}
                className={cx(
                  "num flex h-7 items-center gap-1 rounded-control border px-1.5 text-2xs transition-colors duration-150",
                  bad ? "border-red bg-red/15 text-red-text" : lit ? "border-sage/60 bg-sage/10 text-text" : "border-hairline bg-bg/60 text-muted",
                )}
              >
                {lit && !bad && <IconCheck size={10} className="text-sage" />}
                {l.record_id.replace(/^AUD-/, "")}
                <span className="text-muted">{shortHash(l.hash, 4, 0)}</span>
              </motion.span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
