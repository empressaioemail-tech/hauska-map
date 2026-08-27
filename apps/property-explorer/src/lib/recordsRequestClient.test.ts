import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchRecordsRun,
  instantGisHitsFromWire,
  RECORDS_NOT_REQUESTED_NOTICE,
  RECORDS_NOT_WIRED_NOTICE,
  requestRecordsRun,
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

  it("returns not-requested when jobs array is empty", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ jobs: [] }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.wired).toBe(true);
    expect(result.notice).toBe(RECORDS_NOT_REQUESTED_NOTICE);
  });

  it("POST maps accepted job to running phase", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 202,
      ok: true,
      json: async () => ({ jobStatus: "queued", status: "accepted" }),
    });
    const result = await requestRecordsRun("48021:123", "48021");
    expect(result.wired).toBe(true);
    expect(result.run?.phase).toBe("queued");
  });

  it("POST maps in-progress status to running phase", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ status: "in-progress", jobId: "job-1" }),
    });
    const result = await requestRecordsRun("48021:123", "48021");
    expect(result.wired).toBe(true);
    expect(result.run?.phase).toBe("running");
    expect(result.run?.jobId).toBe("job-1");
  });

  it("maps instrument count from scopeSearched indexHits on GET", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jobs: [
          {
            jobStatus: "complete",
            completedAt: "2026-08-27T12:00:00.000Z",
            scopeSearched: {
              indexHits: [
                {
                  recordingRef: "2020-123456",
                  documentType: "DEED",
                  recordingDate: "01/15/2020",
                  parties: "DIOCESE OF AUSTIN",
                },
                {
                  recordingRef: "2019-654321",
                  documentType: "EASEMENT",
                  recordingDate: "03/02/2019",
                  parties: "CITY OF BASTROP",
                },
              ],
            },
          },
        ],
      }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.run?.instrumentCount).toBe(2);
    expect(result.run?.instruments).toHaveLength(2);
    expect(result.run?.instruments?.[0]?.type).toBe("deed");
    expect(result.run?.instruments?.[1]?.type).toBe("easement");
    expect(result.run?.filters.some((f) => f.type === "deed" && f.count === 1)).toBe(
      true,
    );
    expect(result.run?.live).toBe(true);
  });

  it("maps needs-human job status to paused-fees phase", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jobs: [{ jobStatus: "needs-human", createdAt: "2026-08-27T00:00:00Z" }],
      }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.run?.phase).toBe("paused-fees");
  });

  it("filters junk index hits without instrument numbers", async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({
        jobs: [
          {
            jobStatus: "complete",
            scopeSearched: {
              indexHits: [
                { recordingRef: "Bastrop CountyWeb Access", documentType: "Header" },
                { recordingRef: "2021-999888", documentType: "DEED" },
              ],
            },
          },
        ],
      }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.run?.instruments).toHaveLength(1);
    expect(result.run?.instruments?.[0]?.instrumentNumber).toBe("2021-999888");
  });
});
