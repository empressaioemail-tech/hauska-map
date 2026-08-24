// apps/property-explorer/src/lib/search-landing.ts
//
// Kind-aware LANDING for a selected search suggestion — pure orchestration
// over injected deps so the routing is unit-testable without a map:
//
//   parcel  → today's direct behavior: parcel-id lookup → inspect card.
//   address → resolve through the EXISTING address→parcel lookup; on a hit,
//             the lookup flow opens the inspect card on OUR parcel data (atom
//             path when available) and flies the camera. On a miss the map
//             still LANDS (flyTo) with an honest transient chip — a parcel
//             match is NEVER fabricated.
//   street  → fit the street's extent + a brief fading highlight of it.
//   place   → fly/fit to the place bbox ("dock over it").

import {
  identityQueryFromAddressSuggestion,
  type GeoExtent,
  type Suggestion,
} from "./search-kinds";

/** Honest chip when an address lands outside our parcel coverage. */
export const OUTSIDE_COVERAGE_CHIP =
  "Outside parcel coverage — map view only";

/** Zoom used when landing on a point address without a parcel hit. */
export const ADDRESS_LANDING_ZOOM = 17;
/** Fallback zoom when a place has no extent. */
export const PLACE_LANDING_ZOOM = 13;
/** Fallback zoom when a street has no extent. */
export const STREET_LANDING_ZOOM = 16;

export interface SearchLandingDeps {
  /**
   * The EXISTING lookup flow (parcel-id or address → inspect card + camera).
   * Returns true when it resolved and opened the card; false on a miss.
   * `quiet` misses must not paint the lookup-error line (the caller lands the
   * map honestly instead).
   */
  runParcelLookup: (
    query: string,
    opts?: {
      quiet?: boolean;
      lat?: number;
      lng?: number;
      trustedRooftop?: { lat: number; lng: number };
    },
  ) => Promise<boolean>;
  flyTo: (lat: number, lng: number, zoom: number) => void;
  /** Fit the camera to a Photon extent [minLon, maxLat, maxLon, minLat]. */
  fitExtent: (extent: GeoExtent) => void;
  /** Show a transient honest chip (TransientChips mechanism). */
  showChip: (text: string) => void;
  /** Briefly highlight a street's extent geometry (fading overlay). */
  highlightStreet: (extent: GeoExtent, name: string) => void;
}

export type LandingOutcome =
  | { kind: "parcel"; opened: boolean }
  | { kind: "address"; opened: boolean; coverageMiss: boolean }
  | { kind: "street"; fitted: boolean }
  | { kind: "place"; fitted: boolean }
  | { kind: "noop" };

/** Execute the landing for a selected suggestion. Never throws on a miss. */
export async function executeSearchLanding(
  suggestion: Suggestion,
  deps: SearchLandingDeps,
): Promise<LandingOutcome> {
  switch (suggestion.kind) {
    case "parcel": {
      const id = suggestion.parcelNodeId ?? suggestion.lookupQuery;
      if (!id) return { kind: "noop" };
      const opened = await deps.runParcelLookup(id);
      return { kind: "parcel", opened };
    }

    case "address": {
      // Photon is a camera hint. It is not an identity writer. Posting its
      // label or its point is the 422 the operator keeps seeing.
      if (suggestion.source === "photon") {
        if (suggestion.lat != null && suggestion.lng != null) {
          deps.flyTo(suggestion.lat, suggestion.lng, ADDRESS_LANDING_ZOOM);
        }
        return { kind: "address", opened: false, coverageMiss: true };
      }
      const query = identityQueryFromAddressSuggestion(suggestion);
      const roof =
        suggestion.source === "situs-address-point" &&
        suggestion.lat != null &&
        suggestion.lng != null &&
        Number.isFinite(suggestion.lat) &&
        Number.isFinite(suggestion.lng)
          ? { lat: suggestion.lat, lng: suggestion.lng }
          : undefined;
      const opened = await deps.runParcelLookup(query, {
        quiet: true,
        ...(roof ? { trustedRooftop: roof } : {}),
      });
      if (opened) return { kind: "address", opened: true, coverageMiss: false };
      if (suggestion.lat != null && suggestion.lng != null) {
        deps.flyTo(suggestion.lat, suggestion.lng, ADDRESS_LANDING_ZOOM);
        deps.showChip(OUTSIDE_COVERAGE_CHIP);
        return { kind: "address", opened: false, coverageMiss: true };
      }
      return { kind: "noop" };
    }

    case "street": {
      if (suggestion.extent) {
        deps.fitExtent(suggestion.extent);
        deps.highlightStreet(suggestion.extent, suggestion.label);
        return { kind: "street", fitted: true };
      }
      if (suggestion.lat != null && suggestion.lng != null) {
        deps.flyTo(suggestion.lat, suggestion.lng, STREET_LANDING_ZOOM);
        return { kind: "street", fitted: false };
      }
      return { kind: "noop" };
    }

    case "place": {
      if (suggestion.extent) {
        deps.fitExtent(suggestion.extent);
        return { kind: "place", fitted: true };
      }
      if (suggestion.lat != null && suggestion.lng != null) {
        deps.flyTo(suggestion.lat, suggestion.lng, PLACE_LANDING_ZOOM);
        return { kind: "place", fitted: false };
      }
      return { kind: "noop" };
    }
  }
}
