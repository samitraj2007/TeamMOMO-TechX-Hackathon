import type { Metadata } from "next";
import { geist, jetbrainsMono, plexArabic } from "@/lib/fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "GulfHorizon · MOMO Sentinel",
  description: "Payment triage that a bank can trust with attacker-written text.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable} ${plexArabic.variable} h-full`}>
      <body className="app-backdrop min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
