// apps/property-explorer/src/coldopen/report-rows.test.ts
//
// P-247: the state-2 sample report must never fabricate a value the record
// does not carry. These fixtures mirror what this app's own resolver
// actually returns today for the three real sample parcels (live-checked
// against this app's data path before this lane wrote a line of UI code —
// see sample-parcels.ts): the Austin lot is zoned with a resolved setback
// table but no buildable-envelope figure yet; the Bastrop and Hays parcels
// are unincorporated, so the county carries no zoning or setbacks at all.
// Each fixture below asserts at least one field the record genuinely does
// not carry renders the absent case, not a fabricated value.

import { describe, expect, it } from "vitest";
import type { ParcelFactSheet, Provenance } from "@empressaio/parcel-fact-sheet";
import { citationFor, floodRows, terrainRows, xrayRows } from "./report-rows";

const PROV = (over: Partial<Provenance> = {}): Provenance => ({
  source: "test",
  sourceLabel: "Test source",
  vintage: null,
  method: null,
  retrievedAt: null,
  confidence: null,
  confidenceBasis: "asserted",
  sourceUrl: null,
  atomDids: [],
  ...over,
});

function baseSheet(overrides: Partial<ParcelFactSheet>): ParcelFactSheet {
  return {
    factSheetId: "fs_test",
    resolverVersion: "test",
    sealedAt: "2026-09-16T00:00:00.000Z",
    identity: {
      parcelNodeId: "test:1",
      county: { fips: "48453", name: "Travis" },
      apn: { state: "absent-covered", reason: "n/a", provenance: PROV() },
      situsAddress: { state: "absent-covered", reason: "n/a", provenance: PROV() },
      owner: { state: "absent-uncovered", reason: "owner is not served on the public tier", wouldBeFilledBy: "owner-fact" },
    },
    geometry: {
      rings: [],
      centroid: { lat: 30.25, lng: -97.77 },
      bbox: [-97.77, 30.25, -97.77, 30.25],
      lotArea: { value: 7790, unit: "sqft" },
      crs: "EPSG:4326",
    },
    landUse: { state: "absent-covered", reason: "n/a", provenance: PROV() },
    zoning: { state: "absent-covered", reason: "n/a", provenance: PROV() },
    setbacks: { state: "absent-covered", reason: "n/a", provenance: PROV() },
    envelope: { kind: "not-derived", reason: "n/a", missing: [] },
    flood: { state: "absent-covered", reason: "n/a", provenance: PROV() },
    site: {
      elevationRange: null,
      contourInterval: null,
      frontage: {
        state: "absent-uncovered",
        reason: "street frontage has not been derived for this parcel",
        wouldBeFilledBy: "road-node ingest for 48453",
      },
    },
    ...overrides,
  } as ParcelFactSheet;
}

/** 48453:939221 — 2005 Goodrich Ave, Austin (real, live-checked): zoning and
 *  setbacks are present with a real Austin LDC citation; the buildable-
 *  envelope FIGURE is withheld (atom_path_pending — the polygon can draw,
 *  the area cannot print), a real, structural absence this app's own
 *  BuildableEnvelope type names as "modelled", not "derived". */
const austinFixture = baseSheet({
  zoning: {
    state: "present",
    value: { code: "SF-3", name: "SF-3 Family Residence", jurisdiction: "austin-tx" },
    provenance: PROV({ atomDids: [{ did: "did:atom:1", label: "25-2-492" }] }),
  },
  setbacks: {
    state: "present",
    value: {
      front: { distance: { value: 25, unit: "ft" }, governedBy: "25-2-492", note: null, provenance: PROV({ atomDids: [{ did: "did:atom:2", label: "25-2-492" }] }) },
      side: { distance: { value: 5, unit: "ft" }, governedBy: "25-2-492", note: null, provenance: PROV({ atomDids: [{ did: "did:atom:3", label: "25-2-492" }] }) },
      rear: { distance: { value: 10, unit: "ft" }, governedBy: "25-2-492", note: null, provenance: PROV({ atomDids: [{ did: "did:atom:4", label: "25-2-492" }] }) },
      cornerSide: null,
    },
    provenance: PROV(),
  },
  envelope: {
    kind: "modelled",
    rings: [],
    setbacksUsed: baseSheet({}).setbacks as never,
    disclosure: "buildable area withheld pending an atom",
    approximate: true,
    provenance: PROV(),
  },
  flood: {
    state: "present",
    value: { zones: [{ zone: "X", subtype: null, isSfha: false, areaShare: null }], primaryZone: "X", inSfha: false, baseFloodElevation: null },
    provenance: PROV({ atomDids: [{ did: "did:atom:5", label: "NFHL" }] }),
  },
});

/** 48021:10101 — 1795 Old Hwy 20, McDade (Bastrop, real, live-checked):
 *  unincorporated, so the county genuinely carries no zoning or setbacks —
 *  a real "not-applicable" absence, not a data gap this app failed to fill. */
const bastropFixture = baseSheet({
  zoning: {
    state: "absent-covered",
    reason: "unincorporated parcel — county does not zone land outside city limits",
    provenance: PROV(),
  },
  setbacks: {
    state: "absent-covered",
    reason: "unincorporated parcel — county does not zone land outside city limits",
    provenance: PROV(),
  },
  envelope: { kind: "not-derived", reason: "no setbacks to derive from", missing: ["setbacks"] },
  flood: {
    state: "present",
    value: { zones: [{ zone: "X", subtype: null, isSfha: false, areaShare: null }], primaryZone: "X", inSfha: false, baseFloodElevation: null },
    provenance: PROV(),
  },
});

/** 48209:103421 — 10855 FM 150, Driftwood (Hays, real, live-checked): the
 *  same unincorporated shape as the Bastrop tract, a different county. */
const haysFixture = baseSheet({
  zoning: {
    state: "absent-covered",
    reason: "unincorporated parcel — county does not zone land outside city limits",
    provenance: PROV(),
  },
  setbacks: {
    state: "absent-covered",
    reason: "unincorporated parcel — county does not zone land outside city limits",
    provenance: PROV(),
  },
  envelope: { kind: "not-derived", reason: "no setbacks to derive from", missing: ["setbacks"] },
  flood: {
    state: "present",
    value: { zones: [{ zone: "X", subtype: null, isSfha: false, areaShare: null }], primaryZone: "X", inSfha: false, baseFloodElevation: null },
    provenance: PROV(),
  },
});

describe("xrayRows", () => {
  it("Austin: renders real zoning and setback values with citations, and honestly withholds the envelope figure", () => {
    const rows = xrayRows(austinFixture);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

    expect(byLabel["Zoning district"]).toMatchObject({ state: "present", value: "SF-3" });
    expect(byLabel["Zoning district"]?.citation?.text).toBe("25-2-492");
    expect(byLabel["Front setback"]).toMatchObject({ state: "present", value: "25 ft" });
    expect(byLabel["Side setback"]).toMatchObject({ state: "present", value: "5 ft" });
    expect(byLabel["Rear setback"]).toMatchObject({ state: "present", value: "10 ft" });
    // cornerSide is null (not a corner lot) — the row must not appear at all,
    // never render as an absence for a concept that does not apply here.
    expect(byLabel["Corner side setback"]).toBeUndefined();

    // The one field this real parcel's own record does not carry yet: the
    // buildable-envelope figure is structurally withheld (kind "modelled",
    // not "derived"), and the row must render the honest absent case.
    expect(byLabel["Buildable envelope"]).toEqual({ label: "Buildable envelope", state: "absent" });
  });

  it("Bastrop tract: zoning and setbacks are absent for a real, named reason — never a fabricated district", () => {
    const rows = xrayRows(bastropFixture);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel["Zoning district"]).toEqual({ label: "Zoning district", state: "absent" });
    expect(byLabel["Setbacks"]).toEqual({ label: "Setbacks", state: "absent" });
    expect(byLabel["Buildable envelope"]).toEqual({ label: "Buildable envelope", state: "absent" });
    // No per-axis setback rows when the whole determination is absent.
    expect(byLabel["Front setback"]).toBeUndefined();
  });

  it("Hays corridor lot: the same unincorporated absence, independently fixtured", () => {
    const rows = xrayRows(haysFixture);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel["Zoning district"]).toEqual({ label: "Zoning district", state: "absent" });
    expect(byLabel["Setbacks"]).toEqual({ label: "Setbacks", state: "absent" });
  });

  it("renders a corner setback row only when the axis is governed (not null)", () => {
    const withCorner = baseSheet({
      setbacks: {
        state: "present",
        value: {
          front: { distance: { value: 25, unit: "ft" }, governedBy: null, note: null, provenance: PROV() },
          side: { distance: { value: 5, unit: "ft" }, governedBy: null, note: null, provenance: PROV() },
          rear: { distance: { value: 10, unit: "ft" }, governedBy: null, note: null, provenance: PROV() },
          cornerSide: { distance: { value: 15, unit: "ft" }, governedBy: null, note: null, provenance: PROV() },
        },
        provenance: PROV(),
      },
    });
    const rows = xrayRows(withCorner);
    const corner = rows.find((r) => r.label === "Corner side setback");
    expect(corner).toMatchObject({ state: "present", value: "15 ft" });
  });

  it("a governed axis with no set number renders absent, not a fabricated 0", () => {
    const notSpecified = baseSheet({
      setbacks: {
        state: "present",
        value: {
          front: { distance: null, governedBy: "some-rule", note: "not specified", provenance: PROV() },
          side: { distance: { value: 5, unit: "ft" }, governedBy: null, note: null, provenance: PROV() },
          rear: { distance: { value: 10, unit: "ft" }, governedBy: null, note: null, provenance: PROV() },
          cornerSide: null,
        },
        provenance: PROV(),
      },
    });
    const rows = xrayRows(notSpecified);
    const front = rows.find((r) => r.label === "Front setback");
    expect(front).toEqual({ label: "Front setback", state: "absent" });
  });
});

describe("floodRows", () => {
  it("Austin: flood zone X present, base flood elevation and share honestly absent", () => {
    const rows = floodRows(austinFixture);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel["Flood zone"]).toMatchObject({ state: "present", value: "X" });
    expect(byLabel["Base flood elevation"]).toEqual({ label: "Base flood elevation", state: "absent" });
    expect(byLabel["Special flood hazard area (SFHA)"]).toMatchObject({ state: "present", value: "No" });
    expect(byLabel["Share of parcel in zone X"]).toEqual({ label: "Share of parcel in zone X", state: "absent" });
  });

  it("a wholly absent flood determination renders one honest row, never an invented zone", () => {
    const noFlood = baseSheet({ flood: { state: "unresolved", reason: "upstream timeout", retryable: true } });
    const rows = floodRows(noFlood);
    expect(rows).toEqual([{ label: "Flood zone", state: "absent" }]);
  });

  it("a served base flood elevation renders its real value and citation", () => {
    const withBfe = baseSheet({
      flood: {
        state: "present",
        value: {
          zones: [{ zone: "AE", subtype: null, isSfha: true, areaShare: 0.18 }],
          primaryZone: "AE",
          inSfha: true,
          baseFloodElevation: { value: 458, unit: "ft" },
        },
        provenance: PROV({ atomDids: [{ did: "did:atom:9", label: "FIRM" }] }),
      },
    });
    const rows = floodRows(withBfe);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel["Base flood elevation"]).toMatchObject({ state: "present", value: "458 ft" });
    expect(byLabel["Special flood hazard area (SFHA)"]).toMatchObject({ state: "present", value: "Yes" });
    expect(byLabel["Share of parcel in zone AE"]).toMatchObject({ state: "present", value: "18%" });
  });
});

describe("terrainRows", () => {
  it("every sample parcel: this app's resolver does not derive site conditions yet, so every terrain field is honestly absent for all three", () => {
    for (const fixture of [austinFixture, bastropFixture, haysFixture]) {
      const rows = terrainRows(fixture);
      expect(rows).toEqual([
        { label: "High point", state: "absent" },
        { label: "Low point", state: "absent" },
        { label: "Contour interval", state: "absent" },
      ]);
    }
  });

  it("would render real elevation figures if the resolver ever populates site conditions (not vacuous)", () => {
    const withSite = baseSheet({
      site: {
        elevationRange: { min: { value: 455, unit: "ft" }, max: { value: 466, unit: "ft" }, datum: "NAVD88" },
        contourInterval: { value: 2, unit: "ft" },
        frontage: { state: "absent-uncovered", reason: "n/a", wouldBeFilledBy: "n/a" },
      },
    });
    const rows = terrainRows(withSite);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel["High point"]).toMatchObject({ state: "present", value: "466 ft" });
    expect(byLabel["Low point"]).toMatchObject({ state: "present", value: "455 ft" });
    expect(byLabel["Contour interval"]).toMatchObject({ state: "present", value: "2 ft" });
  });
});

describe("citationFor", () => {
  it("prefers the atom's own label over the source label", () => {
    const c = citationFor(PROV({ sourceLabel: "flood-hazard-fact atom", atomDids: [{ did: "d1", label: "44 CFR 64.3" }] }));
    expect(c).toEqual({ text: "44 CFR 64.3", href: null });
  });

  it("falls back to the source label when no atom carries one, and threads a real link when sourceUrl exists", () => {
    const c = citationFor(PROV({ sourceLabel: "County appraisal roll", sourceUrl: "https://example.gov/record" }));
    expect(c).toEqual({ text: "County appraisal roll", href: "https://example.gov/record" });
  });
});
