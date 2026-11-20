"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { IconLock, IconUnlock } from "@/components/icons";
import { cx } from "@/lib/cx";
import { DUR, EASE, SPRING, useMotionOK } from "@/lib/motion";

/**
 * Approval gate indicator, drawn on the dark key surface reserved for human approval and filing controls.
 * Locked until the caller's conditions hold; on unlock it pulses once (400 ms).
 * The real gate is enforced by the backend; this only shows its state.
 */
export function GateLock({
  unlocked,
  title,
  detail,
  children,
  className,
}: {
  unlocked: boolean;
  title: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const motionOK = useMotionOK();
  return (
    <div className={cx("surface-key relative isolate rounded-sheet", className)}>
      <div className={cx("relative flex flex-col gap-3.5 rounded-sheet border p-4 transition-colors duration-200",
        unlocked ? "border-sage/50 bg-sage/8" : "border-hairline bg-surface")}>
        <div className="flex items-center gap-3">
          <span className={cx("relative flex h-10 w-10 items-center justify-center rounded-full border",
            unlocked ? "border-sage/70 bg-sage/15 text-sage" : "border-hairline-strong bg-raised text-muted")}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={unlocked ? "u" : "l"} initial={{ scale: 0.6, opacity: 0, rotate: unlocked ? -20 : 0 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={SPRING.snappy}>
                {unlocked ? <IconUnlock size={16} /> : <IconLock size={16} />}
              </motion.span>
            </AnimatePresence>
            {unlocked && motionOK && (
              <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-sage"
                initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: DUR.pulse, ease: EASE.out }} />
            )}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-text">{title}</span>
            {detail && <span aria-live="polite" className={cx("text-xs", unlocked ? "text-sage" : "text-muted")}>{detail}</span>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
