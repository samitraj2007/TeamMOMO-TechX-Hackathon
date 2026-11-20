"use client";

import { animate } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { EASE, useMotionOK } from "@/lib/motion";

/**
 * Scroll entrance for landing content.
 * Server HTML and the first client render are fully visible. After mount, only content still below the fold is
 * hidden; it eases in once its top reaches the reading line, or as soon as a jump scroll carries it past.
 * Reduced motion or no script: never hidden.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 20,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const motionOK = useMotionOK();

  useEffect(() => {
    const el = ref.current;
    if (!motionOK || !el) return;
    const line = () => window.innerHeight * 0.88;
    if (el.getBoundingClientRect().top <= line()) return;

    el.style.opacity = "0";
    el.style.transform = `translate3d(0, ${y}px, 0)`;
    let done = false;
    const stop = () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
    function check() {
      if (done || !el || el.getBoundingClientRect().top > line()) return;
      done = true;
      stop();
      animate(el, { opacity: [0, 1], y: [y, 0] }, { duration: 0.7, ease: EASE.out, delay });
    }
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      stop();
      if (!done) {
        el.style.opacity = "";
        el.style.transform = "";
      }
    };
  }, [motionOK, y, delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
