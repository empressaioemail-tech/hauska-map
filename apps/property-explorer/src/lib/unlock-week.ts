// Session-week unlock count. Solo comparison is a fact at the second
// property unlock this week, never a nag on the first.

const STORAGE_KEY = "pe_unlock_week_v1";

export type UnlockWeekState = {
  weekStart: string;
  parcels: string[];
};

/** Node tests have no sessionStorage. Memory keeps the same week countable. */
let memoryStore: UnlockWeekState | null = null;

function mondayUtc(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function readStore(): UnlockWeekState {
  if (typeof sessionStorage === "undefined") {
    return memoryStore ?? { weekStart: mondayUtc(new Date()), parcels: [] };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { weekStart: mondayUtc(new Date()), parcels: [] };
    const parsed = JSON.parse(raw) as UnlockWeekState;
    if (!parsed?.weekStart || !Array.isArray(parsed.parcels)) {
      return { weekStart: mondayUtc(new Date()), parcels: [] };
    }
    return parsed;
  } catch {
    return { weekStart: mondayUtc(new Date()), parcels: [] };
  }
}

function writeStore(state: UnlockWeekState): void {
  memoryStore = state;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function notePropertyUnlockIntent(
  parcelNodeId: string,
  now: Date = new Date(),
): number {
  const week = mondayUtc(now);
  const stored = readStore();
  const parcels =
    stored.weekStart === week ? [...stored.parcels] : [];
  if (parcelNodeId && !parcels.includes(parcelNodeId)) {
    parcels.push(parcelNodeId);
  }
  writeStore({ weekStart: week, parcels });
  return parcels.length;
}

export function unlocksThisWeek(now: Date = new Date()): number {
  const week = mondayUtc(now);
  const stored = readStore();
  return stored.weekStart === week ? stored.parcels.length : 0;
}

export function shouldShowSoloCompare(count: number): boolean {
  return count >= 2;
}

export function resetUnlockWeekForTests(): void {
  memoryStore = null;
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
