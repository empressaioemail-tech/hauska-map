// Kind logic tests — geocoder feature classification, grouping/cap,
// parcel-id fast path shape, matched-substring highlight ranges.

import { describe, expect, it } from "vitest";
import type { GeocodeWireFeature } from "../../api/_lib/pe-geocode-core";
import {
  classifyFeature,
  featureToSuggestion,
  groupSuggestions,
  highlightRanges,
  looksLikeParcelId,
  parcelIdSuggestion,
  type Suggestion,
} from "./search-kinds";

function wire(over: Partial<GeocodeWireFeature>): GeocodeWireFeature {
  return {
    name: null,
    housenumber: null,
    street: null,
    city: null,
    county: null,
    state: null,
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

describe("parcel-id fast path", () => {
  it("matches /^\\d{5}:\\S+/ and builds the direct-open suggestion", () => {
    expect(looksLikeParcelId("48021:34177")).toBe(true);
    const s = parcelIdSuggestion("  48021:34177 ");
    expect(s?.label).toBe("Open parcel 48021:34177");
    expect(s?.parcelNodeId).toBe("48021:34177");
    expect(s?.kind).toBe("parcel");
  });

  it("rejects non-parcel-id input", () => {
    expect(looksLikeParcelId("main street bastrop")).toBe(false);
    expect(looksLikeParcelId("4802:123")).toBe(false);
    expect(parcelIdSuggestion("714 spring st")).toBeNull();
  });
});

describe("feature classification", () => {
  it("housenumber (or type house) -> address", () => {
    expect(classifyFeature(wire({ housenumber: "714", street: "Spring St" }))).toBe("address");
    expect(classifyFeature(wire({ type: "house", name: "714 Spring" }))).toBe("address");
  });

  it("osm highway (or type street) -> street", () => {
    expect(classifyFeature(wire({ osmKey: "highway", name: "Main Street" }))).toBe("street");
    expect(classifyFeature(wire({ type: "street", name: "Main Street" }))).toBe("street");
  });

  it("cities/places -> place", () => {
    expect(classifyFeature(wire({ osmKey: "place", osmValue: "city", name: "Austin" }))).toBe("place");
    expect(classifyFeature(wire({ type: "city", name: "Austin" }))).toBe("place");
  });
});

describe("featureToSuggestion labels", () => {
  it("address: house number + street, locality sublabel, full lookup query", () => {
    const s = featureToSuggestion(
      wire({
        housenumber: "714",
        street: "Spring Street",
        city: "Bastrop",
        state: "Texas",
        postcode: "78602",
      }),
    );
    expect(s?.label).toBe("714 Spring Street");
    expect(s?.sublabel).toBe("Bastrop, Texas");
    expect(s?.lookupQuery).toBe("714 Spring Street, Bastrop, Texas, 78602");
  });

  it("street: name + locality; place: name + state", () => {
    const st = featureToSuggestion(
      wire({ osmKey: "highway", name: "Main Street", city: "Bastrop", state: "Texas" }),
    );
    expect(st?.kind).toBe("street");
    expect(st?.label).toBe("Main Street");
    expect(st?.sublabel).toBe("Bastrop, Texas");
    const pl = featureToSuggestion(
      wire({ osmKey: "place", osmValue: "city", name: "Austin", state: "Texas" }),
    );
    expect(pl?.kind).toBe("place");
    expect(pl?.label).toBe("Austin");
  });

  it("unusable feature (no name at all) -> null, never a blank row", () => {
    expect(featureToSuggestion(wire({}))).toBeNull();
  });
});

describe("grouping", () => {
  const mk = (kind: Suggestion["kind"], label: string): Suggestion => ({
    kind,
    label,
    sublabel: null,
    lat: 0,
    lng: 0,
    extent: null,
    parcelNodeId: null,
    lookupQuery: null,
  });

  it("orders parcel > address > street > place and caps at 7", () => {
    const items = [
      mk("place", "P1"),
      mk("street", "S1"),
      mk("address", "A1"),
      mk("parcel", "ID"),
      mk("address", "A2"),
      mk("place", "P2"),
      mk("street", "S2"),
      mk("place", "P3"),
      mk("place", "P4"),
    ];
    const grouped = groupSuggestions(items, 7);
    expect(grouped.map((s) => s.label)).toEqual([
      "ID",
      "A1",
      "A2",
      "S1",
      "S2",
      "P1",
      "P2",
    ]);
  });

  it("de-dupes identical label+kind rows", () => {
    const grouped = groupSuggestions([mk("place", "Austin"), mk("place", "Austin")]);
    expect(grouped.length).toBe(1);
  });
});

describe("highlightRanges", () => {
  it("marks each query token where it appears (case-insensitive)", () => {
    const r = highlightRanges("Main Street", "main st");
    expect(r).toEqual([
      { start: 0, end: 4 }, // "Main"
      { start: 5, end: 7 }, // "St" in "Street"
    ]);
  });

  it("merges overlapping token matches", () => {
    const r = highlightRanges("Bastrop", "bas astrop");
    expect(r).toEqual([{ start: 0, end: 7 }]);
  });

  it("no query -> no ranges", () => {
    expect(highlightRanges("Main Street", "   ")).toEqual([]);
  });
});
