import { describe, expect, it } from "vitest";

import {
  composeRecordPatch,
  composeZoningSetbackOverride,
  COMPOSED_ZONING_SETBACK_RAIL_KEYS,
  type ParcelRecordResponse,
  type RecordRail,
} from "./pe-record-to-facets";

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

  it("composes floodHazardFact present with SFHA derived from the zone prefix (flood is a companion rail: the zone lives on payload.zone, not the cell itself)", () => {
    const record = emptyRecord({
      flood: rail("record", { kind: "value", disposition: "rows", rowCount: 1, vintage: "2026-01-01" }, [
        { rowIndex: 0, payload: { zone: "AE" }, source: "x", vintage: "2026-01-01" },
      ]),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.floodHazardFact).toMatchObject({ state: "present", floodZone: "AE", inSpecialFloodHazardArea: true, source: "flood-hazard-fact" });
  });

  it("composes floodHazardFact present with SFHA false for an X zone", () => {
    const record = emptyRecord({
      flood: rail("record", { kind: "value", disposition: "rows", rowCount: 1, vintage: "2026-01-01" }, [
        { rowIndex: 0, payload: { zone: "X" }, source: "x", vintage: "2026-01-01" },
      ]),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.floodHazardFact).toMatchObject({ inSpecialFloodHazardArea: false });
  });

  it("refuses (never invents a zone) when a flood cell is kind=value but its companion row is missing", () => {
    const record = emptyRecord({
      flood: rail("record", { kind: "value", disposition: "rows", rowCount: 1, vintage: "2026-01-01" }, []),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.floodHazardFact).toEqual({ state: "refused", code: "parcel-record-malformed-cell", source: "flood-hazard-fact" });
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

/**
 * OPS-23 P-152 lane 4 (p152-slate): `composeZoningSetbackOverride` (P152-RAILS,
 * PR #393) had zero direct test coverage before this lane — only exercised
 * indirectly through `pe-property-atoms.ts`'s own integration tests, none of
 * which construct a fully record-served zoning-envelope rail group. These
 * cases use the REAL `parcel_record_cell` values for the probe parcel
 * `48021:34049` (Bastrop), read live from the FACTORY host
 * (ep-round-base-au0jofwp/neondb, 2026-09-13): setbackSideFt=10,
 * setbackRearFt=30, setbackCornerFt=20, source
 * `@empressaio/setback-corpus@1.1.0:bastrop-development-code` — the SAME
 * ordinance-sourced figures `get_smart_site`/the buildable-envelope endpoint
 * already serve (OPS-23 F3's "30/10/30/20"). The panel itself served
 * front_ft=30/side_ft=5/rear_ft=25/side_corner_ft=15 on this same live read
 * (2026-09-13T19:39Z) because these three rails carry no
 * `parcel-record-slate.json`/`PARCEL_RECORD_SLATE` entry today (a
 * hauska-engine + legacy-design-tools write, outside this lane's registered
 * repos — see this lane's close). This test proves the COMPOSE function
 * itself is correct and ready: once slated, the only remaining step is the
 * slate flip, not new hauska-map code. It is the "divergence test between
 * the record value and the last legacy value" the mission asked for,
 * expressed as fixture data because the live slate cannot be flipped from
 * this lane's write scope.
 */
describe("composeZoningSetbackOverride — real Bastrop parcel_record_cell fixtures (OPS-23 P-152 lane 4)", () => {
  const LEGACY_ATOM_CHAIN_SETBACKS_48021_34049_20260913 = {
    front_ft: 30,
    side_ft: 5,
    rear_ft: 25,
    side_corner_ft: 15,
  } as const;

  it("overrides side/rear/corner from record-served cells, diverging from the live legacy atom-chain values captured 2026-09-13", () => {
    const record = emptyRecord({
      setbackFrontFt: rail("record", {
        kind: "value",
        value: 30,
        source: "@empressaio/setback-corpus@1.1.0:bastrop-development-code",
        vintage: "2026-09-10T22:33:31.180Z",
      }),
      setbackSideFt: rail("record", {
        kind: "value",
        value: 10,
        source: "@empressaio/setback-corpus@1.1.0:bastrop-development-code",
        vintage: "2026-09-10T22:33:31.180Z",
      }),
      setbackRearFt: rail("record", {
        kind: "value",
        value: 30,
        source: "@empressaio/setback-corpus@1.1.0:bastrop-development-code",
        vintage: "2026-09-10T22:33:31.180Z",
      }),
      setbackCornerFt: rail("record", {
        kind: "value",
        value: 20,
        source: "@empressaio/setback-corpus@1.1.0:bastrop-development-code",
        vintage: "2026-09-10T22:33:31.180Z",
      }),
    });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.setbackAxisOverrides).toEqual({ front_ft: 30, side_ft: 10, rear_ft: 30, side_corner_ft: 20 });
    // The divergence this lane found live: today's served value disagrees with
    // the record's own cell on every axis but front (already slated).
    expect(override.setbackAxisOverrides).not.toEqual(LEGACY_ATOM_CHAIN_SETBACKS_48021_34049_20260913);
  });

  it("leaves side/rear/corner untouched (legacy-transitional) when the rails are unslated, matching today's live production response", () => {
    const record = emptyRecord({
      setbackFrontFt: rail("record", { kind: "value", value: 30 }),
      setbackSideFt: rail("legacy-transitional", { kind: "value", value: 10 }),
      setbackRearFt: rail("legacy-transitional", { kind: "value", value: 30 }),
      setbackCornerFt: rail("legacy-transitional", { kind: "value", value: 20 }),
    });

    const { override, railStates } = composeZoningSetbackOverride(record);

    expect(override.setbackAxisOverrides).toEqual({ front_ft: 30 });
    expect(railStates.setbackSideFt).toEqual({ serve: "legacy-transitional", atomBacked: false });
  });

  it("composes zoningJurisdictionKey onto override.jurisdictionKey when record-served", () => {
    const record = emptyRecord({
      zoningDistrict: rail("record", { kind: "value", value: "SF-1" }),
      zoningJurisdictionKey: rail("record", { kind: "value", value: "bastrop-development-code" }),
    });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.district).toBe("SF-1");
    expect(override.jurisdictionKey).toBe("bastrop-development-code");
  });

  /**
   * KNOWN GAP, named rather than silently accepted (OPS-23 P-152 lane 4
   * close, `leave_behind`): `zoningProvenance` is declared in
   * `COMPOSED_ZONING_SETBACK_RAIL_KEYS` (rail-keys.js / the retrieval-api
   * registry both carry it as a real, independent rail) and its `serve`
   * state is tracked in `railStates`, but `composeZoningSetbackOverride`
   * has no line anywhere that reads `record.rails.zoningProvenance`'s
   * VALUE onto any field of `ZoningSetbackOverride` — there is no
   * `provenance` (or similarly named) field on the PE zoning wire type for
   * it to land on. Slating `<county>:zoningProvenance` in the allowlist
   * would flip this rail's `serve` to `"record"` with zero visible effect
   * on any customer surface. This lane does not invent new wire surface to
   * close that gap (out of mandate — see the close's `scopeBasis`); this
   * test only makes the gap visible and regression-proof so a future
   * change to this function is not mistaken for zoningProvenance already
   * being wired.
   */
  it("tracks zoningProvenance's serve state but applies its value to no wire field (documented gap, not fixed here)", () => {
    expect(COMPOSED_ZONING_SETBACK_RAIL_KEYS).toContain("zoningProvenance");

    const record = emptyRecord({
      zoningDistrict: rail("record", { kind: "value", value: "SF-1" }),
      zoningProvenance: rail("record", { kind: "value", value: "bastrop-development-code:2026-06-ordinance" }),
    });

    const { override, railStates } = composeZoningSetbackOverride(record);

    expect(railStates.zoningProvenance).toEqual({ serve: "record", atomBacked: false });
    // No field on ZoningSetbackOverride carries this value today.
    expect(Object.keys(override).sort()).toEqual(
      ["district", "setbackRulesCitationUrl", "setbackRulesEffectiveDate"].sort(),
    );
  });
});
