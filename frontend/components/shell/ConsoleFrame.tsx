"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  IconAudit, IconCases, IconEval, IconIngest, IconQueue, IconTransactions,
} from "@/components/icons";
import { Banner } from "@/components/primitives";
import { apiRecordSource, RecordProvider } from "@/components/records/Records";
import { t } from "@/lib/i18n";
import type { Tone } from "@/lib/labels";
import { usePrefs } from "@/lib/prefs";
import { useCases, useHealth, useVerify } from "@/lib/queries";
import type { Role } from "@/lib/types";
import { AppShell } from "./AppShell";
import { CommandPalette, useCommandHotkey, type Command } from "./CommandPalette";
import type { NavItem } from "./nav";
import type { PaneTab } from "./PaneTabs";
import type { StatusInfo } from "./StatusBar";

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
  const verify = useVerify();
  const cases = useCases(false);
  const [role, setRole] = useState<Role>("ANALYST");
  const [rail, setRail] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [palette, setPalette] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const openPalette = useMemo(() => () => setPalette(true), []);
  useCommandHotkey(openPalette);

  const caseId = path.match(/^\/case\/([^/]+)/)?.[1];
  const section =
    path.startsWith("/transactions") ? "transactions"
    : path.startsWith("/audit") ? "audit"
    : path.startsWith("/eval") ? "eval"
    : path.startsWith("/ingest") ? "ingest"
    : path.startsWith("/case") ? "cases"
    : "queue";

  const link = (id: string, label: string, icon: ReactNode, href: string): NavItem => ({ id, label, icon, href });
  const ribbon: NavItem[] = [
    link("queue", t("queue", lang), <IconQueue />, "/queue"),
    link("transactions", t("transactions", lang), <IconTransactions />, "/transactions"),
    link("cases", t("cases", lang), <IconCases />, "/queue"),
    link("audit", t("audit", lang), <IconAudit />, "/audit"),
    link("eval", t("eval", lang), <IconEval />, "/eval"),
    link("ingest", t("ingest", lang), <IconIngest />, "/ingest"),
  ];
  const demoCases = cases.data ?? [];
  const tree: NavItem[] = [
    link("queue", t("queue", lang), <IconQueue size={14} />, "/queue"),
    link("transactions", t("transactions", lang), <IconTransactions size={14} />, "/transactions"),
    {
      id: "cases",
      label: t("cases", lang),
      icon: <IconCases size={14} />,
      children: demoCases.map((c) => ({
        id: c.alert_id,
        label: `${c.demo_tag ?? "·"} · ${c.alert_id}`,
        href: `/case/${c.alert_id}`,
        meta: c.demo_tag ?? undefined,
      })),
    },
    link("audit", t("audit", lang), <IconAudit size={14} />, "/audit"),
    link("eval", t("eval", lang), <IconEval size={14} />, "/eval"),
  ];

  const openIds = [caseId, ...demoCases.slice(0, 3).map((c) => c.alert_id)].filter((id): id is string => !!id && !closed.includes(id));
  const tabs: PaneTab[] = [...new Set(openIds)].map((id) => ({ id, label: id, mono: true, closable: true }));
  const activeTab = caseId && tabs.some((tab) => tab.id === caseId) ? caseId : undefined;

  const h = health.data;
  const provider: { text: string; tone: Tone } = health.isError
    ? { text: "unreachable", tone: "red" }
    : !h
      ? { text: "checking", tone: "muted" }
      : h.demo_mode === "replay"
        ? { text: "Replay (cache only)", tone: "amber" }
        : h.investigator_live
          ? { text: "Groq live", tone: "sage" }
          : { text: h.backup_model ? "Backup" : "Models offline", tone: "amber" };
  const status: StatusInfo = {
    backend: health.isError ? "down" : h ? "ok" : "checking",
    provider: provider.text,
    providerTone: provider.tone,
    cases: cases.data?.length ?? null,
    chain: verify.data
      ? { ok: verify.data.ok, head: verify.data.head_record_id, entries: verify.data.entries, headHash: verify.data.head_hash }
      : null,
  };

  const commands: Command[] = [
    { id: "go-queue", group: "Navigate", label: "Open queue", run: () => router.push("/queue") },
    { id: "go-txn", group: "Navigate", label: "Open transactions", run: () => router.push("/transactions") },
    { id: "go-audit", group: "Navigate", label: "Open audit", run: () => router.push("/audit") },
    ...demoCases.map((c) => ({
      id: c.alert_id,
      group: "Cases",
      label: `${c.alert_id} · ${c.title}`,
      hint: c.demo_tag ?? undefined,
      keywords: `${c.txn_id} ${c.payee_name ?? ""} ${c.demo_tag ?? ""}`,
      run: () => router.push(`/case/${c.alert_id}`),
    })),
  ];

  return (
    <RoleCtx.Provider value={{ role, setRole }}>
      <RecordProvider source={apiRecordSource}>
        <AppShell
          className="h-svh"
          ribbon={ribbon}
          tree={tree}
          activeId={caseId ?? section}
          ribbonActiveId={section}
          railExpanded={rail}
          onToggleRail={() => setRail((v) => !v)}
          sidebarOpen={sidebar}
          onToggleSidebar={() => setSidebar((v) => !v)}
          onOpenPalette={openPalette}
          tabs={tabs}
          activeTab={activeTab}
          onSelectTab={(id) => router.push(`/case/${id}`)}
          onCloseTab={(id) => {
            setClosed((c) => [...c, id]);
            if (id === caseId) router.push("/queue");
          }}
          status={status}
          role={role}
          onRoleChange={setRole}
          banner={h?.demo_mode === "replay" ? (
            <Banner tone="amber">Replay mode: responses come from the cache. An uncached investigator call fails closed to review.</Banner>
          ) : undefined}
        >
          {children}
        </AppShell>
        <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} dynamic={(q) => {
          const id = q.toUpperCase();
          if (/^ALT-\d+$/.test(id)) return [{ id: `open-${id}`, group: "From your input", label: `Open case ${id}`, run: () => router.push(`/case/${id}`) }];
          if (/^TXN-\d{5,6}$/.test(id)) return [{ id: `find-${id}`, group: "From your input", label: `Find ${id} in transactions`, run: () => router.push(`/transactions?q=${id}`) }];
          return [];
        }} />
      </RecordProvider>
    </RoleCtx.Provider>
  );
}
