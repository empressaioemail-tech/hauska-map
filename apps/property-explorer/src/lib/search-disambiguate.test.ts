// W1 Find disambiguation — fails if a single assumed hit is returned
// for 905 Pecan / 1308 Pecan. History pick uses the same landing as a
// fresh suggest. Place without comma. Parcel-id fast path for 48021:27479.

import { describe, expect, it, vi } from "vitest";
import type { GeocodeWireFeature } from "../../api/_lib/pe-geocode-core";
import {
  executeSearchLanding,
  type SearchLandingDeps,
} from "./search-landing";
import {
  createSuggestController,
  SUGGEST_DEBOUNCE_MS,
} from "./search-suggest";
import {
  featureToSuggestion,
  isAmbiguousSuggestionSet,
  isBareHouseStreetQuery,
  looksLikeBarePlaceQuery,
  looksLikeParcelId,
  mergeSearchSuggestions,
  parcelIdSuggestion,
  placeDisplayLabel,
  situsQueryVariants,
  suggestionLookupTarget,
  type Suggestion,
} from "./search-kinds";

function wire(over: Partial<GeocodeWireFeature>): GeocodeWireFeature {
  return {
    name: null,
    housenumber: null,
    street: null,
    city: null,
    county: null,
    state: "Texas",
    postcode: null,
    countrycode: "US",
    osmKey: null,
    osmValue: null,
    type: null,
    lat: 30.11,
    lng: -97.31,
    extent: null,
    ...over,
  };
}

function parcel(
  id: string,
  label: string,
  locality: string,
  lookup: string,
): Suggestion {
  return {
    kind: "parcel",
    label,
    sublabel: locality,
    lat: null,
    lng: null,
    extent: null,
    parcelNodeId: id,
    lookupQuery: lookup,
    source: "situs-parcel",
  };
}

function photonAddress(
  label: string,
  locality: string,
  lookup: string,
): Suggestion {
  return {
    kind: "address",
    label,
    sublabel: locality,
    lat: 30.11,
    lng: -97.31,
    extent: null,
    parcelNodeId: null,
    lookupQuery: lookup,
    source: "photon",
  };
}

describe("W1.1 / W1.8 — never assume one hit", () => {
  it("905 Pecan keeps Street vs Drive (fails if a single assumed hit is returned)", () => {
    const merged = mergeSearchSuggestions(
      [
        parcel(
          "48021:34161",
          "905 PECAN ST",
          "Bastrop, TX",
          "905 PECAN ST, BASTROP, TX 78602",
        ),
      ],
      [
        photonAddress(
          "905 Pecan Drive",
          "Bastrop, Texas",
          "905 Pecan Drive, Bastrop, Texas, 78602",
        ),
        photonAddress(
          "905 Pecan Street",
          "Bastrop, Texas",
          "905 Pecan Street, Bastrop, Texas, 78602",
        ),
      ],
      7,
      "905 Pecan",
    );
    expect(merged.length).toBeGreaterThan(1);
    expect(isAmbiguousSuggestionSet(merged)).toBe(true);
    const blob = merged.map((s) => `${s.label} ${s.sublabel ?? ""}`).join(" | ");
    expect(blob.toLowerCase()).toMatch(/st|street/);
    expect(blob.toLowerCase()).toMatch(/dr|drive/);
  });

  it("1308 Pecan keeps Bastrop ST and Guadalupe DR (fails on a single assumed hit)", () => {
    const merged = mergeSearchSuggestions(
      [
        parcel(
          "48187:29690",
          "1308 PECAN DR",
          "Cibolo, TX",
          "1308 PECAN DR, CIBOLO, TX",
        ),
        parcel(
          "48021:27479",
          "1308 PECAN ST",
          "Bastrop, TX",
          "1308 PECAN ST, BASTROP, TX 78602",
        ),
      ],
      [
        photonAddress(
          "1308 Pecan Street",
          "Bastrop, Texas",
          "1308 Pecan Street, Bastrop, Texas, 78602",
        ),
      ],
      7,
      "1308 Pecan",
    );
    expect(merged.length).toBeGreaterThan(1);
    expect(merged.some((s) => s.parcelNodeId === "48021:27479")).toBe(true);
    expect(merged.some((s) => s.parcelNodeId === "48187:29690")).toBe(true);
    expect(isBareHouseStreetQuery("1308 Pecan")).toBe(true);
    expect(isBareHouseStreetQuery("1308 Pecan st")).toBe(false);
    expect(isBareHouseStreetQuery("1308 Pecan Bastrop")).toBe(false);
  });

  it("1308 Pecan Bastrop expands the situs prefix so city is not part of the street", () => {
    expect(situsQueryVariants("1308 Pecan Bastrop")).toEqual([
      "1308 Pecan Bastrop",
      "1308 Pecan",
    ]);
    expect(situsQueryVariants("1308 Pecan st")).toEqual(["1308 Pecan st"]);
  });

  it("VIOLATION: house-number-only collapse would hide Bastrop — this merge must not", () => {
    const collapsed = mergeSearchSuggestions(
      [
        parcel(
          "48187:29690",
          "1308 PECAN DR",
          "Cibolo, TX",
          "1308 PECAN DR, CIBOLO, TX",
        ),
      ],
      [
        photonAddress(
          "1308 Pecan Street",
          "Bastrop, Texas",
          "1308 Pecan Street, Bastrop, Texas, 78602",
        ),
      ],
      7,
      "1308 Pecan",
    );
    expect(collapsed).toHaveLength(2);
    expect(collapsed.some((s) => /bastrop/i.test(s.sublabel ?? ""))).toBe(true);
  });
});

describe("W1.3 — history pick is a fresh Find and shows the address", () => {
  it("situs parcel lookup target is the address, not the APN", () => {
    const recent = parcel(
      "48021:27479",
      "1308 PECAN ST",
      "Bastrop, TX",
      "1308 PECAN ST, BASTROP, TX 78602",
    );
    expect(suggestionLookupTarget(recent)).toBe("1308 PECAN ST, BASTROP, TX 78602");
    expect(suggestionLookupTarget(recent)).not.toBe("48021:27479");
  });

  it("history select lands through executeSearchLanding with the stored parcel id", async () => {
    const recent = parcel(
      "48021:27479",
      "1308 PECAN ST",
      "Bastrop, TX",
      "1308 PECAN ST, BASTROP, TX 78602",
    );
    const deps: SearchLandingDeps = {
      runParcelLookup: vi.fn(async () => true),
      flyTo: vi.fn(),
      fitExtent: vi.fn(),
      showChip: vi.fn(),
      highlightStreet: vi.fn(),
    };
    const fresh = await executeSearchLanding(recent, deps);
    const again = await executeSearchLanding(recent, deps);
    expect(fresh).toEqual(again);
    expect(deps.runParcelLookup).toHaveBeenCalledTimes(2);
    expect(deps.runParcelLookup).toHaveBeenNthCalledWith(1, "48021:27479");
    expect(deps.runParcelLookup).toHaveBeenNthCalledWith(2, "48021:27479");
  });
});

describe("W1.4 — place without comma; city vs county labels", () => {
  it("Bastrop Texas is a place query", () => {
    expect(looksLikeBarePlaceQuery("Bastrop Texas")).toBe(true);
    expect(looksLikeBarePlaceQuery("Bastrop, Texas")).toBe(true);
    expect(looksLikeBarePlaceQuery("1308 Pecan")).toBe(false);
  });

  it("labels Bastrop City Texas vs Bastrop County Texas", () => {
    const city = placeDisplayLabel(
      wire({
        name: "Bastrop",
        type: "city",
        osmKey: "place",
        osmValue: "city",
        state: "Texas",
        county: "Bastrop",
      }),
    );
    const county = placeDisplayLabel(
      wire({
        name: "Bastrop County",
        type: "county",
        osmKey: "place",
        osmValue: "county",
        state: "Texas",
      }),
    );
    expect(city?.label).toBe("Bastrop City Texas");
    expect(county?.label).toBe("Bastrop County Texas");
    const citySug = featureToSuggestion(
      wire({
        name: "Bastrop",
        type: "city",
        osmKey: "place",
        osmValue: "city",
        state: "Texas",
      }),
    );
    expect(citySug?.kind).toBe("place");
    expect(citySug?.label).toBe("Bastrop City Texas");
  });
});

describe("W1.5 — debounce measured, no row-dropping fast path", () => {
  it("controller waits SUGGEST_DEBOUNCE_MS (250) and still fetches the full query", () => {
    expect(SUGGEST_DEBOUNCE_MS).toBe(250);
    const calls: string[] = [];
    const c = createSuggestController({
      fetchSuggestions: async (q) => {
        calls.push(q);
        return [];
      },
      onChange: () => {},
    });
    vi.useFakeTimers();
    c.input("1308 Pecan");
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(SUGGEST_DEBOUNCE_MS - 1);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["1308 Pecan"]);
    vi.useRealTimers();
    c.dispose();
  });
});

describe("W1.7 — units stay distinct; PUD street is not a whole-PUD identity", () => {
  it("1620 Bryant unit rows do not collapse to one house-number hit", () => {
    const a = parcel(
      "48021:1",
      "1620 BRYANT ST #1904",
      "Austin, TX",
      "1620 BRYANT ST #1904, AUSTIN, TX",
    );
    const b = parcel(
      "48021:2",
      "1620 BRYANT ST #1905",
      "Austin, TX",
      "1620 BRYANT ST #1905, AUSTIN, TX",
    );
    const merged = mergeSearchSuggestions([a, b], [], 7, "1620 Bryant");
    expect(merged).toHaveLength(2);
    expect(merged.map((s) => s.label).join(" ")).toMatch(/1904/);
    expect(merged.map((s) => s.label).join(" ")).toMatch(/1905/);
  });
});

describe("W1.8 — parcel-id fast path for 48021:27479", () => {
  it("looks like a parcel id and builds the direct-open row", () => {
    expect(looksLikeParcelId("48021:27479")).toBe(true);
    const s = parcelIdSuggestion("48021:27479");
    expect(s?.parcelNodeId).toBe("48021:27479");
    expect(s?.source).toBe("direct-id");
    expect(suggestionLookupTarget(s!)).toBe("48021:27479");
  });

  it("controller shows the row with no geocoder call", () => {
    const calls: string[] = [];
    const c = createSuggestController({
      fetchSuggestions: async (q) => {
        calls.push(q);
        return [];
      },
      onChange: () => {},
    });
    c.input("48021:27479");
    const snap = c.getSnapshot();
    expect(calls).toEqual([]);
    expect(snap.items).toHaveLength(1);
    expect(snap.items[0]?.parcelNodeId).toBe("48021:27479");
    c.dispose();
  });
});
