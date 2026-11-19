"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { IconGate, IconPause, IconPlay, IconReplay } from "@/components/icons";
import { Button, GlowBehind, SegmentedTabs, Tag } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { isMostlyArabic, shortHash } from "@/lib/format";
import { t as tr, type StringKey } from "@/lib/i18n";
import { AIRLOCK, AIRLOCK_PHASES, SPRING, STAGGER, easeOut, progress, useMotionOK, type AirlockPhase } from "@/lib/motion";
import { usePrefs } from "@/lib/prefs";
import { mergeSpans, segmentText } from "@/lib/spans";
import type { MemoFacts, Span } from "@/lib/types";

type Speed = "0.5" | "1" | "2";

const PHASE_LABEL: Record<AirlockPhase, string> = {
  enter: "Raw memo",
  scan: "Scan",
  cut: "Neutralize",
  facts: "Extract facts",
  gate: "Gate",
  deliver: "Deliver",
};

/**
 * Quarantine airlock: the raw memo stays on the left; only typed MemoFacts cross the gate.
 * Run it by dragging the memo into the gate or pressing "Send through gate". One scrubbable clock `t` (0..6 s)
 * drives every element. The mascot guides each phase. Reduced motion: a run jumps straight to the end state.
 */
export function Airlock({
  memo,
  spans,
  facts,
  className,
}: {
  memo: string;
  /** Spans on the memo field; offsets index the raw text. */
  spans: Span[];
  facts: MemoFacts;
  className?: string;
}) {
  const motionOK = useMotionOK();
  const { lang, demoSpeed } = usePrefs();
  const [clock, setClock] = useState(0);
  const [started, setStarted] = useState(false);
  const [wantPlay, setPlaying] = useState(false);
  const [speedOverride, setSpeed] = useState<Speed | null>(null);
  const [scrubbed, setScrubbed] = useState(false);
  const [overGate, setOverGate] = useState(false);
  const tRef = useRef(0);
  const gateRef = useRef<HTMLDivElement>(null);
  const speed = speedOverride ?? (String(demoSpeed) as Speed);

  const jump = useCallback((to: number) => {
    tRef.current = to;
    setClock(to);
  }, []);

  const playing = wantPlay && motionOK;
  const t = !started ? 0 : motionOK || scrubbed ? clock : AIRLOCK.total;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(AIRLOCK.total, tRef.current + ((now - last) / 1000) * Number(speed));
      last = now;
      jump(next);
      if (next >= AIRLOCK.total) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, jump]);

  const run = () => {
    setScrubbed(false);
    setStarted(true);
    jump(0);
    setPlaying(true);
  };

  const merged = useMemo(() => mergeSpans(spans.filter((s) => s.field === "memo")), [spans]);
  const segments = useMemo(() => segmentText(memo, merged), [memo, merged]);
  const rtl = isMostlyArabic(memo);

  // Vertical position (0..1) of each span inside the memo box, so the scan line hits spans where they render.
  const box = useRef<HTMLDivElement>(null);
  const spanEls = useRef<(HTMLSpanElement | null)[]>([]);
  const [spanY, setSpanY] = useState<number[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const h = el.scrollHeight || 1;
      setSpanY(merged.map((_, i) => {
        const s = spanEls.current[i];
        return s ? (s.offsetTop + s.offsetHeight / 2) / h : 0;
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [merged]);

  const pEnter = started ? easeOut(progress(t, AIRLOCK.enter)) : 1;
  const pScan = progress(t, AIRLOCK.scan);
  const pGate = easeOut(progress(t, AIRLOCK.gate));
  const pDeliver = easeOut(progress(t, AIRLOCK.deliver));
  const n = merged.length;
  const cutSpan = AIRLOCK.cut[1] - AIRLOCK.cut[0];
  const cutAt = (i: number) => AIRLOCK.cut[0] + (n > 1 ? (i / (n - 1)) * cutSpan * 0.7 : 0);
  const hit = (i: number) => started && t >= AIRLOCK.scan[0] && pScan >= (spanY[i] ?? merged[i].start / Math.max(1, memo.length));
  const isCut = (i: number) => started && t >= cutAt(i);
  const cutCount = merged.filter((_, i) => isCut(i)).length;

  const factRows = useFactRows(facts);
  const factVisible = (i: number) => progress(t, [AIRLOCK.facts[0] + i * STAGGER.factRow, AIRLOCK.facts[0] + i * STAGGER.factRow + 0.2]);
  const done = started && t >= AIRLOCK.total;
  const scanning = started && t > AIRLOCK.scan[0] && t < AIRLOCK.scan[1];
  const pulse = t >= AIRLOCK.deliver[1] - 0.4 ? Math.sin(progress(t, [AIRLOCK.deliver[1] - 0.4, AIRLOCK.deliver[1]]) * Math.PI) : 0;
  const gatePulse = started && t >= AIRLOCK.gate[1] && t < AIRLOCK.gate[1] + 0.5;
  const delivered = started && t >= AIRLOCK.deliver[0] + 0.3;
  const phase = [...AIRLOCK_PHASES].reverse().find((p) => t >= AIRLOCK[p][0]) ?? "enter";

  const guide: { state: MascotState; caption: StringKey } = !started
    ? { state: "idle", caption: "guideIdle" }
    : t < AIRLOCK.cut[0]
      ? { state: "scanning", caption: "guideScan" }
      : t < AIRLOCK.deliver[0]
        ? n > 0
          ? { state: "alert", caption: "guideAlert" }
          : { state: "idle", caption: "guideClean" }
        : { state: "approved", caption: "guidePass" };

  function onDrag(_: unknown, info: { point: { x: number; y: number } }) {
    const r = gateRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = info.point.x - window.scrollX;
    const y = info.point.y - window.scrollY;
    setOverGate(x > r.left - 32 && x < r.right + 32 && y > r.top - 32 && y < r.bottom + 32);
  }

  return (
    <div className={cx("sheet flex flex-col overflow-hidden rounded-panel border border-hairline bg-surface", className)}>
      <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-hairline/80 px-4 py-1.5">
        <h3 className="text-2xs font-medium uppercase tracking-[0.1em] text-muted">Quarantine airlock</h3>
        <Tag tone={n ? "red" : "sage"} variant="tint">{n ? `${n} injected span${n === 1 ? "" : "s"}` : "benign"}</Tag>
        <div className="ms-auto flex items-center gap-1.5">
          <SegmentedTabs<Speed> size="sm" label="Playback speed" value={speed} onChange={setSpeed}
            options={[{ value: "0.5", label: "0.5×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }]} />
          <Button size="sm" variant="ghost" disabled={!started || !motionOK || done} onClick={() => setPlaying((p) => !p)}
            icon={playing ? <IconPause size={12} /> : <IconPlay size={12} />}>
            {playing ? "Pause" : "Play"}
          </Button>
          <Button size="sm" variant="outline" onClick={run} icon={<IconReplay size={12} />} disabled={!started}>Replay</Button>
        </div>
      </div>

      {/* Guide: the mascot narrates each phase. */}
      <div className="flex items-center gap-3 border-b border-hairline/60 bg-bg/30 px-4 py-2">
        <Mascot state={guide.state} size={40} avatar />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={guide.caption} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }} aria-live="polite" lang={lang} className={cx("text-sm", lang === "ar" && "ar", guide.state === "alert" ? "text-red-text" : guide.state === "approved" ? "text-sage" : "text-text")}>
            {tr(guide.caption, lang)}
            {guide.state === "alert" && <span className="num ms-2 text-xs text-muted">{cutCount}/{n}</span>}
          </motion.span>
        </AnimatePresence>
        {!started && (
          <Button size="sm" variant="accent" className="ms-auto" onClick={run} icon={<IconGate size={14} />}>
            {tr("sendGate", lang)}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_88px_minmax(0,1fr)] gap-0 p-4">
        {/* Raw side: display only, never sent to a model. */}
        <div className="flex min-w-0 flex-col gap-3">
          <motion.div
            drag={!started || done}
            dragSnapToOrigin
            dragElastic={0.6}
            onDragStart={() => setOverGate(false)}
            onDrag={onDrag}
            onDragEnd={() => {
              if (overGate) run();
              setOverGate(false);
            }}
            whileDrag={{ scale: 1.02, rotate: -1, zIndex: 20 }}
            transition={SPRING.soft}
            tabIndex={!started || done ? 0 : -1}
            role={!started || done ? "button" : undefined}
            aria-label={!started || done ? tr("dragHint", lang) : undefined}
            onKeyDown={(e) => (!started || done) && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), run())}
            className={cx("relative rounded-panel", (!started || done) && "cursor-grab active:cursor-grabbing")}
          >
          <div className="flex flex-col gap-2" style={{ opacity: 0.25 + 0.75 * pEnter, transform: `translateY(${(1 - pEnter) * 6}px)` }}>
            <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.1em] text-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-red" /> {tr("rawMemo", lang)}
              {!started && <span className="ms-auto normal-case tracking-normal text-muted">{tr("dragHint", lang)}</span>}
            </div>
            <div ref={box} dir={rtl ? "rtl" : "ltr"} lang={rtl ? "ar" : "en"}
              className={cx("sheet relative min-h-24 overflow-hidden rounded-panel border bg-bg p-4 text-sm leading-6 text-text transition-colors duration-150",
                overGate ? "border-brass/70" : "border-hairline", rtl && "ar")}>
              {segments.map((seg, k) =>
                seg.kind === "text" ? (
                  <span key={k}>{seg.text}</span>
                ) : (
                  <span
                    key={k}
                    ref={(el) => {
                      spanEls.current[seg.index] = el;
                    }}
                    title={seg.codes.join(", ")}
                    className={cx(
                      "rounded-[2px] transition-colors duration-[120ms] [box-decoration-break:clone]",
                      isCut(seg.index)
                        ? "hatch num border border-dashed border-red/60 px-1 text-2xs text-red-text"
                        : hit(seg.index) && "bg-red/25 text-red-text outline outline-1 outline-red",
                    )}
                  >
                    {isCut(seg.index) ? `[${tr("neutralized", lang)} · ${seg.codes[0]}]` : seg.text}
                  </span>
                ),
              )}
              {scanning && (
                <span aria-hidden className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: `${pScan * 100}%` }}>
                  <span className="h-px flex-1 bg-linear-to-r from-transparent via-brass to-brass" />
                  <span className="-me-1 -translate-y-1/2"><Mascot state="scanning" size={22} /></span>
                </span>
              )}
            </div>
          </div>
          </motion.div>
          <div className="flex flex-col rounded-panel border border-hairline bg-bg/60">
            <div className="flex h-8 items-center gap-2 border-b border-hairline/70 px-3 text-2xs uppercase tracking-[0.1em] text-muted">
              {tr("tray", lang)}
              <span className={cx("num ms-auto", cutCount ? "text-red-text" : "text-muted")}>{cutCount} {tr("neutralized", lang)}</span>
            </div>
            <ul className="flex min-h-9 flex-col gap-1 px-3 py-2">
              {n === 0 && <li className="text-xs text-muted">No injected spans found. The memo still never crosses the gate.</li>}
              {merged.map((s, i) => (
                <motion.li key={i} className="flex items-center gap-2 text-xs"
                  initial={false}
                  animate={isCut(i) ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
                  transition={SPRING.soft}>
                  <Tag tone="red" variant="outline" mono>{s.codes.join(" + ")}</Tag>
                  <span dir="auto" className="truncate text-muted line-through">{memo.slice(s.start, s.end)}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>

        {/* Gate */}
        <div ref={gateRef} className="relative isolate flex flex-col items-center justify-center gap-2 px-3" aria-hidden>
          {(overGate || gatePulse) && <GlowBehind tone={overGate ? "brass" : "sage"} />}
          <span className="text-2xs uppercase tracking-[0.1em] text-muted">gate</span>
          <div className={cx("relative h-44 w-8 overflow-hidden rounded-control border bg-bg transition-colors duration-150",
            overGate ? "border-brass" : delivered ? "border-sage/70" : "border-hairline-strong")}>
            <span className="absolute inset-x-0 top-0 rounded-b-[2px] border-b border-hairline-strong bg-raised" style={{ height: `${50 - pGate * 38}%` }} />
            <span className="absolute inset-x-0 bottom-0 rounded-t-[2px] border-t border-hairline-strong bg-raised" style={{ height: `${50 - pGate * 38}%` }} />
            {started && t >= AIRLOCK.deliver[0] && t < AIRLOCK.deliver[1] && (
              <span className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-[2px] bg-sage" style={{ insetInlineStart: `${-30 + pDeliver * 160}%` }} />
            )}
            {gatePulse && motionOK && (
              <motion.span className="absolute inset-0 rounded-control border border-sage" initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.4 }} transition={{ duration: 0.4 }} />
            )}
          </div>
          <span className="text-center text-2xs text-muted">typed only</span>
        </div>

        {/* Investigator side */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.1em] text-muted">
            <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-sage" /> {tr("memoFacts", lang)}
          </div>
          <dl className={cx("sheet flex flex-col overflow-hidden rounded-panel border bg-bg transition-colors duration-[180ms]", delivered ? "border-sage/70" : "border-hairline")}>
            {factRows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[120px_1fr] gap-2 border-b border-hairline/60 px-3 py-1.5 text-xs last:border-b-0"
                style={{ opacity: factVisible(i), transform: `translateX(${(1 - factVisible(i)) * -6}px)` }}>
                <dt className="text-muted">{r.key}</dt>
                <dd className="num min-w-0 truncate text-text">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="relative flex items-center gap-2 overflow-hidden rounded-panel border border-hairline bg-bg px-3 py-2 text-xs"
            style={{ backgroundColor: pulse ? `rgb(127 168 142 / ${0.2 * pulse})` : undefined }}>
            <span className={cx("text-muted", lang === "ar" && "ar")}>{tr("rawReceived", lang)}:</span>
            <span className={cx("num text-sm font-medium", delivered ? "text-sage" : "text-muted")}>0</span>
          </div>
        </div>
      </div>

      <Scrubber t={t} phase={phase} onScrub={(v) => { setStarted(true); setPlaying(false); setScrubbed(true); jump(v); }} />
      <p className="sr-only" aria-live="polite">
        {done ? `${n} injected span${n === 1 ? "" : "s"} neutralized. The investigator receives typed MemoFacts only; raw text received: 0.` : ""}
      </p>
    </div>
  );
}

function Scrubber({ t, onScrub, phase }: { t: number; onScrub: (t: number) => void; phase: AirlockPhase }) {
  return (
    <div className="flex flex-col gap-1 border-t border-hairline/80 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="relative h-4 min-w-0 flex-1">
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-[2px] bg-hairline-strong" />
          <span aria-hidden className="absolute start-0 top-1/2 h-[3px] -translate-y-1/2 rounded-[2px] bg-linear-to-r from-sage/50 to-brass"
            style={{ width: `${(t / AIRLOCK.total) * 100}%` }} />
          <input
            type="range"
            min={0}
            max={AIRLOCK.total}
            step={0.01}
            value={t}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Airlock timeline"
            aria-valuetext={`${t.toFixed(1)} s, ${PHASE_LABEL[phase]}`}
            className="airlock-scrub absolute inset-0 w-full"
          />
        </div>
        <span className="num w-20 shrink-0 text-end text-2xs text-muted">{t.toFixed(1)} / {AIRLOCK.total.toFixed(1)} s</span>
      </div>
      <div className="relative me-[92px] h-5">
        {AIRLOCK_PHASES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onScrub(AIRLOCK[p][0])}
            className={cx(
              "press absolute top-0 rounded-e-control border-s-2 px-1.5 text-2xs",
              p === phase ? "border-brass text-text" : "border-hairline-strong text-muted hover:text-text",
            )}
            style={{ insetInlineStart: `${(AIRLOCK[p][0] / AIRLOCK.total) * 100}%` }}
          >
            {PHASE_LABEL[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

function useFactRows(f: MemoFacts) {
  return useMemo(
    () => [
      { key: "invoice_refs", value: f.invoice_refs.length ? f.invoice_refs.join(", ") : "[]" },
      { key: "claimed_purpose", value: f.claimed_purpose || "-" },
      { key: "language", value: f.language },
      { key: "injection_detected", value: String(f.injection_detected) },
      { key: "injection_signals", value: f.injection_signals.length ? f.injection_signals.map((s) => `${s.code}@${s.layer}`).join(", ") : "[]" },
      { key: "classifier_status", value: f.classifier_status },
      { key: "fields_scanned", value: f.fields_scanned.join(", ") },
      { key: "raw_hash", value: shortHash(f.raw_hash, 10, 4) },
    ],
    [f],
  );
}
