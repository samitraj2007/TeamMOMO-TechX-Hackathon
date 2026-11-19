"use client";

import Link from "next/link";
import { IconCommand, IconSidebar } from "@/components/icons";
import { IconButton } from "@/components/primitives";
import { cx } from "@/lib/cx";
import type { NavItem } from "./nav";

/** Narrow icon rail (44px), as in Obsidian's left ribbon. */
export function Ribbon({
  items,
  activeId,
  onToggleSidebar,
  sidebarOpen,
  onOpenPalette,
}: {
  items: NavItem[];
  activeId?: string;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onOpenPalette: () => void;
}) {
  return (
    <nav aria-label="Ribbon" className="flex w-11 shrink-0 flex-col items-center gap-1 border-e border-hairline bg-surface py-2">
      <IconButton label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} onClick={onToggleSidebar} active={sidebarOpen}>
        <IconSidebar />
      </IconButton>
      <span aria-hidden className="my-1 h-px w-5 bg-hairline" />
      {items.map((it) => {
        const active = it.id === activeId;
        const cls = cx(
          "relative inline-flex h-8 w-8 items-center justify-center transition-colors duration-[120ms]",
          active ? "bg-raised text-text" : "text-muted hover:bg-raised hover:text-text",
        );
        const bar = active && <span aria-hidden className="absolute inset-y-1 start-0 w-0.5 bg-sage" />;
        return it.href ? (
          <Link key={it.id} href={it.href} aria-label={it.label} title={it.label} aria-current={active ? "page" : undefined} className={cls}>
            {bar}
            {it.icon}
          </Link>
        ) : (
          <button key={it.id} type="button" aria-label={it.label} title={it.label} onClick={it.onSelect} className={cls}>
            {bar}
            {it.icon}
          </button>
        );
      })}
      <div className="mt-auto">
        <IconButton label="Command palette (Ctrl+K)" onClick={onOpenPalette}>
          <IconCommand />
        </IconButton>
      </div>
    </nav>
  );
}
