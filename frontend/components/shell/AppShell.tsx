"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { SPRING } from "@/lib/motion";
import type { Role } from "@/lib/types";
import type { NavItem } from "./nav";
import { PaneTabs, type PaneTab } from "./PaneTabs";
import { Ribbon } from "./Ribbon";
import { SidebarTree } from "./SidebarTree";
import { StatusBar, type StatusInfo } from "./StatusBar";

/**
 * Presentational frame: floating rail, sidebar tree, pane tabs over the workspace, and a status bar.
 * State (tabs, role, status) is owned by the caller: real data in the console layout, fixtures in /styleguide.
 */
export function AppShell({
  ribbon,
  tree,
  activeId,
  railExpanded,
  onToggleRail,
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
  railExpanded: boolean;
  onToggleRail: () => void;
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
    <div className={cx("flex min-h-0 flex-col gap-2 p-2", className)}>
      <div className="flex min-h-0 flex-1 gap-2">
        <Ribbon items={ribbon} activeId={activeId} expanded={railExpanded} onToggleExpanded={onToggleRail}
          sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar} onOpenPalette={onOpenPalette} />
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div key="tree" initial={{ width: 0, opacity: 0 }} animate={{ width: 224, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={SPRING.soft} className="flex shrink-0 overflow-hidden">
              <SidebarTree title="GulfHorizon" items={tree} activeId={activeId} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex min-w-0 flex-1 flex-col">
          <PaneTabs tabs={tabs} activeId={activeTab} onSelect={onSelectTab} onClose={onCloseTab} />
          <div className="sheet flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel rounded-tl-none border border-hairline-strong bg-raised/40">
            {banner}
            <main className="min-h-0 flex-1 overflow-auto p-4">{children}</main>
          </div>
        </div>
      </div>
      <StatusBar status={status} role={role} onRoleChange={onRoleChange} extra={statusExtra} />
    </div>
  );
}
