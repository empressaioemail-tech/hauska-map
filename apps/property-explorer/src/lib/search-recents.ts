// apps/property-explorer/src/lib/search-recents.ts
//
// Recent search selections — localStorage-backed, max 6, newest first,
// de-duped by label+kind, clearable. Pure list math is exported separately so
// it unit-tests without a browser storage.

import type { Suggestion } from "./search-kinds";

export const RECENTS_STORAGE_KEY = "pe-search-recents-v1";
export const RECENTS_MAX = 6;

export type RecentEntry = Suggestion;

/** Push a selection onto a recents list: newest first, de-dupe, cap. Pure. */
export function pushRecent(
  prev: RecentEntry[],
  entry: RecentEntry,
  max = RECENTS_MAX,
): RecentEntry[] {
  const key = (e: RecentEntry) => `${e.kind}|${e.label}|${e.sublabel ?? ""}`;
  const next = [entry, ...prev.filter((e) => key(e) !== key(entry))];
  return next.slice(0, max);
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // storage blocked (private mode etc.) — recents just no-op.
  }
}

export function loadRecents(store: StorageLike | null = storage()): RecentEntry[] {
  if (!store) return [];
  try {
    const raw = store.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as RecentEntry).label === "string" &&
          typeof (e as RecentEntry).kind === "string",
      )
      .slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

export function saveRecents(
  recents: RecentEntry[],
  store: StorageLike | null = storage(),
): void {
  if (!store) return;
  try {
    store.setItem(RECENTS_STORAGE_KEY, JSON.stringify(recents.slice(0, RECENTS_MAX)));
  } catch {
    // Quota/blocked — recents are a convenience, never an error surface.
  }
}

export function clearRecents(store: StorageLike | null = storage()): void {
  if (!store) return;
  try {
    store.removeItem(RECENTS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
