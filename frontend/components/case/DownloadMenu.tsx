"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { downloadUrl, files } from "@/lib/api";
import { cx } from "@/lib/cx";

/** Case downloads: SAR draft (.md or printable page), the case's audit (.csv) and the full evidence pack (.zip). */
export function DownloadMenu({ alertId, hasRun }: { alertId: string; hasRun: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const items: { label: string; hint: string; run: () => void; needsRun?: boolean }[] = [
    { label: "Evidence pack (.zip)", hint: "Report, audit, timeline, case data and a SHA-256 manifest", run: () => downloadUrl(files.evidencePack(alertId)) },
    { label: "SAR draft (.md)", hint: "The report as Markdown", run: () => downloadUrl(files.reportMd(alertId)), needsRun: true },
    { label: "Printable report", hint: "Opens a print view: use Print, then Save as PDF", run: () => window.open(files.reportPrint(alertId), "_blank", "noopener"), needsRun: true },
    { label: "Audit trail (.csv)", hint: "Every audit entry for this case", run: () => downloadUrl(files.caseAuditCsv(alertId)) },
  ];

  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="press inline-flex h-9 items-center gap-1.5 rounded-control border border-hairline-strong bg-surface px-3 text-sm text-text hover:bg-raised">
        Download
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className={cx("transition-transform", open && "rotate-180")}>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}
            className="absolute end-0 top-11 z-40 flex w-72 flex-col overflow-hidden rounded-panel border border-hairline bg-surface py-1 shadow-card">
            {items.map((it) => {
              const disabled = it.needsRun && !hasRun;
              return (
                <li key={it.label} role="none">
                  <button type="button" role="menuitem" disabled={disabled}
                    onClick={() => { it.run(); setOpen(false); }}
                    className="flex w-full flex-col items-start px-3.5 py-2 text-start hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45">
                    <span className="text-sm text-text">{it.label}</span>
                    <span className="text-xs text-muted">{disabled ? "Run the investigation first" : it.hint}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
