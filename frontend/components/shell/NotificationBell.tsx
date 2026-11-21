"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AuditEntrySheet } from "@/components/audit/AuditEntrySheet";
import { IconBell } from "@/components/icons";
import { api } from "@/lib/api";
import { cx } from "@/lib/cx";
import { timestamp } from "@/lib/format";
import { useVerify } from "@/lib/queries";
import type { AppNotification } from "@/lib/types";

/**
 * Notification inbox. Events come from GET /notifications, which derives them from the append-only audit log, so
 * there is no separate state to tamper with. Read state is per browser (localStorage); desktop alerts use the
 * browser Notification API and fire for high-severity events only. Polls every 15 s, paused while the tab is hidden.
 */

const READ_KEY = "momo.notifications.readSeq";
const DESKTOP_KEY = "momo.notifications.desktop";
const listeners = new Set<() => void>();

function readStore(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeStore(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private window: keep it in memory only */ }
  memory.set(key, value);
  listeners.forEach((l) => l());
}
const memory = new Map<string, string>();
function useStored(key: string): string | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("storage", cb); return () => { listeners.delete(cb); window.removeEventListener("storage", cb); }; },
    () => readStore(key) ?? memory.get(key) ?? null,
    () => null,
  );
}

const SEVERITY_DOT: Record<AppNotification["severity"], string> = { high: "bg-red", warn: "bg-amber", info: "bg-sage" };
const desktopSupported = () => typeof window !== "undefined" && "Notification" in window;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<string | null>(null);
  const readSeq = Number(useStored(READ_KEY) ?? 0);
  const desktop = useStored(DESKTOP_KEY) === "on";
  const panel = useRef<HTMLDivElement>(null);
  const notified = useRef<number | null>(null);

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications(0),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const verify = useVerify();
  const chainBroken = verify.data && !verify.data.ok;

  const events = q.data?.events ?? [];
  const unread = events.filter((e) => e.seq > readSeq).length + (chainBroken ? 1 : 0);

  // Desktop alerts for new high-severity events. The first load only sets the watermark (no burst of old alerts);
  // several new events in one poll become one summary alert, so a fast feed does not flood the desktop.
  useEffect(() => {
    if (!q.data) return;
    const head = q.data.head_seq;
    if (notified.current === null) { notified.current = head; return; }
    const fresh = q.data.events.filter((e) => e.seq > (notified.current ?? 0) && e.severity === "high");
    notified.current = Math.max(notified.current, head);
    if (!desktop || !fresh.length || !desktopSupported() || Notification.permission !== "granted") return;
    try {
      const body = fresh.length === 1 ? fresh[0].title : `${fresh.length} cases need attention: ${fresh.slice(0, 3).map((e) => e.alert_id).join(", ")}${fresh.length > 3 ? "…" : ""}`;
      const n = new Notification("MOMO Sentinel", { body, tag: "momo-high", silent: false });
      n.onclick = () => { window.focus(); setOpen(true); };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }, [q.data, desktop]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  async function toggleDesktop() {
    if (desktop) { writeStore(DESKTOP_KEY, "off"); return; }
    if (!desktopSupported()) return;
    const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    writeStore(DESKTOP_KEY, perm === "granted" ? "on" : "off");
  }
  const permission = desktopSupported() ? Notification.permission : "unsupported";

  return (
    <div ref={panel} className="relative">
      <button type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="press relative grid h-8 w-8 place-items-center rounded-full border border-hairline bg-surface text-text shadow-sheen hover:border-hairline-strong">
        <IconBell size={15} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span key={unread} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
              className="num absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[10px] font-semibold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute end-0 top-10 z-50 flex w-[min(380px,calc(100vw-32px))] origin-top-right flex-col overflow-hidden rounded-panel border border-hairline bg-surface shadow-card">
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
              <span className="text-sm font-semibold text-text">Notifications</span>
              <button type="button" disabled={!events.length}
                onClick={() => writeStore(READ_KEY, String(q.data?.head_seq ?? 0))}
                className="text-xs text-muted underline-offset-4 hover:text-text hover:underline disabled:opacity-40">Mark all read</button>
            </div>

            <ul className="flex max-h-[420px] flex-col overflow-y-auto">
              {chainBroken && (
                <li className="flex gap-3 border-b border-hairline bg-red/5 px-4 py-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red" />
                  <span className="flex flex-col">
                    <span className="font-medium text-text">Audit chain failed verification</span>
                    <span className="text-xs text-muted">{verify.data?.reason} at {verify.data?.first_bad_record_id ?? "unknown"}</span>
                    <Link href="/audit" onClick={() => setOpen(false)} className="text-xs underline underline-offset-4">Open the audit</Link>
                  </span>
                </li>
              )}
              {q.isError && <li className="px-4 py-6 text-center text-xs text-muted">Notifications unavailable: restart the backend so it serves /notifications.</li>}
              {!q.isError && !events.length && !chainBroken && (
                <li className="px-4 py-8 text-center text-xs text-muted">Nothing needs you right now. Approvals, failed-closed cases, decisions and filings show up here.</li>
              )}
              {events.map((e) => (
                <li key={e.seq} className={cx("flex gap-3 border-b border-hairline px-4 py-3 last:border-b-0", e.seq > readSeq && "bg-raised/60")}>
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[e.severity])} aria-label={e.severity} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cx("text-sm text-text", e.seq > readSeq && "font-medium")}>{e.title}</span>
                    <span className="num text-2xs text-muted">{timestamp(e.ts)}</span>
                    <span className="flex gap-3 text-xs">
                      {e.alert_id && <Link href={`/case/${e.alert_id}`} onClick={() => setOpen(false)} className="underline underline-offset-4">Open case</Link>}
                      <button type="button" onClick={() => setEntry(e.record_id)} className="text-muted underline underline-offset-4 hover:text-text">Audit entry</button>
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5 text-xs">
              <span className="text-muted">
                {permission === "unsupported" ? "Desktop alerts not supported in this browser"
                  : permission === "denied" ? "Desktop alerts blocked in browser settings"
                  : "Desktop alerts for urgent events"}
              </span>
              {permission !== "unsupported" && permission !== "denied" && (
                <button type="button" role="switch" aria-checked={desktop} onClick={() => void toggleDesktop()}
                  className={cx("press relative h-5 w-9 shrink-0 rounded-full transition-colors", desktop ? "bg-text" : "bg-hairline-strong")}>
                  <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-[inset-inline-start]", desktop ? "start-[18px]" : "start-0.5")} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AuditEntrySheet recordId={entry} onClose={() => setEntry(null)} />
    </div>
  );
}
