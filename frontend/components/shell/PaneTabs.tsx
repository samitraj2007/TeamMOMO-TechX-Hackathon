"use client";

import { IconClose } from "@/components/icons";
import { cx } from "@/lib/cx";

export interface PaneTab {
  id: string;
  label: string;
  mono?: boolean;
  closable?: boolean;
}

/** Obsidian-style tab strip at the top of the workspace (32px). */
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
  return (
    <div role="tablist" aria-label="Open panes" className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-hairline bg-surface">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cx(
              "group relative flex min-w-0 max-w-56 items-center border-e border-hairline",
              active ? "bg-bg text-text" : "text-muted hover:bg-raised hover:text-text",
            )}
          >
            {active && <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-sage" />}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(t.id)}
              className={cx("h-full min-w-0 truncate ps-3 pe-1 text-sm", t.mono && "num", !t.closable && "pe-3")}
            >
              {t.label}
            </button>
            {t.closable && onClose && (
              <button
                type="button"
                aria-label={`Close ${t.label}`}
                onClick={() => onClose(t.id)}
                className="me-1 inline-flex h-5 w-5 items-center justify-center text-muted opacity-60 hover:bg-raised hover:text-text group-hover:opacity-100"
              >
                <IconClose size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
