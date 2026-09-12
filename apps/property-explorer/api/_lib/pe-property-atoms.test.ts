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
