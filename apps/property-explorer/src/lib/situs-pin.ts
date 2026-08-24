// Unique situs pin for Find identity.
//
// The situs index is the identity writer. Envelope geocode of a Photon label
// is not. Zero or many usable hits → no pin (caller may fall through to
// address-only envelope). Never take hits[0] of a multi-hit list.

export type SitusPinHit = {
  parcelNodeId: string | null;
  situsAddress: string;
  lat: number | null;
  lng: number | null;
};

function finitePoint(h: SitusPinHit): boolean {
  return (
    h.lat != null &&
    Number.isFinite(h.lat) &&
    h.lng != null &&
    Number.isFinite(h.lng)
  );
}

function usable(h: SitusPinHit): boolean {
  const id = typeof h.parcelNodeId === "string" ? h.parcelNodeId.trim() : "";
  return Boolean(id) || finitePoint(h);
}

/** Parse the BFF `{ hits }` body. Drops malformed rows. */
export function situsHitsFromResponse(json: unknown): SitusPinHit[] {
  const raw =
    json && typeof json === "object" && Array.isArray((json as { hits?: unknown }).hits)
      ? ((json as { hits: unknown[] }).hits)
      : [];
  const out: SitusPinHit[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const situs =
      typeof r.situsAddress === "string" ? r.situsAddress.trim() : "";
    if (!situs) continue;
    const id =
      typeof r.parcelNodeId === "string" && r.parcelNodeId.trim()
        ? r.parcelNodeId.trim()
        : null;
    const lat =
      typeof r.latitude === "number" && Number.isFinite(r.latitude)
        ? r.latitude
        : null;
    const lng =
      typeof r.longitude === "number" && Number.isFinite(r.longitude)
        ? r.longitude
        : null;
    out.push({ parcelNodeId: id, situsAddress: situs, lat, lng });
  }
  return out;
}

/**
 * Exactly one usable hit is a pin. Two or more is not, even if the first
 * looks convenient (bare "908 Pine" ranks Harker Heights first).
 */
export function uniqueSitusPin(hits: SitusPinHit[]): SitusPinHit | null {
  const ok = hits.filter(usable);
  if (ok.length !== 1) return null;
  return ok[0] ?? null;
}
