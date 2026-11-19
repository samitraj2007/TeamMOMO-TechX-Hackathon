"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { IconClose } from "@/components/icons";
import { cx } from "@/lib/cx";
import { SPRING } from "@/lib/motion";

export interface PaneTab {
  id: string;
  label: string;
  mono?: boolean;
  closable?: boolean;
}

/** Obsidian-style tab strip; the active indicator slides between tabs and closed tabs collapse away. */
export function PaneTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
}: {
  tabs: PaneTab[];
  activeId?: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
}) {
  const uid = useId();
  return (
    <div role="tablist" aria-label="Open panes" className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto px-1">
      <AnimatePresence initial={false}>
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, width: 0, transition: { duration: 0.14 } }}
              transition={SPRING.ui}
              className={cx("group relative flex h-8 min-w-0 max-w-56 items-center rounded-t-control", active ? "text-text" : "text-muted hover:text-text")}
            >
              {active && (
                <motion.span layoutId={`tab-${uid}`} transition={SPRING.ui} aria-hidden
                  className="absolute inset-0 rounded-t-panel border border-b-0 border-hairline-strong bg-raised shadow-sheen">
                  <span className="absolute inset-x-3 top-0 h-px bg-brass" />
                </motion.span>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(t.id)}
                className={cx("press relative h-full min-w-0 truncate rounded-t-control ps-3 pe-1 text-sm", t.mono && "num", !t.closable && "pe-3")}
              >
                {t.label}
              </button>
              {t.closable && onClose && (
                <button
                  type="button"
                  aria-label={`Close ${t.label}`}
                  onClick={() => onClose(t.id)}
                  className="press relative me-1.5 inline-flex h-5 w-5 items-center justify-center rounded-xs text-muted opacity-60 hover:bg-overlay hover:text-text group-hover:opacity-100"
                >
                  <IconClose size={12} />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
