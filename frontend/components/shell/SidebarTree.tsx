"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { IconChevronRight } from "@/components/icons";
import { cx } from "@/lib/cx";
import { SPRING } from "@/lib/motion";
import type { NavItem } from "./nav";

/** Collapsible file-tree navigation (224px), folders open and close with a height spring. */
export function SidebarTree({
  title,
  items,
  activeId,
  className,
}: {
  title: string;
  items: NavItem[];
  activeId?: string;
  className?: string;
}) {
  return (
    <nav aria-label={title} className={cx("sheet flex w-56 shrink-0 flex-col overflow-hidden rounded-panel border border-hairline bg-surface/90", className)}>
      <div className="flex h-10 shrink-0 items-center px-4 text-2xs font-medium uppercase tracking-[0.1em] text-muted">{title}</div>
      <ul role="tree" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {items.map((it) => (
          <TreeNode key={it.id} item={it} depth={0} activeId={activeId} />
        ))}
      </ul>
    </nav>
  );
}

function TreeNode({ item, depth, activeId }: { item: NavItem; depth: number; activeId?: string }) {
  const [open, setOpen] = useState(true);
  const hasChildren = !!item.children?.length;
  const active = item.id === activeId;
  const cls = cx(
    "press relative flex h-8 w-full min-w-0 items-center gap-2 rounded-control pe-2 text-sm",
    active ? "bg-raised text-text shadow-sheen" : "text-muted hover:bg-raised/60 hover:text-text",
  );
  const pad = { paddingInlineStart: 6 + depth * 14 };
  const body = (
    <>
      {active && <span aria-hidden className="absolute bottom-2 start-0 top-2 w-[3px] rounded-e-sm bg-brass" />}
      {hasChildren ? (
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={SPRING.ui} className="inline-flex">
          <IconChevronRight size={12} />
        </motion.span>
      ) : (
        <span className="w-3" />
      )}
      {item.icon && <span className="shrink-0 text-muted">{item.icon}</span>}
      <span className="truncate">{item.label}</span>
      {item.meta !== undefined && <span className="num ms-auto shrink-0 text-2xs text-muted">{item.meta}</span>}
    </>
  );
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={active}>
      {hasChildren ? (
        <button type="button" className={cls} style={pad} onClick={() => setOpen((o) => !o)}>
          {body}
        </button>
      ) : item.href ? (
        <Link href={item.href} className={cls} style={pad} aria-current={active ? "page" : undefined}>
          {body}
        </Link>
      ) : (
        <button type="button" className={cls} style={pad} onClick={item.onSelect}>
          {body}
        </button>
      )}
      <AnimatePresence initial={false}>
        {hasChildren && open && (
          <motion.ul role="group" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={SPRING.soft} className="overflow-hidden">
            {item.children!.map((c) => (
              <TreeNode key={c.id} item={c} depth={depth + 1} activeId={activeId} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}
