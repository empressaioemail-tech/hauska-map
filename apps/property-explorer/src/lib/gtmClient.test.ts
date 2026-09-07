import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimShareAttribution } from "./gtmClient";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("claimShareAttribution", () => {
  it("succeeds on the first attempt (no retry needed)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = claimShareAttribution({ grantId: "g1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and succeeds (positive)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "cold start" }, false, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = claimShareAttribution({ grantId: "g1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting all attempts (falsifier: a permanent failure is not swallowed as false success)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "authentication_required" }, false, 401));
    vi.stubGlobal("fetch", fetchMock);

    const promise = claimShareAttribution({ grantId: "g1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network throw the same as an HTTP failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = claimShareAttribution({ grantId: "g1" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the grant id and surface, refusing to assert any identity itself", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = claimShareAttribution({ grantId: "g1", surface: "share-landing" });
    await vi.runAllTimersAsync();
    await promise;

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("share-attribution");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ grantId: "g1", surface: "share-landing" });
  });
});
