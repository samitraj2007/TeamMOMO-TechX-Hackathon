"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { Role } from "@/lib/types";
import type { NavItem } from "./nav";
import { PaneTabs, type PaneTab } from "./PaneTabs";
import { Sidebar } from "./Sidebar";

/**
 * Presentational frame: one sidebar (sections, cases, search, role) beside the workspace,
 * with the open-case tabs above the content. State is owned by the caller: real data in the
 * console layout, fixtures in /styleguide.
 */
export function AppShell({
  tree,
  activeId,
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  role,
  onRoleChange,
  statusExtra,
  banner,
  className,
  children,
}: {
  tree: NavItem[];
  activeId?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  tabs: PaneTab[];
  activeTab?: string;
  onSelectTab: (id: string) => void;
  onCloseTab?: (id: string) => void;
  role: Role;
  onRoleChange: (r: Role) => void;
  statusExtra?: ReactNode;
  banner?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-h-0 gap-3 px-3 pb-3 pt-2", className)}>
      <Sidebar
        items={tree}
        activeId={activeId}
        open={sidebarOpen}
        onToggle={onToggleSidebar}
        onOpenPalette={onOpenPalette}
        role={role}
        onRoleChange={onRoleChange}
        extra={statusExtra}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {tabs.length > 0 && <PaneTabs tabs={tabs} activeId={activeTab} onSelect={onSelectTab} onClose={onCloseTab} />}
        {banner && <div className="mb-2">{banner}</div>}
        {/* relative: absolutely positioned descendants (sr-only live regions) stay inside the scroller instead of growing the document. */}
        <main className="relative min-h-0 flex-1 overflow-auto rounded-sheet">
          {children}
        </main>
      </div>
    </div>
  );
}
