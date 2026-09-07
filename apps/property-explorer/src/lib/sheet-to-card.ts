// apps/property-explorer/src/lib/sheet-to-card.ts
//
// The sealed sheet -> the inspect card's existing `ParcelCardData` shape.
//
// I2 says every surface RENDERS the sheet rather than re-deriving it. The
// inspect card's own props are owned by a parallel lane, so the seam this lane
// changes is where the card's data COMES FROM: the app shell now hands it a
// projection of the one sealed sheet instead of a card assembled by whichever
// lookup happened to run.
//
// It is a projection, not a second derivation: every field is read straight off
// the sheet, nothing is looked up, and an absent fact projects to null rather
// than to a placeholder.

import { isPresent, type ParcelFactSheet } from "@empressaio/parcel-fact-sheet";
import type { ParcelCardData } from "../browse/liveGis";

export function cardFromSheet(sheet: ParcelFactSheet): ParcelCardData {
  const { identity, geometry } = sheet;
  return {
    apn: isPresent(identity.apn) ? identity.apn.value : null,
    situsAddress: isPresent(identity.situsAddress)
      ? identity.situsAddress.value
      : null,
    // Owner is never served on this tier.
    owner: null,
    landUseDescription: isPresent(sheet.landUse)
      ? sheet.landUse.value.description || sheet.landUse.value.code
      : null,
    // County is NOT a Fact — the FIPS is a substring of the parcel node id, so
    // this can never read "county name is not on file".
    county: `${identity.county.name} County (${identity.county.fips})`,
    provider: isPresent(identity.apn) ? identity.apn.provenance.source : null,
    // Tier-1 geometry and envelopes are shape-only. Always.
    notSurveyGrade: true,
    retrievedAt: isPresent(identity.apn)
      ? identity.apn.provenance.retrievedAt
      : null,
    // I5: the centroid is the navigation authority, and it is always present.
    lat: geometry.centroid.lat,
    lng: geometry.centroid.lng,
  };
}

/**
 * cardFromSheet, with the searched address kept as a display fallback when
 * the county's own record carries none.
 *
 * 9-4 UI review: "typing a real street address lands on the correct parcel
 * but the page header shows a parcel number instead of the street address."
 * cardFromSheet correctly nulls situsAddress on an honest county absence
 * (most rural/unaddressed parcels), but Find already has a strictly better
 * label sitting right there: the address the user just typed, which the
 * geocoder already confirmed resolves to this exact parcel. Discarding it in
 * favor of "Parcel 48021:34177" throws away real information to make room for
 * a worse one.
 *
 * This changes the CARD HEADING only, never a fact. There is no separate
 * "situs address" fact row in the inspect card — situsAddress exists here
 * purely as a navigation label — so this asserts nothing the county didn't;
 * every fact row still reads the sheet directly and reports the address gap
 * as absent where it genuinely is.
 */
export function cardFromSheetWithSearchFallback(
  sheet: ParcelFactSheet,
  searchedAddress: string | null,
): ParcelCardData {
  const card = cardFromSheet(sheet);
  return card.situsAddress != null
    ? card
    : { ...card, situsAddress: searchedAddress };
}
