import { afterEach, describe, expect, it, vi } from "vitest";

import { applyRecordPatch, bastropPerParcelSetbackIfNeeded, fetchParcelRecordOnce } from "./pe-property-atoms";
import type { PeBakedFacetsResponse } from "./atom-chain-to-facets";
import type { ParcelRecordResponse, RecordRail } from "./pe-record-to-facets";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function recordRail(serve: RecordRail["serve"], cell: Record<string, unknown> | null): RecordRail {
  return { cell, gate: { verdict: null, evaluatedAt: null }, serve, atom: null, atomBacked: false, rendering: null, companions: [] };
}

function basePayload(): PeBakedFacetsResponse {
  return {
    parcelNodeId: "48021:34049",
    adapterKey: "property-atom-chain",
    source: "atom-chain",
    snapshotAt: "2026-08-05T00:00:00.000Z",
    readPath: "atom-chain",
    facets: {
      parcelNodeId: "48021:34049",
      countyFips: "48021",
      baseFacts: { apn: "34049" },
      zoning: { district: "RR" },
      envelope: null,
      facetCoverage: { baseFacts: true, landUse: false, acreage: false, zoning: true, envelope: false },
      provenance: { parcelSource: "property-atom-chain" },
    },
    // Pre-existing cortex-sourced value, to prove `/record` wins for a rail it slates.
    cityLimitsFact: { status: "unmeasured", etjStatus: "unresolved", source: "tx_city_boundary", basis: "stale cortex copy" },
  };
}

describe("fetchParcelRecordOnce / applyRecordPatch (P152-PANEL)", () => {
  it("refuses without a configured retrieval key, same contract as the atom-chain fetch", async () => {
    const result = await fetchParcelRecordOnce("48021:34049");
    expect(result).toEqual({ ok: false, reason: "missing HAUSKA_RETRIEVAL_API_KEY|RETRIEVAL_API_KEY" });
  });

  it("calls GET /property-nodes/:id/record with the same Bearer key as the atom-chain client", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {},
      refused: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(recordBody));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchParcelRecordOnce("48021:34049");

    expect(result).toEqual({ ok: true, record: recordBody });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/property-nodes/48021%3A34049/record");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("applyRecordPatch overrides a rail the reader slates as record, sets readPath to record, and leaves other fields untouched", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        cityLimits: recordRail("record", {
          kind: "value",
          value: "Bastrop",
          source: "landing_parcel_jurisdiction",
          vintage: "2026-09-02T18:13:56.751Z",
        }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.readPath).toBe("record");
    expect(after.cityLimitsFact).toEqual({
      status: "incorporated",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis:
        "parcel_record cityLimits: incorporated, city 'Bastrop' (source: landing_parcel_jurisdiction, vintage: 2026-09-02T18:13:56.751Z).",
      cityName: "Bastrop",
    });
    expect(after.recordRailStates).toEqual({ cityLimits: { serve: "record", atomBacked: false } });
    // Nothing else on the payload moved.
    expect(after.facets).toEqual(before.facets);
    expect(after.parcelNodeId).toBe(before.parcelNodeId);
  });

  it("F21 (2026-09-13, overseer finding): applyRecordPatch PRESERVES cityLimitsFact.queryPoint from the cortex merge when overriding cityLimits with a record-composed fact — P-151 seeds placement from this field, and composeCityLimits has no way to construct it itself", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        cityLimits: recordRail("record", {
          kind: "value",
          value: "Bastrop",
          source: "landing_parcel_jurisdiction",
          vintage: "2026-09-02T18:13:56.751Z",
        }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    // Simulates mergeBakedBaseFacts having already carried cortex's own
    // cityLimitsFact (with queryPoint) onto the payload before this
    // function runs — the real production shape (withCityLimitsFact,
    // atom-chain-to-facets.ts).
    before.cityLimitsFact = {
      status: "unmeasured",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: "stale cortex copy",
      queryPoint: { longitude: -97.31717, latitude: 30.11238 },
    };
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.cityLimitsFact?.status).toBe("incorporated"); // the record composition still wins on status/basis/cityName
    expect(after.cityLimitsFact?.cityName).toBe("Bastrop");
    expect(after.cityLimitsFact?.queryPoint).toEqual({ longitude: -97.31717, latitude: 30.11238 }); // but queryPoint survives
  });

  it("F21: never fabricates a queryPoint when the pre-existing payload never had one (e.g. cortex merge failed or never carried the field)", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        cityLimits: recordRail("record", { kind: "value", value: "Bastrop", source: "landing_parcel_jurisdiction", vintage: "2026-09-02T18:13:56.751Z" }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload(); // no queryPoint on the pre-existing cityLimitsFact
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.cityLimitsFact?.queryPoint).toBeUndefined();
  });

  it("F21: queryPoint is also preserved across a declared /record outage (item 3's refusal branch)", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, false, 503)));

    const before = basePayload();
    before.cityLimitsFact = {
      status: "incorporated",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: "prior good read",
      cityName: "Bastrop",
      queryPoint: { longitude: -97.31717, latitude: 30.11238 },
    };
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.readPath).toBe("record-unavailable");
    expect(after.cityLimitsFact?.status).toBe("unmeasured"); // the outage refusal still wins on status/basis
    expect(after.cityLimitsFact?.queryPoint).toEqual({ longitude: -97.31717, latitude: 30.11238 }); // queryPoint survives the outage too
  });

  it("P152-RAILS item 3: applyRecordPatch DECLARES a /record outage — readPath becomes record-unavailable and every rail this lane's composer owns is a typed refusal carrying the HTTP status, never a silent no-op that leaves a stale cortex-sourced value standing in as current (R-6)", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, false, 503)));

    const before = basePayload();
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.readPath).toBe("record-unavailable");
    expect(after.cityLimitsFact).toEqual({
      status: "unmeasured",
      etjStatus: "unresolved",
      source: "tx_city_boundary",
      basis: "parcel_record reader unavailable (http-error 503): record HTTP 503",
    });
    expect(after.floodHazardFact).toEqual({
      state: "refused",
      code: "parcel-record-unavailable",
      source: "flood-hazard-fact",
      reason: "parcel_record reader unavailable (http-error 503): record HTTP 503",
    });
    // zoning/envelope have no honest refused shape to invent (see module
    // doc) — the pre-existing atom-chain value is untouched, same as before
    // this lane.
    expect(after.facets.zoning).toEqual(before.facets.zoning);
    expect(after.facets.envelope).toEqual(before.facets.envelope);
  });

  it("P152-RAILS item 3: a timeout classifies as errorClass 'timeout', not 'http-error'", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const abortError = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const before = basePayload();
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.readPath).toBe("record-unavailable");
    expect((after.wellFact as { reason: string }).reason).toMatch(/\(timeout\)/);
  });

  it("P152-RAILS item 1: setback axis override applies only to the reader-slated axis; unslated axes and every envelope figure field (status/geojson/buildableArea*) stay atom-chain-owned (R-2)", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        zoningDistrict: recordRail("record", { kind: "value", value: "RR", source: "parcel_record", vintage: "2026-09-01T00:00:00.000Z" }),
        setbackFrontFt: recordRail("record", { kind: "value", value: 30, source: "parcel_record", vintage: "2026-09-01T00:00:00.000Z" }),
        // Unslated for this county — legacy-transitional, must NOT override side/rear/corner.
        setbackSideFt: recordRail("legacy-transitional", null),
        setbackRearFt: recordRail("legacy-transitional", null),
        setbackCornerFt: recordRail("legacy-transitional", null),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    before.facets.envelope = {
      status: "ok",
      district: "RR",
      setbacks: { front_ft: 25, side_ft: 5, rear_ft: 25, side_corner_ft: 15 },
      approximate: true,
      provisional: true,
      buildableAreaSqFt: 4000,
      buildableAreaPct: 40,
      disclosure: "Atom-chain buildable envelope.",
    };
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.readPath).toBe("record");
    expect(after.facets.zoning).toEqual({ district: "RR" });
    expect(after.facets.envelope?.setbacks).toEqual({
      front_ft: 30, // overridden (record)
      side_ft: 5, // unchanged (legacy-transitional)
      rear_ft: 25, // unchanged (legacy-transitional)
      side_corner_ft: 15, // unchanged (legacy-transitional)
    });
    // R-2: the figure never moves.
    expect(after.facets.envelope?.status).toBe("ok");
    expect(after.facets.envelope?.buildableAreaSqFt).toBe(4000);
    expect(after.facets.envelope?.buildableAreaPct).toBe(40);
  });

  /**
   * P-216 (2026-09-15): live production defect — a payload's top-level
   * `snapshotAt` (and `facets.bakedAt`) named a 2026-07 atom-chain read even
   * though `applyEnvelopeSetbackOverride` had folded in a 2026-09
   * parcel_record axis override for the same response, so the whole payload
   * read as 54-days stale despite carrying content written that same day.
   * The fix: `snapshotAt`/`bakedAt` take the NEWER of the atom-chain date and
   * the overriding axis cell's own vintage, never silently keeping the
   * older one once a fresher axis has been folded in.
   */
  it("P-216: bumps snapshotAt/bakedAt to the newer parcel_record axis vintage when an axis override is applied, so a hybrid payload never wears only its older date", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48209:97658",
      placeKey: "48209:97658",
      countyFips: "48209",
      railRegistrySha: "sha",
      readAt: "2026-09-15T00:54:11.683Z",
      rails: {
        setbackFrontFt: recordRail("record", { kind: "value", value: 25, source: "parcel_record", vintage: "2026-09-15T00:54:11.683Z" }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    before.parcelNodeId = "48209:97658";
    before.facets.parcelNodeId = "48209:97658";
    before.snapshotAt = "2026-07-23T20:00:00.000Z"; // the stale atom-chain read
    before.facets.envelope = {
      status: "ok",
      district: "SF-6",
      setbacks: { front_ft: 20, side_ft: 5, rear_ft: 20 },
      approximate: true,
      provisional: true,
      disclosure: "Atom-chain buildable envelope.",
    };
    const after = await applyRecordPatch(before, "48209:97658");

    expect(after.snapshotAt).toBe("2026-09-15T00:54:11.683Z");
    expect(after.facets.bakedAt).toBe("2026-09-15T00:54:11.683Z");
  });

  it("P-216: leaves snapshotAt/bakedAt untouched when no axis override is applied (no new date to fold in)", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        cityLimits: recordRail("record", { kind: "value", value: "Bastrop", source: "landing_parcel_jurisdiction", vintage: "2026-09-02T18:13:56.751Z" }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.snapshotAt).toBe(before.snapshotAt);
    expect(after.facets.bakedAt).toBe(before.facets.bakedAt);
  });

  /**
   * P-167 wave 5 (OPS-23 R-4). Closes the gap OPS-23 P-152 lane 4 left open
   * (pe-record-to-facets.test.ts's former "documented gap" test): the
   * zoningProvenance rail's value now reaches facets.zoning.provenance
   * end-to-end through applyRecordPatch, so the panel's zoning row has it
   * to print.
   */
  it("P-167 wave 5: applyRecordPatch carries zoningProvenance through onto facets.zoning.provenance", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        zoningDistrict: recordRail("record", { kind: "value", value: "RR", source: "parcel_record", vintage: "2026-09-01T00:00:00.000Z" }),
        zoningProvenance: recordRail("record", { kind: "value", value: "bastrop-development-code:2026-06-ordinance", source: "parcel_record", vintage: "2026-09-01T00:00:00.000Z" }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.readPath).toBe("record");
    expect(after.facets.zoning).toEqual({
      district: "RR",
      provenance: "bastrop-development-code:2026-06-ordinance",
    });
  });

  it("P152-RAILS item 1: never invents a setbacks object when the atom chain declined the envelope (no re-derivation of the decline/ok tree)", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        setbackFrontFt: recordRail("record", { kind: "value", value: 30, source: "parcel_record", vintage: "2026-09-01T00:00:00.000Z" }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    before.facets.envelope = {
      status: "declined",
      declineReason: "setback-rule-pending",
      approximate: true,
      provisional: true,
    };
    const after = await applyRecordPatch(before, "48021:34049");

    expect(after.facets.envelope).toEqual(before.facets.envelope);
  });

  it("does not surface a legacy-transitional rail's /record cell onto the wire — the existing cortex-merge value for that field is left alone", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const recordBody: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        cityLimits: recordRail("legacy-transitional", { kind: "value", value: "Some Other City" }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordBody)));

    const before = basePayload();
    const after = await applyRecordPatch(before, "48021:34049");

    // The pre-existing (cortex-sourced) cityLimitsFact survives untouched —
    // proving the reader does not silently override a rail it does not slate.
    expect(after.cityLimitsFact).toEqual(before.cityLimitsFact);
    // readPath still flips to "record" because the reader WAS consulted for
    // this response (per the dispatch falsifier) — even though this
    // particular rail deferred to the legacy path.
    expect(after.readPath).toBe("record");
  });
});

/**
 * P-270 (OPS-24 X11). The live defect this lane closes: the `setbackRules` rail
 * serves a citation whose effective date cannot be read, and until this lane
 * the payload carried the citation with NO statement of its vintage — so the
 * card printed a citation the reader had to assume was current. The operator's
 * most-current-wins ruling (2026-09-11) says an unreadable date is a conflict
 * row, never a silent pick.
 *
 * These are end-to-end through `applyRecordPatch` because that is the only
 * writer of `facets.envelope.citationUrl` in this app, and therefore the field
 * the surface-probe's XD-11 grader reads.
 */
describe("P-270 (OPS-24 X11) — a citation whose effective date could not be read is declared, never served plain", () => {
  const CITATION = "https://library.municode.com/tx/pflugerville/ordinances/2026-04-14";
  const NOTE =
    "Setback rule vintage unknown — the rule is served undated, not as current. Verify with the city.";

  /** A `setbackRules` rail as the reader slates it: one companion row carrying the citation. */
  function setbackRulesRail(row: Record<string, unknown> | null, cellSource = "pflugerville_udc"): RecordRail {
    return {
      cell: { kind: "value", value: "rules-v1", source: cellSource, vintage: "2026-09-01T00:00:00.000Z" },
      gate: { verdict: null, evaluatedAt: null },
      serve: "record",
      atom: null,
      atomBacked: false,
      rendering: null,
      companions: row
        ? [{ rowIndex: 0, payload: row, source: cellSource, vintage: "2026-09-01T00:00:00.000Z" }]
        : [],
    };
  }

  /**
   * The shape every XD-11 parcel has: the rail IS consulted and it DOES serve a
   * citation, but its own date-bearing field carries no date. An axis override
   * rides along because the composer only writes a citation when it also has
   * something of its own to apply (the pre-existing guard, unchanged here).
   */
  function recordWithCitationRow(row: Record<string, unknown> | null) {
    const record: ParcelRecordResponse = {
      parcelNodeId: "48453:445501",
      placeKey: "48453:445501",
      countyFips: "48453",
      railRegistrySha: "sha",
      readAt: "2026-09-17T00:00:00.000Z",
      rails: {
        setbackFrontFt: recordRail("record", {
          kind: "value",
          value: 25,
          source: "parcel_record",
          vintage: "2026-09-17T00:00:00.000Z",
        }),
        setbackRules: setbackRulesRail(row),
      },
      refused: null,
    };
    return record;
  }

  function baseWithEnvelope(): PeBakedFacetsResponse {
    const payload = basePayload();
    payload.parcelNodeId = "48453:445501";
    payload.facets.parcelNodeId = "48453:445501";
    payload.facets.envelope = {
      status: "ok",
      district: "SF-1",
      setbacks: { front_ft: 20, side_ft: 5, rear_ft: 20 },
      approximate: true,
      provisional: true,
      buildableAreaSqFt: 4000,
      buildableAreaPct: 40,
      disclosure: "Atom-chain buildable envelope.",
    };
    return payload;
  }

  it("SERVES THE CONFLICT ROW when the source's own date-bearing field carries no date", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(recordWithCitationRow({ citationUrl: CITATION })),
      ),
    );

    const after = await applyRecordPatch(baseWithEnvelope(), "48453:445501");
    const env = after.facets.envelope;

    // The citation itself is unchanged: this lane does not withhold a value the
    // source really does cite, it qualifies it.
    expect(env?.citationUrl).toBe(CITATION);
    expect(env?.citationVintage).toEqual({
      kind: "setback-citation-vintage-unreadable",
      state: "unreadable-absent-at-source",
      sourceLabel: "parcel_record setbackRules (pflugerville_udc)",
      citationUrl: CITATION,
      note: NOTE,
    });
    expect(env?.disclosure).toContain(NOTE);
    // The row is about the citation the payload serves, and it names the source.
    expect(env?.citationVintage?.citationUrl).toBe(env?.citationUrl);
    expect(env?.citationVintage?.sourceLabel).toContain("setbackRules");
  });

  it("tells `unparseable` apart from `absent-at-source` on the same rail — a bad value in a good field is a different defect", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(recordWithCitationRow({ citationUrl: CITATION, effectiveDate: "April 2026" })),
      ),
    );

    const after = await applyRecordPatch(baseWithEnvelope(), "48453:445501");
    const env = after.facets.envelope;

    expect(env?.citationVintage?.state).toBe("unreadable-unparseable");
    // The bad value is NOT promoted into the effective-date field, so nothing
    // downstream can compare it as a date.
    expect(env?.sourceDate ?? null).toBeNull();
    expect(env?.disclosure).not.toContain("April 2026");
  });

  it("THE AGREEING CONTROL: a readable effective date publishes NO row and adds NO sentence", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(recordWithCitationRow({ citationUrl: CITATION, effectiveDate: "2026-04-14" })),
      ),
    );

    const after = await applyRecordPatch(baseWithEnvelope(), "48453:445501");
    const env = after.facets.envelope;

    expect("citationVintage" in (env ?? {})).toBe(false);
    expect(env?.citationVintage).toBeUndefined();
    expect(env?.disclosure).not.toContain(NOTE);
    // The dated case keeps the pre-existing date note it always had.
    expect(env?.disclosure).toContain("setback rule effective 2026-04-14");
  });

  it("a rail that serves NO row at all still declares absent-at-source rather than staying silent", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(recordWithCitationRow(null))));

    const after = await applyRecordPatch(baseWithEnvelope(), "48453:445501");

    // No row means no citation either, so there is nothing to qualify: the
    // honest payload carries neither a citation nor a declaration about one.
    expect(after.facets.envelope?.citationUrl).toBeUndefined();
    expect(after.facets.envelope?.citationVintage).toBeUndefined();
    expect(after.facets.envelope?.disclosure).not.toContain(NOTE);
  });

  it("REPLACING a citation also replaces its declaration: a stale row must not survive onto a newly dated citation", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(recordWithCitationRow({ citationUrl: CITATION, effectiveDate: "2026-04-14" })),
      ),
    );

    const before = baseWithEnvelope();
    before.facets.envelope = {
      ...before.facets.envelope!,
      // As an atom-chain-built envelope would have left it: its own undated
      // citation, already declared. The record rail now serves a DATED one.
      citationVintage: {
        kind: "setback-citation-vintage-unreadable",
        state: "unreadable-never-looked",
        sourceLabel: "property atom chain setback-rule (no basis on wire)",
        citationUrl: "https://example.gov/old-undated-citation",
        note: NOTE,
      },
      disclosure: `Atom-chain buildable envelope. ${NOTE}`,
    };

    const after = await applyRecordPatch(before, "48453:445501");
    const env = after.facets.envelope;

    // The row described the OLD citation, so it cannot stand for the new one.
    expect("citationVintage" in (env ?? {})).toBe(false);
    expect(env?.citationUrl).toBe(CITATION);
  });

  it("does not touch a payload whose rail is unslated: byte-identical to what it was before this lane", async () => {
    vi.stubEnv("HAUSKA_RETRIEVAL_API_KEY", "test-key");
    const record: ParcelRecordResponse = {
      parcelNodeId: "48021:34049",
      placeKey: "48021:34049",
      countyFips: "48021",
      railRegistrySha: "sha",
      readAt: "2026-09-12T00:00:00.000Z",
      rails: {
        cityLimits: recordRail("record", {
          kind: "value",
          value: "Bastrop",
          source: "landing_parcel_jurisdiction",
          vintage: "2026-09-02T18:13:56.751Z",
        }),
      },
      refused: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(record)));

    const before = baseWithEnvelope();
    const beforeEnvelope = JSON.parse(JSON.stringify(before.facets.envelope));
    const after = await applyRecordPatch(before, "48021:34049");

    expect(JSON.parse(JSON.stringify(after.facets.envelope))).toEqual(beforeEnvelope);
  });
});

describe("bastropPerParcelSetbackIfNeeded", () => {
  it("fetches and returns live scalars for a Bastrop city parcel with no existing live rule", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 8733833,
              ZoneTypeClass: 2,
              FrontSetback_: 50,
              SideSetback: "20 ft",
              RearSetback_: 50,
              Shape__Area: 22168.1,
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48021:8733833", {
      zoningFact: {
        district: "RR",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
      },
      setbackRule: null,
    });

    expect(result).toEqual({ front_ft: 50, rear_ft: 50, side_ft: 20, side_corner_ft: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null and never calls fetch for a normal table jurisdiction (Austin)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48453:280239", {
      zoningFact: {
        district: "SF-3",
        sourceAdapter: "txgio-zoning-stamp:austin-tx",
      },
      setbackRule: null,
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null and never calls fetch when the atom-chain already carries a live layer-23 rule", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48021:8733833", {
      zoningFact: {
        district: "RR",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
      },
      setbackRule: {
        front: 50,
        side: 20,
        rear: 50,
        districtCode: "RR",
        sourceAdapter: "bastrop-per-parcel-record-layer-23",
      },
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null (propagating an honest decline) when the live record is unusable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 8733833,
              ZoneTypeClass: 2,
              FrontSetback_: 50,
              SideSetback: "see ordinance",
              RearSetback_: 50,
              Shape__Area: 22168.1,
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48021:8733833", {
      zoningFact: {
        district: "RR",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
      },
      setbackRule: null,
    });

    expect(result).toBeNull();
  });
});
