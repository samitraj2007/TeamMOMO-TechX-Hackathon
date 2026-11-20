"use client";

import { useEffect, useRef } from "react";
import { useMotionOK } from "@/lib/motion";

/**
 * Sparse dust over the graphite hero: about three dozen points drifting slowly upward.
 * Decorative only. Drawn at no more than 30 fps, paused while the hero is off screen or the tab is hidden,
 * and not drawn at all under reduced motion. The layer shifts a few pixels with the pointer.
 */
export function HeroField({ count = 36 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motionOK = useMotionOK();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !motionOK) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Fixed seed so every visit looks the same; no Math.random in the field.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const dots = Array.from({ length: count }, () => ({
      x: rnd(),
      y: rnd(),
      r: 0.5 + rnd() * 1.1,
      a: 0.1 + rnd() * 0.32,
      v: 0.004 + rnd() * 0.01, // fraction of height per second
      phase: rnd() * Math.PI * 2,
      depth: 0.4 + rnd() * 0.6,
    }));

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };

    let raf = 0;
    let last = 0;
    let visible = true;
    const start = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / 30) return;
      const dt = Math.min(0.1, (now - (last || now)) / 1000);
      last = now;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      // Fade the whole field in after the entrance has settled.
      const fade = Math.min(1, Math.max(0, (now - start - 1100) / 1400));
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.y -= d.v * dt;
        if (d.y < -0.02) {
          d.y = 1.02;
          d.x = rnd();
        }
        const sway = Math.sin(now / 2600 + d.phase) * 6;
        const x = d.x * w + sway + pointer.x * 6 * d.depth;
        const y = d.y * h + pointer.y * 6 * d.depth;
        const twinkle = 0.75 + 0.25 * Math.sin(now / 1700 + d.phase * 3);
        ctx.globalAlpha = d.a * twinkle * fade;
        ctx.fillStyle = "#edece8";
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const run = () => {
      if (!raf && visible && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) run();
      else pause();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? pause() : run());
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointermove", onPointer, { passive: true });
    run();

    return () => {
      pause();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [motionOK, count]);

  // Always rendered so server and client markup match; under reduced motion it simply stays blank.
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
