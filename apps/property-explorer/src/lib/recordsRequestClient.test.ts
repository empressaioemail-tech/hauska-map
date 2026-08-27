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
});
