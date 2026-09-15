// apps/property-explorer/src/lib/card-subject-guard.test.ts
//
// P-218. Proven by violation on the exact pair the operator hit in
// production: 48209:97651 and 48209:97652, two adjacent Sturgeon Dr lots in
// Hays County, neither carrying a situs address on the county roll (Part B).
//
// FIRST: reproduce the raw defect class at the export seam -- a card left
// pointed at 97651 while the subject has already sealed to 97652 throws
// exactly the production message, proving the disagreement is real and
// customer-visible (this half needs no new code; export-target.ts already
// refuses it, which is how the operator's report surfaced it in the first
// place).
//
// SECOND: prove reconcileCardWithSubject is the fix -- given that same
// disagreement, it returns a reconciliation whose id and card both agree
// with the subject, so re-deriving the export's expected id from the
// reconciled card no longer disagrees with anything.

import { afterEach, describe, expect, it } from "vitest";
import type { ParcelFactSheet } from "@empressaio/parcel-fact-sheet";
import { reconcileCardWithSubject } from "./card-subject-guard";
import { cardFromSheetWithSearchFallback } from "./sheet-to-card";
import { resolveExportTarget, ExportTargetError } from "./export-target";
import { subjectStore } from "./subject-store";

const PROV = {
  source: "cad-roll",
  sourceLabel: "Hays County appraisal roll",
  vintage: null,
  method: null,
  retrievedAt: null,
  confidence: null,
  confidenceBasis: "asserted" as const,
  sourceUrl: null,
};

/** A Sturgeon Dr lot: no real CAD apn, no situs -- apn falls back to the
 *  parcel node id's own propId, exactly as identityFacts() does live. */
function sturgeonLot(parcelNodeId: string): ParcelFactSheet {
  const propId = parcelNodeId.split(":")[1];
  return {
    factSheetId: `fs_${propId}`,
    resolverVersion: "test",
    sealedAt: "2026-09-15T00:00:00.000Z",
    identity: {
      parcelNodeId,
      county: { fips: "48209", name: "Hays" },
      apn: { state: "present", value: propId, provenance: PROV },
      situsAddress: {
        state: "absent-covered",
        reason: "no situs address on the county roll for this parcel",
        provenance: PROV,
      },
      owner: { state: "absent-covered", reason: "n/a", provenance: PROV },
    },
    geometry: {
      rings: [],
      centroid: { lat: 29.8712, lng: -97.9266 },
      bbox: [-97.9266, 29.8712, -97.9266, 29.8712],
      lotArea: { value: 6000, unit: "sqft" },
      crs: "EPSG:4326",
    },
    landUse: { state: "absent-covered", reason: "n/a", provenance: PROV },
    zoning: { state: "absent-covered", reason: "n/a", provenance: PROV },
    setbacks: { state: "absent-covered", reason: "n/a", provenance: PROV },
    envelope: { kind: "not-derived", reason: "n/a", missing: [] },
    flood: { state: "absent-covered", reason: "n/a", provenance: PROV },
    site: {
      elevationRange: null,
      contourInterval: null,
      frontage: { state: "absent-covered", reason: "n/a", provenance: PROV },
    },
    verdict: "v.",
  };
}

const SHEET_97651 = sturgeonLot("48209:97651");
const SHEET_97652 = sturgeonLot("48209:97652");

afterEach(() => subjectStore.clear());

describe("the raw defect (before): a card pinned at 97651 while the subject is 97652", () => {
  it("the export seam throws exactly the production message", () => {
    subjectStore.set({ sheet: SHEET_97652, origin: "search" });
    try {
      resolveExportTarget("48209:97651");
      throw new Error("should have refused");
    } catch (err) {
      expect(err).toBeInstanceOf(ExportTargetError);
      expect((err as Error).message).toBe(
        "Export target 48209:97651 is not the selected property " +
          "(48209:97652). Reselect the property and try again.",
      );
    }
  });
});

describe("reconcileCardWithSubject (after): the fix", () => {
  it("reconciles a card stuck on 97651 to the sealed 97652 subject", () => {
    const subject = { sheet: SHEET_97652, origin: "search" as const };
    const reconciled = reconcileCardWithSubject({
      inspectedParcelNodeId: "48209:97651",
      fallbackAddress: null,
      subject,
      buildCard: cardFromSheetWithSearchFallback,
    });
    expect(reconciled).not.toBeNull();
    expect(reconciled?.parcelNodeId).toBe("48209:97652");
    // The rendered brief's title falls back to `Parcel ${apn}` when no situs
    // is on record (InspectCard.tsx) -- reconciling must carry the RIGHT
    // apn, or the title stays wrong even after the id "fixes" underneath it.
    expect(reconciled?.card.apn).toBe("97652");
    expect(reconciled?.card.situsAddress).toBeNull();
  });

  it("closes the loop: exporting the reconciled id no longer disagrees with the subject", () => {
    subjectStore.set({ sheet: SHEET_97652, origin: "search" });
    const reconciled = reconcileCardWithSubject({
      inspectedParcelNodeId: "48209:97651",
      fallbackAddress: null,
      subject: subjectStore.current(),
      buildCard: cardFromSheetWithSearchFallback,
    });
    expect(reconciled?.parcelNodeId).toBe("48209:97652");
    expect(() => resolveExportTarget(reconciled!.parcelNodeId)).not.toThrow();
    expect(resolveExportTarget(reconciled!.parcelNodeId).parcelNodeId).toBe(
      "48209:97652",
    );
  });

  it("is a no-op once the card already agrees with the subject", () => {
    const subject = { sheet: SHEET_97652, origin: "search" as const };
    const reconciled = reconcileCardWithSubject({
      inspectedParcelNodeId: "48209:97652",
      fallbackAddress: "629 STURGEON DR, SAN MARCOS, TX 78666",
      subject,
      buildCard: cardFromSheetWithSearchFallback,
    });
    expect(reconciled).toBeNull();
  });

  it("never blanks an inspected card when there is no subject yet (AMENDMENT 1)", () => {
    const reconciled = reconcileCardWithSubject({
      inspectedParcelNodeId: "48209:97651",
      fallbackAddress: null,
      subject: null,
      buildCard: cardFromSheetWithSearchFallback,
    });
    expect(reconciled).toBeNull();
  });

  it("keeps the searched address as the heading fallback on reconciliation, same as every other seal", () => {
    const subject = { sheet: SHEET_97652, origin: "search" as const };
    const reconciled = reconcileCardWithSubject({
      inspectedParcelNodeId: "48209:97651",
      fallbackAddress: "617 STURGEON DR, SAN MARCOS, TX 78666",
      subject,
      buildCard: cardFromSheetWithSearchFallback,
    });
    expect(reconciled?.card.situsAddress).toBe(
      "617 STURGEON DR, SAN MARCOS, TX 78666",
    );
  });
});
