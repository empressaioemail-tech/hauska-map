// Which filed reports has this reader not opened yet.
//
// THE STATE THAT DOES NOT EXIST, AND WHY IT IS NOT ZERO.
//
// There is no server-side "viewed" flag on a report. A report is
// { kind, format, savedAt, downloadPath } — a filing record. So read-state is
// per-reader and lives in this browser, the way an unread marker in a mail
// client does. It does not sync across devices, and that is stated rather
// than papered over.
//
// FIRST RUN IS THE INTERESTING CASE. A reader who already has 25 filed
// reports has not "not seen" them; we simply never tracked it. Lighting all
// 25 amber would assert something we do not know, and would train the reader
// to ignore the colour on day one. So the first run SEEDS the set with
// everything already filed: absent is not unseen. Only reports filed after
// that point can light up.

export interface SeenKeyed {
  parcelNodeId: string;
  kind: string;
  savedAt: string;
}

const STORAGE_KEY = "pe:reports:seen:v1";

/** Stable identity for one filed report. */
export function reportKey(row: SeenKeyed): string {
  return `${row.parcelNodeId}:${row.kind}:${row.savedAt}`;
}

/**
 * The seen-set to use for this render.
 *
 * `stored === null` means we have never tracked this reader: seed with every
 * row so nothing is falsely announced as new. An EMPTY stored set is a
 * different thing entirely — it means we tracked and they have seen nothing —
 * and it is preserved.
 */
export function resolveSeen(
  rows: readonly SeenKeyed[],
  stored: ReadonlySet<string> | null,
): Set<string> {
  if (stored === null) return new Set(rows.map(reportKey));
  return new Set(stored);
}

/** Is this row new to the reader? */
export function isUnseen(row: SeenKeyed, seen: ReadonlySet<string>): boolean {
  return !seen.has(reportKey(row));
}

/**
 * Mark every row currently in the list as seen. This is the bulk
 * equivalent of the per-row `markSeen` the library uses when a report is
 * actually viewed — it is what lets OPENING the Reports tool (not opening
 * each PDF) clear the rail's toolbar dot, the same way `markRunsSeen`
 * clears the records-side dot when that dock opens. A report filed AFTER
 * this call still lights the dot again; only what was in `rows` at call
 * time is affected.
 */
export function markAllSeen(
  rows: readonly SeenKeyed[],
  seen: ReadonlySet<string>,
): Set<string> {
  const next = new Set(seen);
  for (const row of rows) next.add(reportKey(row));
  return next;
}

/** How many rows are new. Drives the dock's ambient count. */
export function unseenCount(
  rows: readonly SeenKeyed[],
  seen: ReadonlySet<string>,
): number {
  return rows.filter((r) => isUnseen(r, seen)).length;
}

/** Read the stored set. `null` means never tracked — NOT "seen nothing". */
export function loadSeen(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((k): k is string => typeof k === "string"));
  } catch {
    // Private mode, blocked site data, corrupt value. Untracked, not empty.
    return null;
  }
}

export function saveSeen(seen: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Read-state is a convenience. Losing it must never break the list.
  }
}

// ---------------------------------------------------------------------------
// A tiny notify so the toolbar dot darkens the MOMENT the Reports tool opens,
// rather than waiting for whatever poll/refetch cadence its consumer runs on.
// Same shape as records-seen's own notify pair; kept separate because the
// subject is different and one listener set for two unrelated facts is how a
// signal stops meaning anything.
// ---------------------------------------------------------------------------

const seenListeners = new Set<() => void>();

export function subscribeReportsSeenChanged(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => {
    seenListeners.delete(listener);
  };
}

export function notifyReportsSeenChanged(): void {
  for (const fn of [...seenListeners]) {
    try {
      fn();
    } catch {
      // One bad subscriber must not stop the others.
    }
  }
}
