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
  mergeSearchSuggestions,
  parcelIdSuggestion,
  suggestionLookupTarget,
  compactEnvelopeAddressQuery,
  identityQueryFromAddressSuggestion,
  isPhotonAddressLabel,
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

describe("mergeSearchSuggestions", () => {
  const parcel = (
    id: string,
    label: string,
    lookup: string,
  ): Suggestion => ({
    kind: "parcel",
    label,
    sublabel: "Buda, TX",
    lat: null,
    lng: null,
    extent: null,
    parcelNodeId: id,
    lookupQuery: lookup,
  });

  const address = (label: string, lookup: string): Suggestion => ({
    kind: "address",
    label,
    sublabel: "Buda, TX",
    lat: 30.1,
    lng: -97.8,
    extent: null,
    parcelNodeId: null,
    lookupQuery: lookup,
  });

  it("ranks situs parcels before geocoder addresses", () => {
    const merged = mergeSearchSuggestions(
      [parcel("48209:193340", "6026 Marsh Ln", "6026 MARSH LN, BUDA, TX 78610")],
      [address("6026 Marsh Ln", "6026 Marsh Ln, Buda, TX")],
      7,
    );
    expect(merged[0]?.kind).toBe("parcel");
    expect(merged[0]?.parcelNodeId).toBe("48209:193340");
  });

  it("drops the Photon address row when a situs pin shares the house number", () => {
    const situs: Suggestion = {
      kind: "address",
      label: "17005 SIMSBROOK DR",
      sublabel: "Pflugerville, TX, 78660",
      lat: 30.459,
      lng: -97.635,
      extent: null,
      parcelNodeId: null,
      lookupQuery: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
      source: "situs-address-point",
    };
    const photon: Suggestion = {
      kind: "address",
      label: "17005 Simsbrook Drive",
      sublabel: "Pflugerville, Texas",
      lat: 30.439,
      lng: -97.62,
      extent: null,
      parcelNodeId: null,
      lookupQuery: "17005 Simsbrook Drive, Pflugerville, Texas, 78660",
      source: "photon",
    };
    const merged = mergeSearchSuggestions([situs], [photon], 7);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe("situs-address-point");
    expect(merged[0]?.lookupQuery).toBe(
      "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
    );
  });

  it("keeps a Photon address when no situs pin shares the house number", () => {
    const photon: Suggestion = {
      kind: "address",
      label: "1 Ferry Building",
      sublabel: "San Francisco, California",
      lat: 37.79,
      lng: -122.39,
      extent: null,
      parcelNodeId: null,
      lookupQuery: "1 Ferry Building, San Francisco, California, 94111",
      source: "photon",
    };
    const merged = mergeSearchSuggestions([], [photon], 7);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toBe("photon");
  });

  it("dedupes by parcelNodeId and lookupQuery", () => {
    const merged = mergeSearchSuggestions(
      [parcel("48209:193340", "6026 Marsh Ln", "6026 MARSH LN, BUDA, TX 78610")],
      [
        parcel("48209:193340", "6026 Marsh Ln", "6026 MARSH LN, BUDA, TX 78610"),
        address("6026 Marsh Ln", "6026 marsh ln, buda, tx 78610"),
      ],
      7,
    );
    expect(merged).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// P-39: the picked-suggestion truncation defect.
// ---------------------------------------------------------------------------

describe("suggestionLookupTarget — what the input carries after a pick", () => {
  /** The Photon wire feature for the address named in the QA pass. */
  const SIMSBROOK: GeocodeWireFeature = {
    name: null,
    housenumber: "17005",
    street: "Simsbrook Drive",
    city: "Pflugerville",
    county: "Travis",
    state: "TX",
    postcode: "78660",
    countrycode: "US",
    osmKey: "place",
    osmValue: "house",
    type: "house",
    lat: 30.4394,
    lng: -97.6203,
    extent: null,
  };

  it("writes the compact identity query, not the Photon label or the display label", () => {
    const s = featureToSuggestion(SIMSBROOK);
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.source).toBe("photon");
    expect(s.label).toBe("17005 Simsbrook Drive");
    expect(s.lookupQuery).toBe(
      "17005 Simsbrook Drive, Pflugerville, TX, 78660",
    );
    // Pick / Find must not re-submit the Photon label (Drive + ZIP).
    expect(suggestionLookupTarget(s)).toBe("17005 Simsbrook, Pflugerville TX");
    expect(suggestionLookupTarget(s)).not.toBe(s.label);
    expect(suggestionLookupTarget(s)).not.toBe(s.lookupQuery);
  });

  it("carries the parcel node id for a parcel suggestion", () => {
    const s = parcelIdSuggestion("48021:34177");
    expect(s).not.toBeNull();
    if (!s) return;
    // The label is prose ("Open parcel …") and would never re-submit.
    expect(s.label).toBe("Open parcel 48021:34177");
    expect(suggestionLookupTarget(s)).toBe("48021:34177");
  });

  it("falls back to the label for a street or place, which is not a lookup", () => {
    const street = featureToSuggestion({
      ...SIMSBROOK,
      housenumber: null,
      type: "street",
      osmKey: "highway",
      name: "Simsbrook Drive",
    });
    expect(street).not.toBeNull();
    if (!street) return;
    expect(street.lookupQuery).toBeNull();
    expect(suggestionLookupTarget(street)).toBe("Simsbrook Drive");
  });
});

describe("Photon label compaction (P-60 dropdown pick)", () => {
  it("compacts the operator Photon string to the pasted form that docks", () => {
    expect(
      compactEnvelopeAddressQuery(
        "17005 Simsbrook Drive, Pflugerville, Texas, 78660",
      ),
    ).toBe("17005 Simsbrook, Pflugerville TX");
    expect(
      isPhotonAddressLabel("17005 Simsbrook Drive, Pflugerville, Texas, 78660"),
    ).toBe(true);
    expect(
      isPhotonAddressLabel("17005 SIMSBROOK DR, Pflugerville, TX, 78660"),
    ).toBe(false);
    expect(isPhotonAddressLabel("17005 Simsbrook, Pflugerville TX")).toBe(false);
  });

  it("identity query prefers situs lookupQuery over Photon compaction", () => {
    expect(
      identityQueryFromAddressSuggestion({
        kind: "address",
        label: "17005 SIMSBROOK DR",
        sublabel: null,
        lat: 30.459,
        lng: -97.635,
        extent: null,
        parcelNodeId: null,
        lookupQuery: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
        source: "situs-address-point",
      }),
    ).toBe("17005 SIMSBROOK DR, Pflugerville, TX, 78660");
  });
});
