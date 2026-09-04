// apps/property-explorer/src/lib/sheet-to-card-model.test.ts
//
// The inspect card's data source (I2). These tests exist to prove the swap did
// not silently delete anything: the card used to run two fetches of its own,
// and the two features that blocked the swap under contract v1 — the AtomChip
// provenance popovers and the setback X-ray disclosure — must survive it.

import { describe, expect, it } from "vitest";
import type {
  AtomRef,
  ParcelFactSheet,
  Provenance,
  SetbackAxis,
} from "@empressaio/parcel-fact-sheet";
import {
  bakedCardModelFromSheet,
  envelopeStateFromSheet,
  provenanceRefsFromSheet,
  setbackDisplayFromSheet,
  setbackFieldNotesFromSheet,
  floodFacetFromSheet,
  pipelineFacetFromSheet,
  specialDistrictFacetFromSheet,
  wellFacetFromSheet,
  footprintFacetFromSheet,
  boundaryFacetFromSheet,
  ownerFacetFromSheet,
  cityLimitsFacetFromSheet,
  schoolDistrictFacetFromSheet,
  utilityServiceFacetFromSheet,
  overlayDistrictsFacetFromSheet,
  agValuationFacetFromSheet,
  maxImperviousCoverPctFacetFromSheet,
} from "./sheet-to-card-model";
import {
  FLOOD_HAZARD_FACT_MISSING_REASON,
  CITY_LIMITS_FACT_MISSING_REASON,
  SCHOOL_DISTRICT_FACT_MISSING_REASON,
  UTILITY_SERVICE_FACT_MISSING_REASON,
  OVERLAY_DISTRICTS_FACT_MISSING_REASON,
  AG_VALUATION_FACT_MISSING_REASON,
  MAX_IMPERVIOUS_COVER_PCT_FACT_MISSING_REASON,
} from "./baked-facets";

function prov(atomDids: AtomRef[] = []): Provenance {
  return {
    source: "cad-roll",
    sourceLabel: "Bastrop County appraisal roll",
    vintage: "2026",
    method: null,
    retrievedAt: "2026-08-01T00:00:00.000Z",
    confidence: null,
    confidenceBasis: "asserted",
    sourceUrl: null,
    atomDids,
  };
}

/** AMENDMENT 2: `distance` is NULLABLE - a governed axis with no scalar. */
function axis(
  ft: number | null,
  governedBy: string | null = null,
  note: string | null = null,
): SetbackAxis {
  return {
    distance: ft === null ? null : { value: ft, unit: "ft" },
    governedBy,
    note,
    provenance: prov(),
  };
}

function sheet(over: Partial<ParcelFactSheet> = {}): ParcelFactSheet {
  return {
    factSheetId: "fs_abc123",
    resolverVersion: "pe-fact-sheet-1",
    sealedAt: "2026-08-18T00:00:00.000Z",
    identity: {
      parcelNodeId: "48021:36521",
      county: { fips: "48021", name: "Bastrop" },
      apn: { state: "present", value: "R12345", provenance: prov() },
      situsAddress: { state: "present", value: "1503 Farm St", provenance: prov() },
      owner: {
        state: "absent-uncovered",
        reason: "owner is not served on the public tier",
        wouldBeFilledBy: "the paid owner facet",
      },
    },
    geometry: {
      rings: [],
      centroid: { lat: 30.1105, lng: -97.3184 },
      bbox: [-97.32, 30.11, -97.31, 30.12],
      lotArea: { value: 10890, unit: "sqft" },
      crs: "EPSG:4326",
    },
    landUse: {
      state: "present",
      value: { code: "A1", description: "Single-family residential" },
      provenance: prov(),
    },
    zoning: {
      state: "present",
      value: { code: "R-1", name: null, jurisdiction: "bastrop_city_tx" },
      provenance: prov([{ did: "did:atom:zoning-1", label: null }]),
    },
    setbacks: {
      state: "present",
      value: {
        front: axis(25, null, "Measured from the right-of-way line."),
        side: axis(5),
        rear: axis(10),
        cornerSide: null,
      },
      provenance: prov([
        { did: "did:atom:setback-1", label: null },
        { did: "did:atom:code-1", label: "4.2.1" },
      ]),
    },
    envelope: {
      kind: "derived",
      area: { value: 6325, unit: "sqft" },
      areaPctOfLot: 58,
      rings: [],
      setbacksUsed: {
        front: axis(25),
        side: axis(5),
        rear: axis(10),
        cornerSide: null,
      },
      subtractions: [],
      approximate: true,
      provenance: prov([{ did: "did:atom:envelope-1", label: null }]),
    },
    flood: {
      state: "absent-covered",
      reason: "no determination",
      provenance: prov(),
    },
    site: {
      elevationRange: null,
      contourInterval: null,
      frontage: {
        state: "absent-uncovered",
        reason: "not derived",
        wouldBeFilledBy: "road-node ingest",
      },
    },
    verdict: "Buildable, 58% of the lot.",
    ...over,
  };
}

describe("bakedCardModelFromSheet — the card's rows", () => {
  const model = bakedCardModelFromSheet(sheet());

  it("keeps the value clean and the provenance a SIBLING (I3)", () => {
    // formatLandUseDisplay used to return "A1 — Single-family residential
    // (cad-roll · 2026)" as ONE string, so the UI physically could not separate
    // the fact from its sourcing.
    expect(model.landUse.value).toBe("A1 — Single-family residential");
    expect(model.landUse.value).not.toContain("cad-roll");
    expect(model.provenance.landUseSource).toBe("cad-roll");
    expect(model.acreage.value).toBe("0.25 ac");
    expect(model.acreage.value).not.toContain("cad-roll");
  });

  it("can never say the county is unavailable", () => {
    expect(model.county).toEqual({
      state: "present",
      value: "Bastrop County (48021)",
    });
  });

  it("uses the sheet id as the cross-surface agreement token", () => {
    // Two surfaces showing the same parcel with different tokens is now a
    // defect the reader can see.
    expect(model.buildableAgreementToken).toBe("fs_abc123");
  });

  it("treats a FAILED read as pending, never as 'not verified here' (I4)", () => {
    const failed = bakedCardModelFromSheet(
      sheet({
        zoning: {
          state: "unresolved",
          reason: "the zoning atom chain has not resolved yet",
          retryable: true,
        },
      }),
    );
    expect(failed.zoning.state).toBe("pending");
    expect(failed.zoning.value).toContain("has not resolved");
  });

  it("keeps an honest absence honest, with its own reason", () => {
    const absent = bakedCardModelFromSheet(
      sheet({
        zoning: {
          state: "absent-uncovered",
          reason: "no zoning stamp reaches this parcel",
          wouldBeFilledBy: "a zoning stamp for 48021",
        },
      }),
    );
    expect(absent.zoning.state).toBe("absent");
    expect(absent.zoning.value).toBe("no zoning stamp reaches this parcel");
  });
});

describe("the two features that blocked the swap under contract v1", () => {
  it("SURVIVES: the setback X-ray notes, per axis (AMENDMENT 1)", () => {
    const notes = setbackFieldNotesFromSheet(
      (sheet().setbacks as { value: never }).value,
    );
    expect(notes?.front).toBe("Measured from the right-of-way line.");
    // An axis with no note contributes nothing rather than an empty row.
    expect(notes?.side).toBeNull();
  });

  it("SURVIVES: the AtomChip provenance refs (AMENDMENT 1)", () => {
    const refs = provenanceRefsFromSheet(sheet());
    expect(refs?.zoning).toEqual({ atomDid: "did:atom:zoning-1" });
    expect(refs?.setback).toEqual({ atomDid: "did:atom:setback-1" });
    expect(refs?.envelope).toEqual({ atomDid: "did:atom:envelope-1" });
    // AMENDMENT 2: the code-section chip keeps its SECTION NUMBER as its label,
    // which is what the shipped renderer reads it as. No label is inferred.
    expect(refs?.codeSections?.[0]).toEqual({
      atomDid: "did:atom:code-1",
      sectionNumber: "4.2.1",
    });
  });

  it("renders NO chips when no atom backs the facts, rather than fake ones", () => {
    const bare = provenanceRefsFromSheet(
      sheet({
        zoning: {
          state: "present",
          value: { code: "R-1", name: null, jurisdiction: "x" },
          provenance: prov(),
        },
        setbacks: {
          state: "present",
          value: {
            front: axis(25),
            side: axis(5),
            rear: axis(10),
            cornerSide: null,
          },
          provenance: prov(),
        },
        envelope: {
          kind: "not-derived",
          reason: "no setback table",
          missing: ["setbacks"],
        },
      }),
    );
    expect(bare).toBeNull();
  });
});

describe("setbackDisplayFromSheet", () => {
  it("formats specified axes through the ONE formatter", () => {
    expect(
      setbackDisplayFromSheet({
        front: axis(25),
        side: axis(5),
        rear: axis(10),
        cornerSide: null,
      }),
    ).toBe("F 25 ft · S 5 ft · R 10 ft");
  });

  it("routes a NOT-SPECIFIED axis to its governing rule, never to 0 ft", () => {
    const line = setbackDisplayFromSheet({
      front: axis(null, "C-1 governs (§4.2.1)"),
      side: axis(5),
      rear: axis(10),
      cornerSide: null,
    });
    expect(line).toBe("F C-1 governs (§4.2.1) · S 5 ft · R 10 ft");
    expect(line).not.toContain("F 0");
  });

  it("says 'not specified' when there is no rule to route to either", () => {
    const line = setbackDisplayFromSheet({
      front: axis(null),
      side: axis(5),
      rear: axis(10),
      cornerSide: null,
    });
    expect(line).toContain("F not specified");
    expect(line).not.toContain("F 0");
  });

  it("names a corner side only when it differs from the interior side", () => {
    expect(
      setbackDisplayFromSheet({
        front: axis(25),
        side: axis(5),
        rear: axis(10),
        cornerSide: axis(15),
      }),
    ).toContain("Corner 15 ft");
  });
});

describe("envelopeStateFromSheet", () => {
  it("projects a derived envelope with its area and percentage", () => {
    const env = envelopeStateFromSheet(sheet());
    expect(env.status).toBe("ok");
    expect(env.summary?.buildableAreaSqFt).toBe(6325);
    expect(env.summary?.buildableAreaPct).toBe(58);
    expect(env.setbacks?.front_ft).toBe(25);
  });

  it("passes derived envelope rings through as geojson for map draw", () => {
    const ring: Array<[number, number]> = [
      [-97.3186, 30.1103],
      [-97.3182, 30.1103],
      [-97.3182, 30.1107],
      [-97.3186, 30.1107],
      [-97.3186, 30.1103],
    ];
    const env = envelopeStateFromSheet(
      sheet({
        envelope: {
          kind: "derived",
          area: { value: 4100, unit: "sqft" },
          areaPctOfLot: 38,
          rings: [ring],
          setbacksUsed: {
            front: axis(20),
            side: axis(5),
            rear: axis(20),
            cornerSide: null,
          },
          subtractions: [],
          approximate: true,
          provenance: prov(),
        },
      }),
    );
    expect(env.status).toBe("ok");
    expect(env.geometry?.type).toBe("Polygon");
    expect(env.geojson?.features?.[0]?.geometry?.type).toBe("Polygon");
    expect(env.summary?.buildableAreaSqFt).toBe(4100);
  });

  it("projects a consumed lot as empty, never as a 0 sq ft buildable area", () => {
    const env = envelopeStateFromSheet(
      sheet({
        envelope: {
          kind: "consumed",
          reason: "setbacks consume the lot",
          setbacksUsed: {
            front: axis(25),
            side: axis(5),
            rear: axis(10),
            cornerSide: null,
          },
          provenance: prov(),
        },
      }),
    );
    expect(env.status).toBe("empty");
    expect(env.summary).toBeUndefined();
    expect(env.reason).toContain("consume the lot");
    expect(env.parcelRing).toBeUndefined();
  });

  it("projects consumed lot parcelRing from sheet geometry for map outline", () => {
    const ring: Array<[number, number]> = [
      [-97.3186, 30.1103],
      [-97.3182, 30.1103],
      [-97.3182, 30.1107],
      [-97.3186, 30.1107],
      [-97.3186, 30.1103],
    ];
    const env = envelopeStateFromSheet(
      sheet({
        geometry: {
          rings: [ring],
          centroid: { lat: 30.1105, lng: -97.3184 },
          lotArea: { value: 10214, unit: "sqft" },
        },
        envelope: {
          kind: "consumed",
          reason: "setbacks consume the lot",
          setbacksUsed: {
            front: axis(25),
            side: axis(5),
            rear: axis(10),
            cornerSide: null,
          },
          provenance: prov(),
        },
      }),
    );
    expect(env.status).toBe("empty");
    expect((env.parcelRing as { type: string }).type).toBe("Polygon");
  });

  it("projects declined / not-derived as idle, never as a load error", () => {
    const env = envelopeStateFromSheet(
      sheet({
        envelope: {
          kind: "not-derived",
          reason: "no-zoning-stamp",
          missing: ["setbacks", "envelope-derivation"],
        },
        setbacks: {
          state: "absent-uncovered",
          reason: "no setback table covers this parcel's district",
          wouldBeFilledBy: "a ratified setback table for this jurisdiction",
        },
      }),
    );
    expect(env.status).toBe("idle");
    expect(env.status).not.toBe("error");
    expect(env.reason).toBe("no-zoning-stamp");
  });

  it("gold derived envelope still projects as ok", () => {
    const env = envelopeStateFromSheet(sheet());
    expect(env.status).toBe("ok");
    expect(env.summary?.buildableAreaSqFt).toBe(6325);
  });

  it("carries a not-specified axis as null rather than 0", () => {
    const env = envelopeStateFromSheet(
      sheet({
        setbacks: {
          state: "present",
          value: {
            front: axis(null, "build-to-line governs"),
            side: axis(5),
            rear: axis(10),
            cornerSide: null,
          },
          provenance: prov(),
        },
      }),
    );
    expect(env.setbacks?.front_ft).toBeNull();
    expect(env.setbacks?.side_ft).toBe(5);
  });
});

describe("AMENDMENT 2 - no guessed labels, no sentinels", () => {
  it("drops an UNLABELLED code-section ref rather than inventing a label", () => {
    // The earlier implementation inferred a label from the axis's governing
    // rule when there was exactly one. That is gone: a renderer cannot tell a
    // guessed label from a real one. The shipped chipsForRow already skips a
    // section carrying no sectionNumber, so this mirrors what it can draw.
    const refs = provenanceRefsFromSheet(
      sheet({
        setbacks: {
          state: "present",
          value: {
            front: axis(25, "C-1 governs (§4.2.1)"),
            side: axis(5),
            rear: axis(10),
            cornerSide: null,
          },
          provenance: prov([
            { did: "did:atom:setback-1", label: null },
            { did: "did:atom:unlabelled", label: null },
          ]),
        },
      }),
    );
    expect(refs?.setback).toEqual({ atomDid: "did:atom:setback-1" });
    expect(refs?.codeSections).toBeUndefined();
  });

  it("never reads a null distance as zero anywhere in the projection", () => {
    const s = sheet({
      setbacks: {
        state: "present",
        value: {
          front: axis(null, "build-to-line governs (§3.1)"),
          side: axis(null),
          rear: axis(10),
          cornerSide: null,
        },
        provenance: prov(),
      },
    });
    const model = bakedCardModelFromSheet(s);
    expect(model.setbacks.value).toBe(
      "F build-to-line governs (§3.1) · S not specified · R 10 ft",
    );
    // A bare-substring check would trip on "R 10 ft"; assert per axis instead.
    expect(model.setbacks.value).not.toContain("F 0 ft");
    expect(model.setbacks.value).not.toContain("S 0 ft");
    expect(model.setbacks.value).not.toContain("R 0 ft");
    const env = envelopeStateFromSheet(s);
    expect(env.setbacks?.front_ft).toBeNull();
    expect(env.setbacks?.side_ft).toBeNull();
    expect(env.setbacks?.rear_ft).toBe(10);
  });
});

describe("floodFacetFromSheet — InspectCard Flood row (WDLL 3)", () => {
  it("present Zone X", () => {
    const facet = floodFacetFromSheet({
      state: "present",
      value: {
        zones: [{ zone: "X", subtype: null, isSfha: false, areaShare: null }],
        primaryZone: "X",
        inSfha: false,
        baseFloodElevation: null,
      },
      provenance: prov(),
    });
    expect(facet).toEqual({ state: "present", value: "Zone X" });
    expect(bakedCardModelFromSheet(sheet({
      flood: {
        state: "present",
        value: {
          zones: [{ zone: "X", subtype: null, isSfha: false, areaShare: null }],
          primaryZone: "X",
          inSfha: false,
          baseFloodElevation: null,
        },
        provenance: prov(),
      },
    })).flood).toEqual({ state: "present", value: "Zone X" });
  });

  it("missing floodHazardFact hides the row (unknown)", () => {
    expect(
      floodFacetFromSheet({
        state: "absent-uncovered",
        reason: FLOOD_HAZARD_FACT_MISSING_REASON,
        wouldBeFilledBy: "a flood-hazard-fact atom on this parcel",
      }),
    ).toEqual({ state: "unknown", value: null });
  });

  it("named refusal is pending with the code, never a silent null", () => {
    expect(
      floodFacetFromSheet({
        state: "unresolved",
        reason: "atoms-store-not-configured",
        retryable: false,
      }),
    ).toEqual({ state: "pending", value: "atoms-store-not-configured" });
  });
});

describe("landUseFact inspect row (WDLL 5 leftover)", () => {
  it("present gold uses landUseCode with source=land-use-fact", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        landUse: {
          state: "present",
          value: { code: "A1", description: "Single-family residential" },
          provenance: {
            ...prov(),
            source: "land-use-fact",
            sourceLabel: "land-use-fact atom",
          },
        },
      }),
    );
    expect(model.landUse).toEqual({
      state: "present",
      value: "A1 — Single-family residential",
    });
    expect(model.provenance.landUseSource).toBe("land-use-fact");
    expect(model.landUse.value).not.toContain("cad-roll");
  });

  it("cad-roll-only bake does not claim the atom (retiredStore)", () => {
    const model = bakedCardModelFromSheet(sheet());
    expect(model.provenance.landUseSource).toBe("cad-roll");
    expect(model.provenance.landUseSource).not.toBe("land-use-fact");
  });
});

describe("specialDistrictFact inspect row (P-48 / WDLL 1)", () => {
  it("present fixture shows MUD — The Colony MUD 1C", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        specialDistrict: {
          state: "present",
          value: { districtType: "MUD", districtName: "The Colony MUD 1C" },
          provenance: {
            ...prov(),
            source: "special-district-fact",
            sourceLabel: "special-district-fact atom",
          },
        },
      }),
    );
    expect(model.specialDistrict).toEqual({
      state: "present",
      value: "MUD — The Colony MUD 1C",
    });
    expect(model.specialDistrict.value).toContain("The Colony MUD 1C");
  });

  it("gold-shaped absent fixture does not render a district name", () => {
    const facet = specialDistrictFacetFromSheet({
      state: "absent-covered",
      reason: "outside-tceq-source-boundaries",
      provenance: {
        ...prov(),
        source: "special-district-fact",
        sourceLabel: "special-district-fact atom",
      },
    });
    expect(facet.state).toBe("absent");
    expect(facet.value).toBe("outside-tceq-source-boundaries");
    expect(JSON.stringify(facet)).not.toMatch(/The Colony/);
    expect(JSON.stringify(facet)).not.toMatch(/MUD 1C/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(specialDistrictFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(bakedCardModelFromSheet(sheet()).specialDistrict).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("pipelineFact inspect row (P-49 / WDLL 3)", () => {
  it("present-near fixture shows t4permit=05781", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        pipeline: {
          state: "present",
          value: {
            nearPipeline: true,
            operatorName: "ENERGY TRANSFER COMPANY",
            t4permit: "05781",
            nearestPipelineDistanceMeters: 87.9,
            display: "ENERGY TRANSFER COMPANY · T-4 05781 · 87.9 m",
          },
          provenance: {
            ...prov(),
            source: "rrc-pipeline-fact",
            sourceLabel: "rrc-pipeline-fact atom",
          },
        },
      }),
    );
    expect(model.pipeline.state).toBe("present");
    expect(model.pipeline.value).toContain("05781");
    expect(model.pipeline.value).toContain("ENERGY TRANSFER COMPANY");
  });

  it("gold-shaped present-outside fixture does not render ENERGY TRANSFER", () => {
    const facet = pipelineFacetFromSheet({
      state: "present",
      value: {
        nearPipeline: false,
        operatorName: null,
        t4permit: null,
        nearestPipelineDistanceMeters: null,
        display: "outside pipeline buffer",
      },
      provenance: {
        ...prov(),
        source: "rrc-pipeline-fact",
        sourceLabel: "rrc-pipeline-fact atom",
      },
    });
    expect(facet.state).toBe("present");
    expect(facet.value).toBe("outside pipeline buffer");
    expect(JSON.stringify(facet)).not.toMatch(/ENERGY TRANSFER/);
    expect(JSON.stringify(facet)).not.toMatch(/PRAIRIE LEA/);
    expect(JSON.stringify(facet)).not.toMatch(/05781/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(pipelineFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(bakedCardModelFromSheet(sheet()).pipeline).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("wellFact inspect row (P-50 / WDLL 4)", () => {
  it("present fixture 48103:100 shows apiNumber14=42000001030000", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        well: {
          state: "present",
          value: {
            apiNumber14: "42000001030000",
            wellStatus: "dry",
            operatorName: null,
            parcelRelation: "on-parcel",
            display: "42000001030000 · dry",
          },
          provenance: {
            ...prov(),
            source: "well-fact",
            sourceLabel: "well-fact atom",
          },
        },
      }),
    );
    expect(model.well.state).toBe("present");
    expect(model.well.value).toContain("42000001030000");
    expect(model.well.value).not.toMatch(/ENERGY TRANSFER/);
  });

  it("gold-shaped atom-miss fixture does not render a well or :none", () => {
    const facet = wellFacetFromSheet({
      state: "unresolved",
      reason: "well-fact atom-miss",
      retryable: false,
    });
    expect(facet.state).toBe("pending");
    expect(facet.value).toMatch(/well-fact/);
    expect(facet.value).toMatch(/atom-miss/);
    expect(JSON.stringify(facet)).not.toMatch(/42000001030000/);
    expect(JSON.stringify(facet)).not.toMatch(/:none/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(wellFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(bakedCardModelFromSheet(sheet()).well).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("buildingFootprintFact inspect row (P-51 / WDLL 5)", () => {
  it("present fixture 48001:10136 shows structureRole=primary from the body", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        footprint: {
          state: "present",
          value: {
            structureRole: "primary",
            entityId: "48001:10136.00000000:footprint:primary",
            display: "primary",
          },
          provenance: {
            ...prov(),
            source: "building-footprint",
            sourceLabel: "building-footprint atom",
          },
        },
      }),
    );
    expect(model.footprint.state).toBe("present");
    expect(model.footprint.value).toBe("primary");
    expect(model.footprint.value).not.toMatch(/:primary/);
  });

  it("gold-shaped atom-miss fixture does not render a footprint or :primary", () => {
    const facet = footprintFacetFromSheet({
      state: "unresolved",
      reason: "building-footprint atom-miss",
      retryable: false,
    });
    expect(facet.state).toBe("pending");
    expect(facet.value).toMatch(/building-footprint/);
    expect(facet.value).toMatch(/atom-miss/);
    expect(JSON.stringify(facet)).not.toMatch(/:primary/);
    expect(JSON.stringify(facet)).not.toMatch(/48001:10136/);
  });

  it("role inversion: body accessory wins over :footprint:primary token", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        footprint: {
          state: "present",
          value: {
            structureRole: "accessory",
            entityId: "48001:10136.00000000:footprint:primary",
            display: "accessory",
          },
          provenance: {
            ...prov(),
            source: "building-footprint",
            sourceLabel: "building-footprint atom",
          },
        },
      }),
    );
    expect(model.footprint.value).toBe("accessory");
    expect(model.footprint.value).not.toBe("primary");
  });

  it("role inversion: body primary wins over :footprint:accessory-1 token", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        footprint: {
          state: "present",
          value: {
            structureRole: "primary",
            entityId: "48001:10136.00000000:footprint:accessory-1",
            display: "primary",
          },
          provenance: {
            ...prov(),
            source: "building-footprint",
            sourceLabel: "building-footprint atom",
          },
        },
      }),
    );
    expect(model.footprint.value).toBe("primary");
    expect(model.footprint.value).not.toMatch(/accessory/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(footprintFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(bakedCardModelFromSheet(sheet()).footprint).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("boundaryEdgeFact inspect row (P-53 / WDLL 6)", () => {
  it("gold-shaped present fixture shows role=front from the body", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        boundary: {
          state: "present",
          value: {
            role: "front",
            entityId: "48021:34137:boundary:2",
            display: "front",
          },
          provenance: {
            ...prov(),
            source: "property-boundary-edge",
            sourceLabel: "property-boundary-edge atom",
          },
        },
      }),
    );
    expect(model.boundary.state).toBe("present");
    expect(model.boundary.value).toBe("front");
    expect(model.boundary.value).not.toMatch(/txgio_parcel/);
    expect(model.boundary.value).not.toMatch(/GIS/);
  });

  it("gold-shaped atom-miss fixture does not render a GIS ring", () => {
    const facet = boundaryFacetFromSheet({
      state: "unresolved",
      reason: "property-boundary-edge atom-miss",
      retryable: false,
    });
    expect(facet.state).toBe("pending");
    expect(facet.value).toMatch(/property-boundary-edge/);
    expect(facet.value).toMatch(/atom-miss/);
    expect(JSON.stringify(facet)).not.toMatch(/txgio_parcel/);
    expect(JSON.stringify(facet)).not.toMatch(/parcelRing/);
  });

  it("last token is not role: body front wins over :boundary:0 token", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        boundary: {
          state: "present",
          value: {
            role: "front",
            entityId: "48021:34137:boundary:0",
            display: "front",
          },
          provenance: {
            ...prov(),
            source: "property-boundary-edge",
            sourceLabel: "property-boundary-edge atom",
          },
        },
      }),
    );
    expect(model.boundary.value).toBe("front");
    expect(model.boundary.value).not.toBe("0");
    expect(model.boundary.value).not.toBe("rear");
  });

  it("missing field hides the row (unknown)", () => {
    expect(boundaryFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(bakedCardModelFromSheet(sheet()).boundary).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("ownerFact inspect row (P-54 / WDLL 7)", () => {
  it("identified gold-shaped present fixture shows ownerName not taxYear", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        owner: {
          state: "present",
          value: {
            entityId: "48021:34137:2025",
            taxYear: 2025,
            display: "IDENTIFIED OWNER LLC",
          },
          provenance: {
            ...prov(),
            source: "owner-fact",
            sourceLabel: "owner-fact atom",
          },
        },
      }),
    );
    expect(model.owner.state).toBe("present");
    expect(model.owner.value).toBe("IDENTIFIED OWNER LLC");
    expect(model.owner.value).not.toBe("2025");
    expect(model.owner.value).not.toMatch(/cad-parcel-roll/);
  });

  it("anonymous identified-session-required has no owner body", () => {
    const facet = ownerFacetFromSheet({
      state: "unresolved",
      reason: "owner-fact identified-session-required",
      retryable: false,
    });
    expect(facet.state).toBe("pending");
    expect(facet.value).toMatch(/owner-fact/);
    expect(facet.value).toMatch(/identified-session-required/);
    expect(JSON.stringify(facet)).not.toMatch(/ownerName/);
    expect(JSON.stringify(facet)).not.toMatch(/mailing/);
  });

  it("gold-shaped atom-miss fixture does not render a CAD-roll name", () => {
    const facet = ownerFacetFromSheet({
      state: "unresolved",
      reason: "owner-fact atom-miss",
      retryable: false,
    });
    expect(facet.state).toBe("pending");
    expect(facet.value).toMatch(/owner-fact/);
    expect(facet.value).toMatch(/atom-miss/);
    expect(JSON.stringify(facet)).not.toMatch(/BAKE CAD OWNER/);
    expect(JSON.stringify(facet)).not.toMatch(/cad-parcel-roll/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(ownerFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(bakedCardModelFromSheet(sheet()).owner).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("cityLimitsFact inspect row (P-76)", () => {
  it("incorporated present fixture shows city name and ETJ unresolved", () => {
    const facet = cityLimitsFacetFromSheet({
      state: "present",
      value: {
        display: "Incorporated — Bastrop · ETJ unresolved",
        etjStatus: "unresolved",
      },
      provenance: prov(),
    });
    expect(facet.state).toBe("present");
    expect(facet.value).toContain("Bastrop");
    expect(facet.value).toContain("ETJ unresolved");
  });

  it("missing field hides the row (unknown)", () => {
    expect(
      cityLimitsFacetFromSheet({
        state: "absent-uncovered",
        reason: CITY_LIMITS_FACT_MISSING_REASON,
      }),
    ).toEqual({ state: "unknown", value: null });
  });
});

describe("schoolDistrictFact inspect row (acquire-wave12)", () => {
  it("present fixture shows the district name", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        schoolDistrict: {
          state: "present",
          value: { districtName: "Bastrop ISD", display: "Bastrop ISD" },
          provenance: {
            ...prov(),
            source: "school-district-fact",
            sourceLabel: "school-district-fact atom",
          },
        },
      }),
    );
    expect(model.schoolDistrict).toEqual({ state: "present", value: "Bastrop ISD" });
  });

  it("gold-shaped absent fixture does not render a district name", () => {
    const facet = schoolDistrictFacetFromSheet({
      state: "absent-covered",
      reason: "no school-district-fact atom on this parcel",
      provenance: prov(),
    });
    expect(facet.state).toBe("absent");
    expect(JSON.stringify(facet)).not.toMatch(/Bastrop ISD/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(schoolDistrictFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(
      schoolDistrictFacetFromSheet({
        state: "absent-uncovered",
        reason: SCHOOL_DISTRICT_FACT_MISSING_REASON,
      }),
    ).toEqual({ state: "unknown", value: null });
    expect(bakedCardModelFromSheet(sheet()).schoolDistrict).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("utilityServiceFact inspect row (acquire-wave12)", () => {
  it("present fixture shows the water slot", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        utilityService: {
          state: "present",
          value: {
            water: {
              ccnNo: "10375",
              utility: "Aqua Texas WSC",
              status: "Active",
              ccnType: "water",
            },
            sewer: null,
            display: "Water — Aqua Texas WSC · Active",
          },
          provenance: {
            ...prov(),
            source: "utility-service-fact",
            sourceLabel: "utility-service-fact atom",
          },
        },
      }),
    );
    expect(model.utilityService.state).toBe("present");
    expect(model.utilityService.value).toContain("Aqua Texas WSC");
  });

  it("present fixture with both water and sewer joins both slots", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        utilityService: {
          state: "present",
          value: {
            water: {
              ccnNo: "10375",
              utility: "Aqua Texas WSC",
              status: "Active",
              ccnType: "water",
            },
            sewer: {
              ccnNo: "20481",
              utility: "Bastrop County MUD",
              status: "Active",
              ccnType: "sewer",
            },
            display: "Water — Aqua Texas WSC · Active · Sewer — Bastrop County MUD · Active",
          },
          provenance: {
            ...prov(),
            source: "utility-service-fact",
            sourceLabel: "utility-service-fact atom",
          },
        },
      }),
    );
    expect(model.utilityService.value).toContain("Aqua Texas WSC");
    expect(model.utilityService.value).toContain("Bastrop County MUD");
    expect(model.utilityService.value).not.toMatch(/electric/i);
  });

  it("gold-shaped absent fixture does not render a utility name", () => {
    const facet = utilityServiceFacetFromSheet({
      state: "absent-covered",
      reason: "no utility-service-fact atom on this parcel",
      provenance: prov(),
    });
    expect(facet.state).toBe("absent");
    expect(JSON.stringify(facet)).not.toMatch(/Aqua Texas/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(utilityServiceFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(
      utilityServiceFacetFromSheet({
        state: "absent-uncovered",
        reason: UTILITY_SERVICE_FACT_MISSING_REASON,
      }),
    ).toEqual({ state: "unknown", value: null });
    expect(bakedCardModelFromSheet(sheet()).utilityService).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("overlayDistrictsFact inspect row (acquire-wave12)", () => {
  it("present fixture joins district names", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        overlayDistricts: {
          state: "present",
          value: {
            names: ["Historic Overlay", "Airport Compatibility"],
            display: "Historic Overlay, Airport Compatibility",
          },
          provenance: {
            ...prov(),
            source: "overlay-districts-fact",
            sourceLabel: "overlay-districts-fact atom",
          },
        },
      }),
    );
    expect(model.overlayDistricts.state).toBe("present");
    expect(model.overlayDistricts.value).toContain("Historic Overlay");
    expect(model.overlayDistricts.value).toContain("Airport Compatibility");
  });

  it("gold-shaped absent fixture does not render a district name", () => {
    const facet = overlayDistrictsFacetFromSheet({
      state: "absent-covered",
      reason: "no overlay-districts-fact atom on this parcel",
      provenance: prov(),
    });
    expect(facet.state).toBe("absent");
    expect(JSON.stringify(facet)).not.toMatch(/Historic Overlay/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(overlayDistrictsFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(
      overlayDistrictsFacetFromSheet({
        state: "absent-uncovered",
        reason: OVERLAY_DISTRICTS_FACT_MISSING_REASON,
      }),
    ).toEqual({ state: "unknown", value: null });
    expect(bakedCardModelFromSheet(sheet()).overlayDistricts).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("agValuationFact inspect row (acquire-wave12)", () => {
  it("present fixture shows the single-entry ag land record", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        agValuation: {
          state: "present",
          value: {
            entries: [
              {
                statecode: "D1",
                landType: "Native pasture",
                description: "Open space ag use",
                acres: 42.3,
                value: 210000,
                currValue: 8460,
                agFlag: true,
                apprMethod: "income",
                agYear: "2025",
                propertyNumber: "R12345",
              },
            ],
            display: "Ag — Native pasture · 42.3 ac",
          },
          provenance: {
            ...prov(),
            source: "ag-valuation-fact",
            sourceLabel: "ag-valuation-fact atom",
          },
        },
      }),
    );
    expect(model.agValuation.state).toBe("present");
    expect(model.agValuation.value).toContain("Native pasture");
    expect(model.agValuation.value).toContain("42.3 ac");
  });

  it("present fixture with multiple entries joins each land-record segment", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        agValuation: {
          state: "present",
          value: {
            entries: [
              {
                statecode: "D1",
                landType: "Native pasture",
                description: null,
                acres: 42.3,
                value: 210000,
                currValue: 8460,
                agFlag: true,
                apprMethod: "income",
                agYear: "2025",
                propertyNumber: "R12345",
              },
              {
                statecode: "A1",
                landType: "Residential homesite",
                description: null,
                acres: 1.2,
                value: 95000,
                currValue: 95000,
                agFlag: false,
                apprMethod: "market",
                agYear: null,
                propertyNumber: "R12345",
              },
            ],
            display: "Ag — Native pasture · 42.3 ac; Residential homesite · 1.2 ac",
          },
          provenance: {
            ...prov(),
            source: "ag-valuation-fact",
            sourceLabel: "ag-valuation-fact atom",
          },
        },
      }),
    );
    expect(model.agValuation.value).toContain("Native pasture");
    expect(model.agValuation.value).toContain("Residential homesite");
  });

  it("gold-shaped absent fixture does not render a land record", () => {
    const facet = agValuationFacetFromSheet({
      state: "absent-covered",
      reason: "no ag-valuation-fact atom on this parcel",
      provenance: prov(),
    });
    expect(facet.state).toBe("absent");
    expect(JSON.stringify(facet)).not.toMatch(/Native pasture/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(agValuationFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(
      agValuationFacetFromSheet({
        state: "absent-uncovered",
        reason: AG_VALUATION_FACT_MISSING_REASON,
      }),
    ).toEqual({ state: "unknown", value: null });
    expect(bakedCardModelFromSheet(sheet()).agValuation).toEqual({
      state: "unknown",
      value: null,
    });
  });
});

describe("maxImperviousCoverPctFact inspect row (acquire-wave12)", () => {
  it("present fixture shows the percentage", () => {
    const model = bakedCardModelFromSheet(
      sheet({
        maxImperviousCoverPct: {
          state: "present",
          value: {
            percent: 45,
            watershedType: "Water Supply Suburban",
            inRechargeZone: false,
            crosswalkCitation: "Austin LDC 25-8-342",
            display: "45%",
          },
          provenance: {
            ...prov(),
            source: "max-impervious-cover-pct-fact",
            sourceLabel: "max-impervious-cover-pct-fact atom",
          },
        },
      }),
    );
    expect(model.maxImperviousCoverPct).toEqual({ state: "present", value: "45%" });
  });

  it("gold-shaped absent fixture does not render a percentage", () => {
    const facet = maxImperviousCoverPctFacetFromSheet({
      state: "absent-covered",
      reason: "no max-impervious-cover-pct-fact atom on this parcel",
      provenance: prov(),
    });
    expect(facet.state).toBe("absent");
    expect(JSON.stringify(facet)).not.toMatch(/45/);
  });

  it("missing field hides the row (unknown)", () => {
    expect(maxImperviousCoverPctFacetFromSheet(undefined)).toEqual({
      state: "unknown",
      value: null,
    });
    expect(
      maxImperviousCoverPctFacetFromSheet({
        state: "absent-uncovered",
        reason: MAX_IMPERVIOUS_COVER_PCT_FACT_MISSING_REASON,
      }),
    ).toEqual({ state: "unknown", value: null });
    expect(bakedCardModelFromSheet(sheet()).maxImperviousCoverPct).toEqual({
      state: "unknown",
      value: null,
    });
  });
});
