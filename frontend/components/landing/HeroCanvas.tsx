"use client";

import { animate, motion, useMotionValue, useScroll, useTransform, type MotionValue } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { cx } from "@/lib/cx";
import { useMotionOK } from "@/lib/motion";

/**
 * Landing hero: an endless canvas of MOMO tiles you can drag, fling or move with the arrow keys. One block of tiles is
 * laid out by hand and repeated 4×4; the visible offset wraps by the block size, so the canvas never runs out.
 * The only words are MOMO and Team MOMO.
 */

const CW = 300; // column width
const G = 20; // gap
const BW = 4 * (CW + G); // block width
const BH = 860; // block height (incl. trailing gap)
const CENTRE = { x: 320, y: 280, w: 620, h: 300 };

type Tile = { x: number; y: number; w: number; h: number; art: ReactNode; tone?: string };

const rise = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as CSSProperties;

function Lanes() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-8">
      {[["bg-sage", "86%"], ["bg-amber", "58%"], ["bg-red", "34%"], ["bg-[#56657a]", "72%"]].map(([c, w], i) => (
        <span key={i} className={cx("h-3 rounded-full", c)} style={{ width: w }} />
      ))}
    </div>
  );
}

function Chain() {
  return (
    <svg viewBox="0 0 260 200" className="h-full w-full" aria-hidden>
      <path d="M20 150 C70 150 70 60 130 60 S190 140 240 140" fill="none" stroke="currentColor" strokeOpacity=".25" strokeDasharray="2 7" strokeWidth="2" />
      {[[20, 150], [75, 105], [130, 60], [185, 100], [240, 140]].map(([cx_, cy], i) => (
        <g key={i}>
          <circle cx={cx_} cy={cy} r="11" fill="#2f5d4e" fillOpacity={0.25 + i * 0.15} />
          <circle cx={cx_} cy={cy} r="4" fill="#edece8" />
        </g>
      ))}
    </svg>
  );
}

const art = (src: string, cls = "") => (
  <Image src={src} alt="" fill sizes="320px" draggable={false} className={cx("select-none object-contain p-6", cls)} />
);

const TILES: Tile[] = [
  { x: 0, y: 0, w: CW, h: 240, art: art("/brand/momo-head.png"), tone: "bg-[#2f5d4e]" },
  { x: 0, y: 260, w: CW, h: 320, art: <div className="grid h-full place-items-center"><Mascot state="scanning" size={150} /></div> },
  { x: 0, y: 600, w: CW, h: 240, art: <Lanes /> },
  { x: 320, y: 0, w: CW, h: 260, art: art("/brand/contours.svg", "object-cover p-0 opacity-60") },
  { x: 640, y: 0, w: CW, h: 260, art: <div className="grid h-full place-items-center"><Mascot state="approved" size={140} /></div>, tone: "bg-[#1d2a25]" },
  { x: 320, y: 600, w: CW, h: 240, art: <Chain /> },
  { x: 640, y: 600, w: CW, h: 240, art: art("/brand/momo-body.png"), tone: "bg-[#9a6a1f]" },
  { x: 960, y: 0, w: CW, h: 320, art: art("/brand/momo-mascot.png", "p-8"), tone: "bg-[radial-gradient(circle_at_50%_40%,#2a3b35,#18191b_70%)]" },
  { x: 960, y: 340, w: CW, h: 240, art: <div className="grid h-full place-items-center"><Mascot state="alert" size={130} /></div>, tone: "bg-[#2a1d1b]" },
  { x: 960, y: 600, w: CW, h: 240, art: null, tone: "bg-[linear-gradient(135deg,#2f5d4e,#56657a_55%,#9a6a1f)]" },
];

function CentreCard({ primary }: { primary: boolean }) {
  return (
    <div className="flex h-full items-center gap-6 overflow-hidden rounded-[22px] bg-[#f3f3f1] px-8 text-[#17181a] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)]">
      <Image src="/brand/momo-mascot.png" alt="" width={512} height={512} priority={primary} draggable={false}
        className="h-auto w-[34%] shrink-0 select-none object-contain" />
      <div className="flex min-w-0 flex-col">
        <span aria-hidden className="flex text-[clamp(4.5rem,9vw,7.25rem)] font-bold leading-[0.86] tracking-[-0.065em]">
          {["M", "O", "M", "O"].map((l, i) => (
            <span key={i} className="inline-block overflow-hidden pb-[0.04em] pe-[0.02em]">
              <span className={primary ? "hero-letter inline-block" : "inline-block"} style={primary ? rise(380 + i * 70) : undefined}>{l}</span>
            </span>
          ))}
        </span>
        <span className="mt-3 text-sm font-medium tracking-[-0.01em] text-[#17181a]/60">Team MOMO</span>
      </div>
    </div>
  );
}

function Block({ x, y, primary }: { x: MotionValue<number>; y: MotionValue<number>; primary: boolean }) {
  return (
    <motion.div className="absolute left-0 top-0" style={{ x, y, width: BW, height: BH }} aria-hidden={!primary}>
      {TILES.map((t, i) => (
        <div key={i} className={cx("absolute overflow-hidden rounded-[22px] border border-white/[0.06] bg-[#18191b] text-[#edece8] transition-transform duration-300 ease-out hover:-translate-y-1", t.tone)}
          style={{ left: t.x, top: t.y, width: t.w, height: t.h }}>
          {t.art}
        </div>
      ))}
      <div className="absolute" style={{ left: CENTRE.x, top: CENTRE.y, width: CENTRE.w, height: CENTRE.h }}>
        {primary ? (
          <motion.div className="h-full" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <CentreCard primary />
          </motion.div>
        ) : <CentreCard primary={false} />}
      </div>
    </motion.div>
  );
}

const wrap = (v: number, size: number) => ((v % size) + size) % size - size;

export function HeroCanvas() {
  const ref = useRef<HTMLElement>(null);
  const motionOK = useMotionOK();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const wx = useTransform(px, (v) => wrap(v, BW));
  const wy = useTransform(py, (v) => wrap(v, BH));
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; touch: boolean } | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const lift = useTransform(scrollYProgress, [0, 1], motionOK ? [0, -90] : [0, 0]);
  const fade = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  // Centre the MOMO card in the viewport (the card of block copy 1,1).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set(r.width / 2 - (CENTRE.x + CENTRE.w / 2));
    py.set(Math.max(r.height, 560) / 2 - (CENTRE.y + CENTRE.h / 2) + 10);
  }, [px, py]);

  // Copies at offsets 0..3 blocks from the wrapped origin cover any viewport up to ~2.5k px.
  const copies: { i: number; j: number }[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) copies.push({ i, j });
  const offX = copies.map(({ i }) => i);

  function onDown(e: PointerEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest("a,button")) return;
    px.stop(); py.stop();
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: px.get(), oy: py.get(), touch: e.pointerType === "touch" };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    px.set(d.ox + e.clientX - d.sx);
    if (!d.touch) py.set(d.oy + e.clientY - d.sy);
  }
  function onUp(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!motionOK) return;
    animate(px, px.get(), { type: "inertia", velocity: px.getVelocity(), power: 0.35, timeConstant: 320 });
    if (!d.touch) animate(py, py.get(), { type: "inertia", velocity: py.getVelocity(), power: 0.35, timeConstant: 320 });
  }
  function onKey(e: KeyboardEvent<HTMLElement>) {
    const step = { ArrowLeft: [CW + G, 0], ArrowRight: [-(CW + G), 0], ArrowUp: [0, 280], ArrowDown: [0, -280] }[e.key];
    if (!step) return;
    e.preventDefault();
    const opts = motionOK ? { type: "spring" as const, stiffness: 260, damping: 32 } : { duration: 0 };
    animate(px, px.get() + step[0], opts);
    animate(py, py.get() + step[1], opts);
  }

  return (
    <section
      ref={ref}
      tabIndex={0}
      aria-label="MOMO. Drag the canvas or use the arrow keys."
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      className="palette-charcoal relative isolate -mt-14 h-[100svh] min-h-[620px] cursor-grab touch-pan-y select-none overflow-hidden bg-bg text-text outline-none active:cursor-grabbing"
    >
      <motion.div className="absolute inset-0" style={{ y: lift, opacity: fade }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        {/* Phones see the same canvas at a smaller scale, so the MOMO card fits the screen. */}
        <div className="absolute inset-0 origin-center scale-[0.62] sm:scale-[0.85] lg:scale-100">
          {copies.map(({ i, j }, k) => (
            <Copy key={`${i}-${j}`} wx={wx} wy={wy} i={offX[k]} j={j} primary={i === 1 && j === 1} />
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_62%,rgb(17_18_19/0.6)_100%)]" />
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex items-end justify-between px-5 pb-14 sm:px-8">
        <span aria-label="Drag to explore" className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/30 text-[#edece8] backdrop-blur">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 1.5v15M1.5 9h15M9 1.5 7 3.5M9 1.5l2 2M9 16.5l-2-2M9 16.5l2-2M1.5 9l2-2M1.5 9l2 2M16.5 9l-2-2M16.5 9l-2 2" />
          </svg>
        </span>
        <a href="#mechanism" aria-label="Scroll to how a hostile memo is stopped" className="pointer-events-auto absolute inset-x-0 bottom-16 mx-auto flex w-10 justify-center rounded-full py-1">
          <span aria-hidden className="relative h-9 w-px overflow-hidden bg-white/25">
            <span className="hero-cue absolute inset-x-0 top-0 h-3 bg-white/70" />
          </span>
        </a>
        <Link href="/queue" className="pointer-events-auto inline-flex h-11 items-center rounded-full bg-[#edece8] px-6 text-sm font-medium text-[#111213] transition-transform duration-200 hover:bg-white active:scale-[0.98]">
          Open the console
        </Link>
      </div>
    </section>
  );
}

function Copy({ wx, wy, i, j, primary }: { wx: MotionValue<number>; wy: MotionValue<number>; i: number; j: number; primary: boolean }) {
  const x = useTransform(wx, (v) => v + i * BW);
  const y = useTransform(wy, (v) => v + j * BH);
  return <Block x={x} y={y} primary={primary} />;
}
