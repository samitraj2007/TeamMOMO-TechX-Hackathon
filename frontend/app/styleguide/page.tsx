import type { Metadata } from "next";
import { Styleguide } from "./Styleguide";

export const metadata: Metadata = { title: "Styleguide · Obsidian Ledger (fixtures)" };

export default function StyleguidePage() {
  return <Styleguide />;
}
