import type { ReactNode } from "react";
import { IconAlert, IconFile, IconLock, IconShield } from "@/components/icons";
import { cx } from "@/lib/cx";
import { TONE_BG, TONE_TEXT, TONE_TINT, type Tone } from "@/lib/labels";

export type CalloutKind = "note" | "model" | "warn" | "danger" | "refused";

const KIND: Record<CalloutKind, { tone: Tone; icon: ReactNode; label: string }> = {
  note: { tone: "sage", icon: <IconFile size={14} />, label: "Note" },
  model: { tone: "model", icon: <IconShield size={14} />, label: "Model" },
  warn: { tone: "amber", icon: <IconAlert size={14} />, label: "Review" },
  danger: { tone: "red", icon: <IconAlert size={14} />, label: "Blocked" },
  refused: { tone: "red", icon: <IconLock size={14} />, label: "Refused" },
};

/** Obsidian-style callout: a left bar, a tinted body, an uppercase header. */
export function Callout({
  kind = "note",
  title,
  children,
  actions,
  className,
}: {
  kind?: CalloutKind;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const k = KIND[kind];
  return (
    <div role={kind === "refused" || kind === "danger" ? "alert" : undefined}
      className={cx("relative border border-hairline ps-3.5 pe-3 py-2", TONE_TINT[k.tone], kind === "refused" && "hatch", className)}>
      <span aria-hidden className={cx("absolute inset-y-0 start-0 w-0.5", TONE_BG[k.tone])} />
      <div className={cx("flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.08em]", TONE_TEXT[k.tone])}>
        {k.icon}
        <span>{title ?? k.label}</span>
        {actions && <span className="ms-auto flex items-center gap-1 normal-case tracking-normal">{actions}</span>}
      </div>
      {children && <div className="mt-1 text-sm text-text">{children}</div>}
    </div>
  );
}
