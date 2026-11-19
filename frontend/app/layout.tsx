import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOMO Sentinel",
  description: "AI fraud investigator a bank can trust with attacker-written text.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
