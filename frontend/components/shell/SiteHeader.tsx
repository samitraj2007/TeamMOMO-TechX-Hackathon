"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { MomoLockup } from "@/components/brand/MomoLockup";
import { IconSearch } from "@/components/icons";
import { SegmentedTabs } from "@/components/primitives";
import { cx } from "@/lib/cx";
import { t } from "@/lib/i18n";
import { TONE_BG, type Tone } from "@/lib/labels";
import { usePrefs, type DemoSpeed } from "@/lib/prefs";
import { useHealth, useVerify } from "@/lib/queries";

const NAV = [
  { href: "/live", key: "live" },
  { href: "/queue", key: "queue" },
  { href: "/transactions", key: "transactions" },
  { href: "/audit", key: "audit" },
  { href: "/eval", key: "eval" },
  { href: "/ingest", key: "ingest" },
] as const;

const subscribePath = () => () => {};

function useHydratedPath(): string {
  const path = usePathname() ?? "";
  return useSyncExternalStore(subscribePath, () => path, () => "");
}

const onScroll = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange, { passive: true });
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
};

function useScrolled(): boolean {
  return useSyncExternalStore(onScroll, () => window.scrollY > 8, () => false);
}

/** True once the landing page has scrolled past most of its graphite fold, so the header can turn light. */
function usePastFold(): boolean {
  return useSyncExternalStore(onScroll, () => window.scrollY > window.innerHeight * 0.8, () => false);
}

const CONSOLE = ["/live", "/queue", "/transactions", "/case", "/audit", "/eval", "/ingest"];

/** One status inside the grouped status pill: a dot (filled when healthy) and a short label. */
function Chip({ tone, title, children }: { tone: Tone; title?: string; children: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 items-center gap-1.5 px-2 text-xs text-text">
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", TONE_BG[tone], tone === "sage" && "shadow-[0_0_0_3px_rgb(47_93_78/0.12)]")} />
      {children}
    </span>
  );
}

function StatusDot({ label, on }: { label: string; on: boolean }) {
  return (
    <span title={label} aria-label={label} className="inline-flex">
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-text" : "bg-brass")} />
    </span>
  );
}

export function SiteHeader({ onOpenPalette }: { onOpenPalette: () => void }) {
  const path = useHydratedPath();
  const quiet = path === "/";
  const inConsole = CONSOLE.some((p) => path === p || path.startsWith(`${p}/`));
  const scrolled = useScrolled();
  const pastFold = usePastFold();
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
          ? h.backup_model
            ? { text: "Groq + backup", tone: "sage", title: `Groq live · backup ${h.backup_name ?? ""} (${h.backup_model})` }
            : { text: "Groq", tone: "sage", title: "Groq live · no backup provider: a failed call goes to human review" }
          : { text: h.backup_model ? "Backup" : "Offline", tone: "amber", title: h.backup_model ? "Backup model" : "Models offline" };
  const chain: { text: string; tone: Tone; title?: string } = !verify.data
    ? { text: "Chain …", tone: "muted" }
    : verify.data.ok
      ? { text: "Chain ok", tone: "sage", title: `${verify.data.entries} entries` }
      : { text: "Chain broken", tone: "red", title: verify.data.reason ?? undefined };

  return (
    <header
      className={cx(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-5 transition-[background-color,border-color] duration-300",
        quiet
          ? pastFold
            ? "border-hairline/70 bg-bg/80 backdrop-blur-xl"
            : cx("palette-charcoal", scrolled ? "border-hairline bg-bg/80 backdrop-blur-xl" : "border-transparent bg-transparent")
          : inConsole
            ? "border-transparent bg-bg"
            : cx("border-hairline", scrolled ? "bg-bg/75 backdrop-blur-md" : "bg-bg"),
      )}
    >
      <Link href="/" aria-label="MOMO Sentinel home" className="press flex shrink-0 items-center gap-3 rounded-control pe-2">
        <MomoLockup size={30} />
        {inConsole && <span className="hidden border-s border-hairline ps-3 text-xs text-muted xl:inline">Triage console</span>}
      </Link>

      {!inConsole && (
      <nav aria-label="Sections" className={cx("h-full shrink-0 items-stretch", quiet ? "ms-auto hidden md:flex" : "flex")}>
        {NAV.map((item) => {
          const active = path === item.href || path.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group relative flex items-center px-2.5 text-sm",
                active ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {t(item.key, lang)}
              {quiet ? (
                <span
                  className={cx(
                    "absolute inset-x-2 bottom-1 h-px origin-center bg-text transition-transform duration-200 ease-out",
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                  )}
                />
              ) : (
                active && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sage"
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                )
              )}
            </Link>
          );
        })}
      </nav>
      )}

      {quiet && (
        <Link href="/queue" className="ms-auto inline-flex h-8 items-center rounded-full border border-hairline-strong px-3.5 text-sm text-text hover:border-text/50 md:hidden">
          Console
        </Link>
      )}

      {quiet && (
        <span className="flex shrink-0 items-center gap-2 pe-1">
          <StatusDot label={backend.text} on={backend.tone === "sage"} />
          <StatusDot label={provider.title} on={provider.tone === "sage"} />
        </span>
      )}

      {!quiet && !inConsole && (
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
      <div className="ms-auto flex shrink-0 items-center gap-2.5">
        <div role="group" aria-label="System status" className="flex h-8 items-center rounded-full border border-hairline bg-surface px-1 shadow-sheen">
          <Chip tone={backend.tone}>{backend.text}</Chip>
          <span aria-hidden className="h-3.5 w-px bg-hairline" />
          <Chip tone={provider.tone} title={provider.title}>{provider.text}</Chip>
          <span aria-hidden className="h-3.5 w-px bg-hairline" />
          <Chip tone={chain.tone} title={chain.title}>{chain.text}</Chip>
          {h?.fault_armed && (
            <Chip tone="amber" title={`Resilience drill: the next ${h.fault_armed.remaining} main-model call(s) ${h.fault_armed.mode.replace("_", " ")}`}>
              Drill armed
            </Chip>
          )}
        </div>
        <SegmentedTabs<"en" | "ar">
          size="sm"
          label="Language"
          value={lang}
          onChange={setLang}
          options={[{ value: "en", label: "EN" }, { value: "ar", label: <span className="ar text-[11px] leading-none">عربي</span> }]}
        />
        <span className="hidden text-xs text-muted 2xl:inline">Demo speed</span>
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
