"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  IconAudit, IconCases, IconEval, IconIngest, IconQueue, IconTransactions,
} from "@/components/icons";
import { Banner } from "@/components/primitives";
import { apiRecordSource, RecordProvider } from "@/components/records/Records";
import { t } from "@/lib/i18n";
import { useHydrated } from "@/lib/hydrated";
import { ROUTE_TONE } from "@/lib/labels";
import { usePrefs } from "@/lib/prefs";
import { useCases, useHealth } from "@/lib/queries";
import type { Role } from "@/lib/types";
import { AppShell } from "./AppShell";
import type { NavItem } from "./nav";
import type { PaneTab } from "./PaneTabs";
import { useOpenPalette } from "./SiteFrame";

const RoleCtx = createContext<{ role: Role; setRole: (r: Role) => void }>({ role: "ANALYST", setRole: () => {} });

/** The role chosen in the status bar. Decision and filing actions send this role to the backend. */
export function useConsoleRole() {
  return useContext(RoleCtx);
}

const subscribe = () => () => {};

/** The server render has no route yet. Hydration uses that same empty path, then the browser route. */
function useHydratedPath(): string {
  const path = usePathname() ?? "";
  return useSyncExternalStore(subscribe, () => path, () => "");
}

const ACTOR: Record<Role, string> = { ANALYST: "analyst.demo", COMPLIANCE_OFFICER: "officer.demo" };
export const actorFor = (role: Role) => ACTOR[role];

export function ConsoleFrame({ children }: { children: ReactNode }) {
  const { lang } = usePrefs();
  const path = useHydratedPath();
  const router = useRouter();
  const health = useHealth();
  const cases = useCases(false);
  const [role, setRole] = useState<Role>("ANALYST");
  const [sidebar, setSidebar] = useState(true);
  // Case screens need the width: the sidebar starts collapsed there and remembers its own choice.
  const [sidebarOnCase, setSidebarOnCase] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const openPalette = useOpenPalette();

  const caseId = path.match(/^\/case\/([^/]+)/)?.[1];
  const section =
    path.startsWith("/transactions") ? "transactions"
    : path.startsWith("/audit") ? "audit"
    : path.startsWith("/eval") ? "eval"
    : path.startsWith("/ingest") ? "ingest"
    : path.startsWith("/case") ? "cases"
    : "queue";

  const link = (id: string, label: string, icon: ReactNode, href: string): NavItem => ({ id, label, icon, href });
  // The server render has no case list; the browser may already hold it from cache. Read it only after
  // hydration, so the case tabs and sidebar cases render identically on both sides first.
  const hydrated = useHydrated();
  const demoCases = hydrated ? (cases.data ?? []) : [];
  const tree: NavItem[] = [
    link("queue", t("queue", lang), <IconQueue size={16} />, "/queue"),
    link("transactions", t("transactions", lang), <IconTransactions size={16} />, "/transactions"),
    {
      id: "cases",
      label: t("cases", lang),
      icon: <IconCases size={16} />,
      children: demoCases.map((c) => ({
        id: c.alert_id,
        label: c.title,
        hint: c.alert_id,
        href: `/case/${c.alert_id}`,
        meta: c.demo_tag ?? undefined,
        status: c.last_route ? ROUTE_TONE[c.last_route] : undefined,
      })),
    },
    link("audit", t("audit", lang), <IconAudit size={16} />, "/audit"),
    link("eval", t("eval", lang), <IconEval size={16} />, "/eval"),
    link("ingest", t("ingest", lang), <IconIngest size={16} />, "/ingest"),
  ];

  const openIds = [caseId, ...demoCases.slice(0, 3).map((c) => c.alert_id)].filter((id): id is string => !!id && !closed.includes(id));
  const tabs: PaneTab[] = [...new Set(openIds)].map((id) => ({ id, label: id, mono: true, closable: true }));
  const activeTab = caseId && tabs.some((tab) => tab.id === caseId) ? caseId : undefined;

  const h = health.data;

  return (
    <RoleCtx.Provider value={{ role, setRole }}>
      <RecordProvider source={apiRecordSource}>
        <AppShell
          className="h-full"
          tree={tree}
          activeId={caseId ?? section}
          sidebarOpen={caseId ? sidebarOnCase : sidebar}
          onToggleSidebar={() => (caseId ? setSidebarOnCase((v) => !v) : setSidebar((v) => !v))}
          onOpenPalette={openPalette}
          tabs={tabs}
          activeTab={activeTab}
          onSelectTab={(id) => router.push(`/case/${id}`)}
          onCloseTab={(id) => {
            setClosed((c) => [...c, id]);
            if (id === caseId) router.push("/queue");
          }}
          role={role}
          onRoleChange={setRole}
          banner={h?.demo_mode === "replay" ? (
            <Banner tone="amber" floating>Replay mode: responses come from the cache. An uncached investigator call fails closed to review.</Banner>
          ) : undefined}
        >
          {children}
        </AppShell>
      </RecordProvider>
    </RoleCtx.Provider>
  );
}
