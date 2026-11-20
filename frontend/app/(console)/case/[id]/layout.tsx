import { CaseFrame } from "@/components/case/CaseFrame";

/**
 * Every case screen (pipeline, quarantine, evidence, report, decision) shares this header and tab bar.
 * CaseFrame reads the id on the client, so this layout stays static and each screen can be validated on its own.
 */
export default function CaseLayout({ children }: LayoutProps<"/case/[id]">) {
  return <CaseFrame>{children}</CaseFrame>;
}
