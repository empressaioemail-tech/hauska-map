// Thin inspect identity for Find: swap the card to the found parcelNodeId
// the moment lookup returns, before the sheet seal. The leftover card's
// in-flight resolve cancels on id change (InspectCard cancelled flag).
//
// WDLL 2026-08-24 lane1 item 3 / P-60.

import type { ParcelCardData } from "../browse/liveGis";
import { classifyLookupQuery } from "./parcel-lookup";

export type PendingLookupInput = {
  query: string;
  parcelNodeId: string;
  situsAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type PendingInspect = {
  card: ParcelCardData;
  parcelNodeId: string;
};

export type InspectInPlaceFn = (
  card: ParcelCardData,
  parcelNodeId: string | null,
  geometry?: unknown,
) => void;

/** Address from the query or found data. A parcel-node-id query is not an address. */
function addressFromLookup(input: PendingLookupInput): string | null {
  const fromFound = input.situsAddress?.trim();
  if (fromFound) return fromFound;
  const classified = classifyLookupQuery(input.query);
  if (!classified || classified.kind === "parcel-node-id") return null;
  return classified.value;
}

/**
 * Thin identity card for the found id. Does not wait for facets, envelope, or GIS.
 */
export function pendingInspectFromLookup(input: PendingLookupInput): PendingInspect {
  const parcelNodeId = input.parcelNodeId.trim();
  if (!parcelNodeId) {
    throw new Error("pendingInspectFromLookup requires a parcelNodeId");
  }
  return {
    parcelNodeId,
    card: {
      apn: null,
      situsAddress: addressFromLookup(input),
      owner: null,
      landUseDescription: null,
      county: null,
      provider: null,
      notSurveyGrade: true,
      retrievedAt: null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    },
  };
}

/**
 * Swap inspect to the known id, THEN await the sheet seal.
 * The inspect call must happen before sealSubject is awaited so a leftover
 * card (previous parcelNodeId) is replaced rather than staying mounted.
 */
export async function inspectAsSoonAsIdKnown<T>(
  pending: PendingInspect,
  inspectInPlace: InspectInPlaceFn,
  sealSubject: () => Promise<T>,
): Promise<T> {
  inspectInPlace(pending.card, pending.parcelNodeId);
  return await sealSubject();
}
