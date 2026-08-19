// apps/property-explorer/src/lib/export-target.test.ts
//
// I1 at the export seam. Two QA defects are the fixtures:
//   - a flood/drainage report for 48027:498770 while 498778 was selected;
//   - a DXF export targeting "city of Bastrop", the text left in the search box.

import { afterEach, describe, expect, it } from "vitest";
import type { ParcelFactSheet } from "@empressaio/parcel-fact-sheet";
import {
  ExportTargetError,
  exportTargetOrNull,
  resolveExportTarget,
} from "./export-target";
import { subjectStore } from "./subject-store";

const PROV = {
  source: "cad-roll",
  sourceLabel: "Bell County appraisal roll",
  vintage: null,
  method: null,
  retrievedAt: null,
  confidence: null,
  confidenceBasis: "asserted" as const,
  sourceUrl: null,
};

function sheet(parcelNodeId: string, address: string | null): ParcelFactSheet {
  return {
    factSheetId: `fs_${parcelNodeId.replace(":", "")}`,
    resolverVersion: "test",
    sealedAt: "2026-08-18T00:00:00.000Z",
    identity: {
      parcelNodeId,
      county: { fips: parcelNodeId.split(":")[0], name: "Bell" },
      apn: { state: "absent-covered", reason: "n/a", provenance: PROV },
      situsAddress: address
        ? { state: "present", value: address, provenance: PROV }
        : { state: "absent-covered", reason: "no situs on the roll", provenance: PROV },
      owner: { state: "absent-covered", reason: "n/a", provenance: PROV },
    },
    geometry: {
      rings: [],
      centroid: { lat: 31, lng: -97 },
      bbox: [-97, 31, -97, 31],
      lotArea: { value: 1, unit: "sqft" },
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

afterEach(() => subjectStore.clear());

describe("resolveExportTarget", () => {
  it("refuses to export with no subject at all", () => {
    expect(() => resolveExportTarget("48027:498778")).toThrow(ExportTargetError);
    expect(exportTargetOrNull("48027:498778")).toBeNull();
  });

  it("returns the SUBJECT'S sheet id and its own header fields", () => {
    subjectStore.set({
      sheet: sheet("48027:498778", "3410 Chisholm Trail"),
      origin: "search",
    });
    expect(resolveExportTarget("48027:498778")).toEqual({
      factSheetId: "fs_48027498778",
      parcelNodeId: "48027:498778",
      address: "3410 Chisholm Trail",
      countyName: "Bell",
      displaySystem: "us",
    });
  });

  it("REFUSES a target that is not the subject, rather than picking one", () => {
    subjectStore.set({ sheet: sheet("48027:498778", null), origin: "search" });
    // One digit apart — the drainage-report defect.
    try {
      resolveExportTarget("48027:498770");
      throw new Error("should have refused");
    } catch (err) {
      expect(err).toBeInstanceOf(ExportTargetError);
      expect((err as ExportTargetError).kind).toBe("target-mismatch");
      expect((err as Error).message).toContain("48027:498770");
      expect((err as Error).message).toContain("48027:498778");
    }
  });

  it("refuses free text, which is what the search box used to hand exports", () => {
    subjectStore.set({ sheet: sheet("48021:34177", null), origin: "map-click" });
    expect(() => resolveExportTarget("city of Bastrop")).toThrow(ExportTargetError);
  });

  it("carries an absent address as null rather than inventing a header", () => {
    subjectStore.set({ sheet: sheet("48021:36521", null), origin: "search" });
    expect(resolveExportTarget("48021:36521").address).toBeNull();
  });
});
