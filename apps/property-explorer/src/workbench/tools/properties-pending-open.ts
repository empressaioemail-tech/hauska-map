// Pending "open this saved property in My properties" request.
//
// Compare click-through (W5.2) writes a parcel id here, then switches the
// ONE dock tool to "properties". PropertiesTool remounts (single-tenant rail)
// and consumes the request as its initial detail view. Module-level, not
// chassis-store: the request is one-shot and must not survive a later
// unrelated My properties open.
//
// Fail closed: an empty or whitespace id is refused. A take with nothing
// pending returns null — never a fabricated parcel.

let pendingParcelNodeId: string | null = null;

export function requestOpenSavedProperty(parcelNodeId: string): void {
  const id = parcelNodeId.trim();
  if (!id) return;
  pendingParcelNodeId = id;
}

/** Consume the pending id (null when none). A second take is empty. */
export function takeOpenSavedPropertyRequest(): string | null {
  const id = pendingParcelNodeId;
  pendingParcelNodeId = null;
  return id;
}

/** Test / diagnostic peek. Does not consume. */
export function peekOpenSavedPropertyRequest(): string | null {
  return pendingParcelNodeId;
}

/** Test isolation — never call from product code to "fix" a missing request. */
export function resetOpenSavedPropertyRequest(): void {
  pendingParcelNodeId = null;
}

export type PropertiesView =
  | { kind: "list" }
  | { kind: "detail"; parcelNodeId: string };

/**
 * Initial My properties view from a pending click-through. Consumes the
 * request. No pending id → list (honest, not a guessed detail).
 */
export function initialPropertiesView(): PropertiesView {
  const pending = takeOpenSavedPropertyRequest();
  return pending ? { kind: "detail", parcelNodeId: pending } : { kind: "list" };
}
