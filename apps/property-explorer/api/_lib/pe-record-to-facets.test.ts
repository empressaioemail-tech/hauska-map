import { describe, expect, it } from "vitest";

import { composeRecordPatch, type ParcelRecordResponse, type RecordRail } from "./pe-record-to-facets";

function rail(
  serve: RecordRail["serve"],
  cell: Record<string, unknown> | null,
  companions: unknown[] = [],
  atomBacked = false,
): RecordRail {
  return {
    cell,
    gate: { verdict: serve === "record" ? "pass" : serve === "refused" ? "refuse" : null, evaluatedAt: null },
    serve,
    atom: null,
    atomBacked,
    rendering: null,
    companions,
  };
}

function emptyRecord(overrides: Record<string, RecordRail> = {}): ParcelRecordResponse {
  return {
    parcelNodeId: "48021:34049",
    placeKey: "48021:34049",
    countyFips: "48021",
    railRegistrySha: "test-sha",
    readAt: "2026-09-12T00:00:00.000Z",
    rails: overrides,
    refused: null,
  };
}

describe("composeRecordPatch", () => {
  it("composes cityLimitsFact from a record-served incorporated cell, matching cortex's own field names/labels", () => {
    const record = emptyRecord({
      cityLimits: rail("record", {
        kind: "value",
        value: "Bastrop",
        source: "landing_parcel_jurisdiction",
        vintage: "2026-09-02T18:13:56.751Z",
      }),
    });
    const { patch, railStates } = composeRecordPatch(record);
    expect(patch.cityLimitsFact).toEqual({
      status: "incorporated",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis:
        "parcel_record cityLimits: incorporated, city 'Bastrop' (source: landing_parcel_jurisdiction, vintage: 2026-09-02T18:13:56.751Z).",
      cityName: "Bastrop",
    });
    expect(railStates.cityLimits).toEqual({ serve: "record", atomBacked: false });
  });

  it("composes cityLimitsFact unincorporated from an absent-verified cell", () => {
    const record = emptyRecord({
      cityLimits: rail("record", {
        kind: "absent-verified",
        basis: { disposition: "unincorporated", source: "landing_parcel_jurisdiction" },
      }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.cityLimitsFact).toEqual({
      status: "unincorporated",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: "parcel_record cityLimits: unincorporated (source: landing_parcel_jurisdiction).",
    });
  });

  it("does NOT compose a field whose rail is legacy-transitional — leaves it for the existing cortex merge", () => {
    const record = emptyRecord({
      cityLimits: rail("legacy-transitional", { kind: "value", value: "Bastrop" }),
    });
    const { patch, railStates } = composeRecordPatch(record);
    expect(patch.cityLimitsFact).toBeUndefined();
    expect(railStates.cityLimits).toEqual({ serve: "legacy-transitional", atomBacked: false });
  });

  it("does NOT compose a field whose rail is refused — no silent fallback, no fabricated fact", () => {
    const record = emptyRecord({
      flood: rail("refused", null),
    });
    const { patch, railStates } = composeRecordPatch(record);
    expect(patch.floodHazardFact).toBeUndefined();
    expect(railStates.flood).toEqual({ serve: "refused", atomBacked: false });
  });

  it("composes floodHazardFact present with SFHA derived from the zone prefix", () => {
    const record = emptyRecord({
      flood: rail("record", { kind: "value", floodZone: "AE", vintage: "2026-01-01" }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.floodHazardFact).toMatchObject({ state: "present", floodZone: "AE", inSpecialFloodHazardArea: true, source: "flood-hazard-fact" });
  });

  it("composes floodHazardFact present with SFHA false for an X zone", () => {
    const record = emptyRecord({
      flood: rail("record", { kind: "value", floodZone: "X", vintage: "2026-01-01" }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.floodHazardFact).toMatchObject({ inSpecialFloodHazardArea: false });
  });

  it("composes specialDistrictFact preferring the MUD district when multiple companion rows exist", () => {
    const record = emptyRecord({
      specialDistricts: rail(
        "record",
        { kind: "value", disposition: "rows", rowCount: 2, vintage: "2026-01-01" },
        [
          { rowIndex: 0, payload: { districtId: "ESD-5", districtType: "ESD" }, source: "x", vintage: "2026-01-01" },
          { rowIndex: 1, payload: { districtId: "MUD-2", districtType: "MUD" }, source: "x", vintage: "2026-01-01" },
        ],
      ),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.specialDistrictFact).toMatchObject({ state: "present", districtId: "MUD-2", districtType: "MUD" });
  });

  it("composes wellFact from the lexically-first well when more than one companion row exists", () => {
    const record = emptyRecord({
      wells: rail(
        "record",
        { kind: "value", disposition: "rows", rowCount: 2, vintage: "2026-01-01" },
        [
          { rowIndex: 0, payload: { api: "42-021-99999", wellStatus: "active" }, source: "x", vintage: "2026-01-01" },
          { rowIndex: 1, payload: { api: "42-021-00001", wellStatus: "plugged" }, source: "x", vintage: "2026-01-01" },
        ],
      ),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.wellFact).toMatchObject({ state: "present", apiNumber14: "42-021-00001", parcelRelation: "on-parcel" });
  });

  it("composes schoolDistrictFact present", () => {
    const record = emptyRecord({
      schoolDistrict: rail("record", { kind: "value", value: "Bastrop ISD", vintage: "2026-01-01" }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.schoolDistrictFact).toMatchObject({ state: "present", districtName: "Bastrop ISD" });
  });

  it("composes utilityServiceFact reading fixed water/sewer/electric row slots", () => {
    const record = emptyRecord({
      utilityService: rail(
        "record",
        { kind: "value", disposition: "rows", rowCount: 2, vintage: "2026-01-01" },
        [
          { rowIndex: 0, payload: { utility: "Aqua Texas", status: "active" }, source: "x", vintage: "2026-01-01" },
          { rowIndex: 2, payload: { utility: "Bluebonnet Electric", status: "active" }, source: "x", vintage: "2026-01-01" },
        ],
      ),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.utilityServiceFact).toMatchObject({
      state: "present",
      water: { utility: "Aqua Texas", status: "active" },
      sewer: null,
      electric: { utility: "Bluebonnet Electric", status: "active" },
    });
  });

  it("composes acreage only when acreageAcres itself is record-served and a positive number", () => {
    const record = emptyRecord({
      acreageAcres: rail("record", { kind: "value", value: 0.686, vintage: "2026-01-01" }),
      acreageSqft: rail("record", { kind: "value", value: 29881, vintage: "2026-01-01" }),
      acreageMethod: rail("record", { kind: "value", value: "cad-roll", vintage: "2026-01-01" }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.baseFactsAcreage).toEqual({ value: 0.686, sqft: 29881, method: "cad-roll" });
  });

  it("does not compose acreage when acreageAcres is legacy-transitional even if the sibling rails are record-served", () => {
    const record = emptyRecord({
      acreageAcres: rail("legacy-transitional", { kind: "value", value: 0.686 }),
      acreageSqft: rail("record", { kind: "value", value: 29881 }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.baseFactsAcreage).toBeUndefined();
  });

  it("composes livingAreaSqft and yearBuilt only on a present numeric value", () => {
    const record = emptyRecord({
      livingAreaSqft: rail("record", { kind: "value", value: 1344 }),
      yearBuilt: rail("record", { kind: "value", value: 1906 }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.livingAreaSqft).toEqual({ status: "populated", value: 1344 });
    expect(patch.yearBuilt).toEqual({ status: "populated", value: 1906 });
    expect(patch.yearBuiltSource).toBe("parcel_record");
  });

  it("does not compose yearBuilt/livingAreaSqft on an absent or non-positive cell — never invents a year", () => {
    const record = emptyRecord({
      livingAreaSqft: rail("record", { kind: "absent-verified", basis: "no improvement on record" }),
      yearBuilt: rail("record", { kind: "value", value: 0 }),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.livingAreaSqft).toBeUndefined();
    expect(patch.yearBuilt).toBeUndefined();
  });

  it("produces an empty patch (but still reports rail states) when the whole parcel is refused (crosswalk-ambiguous)", () => {
    const record: ParcelRecordResponse = {
      ...emptyRecord({ cityLimits: rail("record", { kind: "value", value: "Bastrop" }) }),
      refused: { reason: "crosswalk ambiguous" },
    };
    const { patch, railStates } = composeRecordPatch(record);
    expect(patch).toEqual({});
    expect(railStates.cityLimits).toEqual({ serve: "record", atomBacked: false });
  });

  it("carries railStates for every composed rail key the response names, even when a rail is entirely absent from the response", () => {
    const record = emptyRecord({});
    const { railStates } = composeRecordPatch(record);
    expect(Object.keys(railStates)).toHaveLength(0);
  });
});
