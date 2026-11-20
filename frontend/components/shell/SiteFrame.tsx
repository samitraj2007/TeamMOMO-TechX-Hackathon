"use client";

import { useRouter } from "next/navigation";
import { createContext, Suspense, useContext, useMemo, useState, type ReactNode } from "react";
import { CommandPalette, useCommandHotkey, type Command } from "@/components/shell/CommandPalette";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { useCases } from "@/lib/queries";

const PaletteCtx = createContext<() => void>(() => {});

/** Opens the one command palette shared by the header and the console rail. */
export function useOpenPalette() {
  return useContext(PaletteCtx);
}

export function SiteFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const cases = useCases(false);
  const [palette, setPalette] = useState(false);
  const open = useMemo(() => () => setPalette(true), []);
  useCommandHotkey(open);

  const commands: Command[] = [
    { id: "go-queue", group: "Navigate", label: "Open queue", run: () => router.push("/queue") },
    { id: "go-txn", group: "Navigate", label: "Open transactions", run: () => router.push("/transactions") },
    { id: "go-audit", group: "Navigate", label: "Open audit", run: () => router.push("/audit") },
    { id: "go-eval", group: "Navigate", label: "Open eval", run: () => router.push("/eval") },
    { id: "go-ingest", group: "Navigate", label: "Test your own case", run: () => router.push("/ingest") },
    ...(cases.data ?? []).map((c) => ({
      id: c.alert_id,
      group: "Cases",
      label: `${c.alert_id} · ${c.title}`,
      hint: c.demo_tag ?? undefined,
      keywords: `${c.txn_id} ${c.payee_name ?? ""} ${c.demo_tag ?? ""}`,
      run: () => router.push(`/case/${c.alert_id}`),
    })),
  ];

  return (
    <PaletteCtx.Provider value={open}>
      {/* SiteHeader reads the pathname, which is runtime-only on dynamic routes; Suspense lets those routes prerender. */}
      <Suspense fallback={<div className="h-14 shrink-0 border-b border-hairline" />}>
        <SiteHeader onOpenPalette={open} />
      </Suspense>
      {children}
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        commands={commands}
        dynamic={(q) => {
          const id = q.toUpperCase();
          if (/^ALT-\d+$/.test(id)) return [{ id: `open-${id}`, group: "From your input", label: `Open case ${id}`, run: () => router.push(`/case/${id}`) }];
          if (/^TXN-\d{5,6}$/.test(id)) return [{ id: `find-${id}`, group: "From your input", label: `Find ${id} in transactions`, run: () => router.push(`/transactions?q=${id}`) }];
          return [];
        }}
      />
    </PaletteCtx.Provider>
  );
}
