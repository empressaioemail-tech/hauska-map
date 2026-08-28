// Where a chosen report doc LIVES, depending on whether a parcel exists yet.
//
// WHY THIS IS A MODULE AND NOT TWO INLINE TERNARIES.
//
// useDockToolState refuses writes with no active parcel ("no phantom-property
// writes" in WorkbenchContext) because that state is keyed BY property. That
// is right. The consequence was that picking a report before picking a parcel
// silently did nothing — the picker closed on an empty module and the choice
// was gone. Operator, 2026-08-28.
//
// The fix holds a pre-parcel choice in component state and hands it to the
// per-property store when a parcel arrives. That is interaction wiring, and
// this repo's tests run in node with no click harness, so the DECISION lives
// here as pure functions that can actually be tested. An earlier version of
// this fix was "covered" by tests that passed with the fix reverted.

export type PickTarget = "store" | "pending";

/**
 * Where a pick goes. With a parcel it is per-property state; without one it
 * is held locally until there is a property to key it to.
 */
export function routePick(activeParcelNodeId: string | null): PickTarget {
  return activeParcelNodeId ? "store" : "pending";
}

/**
 * The selection actually in effect. Never read the store while there is no
 * parcel: it is keyed by property, so its value belongs to whichever property
 * was last open, not to this empty state.
 */
export function effectiveSelectedDoc(
  activeParcelNodeId: string | null,
  stored: string | null,
  pending: string | null,
): string | null {
  return activeParcelNodeId ? stored : pending;
}

/**
 * Should the held pick now be promoted into per-property state? True exactly
 * once, when a parcel arrives and something is being held.
 */
export function shouldPromotePending(
  activeParcelNodeId: string | null,
  pending: string | null,
): boolean {
  return Boolean(activeParcelNodeId) && Boolean(pending);
}
