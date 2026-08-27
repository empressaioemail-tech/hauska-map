// W2.1 — the share landing flies to THIS parcel, never an invented one.
// The map calls runParcelLookup with this query. A missing parcel id is
// a refuse: no flight. Notes are a separate payload; dropping them must
// not be satisfiable by flying to a different id.

import type { ShareFunnelBinding } from "./SharedDossierDock";

export function shareFlightQuery(share: ShareFunnelBinding): string | null {
  if (share.phase.kind === "ready") {
    const id = share.phase.data.property.parcelNodeId?.trim() ?? "";
    return id || null;
  }
  const id = share.parcelNodeId?.trim() ?? "";
  return id || null;
}

export function shareNotesFromDossier(
  dossier: ShareFunnelBinding["dossier"],
): string | null {
  const notes = dossier?.notes;
  if (typeof notes !== "string") return null;
  const trimmed = notes.trim();
  return trimmed || null;
}
