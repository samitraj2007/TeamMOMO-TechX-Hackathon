"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconSearch } from "@/components/icons";
import { Kbd } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { DUR, EASE, SPRING } from "@/lib/motion";

export interface Command {
  id: string;
  label: string;
  group: string;
  hint?: ReactNode;
  keywords?: string;
  run: () => void;
}

/** Ctrl+K / Cmd+K anywhere opens the palette. */
export function useCommandHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}

/**
 * `dynamic` turns the raw query into extra commands (e.g. "TXN-00412" becomes "Run TXN-00412"),
 * so IDs that are not in the static list can still be reached.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
  dynamic,
  placeholder = "Jump to a case, run a transaction, open a page…",
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  dynamic?: (query: string) => Command[];
  placeholder?: string;
}) {
  const body = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[#111213]/30 pt-[14vh] backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.fast, ease: EASE.out }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div initial={{ y: -6, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: -4, scale: 0.98, transition: { duration: 0.12 } }} transition={SPRING.ui}>
            <PaletteDialog onClose={onClose} commands={commands} dynamic={dynamic} placeholder={placeholder} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return typeof document === "undefined" ? null : createPortal(body, document.body);
}

/** Mounted fresh on every open, so the query and cursor always start empty. */
function PaletteDialog({
  onClose,
  commands,
  dynamic,
  placeholder,
}: {
  onClose: () => void;
  commands: Command[];
  dynamic?: (query: string) => Command[];
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const extra = dynamic?.(query.trim()) ?? [];
    const matched = q
      ? commands.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q))
      : commands;
    return [...extra, ...matched].slice(0, 40);
  }, [query, commands, dynamic]);

  function choose(c: Command | undefined) {
    if (!c) return;
    onClose();
    c.run();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[cursor]);
    }
  }

  let lastGroup = "";
  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey}
      className="w-[580px] max-w-[calc(100vw-32px)] overflow-hidden rounded-sheet border border-hairline bg-overlay shadow-pop">
      <div className="flex h-12 items-center gap-2.5 border-b border-hairline px-4">
        <IconSearch className="text-muted" />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          placeholder={placeholder}
          aria-label="Command"
          aria-controls="palette-results"
          aria-activedescendant={results[cursor] ? `cmd-${results[cursor].id}` : undefined}
          className="h-full flex-1 bg-transparent text-md text-text outline-none placeholder:text-muted"
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id="palette-results" role="listbox" className="max-h-80 overflow-y-auto py-1.5">
        {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">No match</li>}
        {results.map((c, i) => {
          const header = c.group !== lastGroup;
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {header && (
                <div className="px-4 pb-1 pt-2.5 text-xs font-medium text-muted">{c.group}</div>
              )}
              <div
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(c)}
                className={cx(
                  "relative mx-1.5 flex h-9 cursor-pointer items-center gap-3 rounded-control px-3 text-sm",
                  i === cursor ? "text-text" : "text-muted",
                )}
              >
                {i === cursor && (
                  <motion.span layoutId="palette-cursor" transition={SPRING.ui} aria-hidden
                    className="absolute inset-0 rounded-control bg-hairline/60" />
                )}
                <span className="relative truncate">{c.label}</span>
                {c.hint && <span className="num relative ms-auto shrink-0 text-2xs text-muted">{c.hint}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex h-9 items-center gap-4 border-t border-hairline bg-raised px-4 text-xs text-muted">
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
        <span className="flex items-center gap-1"><Kbd>Enter</Kbd> run</span>
      </div>
    </div>
  );
}
