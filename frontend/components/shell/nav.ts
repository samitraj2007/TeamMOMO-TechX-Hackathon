import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";

export interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
  meta?: ReactNode;
  /** Longer description shown as a tooltip (e.g. the alert id behind a case title). */
  hint?: string;
  /** Status dot beside the item (e.g. a case's last route). */
  status?: Tone;
  children?: NavItem[];
}
