"use client";

import { useSyncExternalStore } from "react";
import type { Role } from "./types";

/**
 * The name a person signs decisions with, per role. Demo roles are self-selected; in a pilot the name and role come
 * from the bank's single sign-on. Stored per browser; the backend enforces every rule regardless.
 */
export const DEFAULT_ACTOR: Record<Role, string> = { ANALYST: "analyst.demo", COMPLIANCE_OFFICER: "officer.demo" };
export const ACTOR_PATTERN = /^[A-Za-z0-9._-]{1,60}$/;

const key = (role: Role) => `momo.actor.${role}`;
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(role: Role): string {
  let v: string | null = null;
  try { v = window.localStorage.getItem(key(role)); } catch { /* blocked storage */ }
  v = v ?? memory.get(key(role)) ?? null;
  return v && ACTOR_PATTERN.test(v) ? v : DEFAULT_ACTOR[role];
}

export function setActorName(role: Role, name: string) {
  memory.set(key(role), name);
  try { window.localStorage.setItem(key(role), name); } catch { /* keep it in memory */ }
  listeners.forEach((l) => l());
}

export function useActorName(role: Role): string {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => read(role),
    () => DEFAULT_ACTOR[role],
  );
}
