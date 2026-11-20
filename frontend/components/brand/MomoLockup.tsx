"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useRef, type PointerEvent } from "react";
import { useMotionOK } from "@/lib/motion";

const MASCOT = "/brand/momo-mascot.png";

const RISE = { duration: 0.5, ease: [0.2, 0, 0, 1] as [number, number, number, number] };

/** Lenses on the full 1024 mascot, as percentages of that image. */
const EYES = [
  { left: "23%", top: "34%" },
  { left: "51%", top: "34%" },
] as const;

export function MomoLockup() {
  const motionOK = useMotionOK();
  const head = useRef<HTMLSpanElement>(null);
  const lookX = useSpring(useMotionValue(0), { stiffness: 260, damping: 24, mass: 0.5 });
  const lookY = useSpring(useMotionValue(0), { stiffness: 260, damping: 24, mass: 0.5 });

  function look(event: PointerEvent<HTMLHeadingElement>) {
    if (!motionOK || !head.current) return;
    const box = head.current.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) / box.width;
    const y = (event.clientY - (box.top + box.height / 2)) / box.height;
    lookX.set(Math.max(-1, Math.min(1, x)) * 3);
    lookY.set(Math.max(-1, Math.min(1, y)) * 3);
  }

  function rest() {
    lookX.set(0);
    lookY.set(0);
  }

  return (
    <h1
      aria-label="Momo"
      onPointerMove={look}
      onPointerLeave={rest}
      className="flex items-baseline justify-center font-sans font-black leading-none text-text"
      style={{ fontSize: "calc(var(--momo-cap) / 0.72)", letterSpacing: "-0.06em", gap: "0.02em" }}
    >
      <Letter delay={0} motionOK={motionOK}>M</Letter>
      <motion.span
        ref={head}
        aria-hidden
        className="relative inline-block"
        initial={motionOK ? { y: 18, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...RISE, delay: motionOK ? 0.24 : 0 }}
      >
        <motion.span
          className="block"
          animate={motionOK ? { y: [0, -4, 0] } : { y: 0 }}
          transition={motionOK ? { delay: 1.05, duration: 6, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        >
          <motion.span className="relative block" style={{ x: lookX, y: lookY }}>
            <span className="relative block translate-y-[44%]">
              <img
                src={MASCOT}
                alt=""
                draggable={false}
                className="block h-[calc(var(--momo-cap)*2.55)] w-auto max-w-none object-contain select-none"
              />
              {EYES.map((eye) => (
                <motion.span
                  key={eye.left}
                  aria-hidden
                  className="absolute h-[12%] w-[15%] rounded-[50%] bg-[#f4e0c4]"
                  style={{ left: eye.left, top: eye.top, transformOrigin: "50% 0%" }}
                  initial={{ scaleY: 0 }}
                  animate={motionOK ? { scaleY: [0, 1, 0] } : { scaleY: 0 }}
                  transition={motionOK ? { delay: 0.78, duration: 0.26, times: [0, 0.4, 1], ease: "easeInOut" } : { duration: 0 }}
                />
              ))}
            </span>
          </motion.span>
        </motion.span>
      </motion.span>
      <Letter delay={0.06} motionOK={motionOK}>M</Letter>
      <Letter delay={0.12} motionOK={motionOK}>O</Letter>
    </h1>
  );
}

function Letter({ children, delay, motionOK }: { children: string; delay: number; motionOK: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="inline-block"
      initial={motionOK ? { y: 16, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...RISE, delay: motionOK ? delay : 0 }}
    >
      {children}
    </motion.span>
  );
}
