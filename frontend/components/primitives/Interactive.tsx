"use client";

import { AnimatePresence, motion, useSpring } from "motion/react";
import { useId, useState, type PointerEvent, type ReactNode } from "react";
import { IconAlert, IconCheck, IconClose } from "@/components/icons";
import { cx } from "@/lib/cx";
import { TONE_BG, type Tone } from "@/lib/labels";
import { DUR, EASE, SPRING, useMotionOK } from "@/lib/motion";
import { Button, IconButton, type ButtonSize, type ButtonVariant } from "./Button";

const SOFT = { stiffness: 260, damping: 26, mass: 0.7 };

/** A card that lifts 2px and tilts at most 3 degrees toward the pointer. Still under reduced motion. */
export function LiftCard({
  children,
  className,
  onClick,
  label,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const motionOK = useMotionOK();
  const rx = useSpring(0, SOFT);
  const ry = useSpring(0, SOFT);
  const y = useSpring(0, SOFT);

  function move(e: PointerEvent<HTMLDivElement>) {
    if (!motionOK) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 6);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 6);
  }
  function reset() {
    rx.set(0);
    ry.set(0);
    y.set(0);
  }

  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      onPointerEnter={() => motionOK && y.set(-2)}
      onPointerMove={move}
      onPointerLeave={reset}
      style={{ rotateX: rx, rotateY: ry, y, transformPerspective: 900 }}
      className={cx("sheet relative rounded-panel border border-hairline bg-surface transition-colors duration-150 hover:border-hairline-strong", onClick && "cursor-pointer", className)}
    >
      {children}
    </motion.div>
  );
}

export interface ExpandItem {
  id: string;
  title: ReactNode;
  summary: ReactNode;
  detail: ReactNode;
  tone?: Tone;
}

/**
 * Cards that expand in place with a shared-layout transition (layoutId). The container must have a height;
 * the expanded card fills it. Esc or the close button collapses it.
 */
export function ExpandableCards({ items, className, columns = "grid-cols-3" }: { items: ExpandItem[]; className?: string; columns?: string }) {
  const uid = useId();
  const [open, setOpen] = useState<string | null>(null);
  const active = items.find((i) => i.id === open);

  return (
    <div className={cx("relative isolate", className)} onKeyDown={(e) => e.key === "Escape" && setOpen(null)}>
      <div className={cx("grid h-full gap-3", columns)}>
        {items.map((it) =>
          it.id === open ? (
            <div key={it.id} aria-hidden className="rounded-panel border border-dashed border-hairline" />
          ) : (
            <motion.button
              key={it.id}
              type="button"
              layoutId={`${uid}-${it.id}`}
              onClick={() => setOpen(it.id)}
              transition={SPRING.soft}
              whileHover={{ y: -2 }}
              className="sheet press relative flex min-w-0 flex-col items-start gap-1 overflow-hidden rounded-panel border border-hairline bg-surface p-4 text-start hover:border-hairline-strong"
            >
              {it.tone && <span aria-hidden className={cx("absolute bottom-3 start-0 top-3 w-0.5 rounded-e-sm", TONE_BG[it.tone])} />}
              <motion.span layout="position" className="text-xs font-medium text-muted">{it.title}</motion.span>
              <motion.span layout="position" className="text-sm text-text">{it.summary}</motion.span>
            </motion.button>
          ),
        )}
      </div>
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            layoutId={`${uid}-${active.id}`}
            transition={SPRING.soft}
            role="dialog"
            aria-label={typeof active.title === "string" ? active.title : "Expanded card"}
            className="sheet absolute inset-0 z-10 flex flex-col gap-2 overflow-auto rounded-panel border border-hairline-strong bg-raised p-5"
          >
            {active.tone && <span aria-hidden className={cx("absolute bottom-4 start-0 top-4 w-0.5 rounded-e-sm", TONE_BG[active.tone])} />}
            <div className="flex items-center gap-2">
              <motion.span layout="position" className="text-xs font-medium text-muted">{active.title}</motion.span>
              <IconButton label="Collapse" className="ms-auto" onClick={() => setOpen(null)} autoFocus>
                <IconClose size={14} />
              </IconButton>
            </div>
            <motion.span layout="position" className="text-md text-text">{active.summary}</motion.span>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12, duration: DUR.base } }} exit={{ opacity: 0, transition: { duration: 0.06 } }}
              className="text-sm text-muted">
              {active.detail}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Square toggle (3px radius, never a pill). */
export function Toggle({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "press relative inline-flex h-5 w-9 shrink-0 items-center rounded-control border px-0.5",
        checked ? "justify-end border-sage/70 bg-sage/20" : "justify-start border-hairline-strong bg-bg",
        className,
      )}
    >
      <motion.span layout transition={SPRING.ui} className={cx("h-3.5 w-3.5 rounded-xs", checked ? "bg-sage" : "bg-muted")} />
    </button>
  );
}

type Phase = "idle" | "busy" | "done" | "failed";

/** Runs an action and confirms it: a spinner-free busy state, then a success tick (or a failure mark). */
export function SuccessButton({
  onAction,
  children,
  doneLabel = "Done",
  variant = "outline",
  size = "md",
  icon,
  className,
}: {
  onAction: () => Promise<unknown> | unknown;
  children: ReactNode;
  doneLabel?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  async function run() {
    setPhase("busy");
    try {
      await onAction();
      setPhase("done");
    } catch {
      setPhase("failed");
    }
    setTimeout(() => setPhase("idle"), 1400);
  }
  return (
    <Button variant={variant} size={size} onClick={run} disabled={phase === "busy"} aria-live="polite" className={cx("relative overflow-hidden", className)}
      icon={
        <AnimatePresence mode="popLayout" initial={false}>
          {phase === "done" ? (
            <motion.span key="ok" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING.snappy} className="text-sage">
              <IconCheck size={size === "sm" ? 12 : 14} />
            </motion.span>
          ) : phase === "failed" ? (
            <motion.span key="bad" initial={{ x: -3 }} animate={{ x: [3, -2, 0] }} transition={{ duration: 0.3, ease: EASE.out }} className="text-red-text">
              <IconAlert size={size === "sm" ? 12 : 14} />
            </motion.span>
          ) : (
            <motion.span key="icon" initial={{ opacity: 0 }} animate={{ opacity: phase === "busy" ? 0.4 : 1 }} exit={{ opacity: 0 }}>
              {icon}
            </motion.span>
          )}
        </AnimatePresence>
      }
    >
      {phase === "done" ? doneLabel : phase === "failed" ? "Failed" : children}
    </Button>
  );
}
