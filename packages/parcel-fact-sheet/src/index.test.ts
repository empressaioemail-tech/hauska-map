// packages/parcel-fact-sheet/src/index.test.ts
//
// The two contract implementations, tested against the DEFECTS that produced
// the contract (2026-08-18 QA pass), not against their own prose:
//
//   - one X-ray PDF printed "Zone AO" on sheet 1 and "Flood zone AE" on
//     sheet 4  ->  a multi-zone determination must name EVERY zone (I6);
//   - the same PDF said "buildable envelope not derived here" on sheet 1 and
//     measured 6,325 sq ft on sheet 4  ->  the three envelope outcomes are
//     exclusive variants of ONE field, so a verdict can only ever speak one;
//   - three grey "not verified here" rows read as errors  ->  a FAILED lookup
//     must not share wording or tone with an honest absence (I4);
//   - elevation printed in metres beside a layer control that said feet  ->
//     formatMeasurement is the only place a measurement becomes text (I6).

import { describe, expect, it } from "vitest";
import {
  composeVerdict,
  composeVerdictTone,
  formatMeasurement,
  isFailure,
  isPresent,
  type BuildableEnvelope,
  type Fact,
  type FloodDetermination,
  type AtomRef,
  type ParcelFactSheet,
  type Provenance,
  type ResolveResult,
  type Setbacks,
  type UnplaceableParcel,
} from "./index";

const PROV: Provenance = {
  source: "cad-roll",
  sourceLabel: "Bastrop County appraisal roll",
  vintage: "data-export-01.14.2026",
  method: null,
  retrievedAt: "2026-08-18T00:00:00.000Z",
  confidence: null,
  confidenceBasis: "asserted",
  sourceUrl: null,
  // AMENDMENT 1: an EMPTY array means no atom backs this fact, which is itself
  // worth rendering. It never means "unknown".
  atomDids: [],
};

/**
 * AMENDMENT 1: an axis carries its governance, note and provenance.
 * AMENDMENT 2: `distance` is NULLABLE — a governed axis with no scalar.
 */
function axis(
  ft: number | null,
  governedBy: string | null = null,
  note: string | null = null,
) {
  return {
    distance: ft === null ? null : { value: ft, unit: "ft" as const },
    governedBy,
    note,
    provenance: PROV,
  };
}

const SETBACKS: Setbacks = {
  front: axis(25),
  side: axis(5),
  rear: axis(10),
  cornerSide: null,
};

const DERIVED_ENVELOPE: BuildableEnvelope = {
  kind: "derived",
  area: { value: 6325, unit: "sqft" },
  areaPctOfLot: 58,
  rings: [],
  setbacksUsed: SETBACKS,
  subtractions: [],
  approximate: false,
  provenance: PROV,
};

function sheet(overrides: Partial<ParcelFactSheet> = {}): ParcelFactSheet {
  return {
    factSheetId: "fs_test",
    resolverVersion: "test-1",
    sealedAt: "2026-08-18T00:00:00.000Z",
    identity: {
      parcelNodeId: "48021:36521",
      county: { fips: "48021", name: "Bastrop" },
      apn: { state: "present", value: "R12345", provenance: PROV },
      situsAddress: {
        state: "absent-covered",
        reason: "no situs address on the county roll for this parcel",
        provenance: PROV,
      },
      owner: {
        state: "absent-covered",
        reason: "owner is never served",
        provenance: PROV,
      },
    },
    geometry: {
      rings: [],
      centroid: { lat: 30.1105, lng: -97.3184 },
      bbox: [-97.32, 30.11, -97.31, 30.12],
      lotArea: { value: 10906, unit: "sqft" },
      crs: "EPSG:4326",
    },
    landUse: {
      state: "present",
      value: { code: "A1", description: "Single-family residential" },
      provenance: PROV,
    },
    zoning: {
      state: "present",
      value: { code: "R-1", name: "Single family", jurisdiction: "bastrop_city_tx" },
      provenance: PROV,
    },
    setbacks: { state: "present", value: SETBACKS, provenance: PROV },
    envelope: DERIVED_ENVELOPE,
    flood: {
      state: "present",
      value: {
        zones: [{ zone: "X", subtype: null, isSfha: false, areaShare: 1 }],
        primaryZone: "X",
        inSfha: false,
        baseFloodElevation: null,
      },
      provenance: PROV,
    },
    site: {
      elevationRange: null,
      contourInterval: null,
      frontage: {
        state: "absent-uncovered",
        reason: "road centerlines are not stamped for this county",
        wouldBeFilledBy: "road-node ingest for 48021",
      },
    },
    verdict: "",
    ...overrides,
  };
}

const floodFact = (value: FloodDetermination): Fact<FloodDetermination> => ({
  state: "present",
  value,
  provenance: PROV,
});

describe("Fact state guards", () => {
  it("separates a FAILED lookup from an honest absence (I4)", () => {
    const failed: Fact<string> = {
      state: "unresolved",
      reason: "facets upstream 503",
      retryable: true,
    };
    const absent: Fact<string> = {
      state: "absent-uncovered",
      reason: "zoning is not stamped here",
      wouldBeFilledBy: "city zoning layer for 48021",
    };
    expect(isFailure(failed)).toBe(true);
    expect(isFailure(absent)).toBe(false);
    expect(isPresent(absent)).toBe(false);
  });
});

describe("composeVerdict — the ONE headline", () => {
  it("earns the clean tail only when every core fact is present and clean", () => {
    const s = sheet();
    expect(composeVerdict(s)).toBe(
      "Buildable, 58% of the lot · outside mapped flood hazard · zoned R-1 · single-family residential per county record — no red flags.",
    );
    expect(composeVerdictTone(s)).toBe("clear");
  });

  it("never earns the clean tail when a fact is honestly absent", () => {
    const s = sheet({
      zoning: {
        state: "absent-uncovered",
        reason: "no zoning stamp here",
        wouldBeFilledBy: "city zoning layer",
      },
    });
    const line = composeVerdict(s);
    expect(line).toContain("zoning not verified here");
    expect(line).not.toContain("no red flags");
    expect(composeVerdictTone(s)).toBe("caution");
  });

  it("never earns the clean tail when a lookup FAILED", () => {
    const s = sheet({
      flood: { state: "unresolved", reason: "NFHL timeout", retryable: true },
    });
    const line = composeVerdict(s);
    // "could not be checked" is an ERROR sentence, distinct from the
    // honest-absence "not verified here" wording (I4).
    expect(line).toContain("flood could not be checked");
    expect(line).not.toContain("flood not verified here");
    expect(line).not.toContain("no red flags");
    expect(composeVerdictTone(s)).toBe("caution");
  });

  it("leads with the red flag and stamps tone flag when inside the SFHA", () => {
    const s = sheet({
      flood: floodFact({
        zones: [{ zone: "AE", subtype: null, isSfha: true, areaShare: 1 }],
        primaryZone: "AE",
        inSfha: true,
        baseFloodElevation: { value: 412.5, unit: "ft" },
      }),
    });
    expect(composeVerdict(s)).toBe(
      "Inside the FEMA flood hazard area (Zone AE) · buildable, 58% of the lot · zoned R-1 · single-family residential per county record.",
    );
    expect(composeVerdictTone(s)).toBe("flag");
  });

  it("names EVERY zone when a parcel is in more than one (I6)", () => {
    // The exact defect: sheet 1 said AO, sheet 4 said AE, same parcel.
    const s = sheet({
      flood: floodFact({
        zones: [
          { zone: "AE", subtype: null, isSfha: true, areaShare: 0.62 },
          { zone: "AO", subtype: null, isSfha: true, areaShare: 0.3 },
          { zone: "X500", subtype: null, isSfha: false, areaShare: 0.08 },
        ],
        primaryZone: "AE",
        inSfha: true,
        baseFloodElevation: null,
      }),
    });
    const line = composeVerdict(s);
    expect(line).toContain("(Zones AE, AO and X500)");
    expect(line).toContain("Inside the FEMA flood hazard area");
  });

  it("calls a 500-year-only parcel a mapped zone outside the SFHA", () => {
    const s = sheet({
      flood: floodFact({
        zones: [{ zone: "X500", subtype: null, isSfha: false, areaShare: 1 }],
        primaryZone: "X500",
        inSfha: false,
        baseFloodElevation: null,
      }),
    });
    const line = composeVerdict(s);
    expect(line).toContain("in a mapped FEMA flood zone (Zone X500), outside the SFHA");
    expect(composeVerdictTone(s)).toBe("caution");
  });

  it("cannot say 'not derived' and carry an area at the same time (I2)", () => {
    const notDerived = sheet({
      envelope: {
        kind: "not-derived",
        reason: "no setback table for this district",
        missing: ["setbacks"],
      },
    });
    const derived = sheet();
    expect(composeVerdict(notDerived)).toContain(
      "Buildable envelope not derived here (missing setbacks)",
    );
    expect(composeVerdict(notDerived)).not.toMatch(/\d+% of the lot/);
    expect(composeVerdict(derived)).toContain("58% of the lot");
    expect(composeVerdict(derived)).not.toContain("not derived");
  });

  it("says a consumed lot plainly, never softened", () => {
    const s = sheet({
      envelope: {
        kind: "consumed",
        reason: "setbacks exceed the lot",
        setbacksUsed: SETBACKS,
        provenance: PROV,
      },
    });
    expect(composeVerdict(s)).toContain("No buildable area after setbacks");
    expect(composeVerdictTone(s)).toBe("caution");
  });

  it("marks an approximate envelope as a caution", () => {
    const s = sheet({
      envelope: { ...DERIVED_ENVELOPE, approximate: true },
    });
    expect(composeVerdict(s)).toContain("Buildable (approximate), 58% of the lot");
    expect(composeVerdictTone(s)).toBe("caution");
  });

  it("is pure — same sheet, same sentence", () => {
    const s = sheet();
    expect(composeVerdict(s)).toBe(composeVerdict(s));
  });
});

describe("formatMeasurement — the ONE formatter", () => {
  it("formats US lengths and areas", () => {
    expect(formatMeasurement({ value: 25, unit: "ft" }, "us")).toBe("25 ft");
    expect(formatMeasurement({ value: 6325, unit: "sqft" }, "us")).toBe("6,325 sq ft");
    // 705 vs 707 Laurel from the contract: 0.2345 vs 0.2519 ac.
    expect(formatMeasurement({ value: 0.2519, unit: "acre" }, "us")).toBe("0.252 ac");
  });

  it("converts rather than relabelling when the system flips", () => {
    // The DXF-into-a-Revit-US-template defect: the number must change with
    // the unit word, never just the word.
    expect(formatMeasurement({ value: 10, unit: "m" }, "us")).toBe("32.8 ft");
    expect(formatMeasurement({ value: 100, unit: "ft" }, "metric")).toBe("30.5 m");
    expect(formatMeasurement({ value: 1076.391, unit: "sqft" }, "metric")).toBe("100 m²");
    expect(formatMeasurement({ value: 1, unit: "acre" }, "metric")).toBe("0.405 ha");
  });

  it("groups thousands without a locale", () => {
    expect(formatMeasurement({ value: 1234567, unit: "sqft" }, "us")).toBe(
      "1,234,567 sq ft",
    );
  });

  it("never prints a non-finite value as zero", () => {
    expect(formatMeasurement({ value: Number.NaN, unit: "ft" }, "us")).toBe(
      "not measured",
    );
    expect(
      formatMeasurement({ value: Number.POSITIVE_INFINITY, unit: "sqft" }, "us"),
    ).toBe("not measured");
  });
});

// ---------------------------------------------------------------------------
// AMENDMENT 1 (2026-08-18, planner).
// ---------------------------------------------------------------------------

describe("AMENDMENT 1 — the types the shipped card needs", () => {
  it("lets a fact name the atoms behind it, empty meaning none rather than unknown", () => {
    const s = sheet();
    if (s.zoning.state !== "present") throw new Error("unreachable");
    expect(s.zoning.provenance.atomDids).toEqual([]);
    const backed = {
      ...s.zoning.provenance,
      atomDids: [
        { did: "did:atom:zoning-1", label: null },
        { did: "did:atom:code-1", label: "4.2.1" },
      ],
    };
    expect(backed.atomDids).toHaveLength(2);
  });

  it("lets a setback axis carry its governing rule and X-ray note", () => {
    const front = axis(25, "C-1 governs (§4.2.1)", "Measured from the ROW line.");
    expect(front.distance).toEqual({ value: 25, unit: "ft" });
    expect(front.governedBy).toBe("C-1 governs (§4.2.1)");
    expect(front.note).toBe("Measured from the ROW line.");
  });

  it("expresses a NOT-SPECIFIED axis as NULL, never as a sentinel (AMENDMENT 2)", () => {
    // The absence lives in the TYPE. Amendment 1 forced a non-finite carrier,
    // which was refused because the next implementer reads NaN as a bug and
    // "fixes" it to 0 — printing a 0 ft setback and producing exactly the
    // build-to-line error this treatment exists to prevent.
    const notSpecified = axis(null, "build-to-line governs (§3.1)");
    expect(notSpecified.distance).toBeNull();
    expect(notSpecified.governedBy).toBe("build-to-line governs (§3.1)");
    // A specified axis is unaffected and still formats through the ONE formatter.
    const specified = axis(25);
    expect(specified.distance).not.toBeNull();
    expect(formatMeasurement(specified.distance!, "us")).toBe("25 ft");
  });

  it("carries an atom's display LABEL beside its id (AMENDMENT 2)", () => {
    // The shipped chip renders a code section AS its section number, so a bare
    // id list degraded those chips to unlabelled.
    const refs: AtomRef[] = [
      { did: "did:atom:setback-1", label: null },
      { did: "did:atom:code-1", label: "4.2.1" },
    ];
    expect(refs[0].label).toBeNull();
    expect(refs[1].label).toBe("4.2.1");
    // A null label is a real state the renderer can handle. It is never a
    // guessed label the renderer cannot tell from a real one.
    expect(refs.every((r) => r.label !== undefined)).toBe(true);
  });

  it("keeps an unplaceable parcel structurally distinct from a sheet", () => {
    const unplaceable: UnplaceableParcel = {
      kind: "unplaceable",
      parcelNodeId: "48021:36521",
      identity: sheet().identity,
      reason: "No boundary or coordinate is on file for this parcel.",
      wouldBeFilledBy: "parcel geometry for Bastrop County (48021)",
    };
    const results: ResolveResult[] = [
      { kind: "sheet", ...sheet() },
      unplaceable,
    ];
    // The discriminant is the whole point: an unplaceable parcel can never be
    // mistaken for a sheet, so nothing downstream needs a geometry null check.
    const sheets = results.filter((r) => r.kind === "sheet");
    expect(sheets).toHaveLength(1);
    expect("geometry" in unplaceable).toBe(false);
    // An honest absence that cannot say what would fill it is just empty.
    expect(unplaceable.wouldBeFilledBy).not.toBe("");
  });
});
