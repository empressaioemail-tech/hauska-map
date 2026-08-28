// Which finished records runs this reader has already looked at.
//
// THE BUG THIS EXISTS FOR. The rail's unread dot was permanently lit. Its rule
// was isReadyForPickup: not queued, not running, no errorCode. That is not
// "unread", it is "has ever finished". There was no read state anywhere in the
// product — no readAt, no acknowledge, no mark-seen — so once any records job
// completed on the account the dot was on forever and nothing could turn it
// off. The operator described it as stuck and unresponsive; it was, and
// structurally so.
//
// A dot that can never go dark trains people to stop looking at it, which is
// worse than having no dot: it spends the one piece of ambient attention the
// rail has and returns nothing.
//
// FIRST RUN SEEDS, for the same reason the filed-report library seeds. A
// reader who already has finished runs has not "not seen" them; we never
// tracked it. Lighting them all on the day this ships would assert something
// never recorded, and would train the reader to ignore the colour immediately.
// Only runs that finish AFTER this point can light it.
//
// Read state is per-reader and lives in this browser. There is no server field
// for it, and this does not sync across devices — stated, not papered over.

const STORAGE_KEY = "pe:records:seen:v1";

/** Stable identity for a run. jobId is the server's own key. */
export function runKey(row: { jobId: string }): string {
  return row.jobId;
}

/**
 * The seen-set for this render.
 *
 * `stored === null` means never tracked: seed with everything currently
 * finished so nothing is falsely announced. An EMPTY stored set is a different
 * state — tracked, and nothing seen — and is preserved.
 */
export function resolveSeenRuns(
  finishedJobIds: readonly string[],
  stored: ReadonlySet<string> | null,
): Set<string> {
  if (stored === null) return new Set(finishedJobIds);
  return new Set(stored);
}

/** How many finished runs this reader has not looked at. */
export function unseenRunCount(
  finishedJobIds: readonly string[],
  seen: ReadonlySet<string>,
): number {
  return finishedJobIds.filter((id) => !seen.has(id)).length;
}

/** Opening the Reports dock is what marks the current finished runs seen. */
export function markRunsSeen(
  finishedJobIds: readonly string[],
  seen: ReadonlySet<string>,
): Set<string> {
  const next = new Set(seen);
  for (const id of finishedJobIds) next.add(id);
  return next;
}

/** Stored set, or null for never-tracked. Null is NOT "seen nothing". */
export function loadSeenRuns(): Set<string> | null {
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

export function saveSeenRuns(seen: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // An ambient dot must never break the app to remember itself.
  }
}

// ---------------------------------------------------------------------------
// A tiny notify so the dot darkens the MOMENT you open the dock, rather than
// on the next sixty-second poll. Same shape as the saved-properties signal in
// savedPropertiesClient; kept local because the subject is different and one
// listener set for two unrelated facts is how a signal stops meaning anything.
// ---------------------------------------------------------------------------

const seenListeners = new Set<() => void>();

export function subscribeRecordsSeenChanged(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => {
    seenListeners.delete(listener);
  };
}

export function notifyRecordsSeenChanged(): void {
  for (const fn of [...seenListeners]) {
    try {
      fn();
    } catch {
      // One bad subscriber must not stop the others.
    }
  }
}
