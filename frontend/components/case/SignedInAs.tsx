"use client";

import { useState } from "react";
import { SegmentedTabs } from "@/components/primitives";
import { useConsoleRole } from "@/components/shell/ConsoleFrame";
import { ACTOR_PATTERN, setActorName, useActorName } from "@/lib/actor";
import { cx } from "@/lib/cx";
import type { Lifecycle, Role } from "@/lib/types";
import { WHO_LABEL } from "./Lifecycle";

const ROLE_NAME: Record<Role, string> = { ANALYST: "Analyst", COMPLIANCE_OFFICER: "Compliance officer" };

/** The signer's name, edited in place. Keyed by role so switching role starts from that role's saved name. */
function NameField({ role }: { role: Role }) {
  const saved = useActorName(role);
  const [draft, setDraft] = useState(saved);
  const valid = ACTOR_PATTERN.test(draft);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs text-muted">Your name</span>
      <input value={draft} aria-invalid={!valid} spellCheck={false}
        onChange={(e) => { setDraft(e.target.value); if (ACTOR_PATTERN.test(e.target.value)) setActorName(role, e.target.value); }}
        className={cx("num h-8 w-44 rounded-control border bg-surface px-2.5 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-text/20",
          valid ? "border-hairline-strong" : "border-red")} />
      {!valid && <span className="text-2xs text-red-text">Letters, digits, dot, dash or underscore</span>}
    </label>
  );
}

/**
 * Who is signing, and whether they can act on this case right now. Roles are self-selected in the demo; the
 * backend enforces officer-only steps and four-eyes regardless of what this card says.
 */
export function SignedInAs({ lifecycle }: { lifecycle: Lifecycle | null | undefined }) {
  const { role, setRole } = useConsoleRole();
  const actor = useActorName(role);
  const need = lifecycle?.next_action_role ?? null;
  const canAct = need === null || need === "CODE" || need === role
    || (need === "ANALYST" && role === "COMPLIANCE_OFFICER");
  const sameAsEscalator = role === "COMPLIANCE_OFFICER" && !!lifecycle?.escalated_by.includes(actor.toLowerCase());
  const tone = !need ? "neutral" : sameAsEscalator || !canAct ? "warn" : "ok";

  return (
    <section aria-label="Who can act" className={cx("flex flex-col gap-3 rounded-panel border p-4 lg:col-span-2",
      tone === "warn" ? "border-amber/50 bg-amber/[0.06]" : tone === "ok" ? "border-sage/40 bg-sage/[0.05]" : "border-hairline bg-surface")}>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1">
          <span className="text-2xs text-muted">Signing as</span>
          <SegmentedTabs<Role> size="sm" label="Role" value={role} onChange={setRole}
            options={[{ value: "ANALYST", label: "Analyst" }, { value: "COMPLIANCE_OFFICER", label: "Compliance officer" }]} />
        </div>
        <NameField key={role} role={role} />
        <p className="min-w-[220px] flex-1 text-sm text-text">
          {!lifecycle ? "Run the case to see who needs to act."
            : !need ? "Nothing is waiting on a person for this case."
            : need === "CODE" ? "Code is handling this step."
            : sameAsEscalator ? <>You escalated this case, so four-eyes stops you approving it. Another officer must decide.</>
            : canAct ? <>This step needs {WHO_LABEL[need]}. You can act as <span className="num">{actor}</span> ({ROLE_NAME[role].toLowerCase()}).</>
            : <>This step needs {WHO_LABEL[need]}. You are signed in as <span className="num">{actor}</span> ({ROLE_NAME[role].toLowerCase()}).</>}
        </p>
        {lifecycle && need === "COMPLIANCE_OFFICER" && role !== "COMPLIANCE_OFFICER" && (
          <button type="button" onClick={() => setRole("COMPLIANCE_OFFICER")}
            className="press h-8 rounded-control bg-text px-3 text-sm text-bg">Switch to compliance officer</button>
        )}
      </div>
      <p className="text-2xs text-muted">
        Demo roles are self-selected. In a pilot, roles and names come from the bank&apos;s single sign-on. Code enforces
        officer-only steps and four-eyes (the officer who decides must not be the analyst who escalated) either way.
      </p>
    </section>
  );
}
