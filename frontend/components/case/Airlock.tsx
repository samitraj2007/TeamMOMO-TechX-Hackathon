"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconPause, IconPlay, IconReplay } from "@/components/icons";
import { Button, SegmentedTabs, Tag } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { isMostlyArabic, shortHash } from "@/lib/format";
import { AIRLOCK, AIRLOCK_PHASES, STAGGER, easeOut, progress, useMotionOK, type AirlockPhase } from "@/lib/motion";
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
 * One scrubbable clock `t` (seconds, 0..6) drives every element, so replay, speed and phase-jump are exact.
 * Reduced motion: the final state is shown and the clock does not run.
 */
export function Airlock({
  memo,
  spans,
  facts,
  autoPlay = true,
  className,
}: {
  memo: string;
  /** Spans on the memo field; offsets index the raw text. */
  spans: Span[];
  facts: MemoFacts;
  autoPlay?: boolean;
  className?: string;
}) {
  const motionOK = useMotionOK();
  const [clock, setClock] = useState(0);
  const [wantPlay, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState<Speed>("1");
  const [scrubbed, setScrubbed] = useState(false);
  const tRef = useRef(0);

  const jump = useCallback((to: number) => {
    tRef.current = to;
    setClock(to);
  }, []);

  // Reduced motion: show the end state unless the user scrubs; the clock never runs on its own.
  const playing = wantPlay && motionOK;
  const t = motionOK || scrubbed ? clock : AIRLOCK.total;

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

  const replay = () => {
    if (!motionOK) {
      setScrubbed(false);
      return;
    }
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

  const pEnter = easeOut(progress(t, AIRLOCK.enter));
  const pScan = progress(t, AIRLOCK.scan);
  const pGate = easeOut(progress(t, AIRLOCK.gate));
  const pDeliver = easeOut(progress(t, AIRLOCK.deliver));
  const n = merged.length;
  const cutSpan = AIRLOCK.cut[1] - AIRLOCK.cut[0];
  const cutAt = (i: number) => AIRLOCK.cut[0] + (n > 1 ? (i / (n - 1)) * cutSpan * 0.7 : 0);
  const hit = (i: number) => t >= AIRLOCK.scan[0] && pScan >= (spanY[i] ?? (merged[i].start / Math.max(1, memo.length)));
  const isCut = (i: number) => t >= cutAt(i);
  const cutCount = merged.filter((_, i) => isCut(i)).length;

  const factRows = useFactRows(facts);
  const factVisible = (i: number) => progress(t, [AIRLOCK.facts[0] + i * STAGGER.factRow, AIRLOCK.facts[0] + i * STAGGER.factRow + 0.2]);
  const done = t >= AIRLOCK.total;
  const pulse = t >= AIRLOCK.deliver[1] - 0.4 ? Math.sin(progress(t, [AIRLOCK.deliver[1] - 0.4, AIRLOCK.deliver[1]]) * Math.PI) : 0;
  const delivered = t >= AIRLOCK.deliver[0] + 0.3;
  const phase = [...AIRLOCK_PHASES].reverse().find((p) => t >= AIRLOCK[p][0]) ?? "enter";

  return (
    <div className={cx("flex flex-col border border-hairline bg-surface", className)}>
      <div className="flex h-8 items-center gap-2 border-b border-hairline px-3">
        <h3 className="text-2xs font-medium uppercase tracking-[0.08em] text-muted">Quarantine airlock</h3>
        <Tag tone={n ? "red" : "sage"} variant="tint">{n ? `${n} injected span${n === 1 ? "" : "s"}` : "benign"}</Tag>
        <div className="ms-auto flex items-center gap-1">
          <SegmentedTabs<Speed>
            size="sm"
            label="Playback speed"
            value={speed}
            onChange={setSpeed}
            options={[{ value: "0.5", label: "0.5×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }]}
          />
          <Button size="sm" variant="ghost" disabled={!motionOK || done} onClick={() => setPlaying((p) => !p)}
            icon={playing ? <IconPause size={12} /> : <IconPlay size={12} />} aria-label={playing ? "Pause" : "Play"}>
            {playing ? "Pause" : "Play"}
          </Button>
          <Button size="sm" variant="outline" onClick={replay} icon={<IconReplay size={12} />}>Replay</Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_56px_minmax(0,1fr)] gap-0 p-3">
        {/* Raw side: display only, never sent to a model. */}
        <div className="flex min-w-0 flex-col gap-2" style={{ opacity: 0.25 + 0.75 * pEnter, transform: `translateY(${(1 - pEnter) * 6}px)` }}>
          <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.08em] text-muted">
            <span aria-hidden className="h-1.5 w-1.5 bg-red" /> Raw memo · untrusted
          </div>
          <div ref={box} dir={rtl ? "rtl" : "ltr"} lang={rtl ? "ar" : "en"}
            className={cx("relative min-h-24 overflow-hidden border border-hairline bg-bg p-3 text-sm leading-6 text-text", rtl && "ar")}>
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
                    "transition-colors duration-[120ms]",
                    isCut(seg.index)
                      ? "hatch num border border-dashed border-red/60 px-1 text-2xs text-red-text [box-decoration-break:clone]"
                      : hit(seg.index) && "bg-red/25 text-red-text outline outline-1 outline-red",
                  )}
                >
                  {isCut(seg.index) ? `[neutralized · ${seg.codes[0]}]` : seg.text}
                </span>
              ),
            )}
            {t > AIRLOCK.scan[0] && t < AIRLOCK.scan[1] && (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-sage"
                style={{ top: `${pScan * 100}%` }} />
            )}
          </div>
          <div className="flex flex-col border border-hairline bg-bg">
            <div className="flex h-7 items-center gap-2 border-b border-hairline px-2 text-2xs uppercase tracking-[0.08em] text-muted">
              Neutralized tray
              <span className={cx("num ms-auto", cutCount ? "text-red-text" : "text-muted")}>{cutCount} neutralized</span>
            </div>
            <ul className="flex min-h-9 flex-col px-2 py-1">
              {n === 0 && <li className="py-1 text-xs text-muted">No injected spans found. The memo still never crosses the gate.</li>}
              {merged.map((s, i) => (
                <li key={i} className="flex items-center gap-2 py-0.5 text-xs"
                  style={{ opacity: isCut(i) ? Math.min(1, (t - cutAt(i)) / 0.2) : 0 }}>
                  <Tag tone="red" variant="outline" mono>{s.codes.join(" + ")}</Tag>
                  <span dir="auto" className="truncate text-muted line-through">{memo.slice(s.start, s.end)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Gate */}
        <div className="flex flex-col items-center justify-center gap-2 px-2" aria-hidden>
          <span className="text-2xs uppercase tracking-[0.08em] text-muted">gate</span>
          <div className="relative h-40 w-6 border border-hairline-strong bg-bg">
            <span className="absolute inset-x-0 top-0 bg-raised" style={{ height: `${50 - pGate * 38}%`, borderBottom: "1px solid var(--color-hairline-strong)" }} />
            <span className="absolute inset-x-0 bottom-0 bg-raised" style={{ height: `${50 - pGate * 38}%`, borderTop: "1px solid var(--color-hairline-strong)" }} />
            {t >= AIRLOCK.deliver[0] && t < AIRLOCK.deliver[1] && (
              <span className="absolute top-1/2 h-2 w-2 -translate-y-1/2 bg-sage" style={{ insetInlineStart: `${-20 + pDeliver * 140}%` }} />
            )}
          </div>
          <span className="text-center text-2xs text-muted">typed only</span>
        </div>

        {/* Investigator side */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 text-2xs uppercase tracking-[0.08em] text-muted">
            <span aria-hidden className="h-1.5 w-1.5 bg-sage" /> MemoFacts · typed
          </div>
          <dl className={cx("flex flex-col border bg-bg transition-colors duration-[180ms]", delivered ? "border-sage" : "border-hairline")}>
            {factRows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[112px_1fr] gap-2 border-b border-hairline px-2 py-1 text-xs last:border-b-0"
                style={{ opacity: factVisible(i), transform: `translateX(${(1 - factVisible(i)) * -4}px)` }}>
                <dt className="text-muted">{r.key}</dt>
                <dd className="num min-w-0 truncate text-text">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="relative flex items-center gap-2 border border-hairline bg-bg px-2 py-1.5 text-xs"
            style={{ backgroundColor: pulse ? `rgb(110 155 131 / ${0.18 * pulse})` : undefined }}>
            <span className="text-muted">raw text received by investigator:</span>
            <span className={cx("num text-sm font-medium", done || delivered ? "text-sage" : "text-muted")}>0</span>
          </div>
        </div>
      </div>

      <Scrubber t={t} onScrub={(v) => { setPlaying(false); setScrubbed(true); jump(v); }} phase={phase} />
      <p className="sr-only" aria-live="polite">
        {done ? `${n} injected span${n === 1 ? "" : "s"} neutralized. The investigator receives typed MemoFacts only; raw text received: 0.` : ""}
      </p>
    </div>
  );
}

function Scrubber({ t, onScrub, phase }: { t: number; onScrub: (t: number) => void; phase: AirlockPhase }) {
  return (
    <div className="flex flex-col gap-1 border-t border-hairline px-3 py-2">
      <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={AIRLOCK.total}
        step={0.01}
        value={t}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Airlock timeline"
        aria-valuetext={`${t.toFixed(1)} s, ${PHASE_LABEL[phase]}`}
        className="airlock-scrub min-w-0 flex-1"
      />
        <span className="num w-20 shrink-0 text-end text-2xs text-muted">{t.toFixed(1)} / {AIRLOCK.total.toFixed(1)} s</span>
      </div>
      <div className="relative me-[92px] h-5">
        {AIRLOCK_PHASES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onScrub(AIRLOCK[p][0])}
            className={cx(
              "absolute top-0 border-s px-1 text-2xs transition-colors duration-[120ms]",
              p === phase ? "border-sage text-text" : "border-hairline-strong text-muted hover:text-text",
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
