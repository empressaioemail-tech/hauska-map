// apps/property-explorer/src/lib/sheet-to-card-model.test.ts
//
// The inspect card's data source (I2). These tests exist to prove the swap did
// not silently delete anything: the card used to run two fetches of its own,
// and the two features that blocked the swap under contract v1 — the AtomChip
// provenance popovers and the setback X-ray disclosure — must survive it.

import { describe, expect, it } from "vitest";
import type {
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
} from "./sheet-to-card-model";

function prov(atomDids: string[] = []): Provenance {
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

function axis(
  ft: number,
  governedBy: string | null = null,
  note: string | null = null,
): SetbackAxis {
  return {
    distance: { value: ft, unit: "ft" },
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
      provenance: prov(["did:atom:zoning-1"]),
    },
    setbacks: {
      state: "present",
      value: {
        front: axis(25, null, "Measured from the right-of-way line."),
        side: axis(5),
        rear: axis(10),
        cornerSide: null,
      },
      provenance: prov(["did:atom:setback-1", "did:atom:code-1"]),
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
      provenance: prov(["did:atom:envelope-1"]),
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
    // The second setback DID becomes a code-section chip. It still resolves
    // through fetchAtomByDid; only its LABEL degrades, because atomDids is a
    // bare string list and carries no section number. Reported to the planner.
    expect(refs?.codeSections?.[0]?.atomDid).toBe("did:atom:code-1");
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
      front: axis(Number.NaN, "C-1 governs (§4.2.1)"),
      side: axis(5),
      rear: axis(10),
      cornerSide: null,
    });
    expect(line).toBe("F C-1 governs (§4.2.1) · S 5 ft · R 10 ft");
    expect(line).not.toContain("F 0");
  });

  it("says 'not specified' when there is no rule to route to either", () => {
    const line = setbackDisplayFromSheet({
      front: axis(Number.NaN),
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
  });

  it("carries a not-specified axis as null rather than 0", () => {
    const env = envelopeStateFromSheet(
      sheet({
        setbacks: {
          state: "present",
          value: {
            front: axis(Number.NaN, "build-to-line governs"),
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
