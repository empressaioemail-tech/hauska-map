import { describe, expect, it } from "vitest";

import {
  composeRecordPatch,
  composeRecordUnavailablePatch,
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
      // P-332: no determination is in hand on this call (the caller passed no
      // prior fact), so the ETJ state is `unresolved` AND says why. The literal
      // is asserted, not read off the module's constant, so the test still
      // fails if the reason is ever emptied.
      etjReason:
        "no ETJ determination was served for this point; P-332: ETJ is never derived from city limits, nor city limits from ETJ.",
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
      etjReason:
        "no ETJ determination was served for this point; P-332: ETJ is never derived from city limits, nor city limits from ETJ.",
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
   * P-167 wave 5 (OPS-23 R-4) CLOSES the gap OPS-23 P-152 lane 4 named and
   * left open: `zoningProvenance` is declared in
   * `COMPOSED_ZONING_SETBACK_RAIL_KEYS` (rail-keys.js / the retrieval-api
   * registry both carry it as a real, independent rail) and its `serve`
   * state was tracked in `railStates`, but `composeZoningSetbackOverride`
   * had no line anywhere that read `record.rails.zoningProvenance`'s VALUE
   * onto any field of `ZoningSetbackOverride`. It now lands on
   * `override.provenance`, `applyZoningOverride` (pe-property-atoms.ts)
   * carries it onto `facets.zoning.provenance`, and the panel's zoning row
   * (fact-sheet-resolver.ts's `provenance({sourceUrl: ...})`) prints it as
   * the citation it is.
   */
  it("composes zoningProvenance onto override.provenance when record-served (P-167 wave 5)", () => {
    expect(COMPOSED_ZONING_SETBACK_RAIL_KEYS).toContain("zoningProvenance");

    const record = emptyRecord({
      zoningDistrict: rail("record", { kind: "value", value: "SF-1" }),
      zoningProvenance: rail("record", { kind: "value", value: "bastrop-development-code:2026-06-ordinance" }),
    });

    const { override, railStates } = composeZoningSetbackOverride(record);

    expect(railStates.zoningProvenance).toEqual({ serve: "record", atomBacked: false });
    expect(override.provenance).toBe("bastrop-development-code:2026-06-ordinance");
    expect(Object.keys(override).sort()).toEqual(
      [
        "district",
        "provenance",
        "setbackAxisOverrideVintage",
        "setbackRulesCitationUrl",
        "setbackRulesEffectiveDate",
      ].sort(),
    );
  });

  it("does not compose override.provenance when the zoningProvenance rail is not record-served", () => {
    const record = emptyRecord({
      zoningDistrict: rail("record", { kind: "value", value: "SF-1" }),
      zoningProvenance: rail("legacy-transitional", { kind: "value", value: "bastrop-development-code:2026-06-ordinance" }),
    });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.provenance).toBeUndefined();
  });
});

/**
 * P-270 (OPS-24 X11). The `setbackRules` rail is the one that serves the
 * citation the surface-probe's XD-11 grader reads (`facets.envelope.citationUrl`
 * — written only from `override.setbackRulesCitationUrl`), and until this lane
 * the composer read a date out of the row only when one happened to be there,
 * publishing NO state when it was not. A citation whose vintage could not be
 * read was therefore served plain: the silent pick the operator's
 * most-current-wins ruling forbids.
 */
describe("composeZoningSetbackOverride — setback-rule citation vintage (P-270, OPS-24 X11)", () => {
  const CITATION = "https://library.municode.com/tx/pflugerville/ordinances/2026-04-14";

  function setbackRulesRail(row: Record<string, unknown> | null, cellSource = "pflugerville_udc"): RecordRail {
    return rail(
      "record",
      { kind: "value", value: "rules-v1", source: cellSource, vintage: "2026-09-01T00:00:00.000Z" },
      row ? [{ rowIndex: 0, payload: row, source: cellSource, vintage: "2026-09-01T00:00:00.000Z" }] : [],
    );
  }

  it("`read` when the row's own date-bearing field holds a real date, and the date lands on setbackRulesEffectiveDate", () => {
    const record = emptyRecord({
      setbackRules: setbackRulesRail({ citationUrl: CITATION, effectiveDate: "2026-04-14" }),
    });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.setbackRulesEffectiveDate).toBe("2026-04-14");
    expect(override.setbackRulesCitationUrl).toBe(CITATION);
    expect(override.setbackRulesCitationDateRead).toEqual({
      sourceDate: "2026-04-14",
      state: "read",
    });
  });

  it("`absent-at-source` when the row carries the citation but no date field, and the date is NOT defaulted", () => {
    const record = emptyRecord({ setbackRules: setbackRulesRail({ citationUrl: CITATION }) });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.setbackRulesCitationUrl).toBe(CITATION);
    expect(override.setbackRulesEffectiveDate).toBeNull();
    expect(override.setbackRulesCitationDateRead).toEqual({
      sourceDate: null,
      state: "unreadable-absent-at-source",
    });
    expect(override.setbackRulesSourceLabel).toBe("parcel_record setbackRules (pflugerville_udc)");
  });

  it("`unparseable` when the field exists and holds something that is not a strict date", () => {
    const record = emptyRecord({
      setbackRules: setbackRulesRail({ citationUrl: CITATION, effective_date: "April 2026" }),
    });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.setbackRulesCitationDateRead).toEqual({
      sourceDate: null,
      state: "unreadable-unparseable",
    });
    expect(override.setbackRulesEffectiveDate).toBeNull();
  });

  it("reads the row's snake_case spelling too, so the `parcel_record` writer's own field name is not a second silent omission", () => {
    const record = emptyRecord({
      setbackRules: setbackRulesRail({ citation_url: CITATION, effective_date: "2026-04-14" }),
    });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.setbackRulesCitationUrl).toBe(CITATION);
    expect(override.setbackRulesCitationDateRead?.state).toBe("read");
  });

  it("DECLARES NOTHING when this rail is not record-served: the vintage of a citation this path did not serve is not this path's to announce", () => {
    const record = emptyRecord({
      setbackRules: rail("legacy-transitional", { kind: "value", value: "rules-v1" }),
    });

    const { override } = composeZoningSetbackOverride(record);

    // Absent keys, not `never-looked`: the same shape as
    // `setbackRulesCitationUrl` on a payload where nothing was served.
    expect("setbackRulesCitationDateRead" in override).toBe(false);
    expect("setbackRulesSourceLabel" in override).toBe(false);
    expect(override.setbackRulesCitationUrl).toBeNull();
  });

  it("a whole-parcel refusal reads no rail at all, so it declares no date read", () => {
    const refused = { ...emptyRecord(), refused: { code: "malformed-cell", reason: "no readable kind" } };

    const { override } = composeZoningSetbackOverride(refused as never);

    expect(override.setbackRulesCitationDateRead).toBeUndefined();
    expect(override.setbackRulesEffectiveDate).toBeNull();
  });

  it("the rail's own refused cell leaves the citation undeclared rather than inventing a date", () => {
    const record = emptyRecord({ setbackRules: rail("record", { kind: "refused", reason: "engine said no" }) });

    const { override } = composeZoningSetbackOverride(record);

    expect(override.setbackRulesCitationUrl).toBeNull();
    expect(override.setbackRulesCitationDateRead).toBeUndefined();
  });
});

/**
 * P-332 (OPS-24 wave 1). The record reader has no ETJ column — `rail.cell`
 * carries a city name or an unincorporated disposition and nothing about the
 * ETJ. So the determination the panel serves has exactly one place it can come
 * from on this path: the city-limits fact the patch REPLACES. Pre-change, all
 * four `composeCityLimits` branches wrote the literal `etjStatus:
 * "unresolved"`, so a parcel whose cortex read said `present` was served
 * `unresolved` the moment a record patch landed on it — the same wholesale-
 * replacement defect F21 caught for `queryPoint` in 2026-09-13, unnoticed for
 * the determination.
 *
 * `LIVE_48453_134392` below is the real `cityLimitsFact` cortex served for that
 * parcel (captured 2026-09-18 via the spine's own cortex proxy) and is
 * transcribed, not paraphrased.
 */
const LIVE_48453_134392_CITY_LIMITS = {
  status: "incorporated",
  etjStatus: "present",
  source: "tx_city_boundary",
  basis:
    "parcel_record cityLimits: incorporated, city 'Austin' (source: landing_parcel_jurisdiction, vintage: 2026-09-17T19:23:36.801Z). ETJ: point-in-polygon against tx_etj_boundary etj_id=austin-tx:39 (Austin: \"AUSTIN 2 MILE ETJ\", ring 39)",
  cityName: "Austin",
  queryPoint: { longitude: -97.85514, latitude: 30.35297 },
  etjFact: {
    status: "present",
    source: "tx_etj_boundary",
    basis:
      "point-in-polygon against tx_etj_boundary etj_id=austin-tx:39 (Austin: \"AUSTIN 2 MILE ETJ\", ring 39)",
    cityKey: "austin-tx",
    cityName: "Austin",
    ringLabel: "AUSTIN 2 MILE ETJ",
    etjId: "austin-tx:39",
    sourceCitation:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/BOUNDARIES_jurisdictions/FeatureServer/0",
    queryPoint: { longitude: -97.85514, latitude: 30.35297 },
  },
};

const RECORD_FAILURE = {
  errorClass: "http-error" as const,
  httpStatus: 503,
  reason: "record HTTP 503",
};

describe("P-332 — the ETJ determination survives the record patch (falsifier F1)", () => {
  it("F1: a record-served UNINCORPORATED cell does not blank a determination already in hand — the patch serves the real read, not the literal", () => {
    const record = emptyRecord({
      cityLimits: rail("record", { kind: "absent-verified", basis: { disposition: "unincorporated", source: "landing_parcel_jurisdiction" } }),
    });

    const { patch } = composeRecordPatch(record, LIVE_48453_134392_CITY_LIMITS as never);
    const served = patch.cityLimitsFact!;

    expect(served.status).toBe("unincorporated");
    // The read is `present` on land the city limits reading now calls
    // unincorporated. That is the coherent ETJ case, not a conflict — and it is
    // NOT `unresolved`, which is what this returned before the change.
    expect(served.etjStatus).toBe("present");
    expect(served.etjStatus).not.toBe("unresolved");
    expect(served.etjReason).toBeUndefined();
    expect(served.etjFact?.etjId).toBe("austin-tx:39");
    expect(served.etjFact?.ringLabel).toBe("AUSTIN 2 MILE ETJ");
    expect(served.etjFact?.sourceCitation).toContain("BOUNDARIES_jurisdictions");
  });

  it("F1 control: with NO determination in hand the same composition still serves `unresolved` — and now says why", () => {
    const record = emptyRecord({
      cityLimits: rail("record", { kind: "absent-verified", basis: { disposition: "unincorporated", source: "landing_parcel_jurisdiction" } }),
    });

    const { patch } = composeRecordPatch(record);
    const served = patch.cityLimitsFact!;

    expect(served.etjStatus).toBe("unresolved");
    expect(served.etjReason).toBe(
      "no ETJ determination was served for this point; P-332: ETJ is never derived from city limits, nor city limits from ETJ.",
    );
  });

  it("F3: a record-served INCORPORATED cell on top of a present read declares the conflict instead of serving `present` as a clean fact", () => {
    const record = emptyRecord({
      cityLimits: rail("record", {
        kind: "value",
        value: "Bastrop",
        source: "landing_parcel_jurisdiction",
        vintage: "2026-09-02T18:13:56.751Z",
      }),
    });

    const { patch } = composeRecordPatch(record, LIVE_48453_134392_CITY_LIMITS as never);
    const served = patch.cityLimitsFact!;

    expect(served.status).toBe("incorporated");
    expect(served.etjStatus).toBe("conflicting");
    // The direction that would catch verbatim forwarding:
    expect(served.etjStatus).not.toBe("present");
    // Both sides, both bases, neither dropped:
    expect(served.etjConflict?.cityLimits.basis).toContain("landing_parcel_jurisdiction");
    expect(served.etjConflict?.cityLimits.cityName).toBe("Bastrop");
    expect(served.etjConflict?.etj.basis).toContain("tx_etj_boundary");
    expect(served.etjConflict?.etj.etjId).toBe("austin-tx:39");
    expect(served.etjFact?.status).toBe("present");
  });

  it("a declared /record OUTAGE is not an ETJ event: the city-limits reader failing does not invalidate a determination from another source", () => {
    const patch = composeRecordUnavailablePatch(RECORD_FAILURE, LIVE_48453_134392_CITY_LIMITS as never);
    const served = patch.cityLimitsFact!;

    expect(served.status).toBe("unmeasured");
    expect(served.etjStatus).toBe("present");
    expect(served.etjFact?.etjId).toBe("austin-tx:39");
  });

  it("...and with none in hand the outage serves `unresolved` with its reason, never a derivation", () => {
    const patch = composeRecordUnavailablePatch(RECORD_FAILURE);
    const served = patch.cityLimitsFact!;

    expect(served.status).toBe("unmeasured");
    expect(served.etjStatus).toBe("unresolved");
    expect(served.etjReason).toBe(
      "no ETJ determination was served for this point; P-332: ETJ is never derived from city limits, nor city limits from ETJ.",
    );
  });

  it("stale residue does not survive: a prior fact that was already `conflicting` re-composes cleanly to `absent` when the read in hand is an absence", () => {
    const conflicting = composeRecordPatch(
      emptyRecord({
        cityLimits: rail("record", { kind: "value", value: "Bastrop", source: "landing_parcel_jurisdiction", vintage: "v" }),
      }),
      LIVE_48453_134392_CITY_LIMITS as never,
    ).patch.cityLimitsFact!;
    expect(conflicting.etjStatus).toBe("conflicting");

    const absentPrior = {
      ...conflicting,
      etjStatus: "absent",
      etjFact: { status: "absent", source: "tx_etj_boundary", basis: "checked against published rings" },
    };
    const { patch } = composeRecordPatch(
      emptyRecord({
        cityLimits: rail("record", { kind: "absent-verified", basis: { disposition: "unincorporated", source: "landing_parcel_jurisdiction" } }),
      }),
      absentPrior as never,
    );

    expect(patch.cityLimitsFact?.etjStatus).toBe("absent");
    expect(patch.cityLimitsFact?.etjConflict).toBeUndefined();
    expect(patch.cityLimitsFact?.etjReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------- P-270 address half
/**
 * Measured live 2026-09-18 on Pflugerville `48453:445501`: the ledger holds
 * `situsZip` `78660` and names `cityLimits` `Pflugerville`, while the roll's
 * `situsCity` is ABSENT-VERIFIED (both the cad-parcel-roll claim and the
 * declared-vintage `cad_property.situs_city` are empty). The card served neither.
 * These are the ledger → `baseFacts` carry rules, both directions.
 */
describe("composeRecordPatch — P-270 address half (baseFactsSitus)", () => {
  const rollCarriesNoCity = {
    kind: "absent-verified",
    basis: { verdict: "absent-verified", authority: "Travis County CAD roll" },
  };
  const incorporated = {
    kind: "value",
    value: "Pflugerville",
    source: "landing_parcel_jurisdiction",
    vintage: "2026-09-17T19:23:36.801Z",
  };

  it("carries situsZip from a record-served value cell (the ledger ZIP the card dropped)", () => {
    const record = emptyRecord({
      situsZip: rail("record", { kind: "value", value: "78660", source: "cad-parcel-roll", vintage: "2026-09-17" }),
    });
    expect(composeRecordPatch(record).patch.baseFactsSitus).toEqual({ situsZip: "78660" });
  });

  it("names the roll's own city as the roll's city when the situsCity rail is a value", () => {
    const record = emptyRecord({
      situsCity: rail("record", { kind: "value", value: "Dripping Springs", source: "cad-parcel-roll", vintage: "2026-09-17" }),
      cityLimits: rail("record", incorporated),
    });
    expect(composeRecordPatch(record).patch.baseFactsSitus).toEqual({
      situsCity: "Dripping Springs",
      situsCityBasis: "cad-roll",
    });
  });

  it("falls back to the city whose LIMITS CONTAIN the parcel when the roll's city is absent-verified, and labels the basis (the 48453:445501 shape)", () => {
    const record = emptyRecord({
      situsCity: rail("record", rollCarriesNoCity),
      situsState: rail("record", { kind: "value", value: "TX" }),
      situsZip: rail("record", { kind: "value", value: "78660" }),
      cityLimits: rail("record", incorporated),
    });
    expect(composeRecordPatch(record).patch.baseFactsSitus).toEqual({
      situsCity: "Pflugerville",
      situsCityBasis: "city-limits",
      situsState: "TX",
      situsZip: "78660",
    });
  });

  it("names NO city when the roll's situsCity rail is unslated, refused or malformed — a city is never inferred from a rail that was never read", () => {
    for (const absentRail of [
      undefined,
      rail("refused", null),
      rail("legacy-transitional", { kind: "value", value: "Bastrop" }),
      rail("record", { kind: "malformed" }),
    ]) {
      const record = emptyRecord({
        ...(absentRail ? { situsCity: absentRail } : {}),
        cityLimits: rail("record", incorporated),
      });
      expect(composeRecordPatch(record).patch.baseFactsSitus).toBeUndefined();
    }
  });

  it("names no city for an unincorporated parcel the roll gives no city for (no cityLimits value to fall back to)", () => {
    const record = emptyRecord({
      situsCity: rail("record", rollCarriesNoCity),
      cityLimits: rail("record", { kind: "absent-verified", basis: { disposition: "unincorporated" } }),
      situsZip: rail("record", { kind: "value", value: "78602" }),
    });
    expect(composeRecordPatch(record).patch.baseFactsSitus).toEqual({ situsZip: "78602" });
  });

  it("does not invent a ZIP from an absent, refused or non-string cell", () => {
    const record = emptyRecord({
      situsZip: rail("record", { kind: "absent-verified", basis: { verdict: "absent-verified" } }),
    });
    expect(composeRecordPatch(record).patch.baseFactsSitus).toBeUndefined();
  });

  it("reports the three address rails in recordRailStates so the panel can tell 'the roll states none' from 'nobody looked'", () => {
    const record = emptyRecord({
      situsCity: rail("record", rollCarriesNoCity),
      situsZip: rail("record", { kind: "value", value: "78660" }),
      cityLimits: rail("record", incorporated),
    });
    const { railStates } = composeRecordPatch(record);
    expect(railStates.situsCity).toEqual({ serve: "record", atomBacked: false });
    expect(railStates.situsZip).toEqual({ serve: "record", atomBacked: false });
  });

  it("keeps P-332's ETJ behaviour untouched: the city fallback changes no ETJ field", () => {
    const record = emptyRecord({
      situsCity: rail("record", rollCarriesNoCity),
      cityLimits: rail("record", incorporated),
    });
    const { patch } = composeRecordPatch(record);
    expect(patch.cityLimitsFact?.status).toBe("incorporated");
    expect(patch.cityLimitsFact?.cityName).toBe("Pflugerville");
    expect(patch.cityLimitsFact?.etjStatus).toBe("unresolved");
  });
});

