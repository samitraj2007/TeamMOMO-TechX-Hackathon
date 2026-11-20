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

/** Callout: a rounded inset bar, a tinted body, a titled header. */
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
      className={cx("relative overflow-hidden rounded-panel border border-hairline ps-5 pe-3.5 py-3", TONE_TINT[k.tone], kind === "refused" && "hatch", className)}>
      <span aria-hidden className={cx("absolute inset-y-3 start-2 w-[3px] rounded-full", TONE_BG[k.tone])} />
      <div className={cx("flex items-center gap-2 text-sm font-semibold", TONE_TEXT[k.tone])}>
        {k.icon}
        <span>{title ?? k.label}</span>
        {actions && <span className="ms-auto flex items-center gap-1 font-normal">{actions}</span>}
      </div>
      {children && <div className="mt-1 text-sm text-text">{children}</div>}
    </div>
  );
}
