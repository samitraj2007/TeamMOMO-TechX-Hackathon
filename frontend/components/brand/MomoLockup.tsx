"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import { useRef, type PointerEvent } from "react";
import { useMotionOK } from "@/lib/motion";

const SRC = "/brand/momo-mascot.png";

/**
 * The 1024px guard, transparent at the corners. The round head is the first O:
 * its face occupies the em box and the shield hangs just below the baseline.
 * Numbers are fractions of that file, measured from the opaque pixels.
 */
const IMAGE_EM = 2.05;
const IMAGE_TOP_EM = -0.4;
const FACE_SHIFT_EM = -0.08;

const EYES = [
  { left: "23.5%", top: "35.5%" },
  { left: "49.5%", top: "35.5%" },
] as const;

const RISE = { duration: 0.55, ease: [0.2, 0, 0, 1] as [number, number, number, number] };

export function MomoLockup() {
  const motionOK = useMotionOK();
  const tiltX = useSpring(useMotionValue(0), { stiffness: 220, damping: 22, mass: 0.6 });
  const tiltY = useSpring(useMotionValue(0), { stiffness: 220, damping: 22, mass: 0.6 });
  const slot = useRef<HTMLSpanElement>(null);

  function look(event: PointerEvent<HTMLHeadingElement>) {
    if (!motionOK || !slot.current) return;
    const box = slot.current.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) / box.width;
    const y = (event.clientY - (box.top + box.height / 2)) / box.height;
    tiltY.set(Math.max(-1, Math.min(1, x)) * 12);
    tiltX.set(Math.max(-1, Math.min(1, y)) * -8);
  }

  function rest() {
    tiltX.set(0);
    tiltY.set(0);
  }

  return (
    <h1
      aria-label="Momo"
      onPointerMove={look}
      onPointerLeave={rest}
      className="flex items-baseline justify-center font-sans font-black leading-none tracking-[-0.065em] text-bg"
      style={{ fontSize: "clamp(7.5rem, 17vw, 15rem)" }}
    >
      <Letter delay={0} motionOK={motionOK}>M</Letter>
      <span ref={slot} aria-hidden className="relative inline-block">
        <span className="invisible">O</span>
        <motion.span
          className="absolute left-1/2 w-[1.15em]"
          style={{
            height: `${IMAGE_EM}em`,
            top: `${IMAGE_TOP_EM}em`,
            marginLeft: `${FACE_SHIFT_EM}em`,
            x: "-50%",
          }}
          initial={motionOK ? { y: "0.28em", opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...RISE, delay: motionOK ? 0.42 : 0 }}
        >
          <motion.span
            className="block h-full w-full [transform-style:preserve-3d]"
            style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 700 }}
            animate={motionOK ? { y: [0, -5, 0] } : { y: 0 }}
            transition={motionOK ? { delay: 1.15, duration: 5.5, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
          >
            <img src={SRC} alt="" draggable={false} className="h-full w-full select-none [clip-path:inset(0_0_32%_0)]" />
            {EYES.map((eye) => (
              <motion.span
                key={eye.left}
                aria-hidden
                className="absolute h-[11%] w-[17%] rounded-[50%] bg-[#f4e2c8]"
                style={{ left: eye.left, top: eye.top, transformOrigin: "50% 0%" }}
                initial={{ scaleY: 0 }}
                animate={motionOK ? { scaleY: [0, 1, 0] } : { scaleY: 0 }}
                transition={motionOK ? { delay: 0.95, duration: 0.28, times: [0, 0.42, 1], ease: "easeInOut" } : { duration: 0 }}
              />
            ))}
          </motion.span>
        </motion.span>
      </span>
      <Letter delay={0.1} motionOK={motionOK}>M</Letter>
      <Letter delay={0.2} motionOK={motionOK}>O</Letter>
    </h1>
  );
}

function Letter({ children, delay, motionOK }: { children: string; delay: number; motionOK: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="inline-block"
      initial={motionOK ? { y: "0.22em", opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...RISE, delay: motionOK ? delay : 0 }}
    >
      {children}
    </motion.span>
  );
}
