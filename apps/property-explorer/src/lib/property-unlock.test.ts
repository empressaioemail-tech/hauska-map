// R1 PAYWALL → LIVE PAYMENTS (WDLL item 3) — the $15 property-unlock seam:
// default path is a REAL, authenticated Stripe checkout (never a fake
// success); `armed` is a TEST-SEAM-ONLY escape hatch for the legacy
// dev-bypass route (WDLL item 5 — no env var reads this in production).

import { describe, expect, it, vi } from "vitest";
import {
  PROPERTY_UNLOCK_COMING_MESSAGE,
  isStripeCheckoutUrl,
  startPropertyUnlock,
} from "./billingClient";

function fakeCheckoutFetch(status: number, payload: unknown = {}): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toBe(
      "/api/spine-deep/api/property-explorer/v1/entitlement/checkout",
    );
    expect(init?.credentials).toBe("include");
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  }) as typeof fetch;
}

describe("startPropertyUnlock — real checkout by default, never a fake success", () => {
  it("not armed (prod default) + server returns a checkout session → 'checkout' with the Stripe URL", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: fakeCheckoutFetch(200, {
        checkoutUrl: "https://checkout.stripe.com/pay/cs_test_123",
        sessionId: "cs_test_123",
      }),
    });
    expect(result).toMatchObject({
      kind: "checkout",
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_123",
    });
  });

  it("carries parcelNodeId + a success/cancel URL in the request body", async () => {
    let body: Record<string, unknown> | null = null;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({ checkoutUrl: "https://checkout.stripe.com/x" }),
      } as unknown as Response;
    }) as typeof fetch;
    await startPropertyUnlock("48021:1", { fetchImpl });
    expect(body).toMatchObject({ parcelNodeId: "48021:1", uiMode: "elements" });
    expect((body as Record<string, unknown>).successUrl).toEqual(
      expect.stringContaining("checkout=success"),
    );
    expect((body as Record<string, unknown>).cancelUrl).toEqual(
      expect.stringContaining("checkout=cancel"),
    );
  });

  it("FEATURE-DETECT: cortex checkout route not deployed yet (404/403) → honest 'coming', never fake", async () => {
    for (const status of [404, 403]) {
      const result = await startPropertyUnlock("48021:1", {
        fetchImpl: fakeCheckoutFetch(status),
      });
      expect(result).toEqual({
        kind: "coming",
        message: PROPERTY_UNLOCK_COMING_MESSAGE,
      });
    }
  });

  it("401 (session expired mid-flow) → 'sign-in', never a fake success", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: fakeCheckoutFetch(401),
    });
    expect(result).toEqual({ kind: "sign-in" });
  });

  it("server error → honest error", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: fakeCheckoutFetch(500, { message: "boom" }),
    });
    expect(result).toEqual({ kind: "error", message: "boom" });
  });

  it("200 without a checkoutUrl (partial/incomplete deploy) → honest 'coming', never fake", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: fakeCheckoutFetch(200, {}),
    });
    expect(result.kind).toBe("error");
    expect(result).toMatchObject({
      message: expect.stringMatching(/payment session|not return/i),
    });
  });

  it("200 with unlocked:true (simulated / dev server) → honest 'coming', never instant unlock", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: fakeCheckoutFetch(200, { unlocked: true }),
    });
    expect(result).toEqual({
      kind: "coming",
      message: PROPERTY_UNLOCK_COMING_MESSAGE,
    });
    expect(result).not.toEqual({ kind: "unlocked", mode: "dev-bypass" });
  });

  it("200 with a same-origin success URL → error, never redirect bypass", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: fakeCheckoutFetch(200, {
        checkoutUrl:
          "https://smartsite.cloud/?checkout=success&parcelNodeId=48021%3A1",
      }),
    });
    expect(result.kind).toBe("error");
    expect(result).toMatchObject({
      message: expect.stringContaining("not from Stripe"),
    });
  });

  it("VITE_PE_DEV_UNLOCK env (legacy) is ignored — prod path hits checkout only", async () => {
    vi.stubEnv("VITE_PE_DEV_UNLOCK", "1");
    const fetchImpl = vi.fn(fakeCheckoutFetch(200, { checkoutUrl: "https://checkout.stripe.com/x" }));
    await startPropertyUnlock("48021:1", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain(
      "/entitlement/checkout",
    );
    vi.unstubAllEnvs();
  });

  it("network throw → honest error", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(result.kind).toBe("error");
  });
});

describe("isStripeCheckoutUrl", () => {
  it("accepts checkout.stripe.com HTTPS URLs", () => {
    expect(
      isStripeCheckoutUrl("https://checkout.stripe.com/pay/cs_test_123"),
    ).toBe(true);
  });

  it("rejects same-origin success URLs and non-HTTPS", () => {
    expect(
      isStripeCheckoutUrl(
        "https://smartsite.cloud/?checkout=success&parcelNodeId=1",
      ),
    ).toBe(false);
    expect(isStripeCheckoutUrl("http://checkout.stripe.com/pay/x")).toBe(false);
    expect(isStripeCheckoutUrl("not-a-url")).toBe(false);
  });
});

describe("startPropertyUnlock — armed is a TEST SEAM ONLY (legacy dev-bypass route)", () => {
  function fakeDevUnlockFetch(status: number, payload: unknown = {}): typeof fetch {
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

  it("armed:false (implicit default) never touches the dev-unlock route", async () => {
    const fetchImpl = vi.fn(fakeCheckoutFetch(200, { checkoutUrl: "https://x" }));
    await startPropertyUnlock("48021:1", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain(
      "/entitlement/checkout",
    );
  });

  it("armed:true + server OK → a REAL dev-bypass unlock (test seam)", async () => {
    const result = await startPropertyUnlock("48021:1", {
      armed: true,
      fetchImpl: fakeDevUnlockFetch(200, { unlocked: true }),
    });
    expect(result).toEqual({ kind: "unlocked", mode: "dev-bypass" });
  });

  it("armed:true + backend without the route (404/403) → feature-detect back to honest 'coming'", async () => {
    for (const status of [404, 403]) {
      const result = await startPropertyUnlock("48021:1", {
        armed: true,
        fetchImpl: fakeDevUnlockFetch(status),
      });
      expect(result.kind).toBe("coming");
    }
  });

  it("armed:true + server error → honest error (still never 'unlocked')", async () => {
    const result = await startPropertyUnlock("48021:1", {
      armed: true,
      fetchImpl: fakeDevUnlockFetch(500, { message: "boom" }),
    });
    expect(result).toEqual({ kind: "error", message: "boom" });
  });
});
