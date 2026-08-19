// apps/property-explorer/src/lib/subject-store.test.ts
//
// I1 — the app has ONE subject. These tests pin the property that was missing:
// the search box and the selected parcel used to be separate states, so a
// drainage report came back for 48027:498770 while 498778 was selected, and a
// DXF export targeted "city of Bastrop" left in the search box while the
// sidebar showed an address.

import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ParcelFactSheet,
  ResolveResult,
  Subject,
} from "@empressaio/parcel-fact-sheet";
import { setSubjectByParcelNodeId, subjectStore } from "./subject-store";
import type { PeFactSheetResolver } from "./fact-sheet-resolver";

function stubSheet(parcelNodeId: string, factSheetId: string): ParcelFactSheet {
  return {
    factSheetId,
    resolverVersion: "test",
    sealedAt: "2026-08-18T00:00:00.000Z",
    identity: {
      parcelNodeId,
      county: { fips: parcelNodeId.split(":")[0], name: "Bell" },
      apn: { state: "absent-covered", reason: "n/a", provenance: PROV },
      situsAddress: { state: "absent-covered", reason: "n/a", provenance: PROV },
      owner: { state: "absent-covered", reason: "n/a", provenance: PROV },
    },
    geometry: {
      rings: [],
      centroid: { lat: 30, lng: -97 },
      bbox: [-97, 30, -97, 30],
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
    verdict: "test verdict.",
  };
}

const PROV = {
  source: "test",
  sourceLabel: "Test",
  vintage: null,
  method: null,
  retrievedAt: null,
  confidence: null,
  confidenceBasis: "asserted" as const,
  sourceUrl: null,
};

function fakeResolver(
  sheets: Record<string, ParcelFactSheet>,
  unplaceable: string[] = [],
) {
  return {
    resolve: vi.fn(async (id: string): Promise<ResolveResult> => {
      if (unplaceable.includes(id)) {
        return {
          kind: "unplaceable",
          parcelNodeId: id,
          identity: stubSheet(id, "fs_none").identity,
          reason: "No boundary or coordinate is on file for this parcel.",
          wouldBeFilledBy: "parcel geometry for this county",
        };
      }
      const sheet = sheets[id];
      if (!sheet) throw new Error(`no sheet for ${id}`);
      return { kind: "sheet", ...sheet };
    }),
  } as unknown as PeFactSheetResolver;
}

afterEach(() => {
  subjectStore.clear();
});

describe("subjectStore", () => {
  it("starts empty and notifies subscribers on every change", () => {
    expect(subjectStore.current()).toBeNull();
    const seen: Array<Subject | null> = [];
    const off = subjectStore.subscribe((s) => seen.push(s));

    const subject: Subject = { sheet: stubSheet("48027:498778", "fs_a"), origin: "search" };
    subjectStore.set(subject);
    expect(subjectStore.current()).toBe(subject);
    expect(subjectStore.currentSheetId()).toBe("fs_a");
    expect(subjectStore.currentParcelNodeId()).toBe("48027:498778");

    subjectStore.clear();
    expect(subjectStore.current()).toBeNull();
    off();
    subjectStore.set(subject);
    expect(seen).toEqual([subject, null]);
  });

  it("does not re-notify on a redundant clear", () => {
    const seen: Array<Subject | null> = [];
    const off = subjectStore.subscribe((s) => seen.push(s));
    subjectStore.clear();
    subjectStore.clear();
    off();
    expect(seen).toEqual([]);
  });

  it("replaces the whole subject, so no consumer can hold the previous parcel", async () => {
    // 498770 vs 498778: the drainage-report defect, one digit apart.
    const sheets = {
      "48027:498770": stubSheet("48027:498770", "fs_wrong"),
      "48027:498778": stubSheet("48027:498778", "fs_right"),
    };
    const resolver = fakeResolver(sheets);

    await setSubjectByParcelNodeId("48027:498770", "search", resolver);
    expect(subjectStore.currentSheetId()).toBe("fs_wrong");

    await setSubjectByParcelNodeId("48027:498778", "map-click", resolver);
    expect(subjectStore.currentSheetId()).toBe("fs_right");
    expect(subjectStore.currentParcelNodeId()).toBe("48027:498778");
    expect(subjectStore.current()?.origin).toBe("map-click");
  });

  it("carries the SEALED sheet, not a parcel id for consumers to re-resolve", async () => {
    const sheets = { "48027:498778": stubSheet("48027:498778", "fs_right") };
    const resolver = fakeResolver(sheets);
    const outcome = await setSubjectByParcelNodeId(
      "48027:498778",
      "deep-link",
      resolver,
    );
    if (outcome.kind !== "subject") throw new Error("expected a subject");
    // Everything an export or a panel needs is already on the subject.
    expect(outcome.subject.sheet.verdict).toBe("test verdict.");
    expect(outcome.subject.sheet.geometry.centroid).toEqual({ lat: 30, lng: -97 });
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    // The union discriminant never leaks onto the sheet the subject carries.
    expect("kind" in outcome.subject.sheet).toBe(false);
  });

  it("leaves the previous subject standing when a resolve fails", async () => {
    const sheets = { "48027:498778": stubSheet("48027:498778", "fs_right") };
    const resolver = fakeResolver(sheets);
    await setSubjectByParcelNodeId("48027:498778", "search", resolver);
    await expect(
      setSubjectByParcelNodeId("48027:000000", "search", resolver),
    ).rejects.toThrow();
    // A failed Find must not silently blank what the user was looking at.
    expect(subjectStore.currentSheetId()).toBe("fs_right");
  });
});

describe("setSubjectByParcelNodeId — AMENDMENT 1 unplaceable parcels", () => {
  it("returns the unplaceable parcel and NEVER makes it the subject", async () => {
    const sheets = { "48027:498778": stubSheet("48027:498778", "fs_right") };
    const resolver = fakeResolver(sheets, ["48027:000000"]);
    await setSubjectByParcelNodeId("48027:498778", "search", resolver);

    const outcome = await setSubjectByParcelNodeId(
      "48027:000000",
      "search",
      resolver,
    );
    expect(outcome.kind).toBe("unplaceable");
    if (outcome.kind !== "unplaceable") throw new Error("unreachable");
    expect(outcome.parcel.parcelNodeId).toBe("48027:000000");
    expect(outcome.parcel.wouldBeFilledBy).toBe("parcel geometry for this county");
    // A Subject carries a ParcelFactSheet, and geometry is required on a sheet
    // precisely so nothing downstream needs a null check. So an unplaceable
    // parcel cannot become one — and it must not blank the standing subject.
    expect(subjectStore.currentSheetId()).toBe("fs_right");
  });
});
