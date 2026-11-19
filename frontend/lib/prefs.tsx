"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "./i18n";

export type DemoSpeed = 0.5 | 1 | 2;

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Multiplies the airlock clock and the timeline player. */
  demoSpeed: DemoSpeed;
  setDemoSpeed: (s: DemoSpeed) => void;
}

const PrefsCtx = createContext<Prefs>({ lang: "en", setLang: () => {}, demoSpeed: 1, setDemoSpeed: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const [demoSpeed, setDemoSpeed] = useState<DemoSpeed>(1);
  const value = useMemo(() => ({ lang, setLang, demoSpeed, setDemoSpeed }), [lang, demoSpeed]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export const usePrefs = () => useContext(PrefsCtx);
