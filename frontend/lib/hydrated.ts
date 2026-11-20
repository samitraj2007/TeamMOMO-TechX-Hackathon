"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False on the server and during hydration, true afterwards.
 * The case list can already be in the browser's query cache when a console page hydrates (another part of
 * the page fetched it first), so anything rendered from it waits for this to keep server and client HTML equal.
 */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
