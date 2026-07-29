// apps/property-explorer/src/browse/transient-chips.ts
//
// Pure toast-lifecycle engine for the bottom-left NOTIFICATION area (map UX
// cluster item 2). The status chips used to persist forever; now the space
// behaves like a notification tray:
//
//   - a chip APPEARS on a layer-state change/event,
//   - stays long enough to read (duration scales with text length, 4–8 s),
//   - then smoothly fades out (the component animates the "leaving" phase),
//   - and NEVER re-appears for the same unchanged state (a "dismissed"
//     tombstone is kept while the source still reports the same key+text, so
//     stale entries never stack or resurrect).
//
// HONESTY CONSTRAINT (do not weaken): fading here is presentation only.
// Any chip that encodes a PERSISTENT honest state (degraded layer,
// not-survey-grade parcels, honest-empty hydrology) must ALSO be surfaced as
// a persistent per-layer state badge in the merged layer panel
// (MapToolset `layerStates`) so the honesty stays discoverable after the
// toast fades. ExplorerMap builds both from the same source states.

export type ChipSeverity = "info" | "warn" | "error";

/** A chip the host currently wants to announce (derived state, per render). */
export interface ChipSpec {
  key: string;
  sev: ChipSeverity;
  text: string;
}

export type ToastPhase = "showing" | "leaving" | "dismissed";

/** A chip's toast lifecycle record. "dismissed" is an invisible tombstone kept
 *  while the source still reports the same key+text (prevents resurrection). */
export interface Toast {
  key: string;
  sev: ChipSeverity;
  text: string;
  phase: ToastPhase;
  /** When the showing phase auto-dismisses (ms epoch). */
  expiresAt: number;
  /** When the leaving fade started (ms epoch); null until leaving. */
  leaveAt: number | null;
}

/** Fade-out duration — must match the component's CSS animation. */
export const TOAST_FADE_MS = 400;
/** Readable-duration bounds (operator: ~4–8 s, scaled with text length). */
export const TOAST_MIN_MS = 4_000;
export const TOAST_MAX_MS = 8_000;

/** How long a chip stays readable: base + per-character allowance, clamped. */
export function chipDisplayMs(text: string): number {
  const ms = 3_500 + 45 * text.length;
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, ms));
}

/**
 * Reconcile the toast list against the chips the host wants right now.
 *
 *   - new key, or same key with CHANGED text → fresh "showing" toast (a state
 *     change is a new event; the timer restarts),
 *   - same key + same text → keep the existing record whatever its phase
 *     (this is what stops an unchanged persistent state from re-toasting),
 *   - key no longer reported → let a showing toast fade out early ("leaving"),
 *     let a leaving toast finish, and drop any tombstone.
 */
export function reconcileToasts(
  prev: Toast[],
  incoming: ChipSpec[],
  now: number,
): Toast[] {
  const byKey = new Map(prev.map((t) => [t.key, t]));
  const incomingKeys = new Set(incoming.map((c) => c.key));
  const next: Toast[] = [];

  for (const chip of incoming) {
    const existing = byKey.get(chip.key);
    if (existing && existing.text === chip.text) {
      next.push(existing);
    } else {
      next.push({
        key: chip.key,
        sev: chip.sev,
        text: chip.text,
        phase: "showing",
        expiresAt: now + chipDisplayMs(chip.text),
        leaveAt: null,
      });
    }
  }

  for (const t of prev) {
    if (incomingKeys.has(t.key)) continue;
    if (t.phase === "showing") {
      // Source state gone — fade the stale toast out now (never stack stale).
      next.push({ ...t, phase: "leaving", leaveAt: now });
    } else if (t.phase === "leaving") {
      next.push(t); // finish the fade; advanceToasts drops it after.
    }
    // "dismissed" tombstones for keys the source no longer reports are dropped,
    // so a future re-occurrence of the same event toasts again.
  }

  return next;
}

/**
 * Advance toast phases by time: showing → leaving at expiry, leaving →
 * dismissed after the fade. Dismissed records persist as tombstones (dropped
 * by reconcileToasts once their source key disappears).
 */
export function advanceToasts(toasts: Toast[], now: number): Toast[] {
  let changed = false;
  const next = toasts.map((t) => {
    if (t.phase === "showing" && now >= t.expiresAt) {
      changed = true;
      return { ...t, phase: "leaving" as const, leaveAt: now };
    }
    if (t.phase === "leaving" && now >= (t.leaveAt ?? 0) + TOAST_FADE_MS) {
      changed = true;
      return { ...t, phase: "dismissed" as const };
    }
    return t;
  });
  return changed ? next : toasts;
}

/** The toasts the component actually draws (tombstones are invisible). */
export function visibleToasts(toasts: Toast[]): Toast[] {
  return toasts.filter((t) => t.phase !== "dismissed");
}
