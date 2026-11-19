"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { IconCheck } from "@/components/icons";
import { cx } from "@/lib/cx";
import { SPRING, useMotionOK } from "@/lib/motion";

export type MascotState = "idle" | "scanning" | "alert" | "approved";

const STATE_LABEL: Record<MascotState, string> = {
  idle: "idle",
  scanning: "scanning",
  alert: "alert: injection neutralized",
  approved: "approved: typed facts passed",
};

const GLOW: Partial<Record<MascotState, string>> = { alert: "glow-red", approved: "glow-sage", scanning: "glow-brass" };

/**
 * The MOMO guard. Small and purposeful: the logo, loading/empty states, and the airlock guide.
 * `scanning` is the only looping state (it stands for work in progress); reduced motion keeps only the state marks.
 */
export function Mascot({
  state = "idle",
  size = 40,
  avatar = false,
  className,
}: {
  state?: MascotState;
  size?: number;
  /** Circle avatar treatment: the one circle allowed in the system. */
  avatar?: boolean;
  className?: string;
}) {
  const motionOK = useMotionOK();
  const body =
    !motionOK
      ? {}
      : state === "scanning"
        ? { rotate: [-3, 3], transition: { duration: 0.9, repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" as const } }
        : state === "alert"
          ? { x: [0, -3, 3, -2, 2, 0], rotate: 0, transition: { duration: 0.45 } }
          : state === "approved"
            ? { rotate: [0, -7, 0], x: 0, transition: { duration: 0.5, ease: "easeOut" as const } }
            : { rotate: 0, x: 0 };
  const glow = GLOW[state];

  return (
    <span
      role="img"
      aria-label={`MOMO guard, ${STATE_LABEL[state]}`}
      className={cx("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {glow && <span aria-hidden className={cx("absolute -inset-2 rounded-full opacity-80", glow)} />}
      <span
        className={cx(
          "relative flex h-full w-full items-center justify-center",
          avatar && "overflow-hidden rounded-full border border-hairline-strong bg-linear-to-b from-raised to-surface",
        )}
      >
        <motion.span key={state} className="relative block origin-bottom" style={{ width: avatar ? "88%" : "100%", height: avatar ? "88%" : "100%" }} animate={body}>
          <Image src="/brand/momo-mascot.png" alt="" fill sizes={`${Math.ceil(size * 2)}px`} className="select-none object-contain" draggable={false} />
          {state === "scanning" && motionOK && (
            <span aria-hidden className="absolute overflow-hidden" style={{ left: "22%", top: "32%", width: "47%", height: "17%" }}>
              <motion.span
                className="absolute inset-y-0 w-1/4 -skew-x-12 bg-linear-to-r from-transparent via-[#fff8e0]/70 to-transparent"
                initial={{ left: "-30%" }}
                animate={{ left: "110%" }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "linear", repeatDelay: 0.25 }}
              />
            </span>
          )}
        </motion.span>
      </span>
      <AnimatePresence>
        {(state === "alert" || state === "approved") && (
          <motion.span
            key={state}
            aria-hidden
            initial={motionOK ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={SPRING.snappy}
            className={cx(
              "absolute -end-0.5 -top-0.5 flex items-center justify-center rounded-control border text-bg",
              state === "alert" ? "border-red bg-red" : "border-sage bg-sage",
            )}
            style={{ width: Math.max(12, size * 0.3), height: Math.max(12, size * 0.3) }}
          >
            {state === "alert" ? <span className="text-[10px] font-bold leading-none">!</span> : <IconCheck size={Math.max(9, size * 0.2)} />}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
