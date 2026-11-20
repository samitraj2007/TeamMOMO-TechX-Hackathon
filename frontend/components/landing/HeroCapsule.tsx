"use client";

import { motion, useSpring } from "motion/react";
import { type PointerEvent } from "react";
import Link from "next/link";
import { useMotionOK } from "@/lib/motion";
import { cx } from "@/lib/cx";

export function HeroCapsule({
  href,
  children,
  variant = "filled",
}: {
  href: string;
  children: string;
  variant?: "filled" | "ghost";
}) {
  const motionOK = useMotionOK();
  const scale = useSpring(1, { stiffness: 520, damping: 28 });

  function press() {
    if (motionOK) scale.set(0.97);
  }

  function rest() {
    scale.set(1);
  }

  function lift(event: PointerEvent<HTMLAnchorElement>) {
    if (!motionOK) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    if (Math.abs(x) < 0.35 && Math.abs(y) < 0.35) scale.set(1.02);
  }

  const filled = variant === "filled";

  return (
    <motion.div style={{ scale }} className="inline-flex">
      <Link
        href={href}
        onPointerDown={press}
        onPointerUp={rest}
        onPointerLeave={rest}
        onPointerMove={lift}
        className={cx(
          "hero-press inline-flex h-10 items-center rounded-full px-5 text-[13px] font-medium transition-[background-color,border-color,box-shadow] duration-200",
          filled
            ? "bg-text text-bg shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] hover:bg-[#f3efe6]"
            : "border border-white/12 bg-white/[0.06] text-text shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-sm hover:border-brass/50 hover:bg-white/[0.09]",
        )}
      >
        {children}
      </Link>
    </motion.div>
  );
}