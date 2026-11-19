"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import type { Role } from "@/lib/types";
import type { Tone } from "@/lib/labels";

export interface StatusInfo {
  backend: "ok" | "down" | "checking";
  /** e.g. "Groq live", "Backup", "Replay (cache only)" */
  provider: string;
  providerTone: Tone;
  chain: { ok: boolean; head: string | null; entries: number; headHash: string } | null;
  cases: number | null;
}

/** Role only. Health, provider, chain, language and demo speed live in the site header. */
export function StatusBar({
  role,
  onRoleChange,
  extra,
}: {
  role: Role;
  onRoleChange: (r: Role) => void;
  extra?: ReactNode;
}) {
  const { lang } = usePrefs();
  return (
    <footer className="sheet flex h-9 shrink-0 items-center justify-end gap-2 overflow-hidden whitespace-nowrap rounded-panel border border-hairline bg-surface px-2 text-2xs">
      {extra}
      <label className="flex items-center gap-1.5 text-muted">
        {t("role", lang)}
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as Role)}
          className="h-6 rounded-control border border-hairline-strong bg-bg px-1 text-2xs text-text outline-none focus:border-brass"
        >
          <option value="ANALYST">Analyst</option>
          <option value="COMPLIANCE_OFFICER">Compliance officer</option>
        </select>
      </label>
    </footer>
  );
}
