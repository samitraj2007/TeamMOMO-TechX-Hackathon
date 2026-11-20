"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconChevronRight, IconSearch, IconSidebar } from "@/components/icons";
import { Kbd } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { t } from "@/lib/i18n";
import { TONE_BG, type Tone } from "@/lib/labels";
import { useHydrated } from "@/lib/hydrated";
import { SPRING } from "@/lib/motion";
import { usePrefs } from "@/lib/prefs";
import type { Role } from "@/lib/types";
import type { NavItem } from "./nav";

const ROLES: { value: Role; label: string; short: string }[] = [
  { value: "ANALYST", label: "Analyst", short: "A" },
  { value: "COMPLIANCE_OFFICER", label: "Officer", short: "O" },
];

/**
 * The console's one navigation: sections, the demo cases, search, and the role that decisions are sent as.
 * Expanded 248px with labels, collapsed 68px with icons; the width eases with a spring.
 */
export function Sidebar({
  items,
  activeId,
  open,
  onToggle,
  onOpenPalette,
  role,
  onRoleChange,
  extra,
}: {
  items: NavItem[];
  activeId?: string;
  open: boolean;
  onToggle: () => void;
  onOpenPalette: () => void;
  role: Role;
  onRoleChange: (r: Role) => void;
  extra?: ReactNode;
}) {
  const uid = useId();
  const hydrated = useHydrated();
  const [casesOpen, setCasesOpen] = useState(true);
  const links = items.filter((i) => !i.children);
  const group = items.find((i) => i.children);
  const cases = hydrated ? (group?.children ?? []) : [];

  return (
    <motion.nav
      aria-label="Console"
      initial={false}
      animate={{ width: open ? 248 : 68 }}
      transition={SPRING.soft}
      className="flex shrink-0 flex-col overflow-hidden py-1"
    >
      <div className="flex flex-col gap-0.5 px-2">
        <div className={cx("flex h-9 items-center", open ? "justify-between ps-2" : "justify-center")}>
          <Fade show={open}>
            <span className="text-xs font-medium text-muted">GulfHorizon</span>
          </Fade>
          <button
            type="button"
            onClick={onToggle}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={open}
            className="press inline-flex h-8 w-8 items-center justify-center rounded-control text-muted hover:bg-hairline/60 hover:text-text"
          >
            <IconSidebar size={16} />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Search (Ctrl K)"
          title={open ? undefined : "Search (Ctrl K)"}
          className={cx(
            "press mb-3 mt-1 flex h-9 items-center gap-2 rounded-control border border-hairline bg-surface text-sm text-muted shadow-sheen hover:border-hairline-strong hover:text-text",
            open ? "px-2.5" : "justify-center",
          )}
        >
          <IconSearch size={15} />
          <Fade show={open} className="flex flex-1 items-center justify-between">
            <span>Search</span>
            <span className="flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
          </Fade>
        </button>

        {links.map((it) => (
          <NavRow key={it.id} item={it} active={it.id === activeId} open={open} pill={`nav-${uid}`} />
        ))}
      </div>

      {group && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col px-2">
          <button
            type="button"
            onClick={() => setCasesOpen((v) => !v)}
            aria-expanded={casesOpen}
            aria-controls={`cases-${uid}`}
            title={open ? undefined : group.label}
            className={cx(
              "press flex h-8 shrink-0 items-center gap-1.5 rounded-control text-xs font-medium text-muted hover:text-text",
              open ? "px-2.5" : "justify-center",
            )}
          >
            {open ? (
              <>
                <span>{group.label}</span>
                {hydrated && <span className="num text-2xs text-muted/80">{cases.length}</span>}
                <motion.span animate={{ rotate: casesOpen ? 90 : 0 }} transition={SPRING.ui} className="ms-auto inline-flex">
                  <IconChevronRight size={12} />
                </motion.span>
              </>
            ) : (
              <span aria-hidden className="h-px w-6 bg-hairline-strong" />
            )}
          </button>
          <AnimatePresence initial={false}>
            {casesOpen && (
              <motion.ul
                id={`cases-${uid}`}
                aria-label={group.label}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SPRING.soft}
                className="-mx-2 min-h-0 overflow-y-auto px-2"
              >
                {cases.map((c) => (
                  <li key={c.id}>
                    <CaseRow item={c} active={c.id === activeId} open={open} pill={`nav-${uid}`} />
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className={cx("mt-auto flex shrink-0 flex-col gap-2 border-t border-hairline px-2 pt-3", !group && "mt-auto")}>
        {extra}
        <RoleSwitch role={role} onChange={onRoleChange} open={open} onExpand={onToggle} />
      </div>
    </motion.nav>
  );
}

function Fade({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.06, duration: 0.16 } }}
          exit={{ opacity: 0, transition: { duration: 0.06 } }}
          className={cx("min-w-0 truncate whitespace-nowrap", className)}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

const rowClass = (active: boolean, open: boolean) =>
  cx(
    "press relative flex h-9 items-center gap-2.5 rounded-control text-sm",
    open ? "px-2.5" : "justify-center",
    active ? "font-medium text-text" : "text-muted hover:bg-hairline/50 hover:text-text",
  );

/** The active row carries a white pill that slides between rows (shared layoutId). */
function ActivePill({ id }: { id: string }) {
  return (
    <motion.span
      layoutId={id}
      transition={SPRING.ui}
      aria-hidden
      className="absolute inset-0 rounded-control bg-surface shadow-[0_1px_2px_rgb(16_17_18/0.07),0_0_0_0.5px_rgb(16_17_18/0.07)]"
    />
  );
}

function NavRow({ item, active, open, pill }: { item: NavItem; active: boolean; open: boolean; pill: string }) {
  const body = (
    <>
      {active && <ActivePill id={pill} />}
      <span className={cx("relative inline-flex shrink-0", active ? "text-sage" : "")}>{item.icon}</span>
      <Fade show={open} className="relative">{item.label}</Fade>
    </>
  );
  return item.href ? (
    <Link href={item.href} aria-current={active ? "page" : undefined} aria-label={open ? undefined : item.label}
      title={open ? undefined : item.label} className={rowClass(active, open)}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={item.onSelect} aria-label={open ? undefined : item.label} className={rowClass(active, open)}>
      {body}
    </button>
  );
}

function CaseRow({ item, active, open, pill }: { item: NavItem; active: boolean; open: boolean; pill: string }) {
  return (
    <Link
      href={item.href ?? "#"}
      aria-current={active ? "page" : undefined}
      aria-label={item.hint ? `${item.label} (${item.hint})` : item.label}
      title={item.hint ? `${item.hint} · ${item.label}` : item.label}
      className={cx(rowClass(active, open), "h-8")}
    >
      {active && <ActivePill id={pill} />}
      <span
        aria-hidden
        className={cx(
          "num relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
          active ? "bg-sage text-bg" : "bg-hairline/80 text-text",
        )}
      >
        {item.meta ?? "·"}
      </span>
      <Fade show={open} className="relative flex-1 text-[13px]">{item.label}</Fade>
      {open && item.status && <StatusDot tone={item.status} />}
    </Link>
  );
}

function StatusDot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={cx("relative h-1.5 w-1.5 shrink-0 rounded-full", TONE_BG[tone])} />;
}

/** "Acting as": the role decisions and filings are sent as. A two-option radio group; arrows move. */
function RoleSwitch({ role, onChange, open, onExpand }: { role: Role; onChange: (r: Role) => void; open: boolean; onExpand: () => void }) {
  const { lang } = usePrefs();
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = ROLES.find((r) => r.value === role) ?? ROLES[0];

  function onKey(e: KeyboardEvent) {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const i = ROLES.findIndex((r) => r.value === role);
    const next = (i + 1) % ROLES.length;
    onChange(ROLES[next].value);
    refs.current[next]?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onExpand}
        title={`${t("role", lang)}: ${current.label}. Expand the sidebar to change it.`}
        aria-label={`${t("role", lang)}: ${current.label}. Expand the sidebar to change it.`}
        className="press mx-auto mb-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline-strong bg-surface text-xs font-semibold text-text shadow-sheen"
      >
        {current.short}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1">
      <span id={`role-${uid}`} className="text-xs font-medium text-muted first-letter:uppercase">{t("role", lang)}</span>
      <div role="radiogroup" aria-labelledby={`role-${uid}`} onKeyDown={onKey} className="relative grid grid-cols-2 rounded-full bg-hairline/60 p-[3px]">
        {ROLES.map((r, i) => {
          const on = r.value === role;
          return (
            <button
              key={r.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(r.value)}
              className={cx("press relative h-7 rounded-full text-xs font-medium", on ? "text-text" : "text-muted hover:text-text")}
            >
              {on && (
                <motion.span
                  layoutId={`role-pill-${uid}`}
                  transition={SPRING.ui}
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgb(16_17_18/0.08),0_0_0_0.5px_rgb(16_17_18/0.06)]"
                />
              )}
              <span className="relative">{r.value === "COMPLIANCE_OFFICER" ? "Compliance officer" : r.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
