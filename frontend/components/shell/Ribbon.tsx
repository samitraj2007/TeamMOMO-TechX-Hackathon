"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { IconChevronRight, IconCommand, IconSidebar } from "@/components/icons";
import { cx } from "@/lib/cx";
import { SPRING } from "@/lib/motion";
import type { NavItem } from "./nav";

/** Left rail: mascot logo, page icons, palette. Collapses to 52px icons or expands to 184px with labels. */
export function Ribbon({
  items,
  activeId,
  expanded,
  onToggleExpanded,
  onToggleSidebar,
  sidebarOpen,
  onOpenPalette,
}: {
  items: NavItem[];
  activeId?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onOpenPalette: () => void;
}) {
  const uid = useId();
  return (
    <motion.nav
      aria-label="Rail"
      initial={false}
      animate={{ width: expanded ? 184 : 52 }}
      transition={SPRING.soft}
      className="sheet relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-panel border border-hairline bg-surface px-1.5 py-2"
    >
      <div className="mb-2 flex h-10 items-center gap-2 px-0.5">
        <Mascot size={36} avatar />
        <Label show={expanded}>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text">MOMO</span>
            <span className="text-2xs text-muted">GulfHorizon</span>
          </span>
        </Label>
      </div>
      {items.map((it) => {
        const active = it.id === activeId;
        const inner = (
          <>
            {active && (
              <motion.span layoutId={`rail-${uid}`} transition={SPRING.ui} aria-hidden
                className="absolute inset-0 rounded-control border border-hairline-strong bg-raised shadow-sheen">
                <span className="absolute bottom-2 start-0 top-2 w-[3px] rounded-e-sm bg-brass" />
              </motion.span>
            )}
            <span className="relative flex w-7 shrink-0 justify-center">{it.icon}</span>
            <Label show={expanded}>{it.label}</Label>
          </>
        );
        const cls = cx(
          "press relative flex h-9 items-center gap-2 rounded-control px-1.5 text-sm",
          active ? "text-text" : "text-muted hover:bg-raised/60 hover:text-text",
        );
        return it.href ? (
          <Link key={it.id} href={it.href} aria-label={it.label} title={expanded ? undefined : it.label} aria-current={active ? "page" : undefined} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={it.id} type="button" aria-label={it.label} title={expanded ? undefined : it.label} aria-current={active ? "page" : undefined} onClick={it.onSelect} className={cls}>
            {inner}
          </button>
        );
      })}
      <div className="mt-auto flex flex-col gap-1 border-t border-hairline/70 pt-2">
        <RailButton label="Command palette (Ctrl+K)" icon={<IconCommand />} expanded={expanded} onClick={onOpenPalette} />
        <RailButton label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} icon={<IconSidebar />} expanded={expanded} onClick={onToggleSidebar} active={sidebarOpen} />
        <RailButton
          label={expanded ? "Collapse rail" : "Expand rail"}
          icon={<motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={SPRING.ui} className="inline-flex"><IconChevronRight /></motion.span>}
          expanded={expanded}
          onClick={onToggleExpanded}
        />
      </div>
    </motion.nav>
  );
}

function Label({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4, transition: { duration: 0.08 } }}
          transition={{ delay: 0.05, duration: 0.16 }} className="relative min-w-0 truncate whitespace-nowrap">
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function RailButton({ label, icon, expanded, onClick, active }: { label: string; icon: ReactNode; expanded: boolean; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={expanded ? undefined : label} onClick={onClick}
      className={cx("press relative flex h-8 items-center gap-2 rounded-control px-1.5 text-xs",
        active ? "text-text" : "text-muted hover:bg-raised/60 hover:text-text")}>
      <span className="flex w-7 shrink-0 justify-center">{icon}</span>
      <Label show={expanded}>{label}</Label>
    </button>
  );
}
