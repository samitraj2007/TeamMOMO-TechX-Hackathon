"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { Role } from "@/lib/types";
import type { NavItem } from "./nav";
import { PaneTabs, type PaneTab } from "./PaneTabs";
import { Ribbon } from "./Ribbon";
import { SidebarTree } from "./SidebarTree";
import { StatusBar, type StatusInfo } from "./StatusBar";

/**
 * Presentational frame: ribbon | sidebar tree | (pane tabs / workspace) with a status bar underneath.
 * State (tabs, role, status) is owned by the caller: real data in the console layout, fixtures in /styleguide.
 */
export function AppShell({
  ribbon,
  tree,
  activeId,
  sidebarOpen,
  onToggleSidebar,
  onOpenPalette,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  status,
  role,
  onRoleChange,
  statusExtra,
  banner,
  className,
  children,
}: {
  ribbon: NavItem[];
  tree: NavItem[];
  activeId?: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  tabs: PaneTab[];
  activeTab?: string;
  onSelectTab: (id: string) => void;
  onCloseTab?: (id: string) => void;
  status: StatusInfo;
  role: Role;
  onRoleChange: (r: Role) => void;
  statusExtra?: ReactNode;
  banner?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-h-0 flex-col", className)}>
      <div className="flex min-h-0 flex-1">
        <Ribbon items={ribbon} activeId={activeId} sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar}
          onOpenPalette={onOpenPalette} />
        {sidebarOpen && <SidebarTree title="GulfHorizon" items={tree} activeId={activeId} />}
        <div className="flex min-w-0 flex-1 flex-col">
          <PaneTabs tabs={tabs} activeId={activeTab} onSelect={onSelectTab} onClose={onCloseTab} />
          {banner}
          <main className="min-h-0 flex-1 overflow-auto p-2">{children}</main>
        </div>
      </div>
      <StatusBar status={status} role={role} onRoleChange={onRoleChange} extra={statusExtra} />
    </div>
  );
}
