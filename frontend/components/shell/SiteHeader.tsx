"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { IconSearch } from "@/components/icons";
import { SegmentedTabs } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { t } from "@/lib/i18n";
import { TONE_BG, type Tone } from "@/lib/labels";
import { usePrefs, type DemoSpeed } from "@/lib/prefs";
import { useHealth, useVerify } from "@/lib/queries";

const NAV = [
  { href: "/queue", key: "queue" },
  { href: "/transactions", key: "transactions" },
  { href: "/audit", key: "audit" },
  { href: "/eval", key: "eval" },
] as const;

const subscribePath = () => () => {};

function useHydratedPath(): string {
  const path = usePathname() ?? "";
  return useSyncExternalStore(subscribePath, () => path, () => "");
}

function useScrolled(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("scroll", onChange, { passive: true });
      return () => window.removeEventListener("scroll", onChange);
    },
    () => window.scrollY > 8,
    () => false,
  );
}

function Chip({ tone, title, children }: { tone: Tone; title?: string; children: string }) {
  return (
    <span title={title} className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-control border border-hairline bg-surface px-2 text-2xs text-text">
      <span aria-hidden className={cx("h-1.5 w-1.5", TONE_BG[tone])} />
      {children}
    </span>
  );
}

export function SiteHeader({ onOpenPalette }: { onOpenPalette: () => void }) {
  const path = useHydratedPath();
  const quiet = path === "/";
  const scrolled = useScrolled();
  const { lang, setLang, demoSpeed, setDemoSpeed } = usePrefs();
  const health = useHealth();
  const verify = useVerify();
  const h = health.data;

  const backend: { text: string; tone: Tone } = health.isError
    ? { text: "Backend down", tone: "red" }
    : !h
      ? { text: "Backend …", tone: "muted" }
      : { text: "Backend ok", tone: "sage" };
  const provider: { text: string; tone: Tone; title: string } = health.isError
    ? { text: "Offline", tone: "red", title: "Backend unreachable" }
    : !h
      ? { text: "…", tone: "muted", title: "Checking the provider" }
      : h.demo_mode === "replay"
        ? { text: "Replay", tone: "amber", title: "Replay (cache only)" }
        : h.investigator_live
          ? { text: "Groq", tone: "sage", title: "Groq live" }
          : { text: h.backup_model ? "Backup" : "Offline", tone: "amber", title: h.backup_model ? "Backup model" : "Models offline" };
  const chain: { text: string; tone: Tone; title?: string } = !verify.data
    ? { text: "Chain …", tone: "muted" }
    : verify.data.ok
      ? { text: "Chain ok", tone: "sage", title: `${verify.data.entries} entries` }
      : { text: "Chain broken", tone: "red", title: verify.data.reason ?? undefined };

  return (
    <header
      className={cx(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-3",
        scrolled ? "bg-bg/75 backdrop-blur-md" : "bg-bg",
      )}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2 pe-1">
        {!quiet && <Mascot state="idle" size={28} avatar />}
        <span className="text-sm font-medium tracking-tight text-text">GulfHorizon</span>
        {!quiet && <span className="num hidden text-2xs text-muted xl:inline">Triage Console</span>}
      </Link>

      <nav aria-label="Sections" className={cx("flex h-full shrink-0 items-stretch", quiet && "ms-auto")}>
        {NAV.map((item) => {
          const active = path === item.href || path.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex items-center px-2.5 text-sm",
                active ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {t(item.key, lang)}
              {active && (
                <motion.span
                  layoutId="nav-underline"
                  className="absolute inset-x-2 bottom-0 h-0.5 bg-sage"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {!quiet && (
        <button
          type="button"
          onClick={onOpenPalette}
          className="press mx-auto flex h-8 min-w-0 max-w-md flex-1 items-center gap-2 rounded-search border border-hairline bg-surface px-3 text-start text-sm text-muted shadow-sheen hover:border-hairline-strong"
        >
          <IconSearch size={14} />
          <span className="truncate">Search cases, transactions... Ctrl K</span>
        </button>
      )}

      {!quiet && (
      <div className="flex shrink-0 items-center gap-2">
        <Chip tone={backend.tone}>{backend.text}</Chip>
        <Chip tone={provider.tone} title={provider.title}>{provider.text}</Chip>
        <Chip tone={chain.tone} title={chain.title}>{chain.text}</Chip>
        <SegmentedTabs<"en" | "ar">
          size="sm"
          label="Language"
          value={lang}
          onChange={setLang}
          options={[{ value: "en", label: "EN" }, { value: "ar", label: <span className="ar text-[11px] leading-none">عربي</span> }]}
        />
        <span className="hidden text-2xs text-muted 2xl:inline">Demo speed</span>
        <SegmentedTabs<"0.5" | "1" | "2">
          size="sm"
          label="Demo speed"
          value={String(demoSpeed) as "0.5" | "1" | "2"}
          onChange={(v) => setDemoSpeed(Number(v) as DemoSpeed)}
          options={[{ value: "0.5", label: "0.5×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }]}
        />
      </div>
      )}
    </header>
  );
}
