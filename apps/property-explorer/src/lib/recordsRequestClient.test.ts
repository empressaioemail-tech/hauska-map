import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchRecordsRun,
  instantGisHitsFromWire,
  instrumentsFromClassifiedScope,
  instrumentsFromIndexHits,
  instrumentsFromScope,
  RECORDS_NOT_REQUESTED_NOTICE,
  RECORDS_NOT_WIRED_NOTICE,
  requestRecordsRun,
  verdictsFromScopeAndJob,
} from "./recordsRequestClient";

const ROUND_ROCK_GIS_AUDIT = {
  queriedAt: "2026-08-27T12:00:00.000Z",
  parcelKey: "48491:RR-LOT",
  countyFips: "48491",
  layers: [],
  hits: [
    {
      sourceLayerId: "round-rock-easements",
      sourceLayerName: "City of Round Rock Easements",
      recordingRef: "2020-12345",
      easementType: "Utility",
      corridorWidthFt: null,
      featureIds: [42],
    },
  ],
};

const RURAL_EMPTY_GIS_AUDIT = {
  queriedAt: "2026-08-27T12:00:00.000Z",
  parcelKey: "48027:RURAL",
  countyFips: "48027",
  layers: [],
  hits: [],
};

describe("instantGisHitsFromWire", () => {
  it("maps live GIS audit hits to acknowledgement rows", () => {
    const hits = instantGisHitsFromWire(ROUND_ROCK_GIS_AUDIT);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: "round-rock-easements",
      title: "Utility easement",
      citation: expect.stringContaining("City of Round Rock Easements"),
    });
    expect(hits[0]?.citation).toContain("rec. 2020-12345");
  });

  it("returns empty array for missing or empty hits", () => {
    expect(instantGisHitsFromWire(null)).toEqual([]);
    expect(instantGisHitsFromWire(RURAL_EMPTY_GIS_AUDIT)).toEqual([]);
  });
});

describe("instrumentsFromScope", () => {
  it("maps indexHits with honest clerk-index labels", () => {
    const rows = instrumentsFromIndexHits({
      indexHits: [
        {
          recordingRef: "2019012345",
          documentType: "WARRANTY DEED",
          recordingDate: "2019-01-02",
          parties: "SMITH, JOHN",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.instrumentNumber).toBe("2019012345");
    expect(rows[0]?.label).toBe("WARRANTY DEED");
    expect(rows[0]?.readDepth).toBe("not-acquired");
    expect(rows[0]?.acquisitionNote).toContain("Clerk index hit");
  });

  it("prefers classified recordedInstruments over indexHits", () => {
    const rows = instrumentsFromScope({
      recordedInstruments: [
        {
          id: "ri-1",
          instrumentType: "deed",
          documentKind: "Warranty deed",
          recording: {
            instrumentNumber: "2019012345",
            recordingDate: "2019-01-02",
          },
          parties: "A TO B",
          acquisitionMethod: "download",
        },
      ],
      indexHits: [
        {
          recordingRef: "9999999999",
          documentType: "SHOULD NOT WIN",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.instrumentNumber).toBe("2019012345");
    expect(rows[0]?.readDepth).toBe("header-only");
  });

  it("falls back to indexHits when classified array is empty", () => {
    const rows = instrumentsFromScope({
      recordedInstruments: [],
      indexHits: [
        {
          recordingRef: "2020-12345",
          documentType: "EASEMENT",
        },
      ],
    });
    expect(rows[0]?.instrumentNumber).toBe("2020-12345");
  });

  it("maps classified scope via instrumentsFromClassifiedScope", () => {
    const rows = instrumentsFromClassifiedScope({
      recorded_instruments: [
        {
          recordingRef: "V.812 P.339",
          documentKind: "Plat",
          parties: ["COUNTY CLERK"],
        },
      ],
    });
    expect(rows[0]?.instrumentNumber).toBe("V.812 P.339");
    expect(rows[0]?.type).toBe("plat");
  });

  it("maps scopeSearched indexHits on GET complete job", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jobs: [
          {
            jobStatus: "complete",
            completedAt: "2026-08-27T00:00:00Z",
            scopeSearched: {
              indexHits: [
                {
                  recordingRef: "2019012345",
                  documentType: "DEED",
                  recordingDate: "2019-01-02",
                },
              ],
            },
          },
        ],
      }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.run?.instruments).toHaveLength(1);
    expect(result.run?.instruments[0]?.instrumentNumber).toBe("2019012345");
    vi.unstubAllGlobals();
  });
});

describe("verdictsFromScopeAndJob", () => {
  it("returns verified-absent when scope marks absent", () => {
    const cards = verdictsFromScopeAndJob({
      scope: { verdict: "verified-absent", scopeSummary: "Owner query returned zero hits." },
      jobStatus: "complete",
      instrumentCount: 0,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("verified-absent");
    expect(cards[0]?.body).toContain("Owner query");
  });

  it("returns could-not-search on failed job", () => {
    const cards = verdictsFromScopeAndJob({
      scope: null,
      jobStatus: "failed",
      errorMessage: "Portal login required",
      instrumentCount: 0,
    });
    expect(cards[0]?.kind).toBe("could-not-search");
    expect(cards[0]?.body).toContain("login");
  });

  it("does not emit verified-absent for header-only decline", () => {
    const cards = verdictsFromScopeAndJob({
      scope: { finishReason: "header-only", resultCount: 0 },
      jobStatus: "complete",
      instrumentCount: 0,
    });
    expect(cards.find((c) => c.kind === "verified-absent")).toBeUndefined();
  });
});

describe("recordsRequestClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps liveInstantGis from latest job on GET", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jobs: [
          {
            jobStatus: "running",
            createdAt: "2026-08-27T00:00:00Z",
            liveInstantGis: ROUND_ROCK_GIS_AUDIT,
          },
        ],
      }),
    });
    const result = await fetchRecordsRun("48491:123");
    expect(result.run?.instantGisHits).toHaveLength(1);
    expect(result.run?.instantGisHits?.[0]?.id).toBe("round-rock-easements");
  });

  it("maps liveInstantGis from POST response", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 202,
      ok: true,
      json: async () => ({
        jobStatus: "queued",
        status: "accepted",
        jobId: "job-gis",
        liveInstantGis: ROUND_ROCK_GIS_AUDIT,
      }),
    });
    const result = await requestRecordsRun("48491:123", "48491");
    expect(result.run?.instantGisHits).toHaveLength(1);
    expect(result.run?.jobId).toBe("job-gis");
  });

  it("POST with empty GIS hits yields empty instantGisHits", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 202,
      ok: true,
      json: async () => ({
        jobStatus: "queued",
        status: "accepted",
        jobId: "job-rural",
        liveInstantGis: RURAL_EMPTY_GIS_AUDIT,
      }),
    });
    const result = await requestRecordsRun("48027:999", "48027");
    expect(result.run?.instantGisHits).toEqual([]);
  });

  it("returns not-wired on 404 from deep proxy", async () => {
    fetchMock.mockResolvedValueOnce({ status: 404, ok: false });
    const result = await fetchRecordsRun("48021:123");
    expect(result.wired).toBe(false);
    expect(result.notice).toBe(RECORDS_NOT_WIRED_NOTICE);
  });

  it("maps latest job to run phase on GET", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jobs: [{ jobStatus: "queued", createdAt: "2026-08-26T00:00:00Z" }],
      }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.wired).toBe(true);
    expect(result.run?.phase).toBe("queued");
  });

  it("returns not-requested when jobs list empty", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ jobs: [] }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.notice).toBe(RECORDS_NOT_REQUESTED_NOTICE);
  });
});
