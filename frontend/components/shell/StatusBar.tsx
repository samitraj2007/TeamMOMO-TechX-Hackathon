"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { shortHash } from "@/lib/format";
import { TONE_BG, type Tone } from "@/lib/labels";
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
    <span title={title} className="flex h-full items-center gap-1.5 border-e border-hairline px-3">
      <span aria-hidden className={cx("h-1.5 w-1.5", TONE_BG[tone])} />
      <span className="text-muted">{children}</span>
    </span>
  );
}

/** Bottom status bar (24px): backend, provider, audit chain, case count, role. */
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
  const backendTone: Tone = status.backend === "ok" ? "sage" : status.backend === "down" ? "red" : "muted";
  const chainTone: Tone = !status.chain ? "muted" : status.chain.ok ? "sage" : "red";
  return (
    <footer role="status" aria-live="polite"
      className="flex h-6 shrink-0 items-stretch overflow-hidden whitespace-nowrap border-t border-hairline bg-surface text-2xs">
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
        <span className="num">{status.cases ?? "-"}</span> cases
      </Item>
      <div className="ms-auto flex items-stretch">
        {extra}
        <label className="flex items-center gap-2 border-s border-hairline px-3 text-muted">
          role
          <select
            value={role}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            className="h-5 border border-hairline-strong bg-bg px-1 text-2xs text-text outline-none focus:border-sage"
          >
            <option value="ANALYST">Analyst</option>
            <option value="COMPLIANCE_OFFICER">Compliance officer</option>
          </select>
        </label>
      </div>
    </footer>
  );
}
