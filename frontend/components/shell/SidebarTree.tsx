"use client";

import Link from "next/link";
import { useState } from "react";
import { IconChevronDown, IconChevronRight } from "@/components/icons";
import { cx } from "@/lib/cx";
import type { NavItem } from "./nav";

/** Collapsible file-tree style navigation (224px). */
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
    <nav aria-label={title} className={cx("flex w-56 shrink-0 flex-col border-e border-hairline bg-surface", className)}>
      <div className="flex h-8 shrink-0 items-center border-b border-hairline px-3 text-2xs font-medium uppercase tracking-[0.08em] text-muted">
        {title}
      </div>
      <ul role="tree" className="min-h-0 flex-1 overflow-y-auto py-1">
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
    "relative flex h-7 w-full min-w-0 items-center gap-2 pe-2 text-sm transition-colors duration-[120ms]",
    active ? "bg-raised text-text" : "text-muted hover:bg-raised hover:text-text",
  );
  const pad = { paddingInlineStart: 8 + depth * 12 };
  const body = (
    <>
      {active && <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-sage" />}
      {hasChildren ? (open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />) : <span className="w-3" />}
      {item.icon && <span className="shrink-0 text-muted">{item.icon}</span>}
      <span className="truncate">{item.label}</span>
      {item.meta && <span className="num ms-auto shrink-0 text-2xs text-muted">{item.meta}</span>}
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
      {hasChildren && open && (
        <ul role="group">
          {item.children!.map((c) => (
            <TreeNode key={c.id} item={c} depth={depth + 1} activeId={activeId} />
          ))}
        </ul>
      )}
    </li>
  );
}
