"use client";

import type { ReactNode } from "react";
import { SegmentedTabs } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { shortHash } from "@/lib/format";
import { t } from "@/lib/i18n";
import { TONE_BG, type Tone } from "@/lib/labels";
import { usePrefs, type DemoSpeed } from "@/lib/prefs";
import type { Role } from "@/lib/types";

export interface StatusInfo {
  backend: "ok" | "down" | "checking";
  /** e.g. "Groq live", "Backup", "Replay (cache only)" */
  provider: string;
  providerTone: Tone;
  chain: { ok: boolean; head: string | null; entries: number; headHash: string } | null;
  cases: number | null;
}

function Item({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className="flex h-full items-center gap-1.5 px-2.5 text-muted">
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-[1px]", TONE_BG[tone])} />
      {children}
    </span>
  );
}

/** Status bar: backend, provider, audit chain, case count; EN/AR, demo speed and role on the right. */
export function StatusBar({
  status,
  role,
  onRoleChange,
  extra,
}: {
  status: StatusInfo;
  role: Role;
  onRoleChange: (r: Role) => void;
  extra?: ReactNode;
}) {
  const { lang, setLang, demoSpeed, setDemoSpeed } = usePrefs();
  const backendTone: Tone = status.backend === "ok" ? "sage" : status.backend === "down" ? "red" : "muted";
  const chainTone: Tone = !status.chain ? "muted" : status.chain.ok ? "sage" : "red";
  return (
    <footer role="status" aria-live="polite"
      className="sheet flex h-9 shrink-0 items-center overflow-hidden whitespace-nowrap rounded-panel border border-hairline bg-surface/90 px-1.5 text-2xs">
      <Item tone={backendTone}>backend {status.backend}</Item>
      <Item tone={status.providerTone}>{status.provider}</Item>
      <Item tone={chainTone} title={status.chain?.headHash}>
        {status.chain ? (
          <span className="num">
            chain {status.chain.ok ? "ok" : "BROKEN"} · {status.chain.head ?? "empty"} · {shortHash(status.chain.headHash, 6, 0)}
          </span>
        ) : (
          "chain -"
        )}
      </Item>
      <Item tone="muted">
        <span className="num">{status.cases ?? "-"}</span> {t("cases", lang).toLowerCase()}
      </Item>
      <div className="ms-auto flex items-center gap-2">
        {extra}
        <SegmentedTabs<"en" | "ar"> size="sm" label="Language" value={lang} onChange={setLang}
          options={[{ value: "en", label: "EN" }, { value: "ar", label: <span className="ar text-[11px] leading-none">عربي</span> }]} />
        <span className="text-muted">{t("demoSpeed", lang)}</span>
        <SegmentedTabs<"0.5" | "1" | "2"> size="sm" label="Demo speed" value={String(demoSpeed) as "0.5" | "1" | "2"}
          onChange={(v) => setDemoSpeed(Number(v) as DemoSpeed)}
          options={[{ value: "0.5", label: "0.5×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }]} />
        <label className="flex items-center gap-1.5 ps-1 text-muted">
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
      </div>
    </footer>
  );
}
