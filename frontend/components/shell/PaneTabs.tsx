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

/** Open cases as pills; the white active pill slides between them and closed tabs collapse away. */
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
    <div role="tablist" aria-label="Open panes" className="mb-2 flex h-10 shrink-0 items-center gap-1 overflow-x-auto">
      <AnimatePresence initial={false}>
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, width: 0, transition: { duration: 0.14 } }}
              transition={SPRING.ui}
              className={cx("group relative flex h-8 min-w-0 max-w-56 shrink-0 items-center rounded-full", active ? "text-text" : "text-muted hover:text-text")}
            >
              {active && (
                <motion.span
                  layoutId={`tab-${uid}`}
                  transition={SPRING.ui}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgb(16_17_18/0.07),0_0_0_0.5px_rgb(16_17_18/0.07)]"
                />
              )}
              {!active && <span aria-hidden className="absolute inset-0 rounded-full transition-colors duration-150 group-hover:bg-hairline/50" />}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(t.id)}
                className={cx("press relative h-full min-w-0 truncate rounded-full ps-3.5 pe-1 text-xs", t.mono && "num", !t.closable && "pe-3.5")}
              >
                {t.label}
              </button>
              {t.closable && onClose && (
                <button
                  type="button"
                  aria-label={`Close ${t.label}`}
                  onClick={() => onClose(t.id)}
                  className="press relative me-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted opacity-60 hover:bg-hairline hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <IconClose size={11} />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
