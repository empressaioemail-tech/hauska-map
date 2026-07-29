// R1 PAYWALL — the $15 property-unlock STUB SEAM: never a fake success.
// Outside an armed dev-bypass environment the seam returns the honest
// "purchase flow coming" state without touching the network; armed, it hits
// the cortex dev-unlock and only a server OK counts as unlocked.

import { describe, expect, it, vi } from "vitest";
import {
  PROPERTY_UNLOCK_COMING_MESSAGE,
  startPropertyUnlock,
} from "./billingClient";

function fakeFetch(status: number, payload: unknown = {}): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    expect(String(url)).toBe(
      "/api/spine-deep/api/property-explorer/v1/entitlement/dev-unlock",
    );
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  }) as typeof fetch;
}

describe("startPropertyUnlock — no fake success, ever", () => {
  it("NOT armed (prod default) → honest 'coming' state, NO network call", async () => {
    const fetchImpl = vi.fn();
    const result = await startPropertyUnlock("48021:1", {
      armed: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      kind: "coming",
      message: PROPERTY_UNLOCK_COMING_MESSAGE,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("armed + server OK → a REAL dev-bypass unlock", async () => {
    const result = await startPropertyUnlock("48021:1", {
      armed: true,
      fetchImpl: fakeFetch(200, { unlocked: true }),
    });
    expect(result).toEqual({ kind: "unlocked", mode: "dev-bypass" });
  });

  it("armed + backend without the route (404/403) → feature-detect back to honest 'coming'", async () => {
    for (const status of [404, 403]) {
      const result = await startPropertyUnlock("48021:1", {
        armed: true,
        fetchImpl: fakeFetch(status),
      });
      expect(result.kind).toBe("coming");
    }
  });

  it("armed + server error → honest error (still never 'unlocked')", async () => {
    const result = await startPropertyUnlock("48021:1", {
      armed: true,
      fetchImpl: fakeFetch(500, { message: "boom" }),
    });
    expect(result).toEqual({ kind: "error", message: "boom" });
  });

  it("armed + network throw → honest error", async () => {
    const result = await startPropertyUnlock("48021:1", {
      armed: true,
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(result.kind).toBe("error");
  });
});
