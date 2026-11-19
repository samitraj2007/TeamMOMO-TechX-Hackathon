"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { cx } from "@/lib/cx";
import { DUR, EASE, SPRING } from "@/lib/motion";
import { IconButton } from "./Button";

function Portal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

/** Right-hand drawer (left in RTL). Esc closes; focus moves in on open and back on close. */
export function Drawer({
  open,
  onClose,
  title,
  actions,
  width = 440,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  actions?: ReactNode;
  width?: number;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 bg-bg/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.base, ease: EASE.out }}
              onClick={onClose}
            />
            <motion.div
              key="panel"
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              style={{ width }}
              className="sheet fixed inset-y-2 end-2 z-50 flex max-w-[calc(100%-16px)] flex-col overflow-hidden rounded-panel border border-hairline-strong bg-surface outline-none"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={SPRING.soft}
            >
              <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-4">
                <h2 id={titleId} className="min-w-0 truncate text-sm font-medium text-text">{title}</h2>
                <div className="ms-auto flex items-center gap-1">
                  {actions}
                  <IconButton label="Close" onClick={onClose}>
                    <IconClose size={14} />
                  </IconButton>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** Hover or focus preview, positioned below the trigger (above when near the viewport bottom). */
export function HoverCard({
  content,
  children,
  delay = 250,
  width = 320,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  delay?: number;
  width?: number;
  className?: string;
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const id = useId();

  function show() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos(r.bottom + 220 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
    }, delay);
  }
  function hide() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPos(null), 80);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span
      ref={trigger}
      className={cx("inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={pos ? id : undefined}
    >
      {children}
      <Portal>
        <AnimatePresence>
          {pos && (
            <motion.div
              id={id}
              role="tooltip"
              onMouseEnter={() => clearTimeout(timer.current)}
              onMouseLeave={hide}
              style={{ ...pos, width }}
              className="sheet fixed z-50 rounded-panel border border-hairline-strong bg-overlay p-3 text-sm text-text"
              initial={{ opacity: 0, y: 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 2 }}
              transition={SPRING.ui}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </span>
  );
}

export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <HoverCard content={<span className="text-xs text-text">{label}</span>} delay={400} width={220}>
      {children}
    </HoverCard>
  );
}
