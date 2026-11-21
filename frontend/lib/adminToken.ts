"use client";

import { useSyncExternalStore } from "react";

/** The demo admin token, entered once per browser tab and shared by every control screen. Never sent anywhere
 * except as the X-Admin-Token header on demo controls. */
const KEY = "momo.adminToken";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(value: string) {
  try {
    sessionStorage.setItem(KEY, value);
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** "" on the server and during hydration, then the stored token. */
export function useAdminToken(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}
