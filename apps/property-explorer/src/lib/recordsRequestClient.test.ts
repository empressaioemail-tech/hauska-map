import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchRecordsRun,
  RECORDS_NOT_REQUESTED_NOTICE,
  RECORDS_NOT_WIRED_NOTICE,
  requestRecordsRun,
} from "./recordsRequestClient";

describe("recordsRequestClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
            scopeSearched: { indexHits: [{ id: "a" }, { id: "b" }] },
          },
        ],
      }),
    });
    const result = await fetchRecordsRun("48021:123");
    expect(result.run?.instrumentCount).toBe(2);
    expect(result.run?.live).toBe(true);
  });
});
