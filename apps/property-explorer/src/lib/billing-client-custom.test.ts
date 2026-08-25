import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_NO_SESSION_MESSAGE,
  resolveCustomOrHostedCheckout,
  startPeCheckout,
  startPropertyUnlock,
} from "./billingClient";

const DEEP_CHECKOUT_URL =
  "/api/spine-deep/api/property-explorer/v1/billing/checkout";

type Captured = { url: string; body: Record<string, unknown> };

function stubCheckoutFetch(
  status: number,
  payload: unknown,
): { calls: Captured[] } {
  const calls: Captured[] = [];
  vi.stubGlobal("fetch", (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  }) as typeof fetch);
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startPeCheckout — custom session contract (WDLL item 7)", () => {
  it("POST body sends uiMode elements and returnUrl", async () => {
    const { calls } = stubCheckoutFetch(200, {
      clientSecret: "cs_test_secret",
      publishableKey: "pk_test_123",
      sessionId: "cs_1",
    });
    const result = await startPeCheckout({ tier: "studio", interval: "year" });
    expect(result.ok).toBe(true);
    expect(result.clientSecret).toBe("cs_test_secret");
    expect(result.publishableKey).toBe("pk_test_123");
    expect(calls[0].url).toBe(DEEP_CHECKOUT_URL);
    expect(calls[0].body.uiMode).toBe("elements");
    expect(calls[0].body.returnUrl).toEqual(
      expect.stringContaining("checkout=success"),
    );
  });

  it("VIOLATE empty-secret 200: no clientSecret and no hosted checkoutUrl → ok:false", async () => {
    stubCheckoutFetch(200, { sessionId: "cs_empty", mode: "live" });
    const result = await startPeCheckout({ tier: "solo", interval: "month" });
    expect(result.ok).toBe(false);
    expect(result.clientSecret).toBeUndefined();
    expect(result.checkoutUrl).toBeUndefined();
    expect(result.message).toBe(CHECKOUT_NO_SESSION_MESSAGE);
  });

  it("200 with hosted checkoutUrl and no secret is still ok (item 3 fallback)", async () => {
    stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_hosted",
    });
    const result = await startPeCheckout({ tier: "team", interval: "month" });
    expect(result.ok).toBe(true);
    expect(result.clientSecret).toBeUndefined();
    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_hosted");
  });

  it("200 with a same-origin URL and no secret is not hosted success", async () => {
    stubCheckoutFetch(200, {
      checkoutUrl: "https://smartsite.cloud/?checkout=success",
    });
    const result = await startPeCheckout({ tier: "studio", interval: "year" });
    expect(result.ok).toBe(false);
  });
});

describe("resolveCustomOrHostedCheckout — custom success is the secret", () => {
  it("clientSecret present is custom success even if checkoutUrl is absent", () => {
    const result = resolveCustomOrHostedCheckout({
      clientSecret: "cs_live_abc",
      publishableKey: "pk_live_x",
    });
    expect(result).toMatchObject({
      ok: true,
      clientSecret: "cs_live_abc",
      publishableKey: "pk_live_x",
    });
    expect(result.checkoutUrl).toBeUndefined();
  });

  it("whitespace secret is treated as missing", () => {
    expect(
      resolveCustomOrHostedCheckout({ clientSecret: "   ", checkoutUrl: "" }).ok,
    ).toBe(false);
  });
});

describe("startPropertyUnlock — custom secret + empty 200 is error", () => {
  it("200 with clientSecret is custom checkout (no hosted URL required)", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            clientSecret: "cs_unlock_secret",
            publishableKey: "pk_test_u",
          }),
        }) as unknown as Response) as typeof fetch,
    });
    expect(result).toMatchObject({
      kind: "checkout",
      clientSecret: "cs_unlock_secret",
      publishableKey: "pk_test_u",
    });
  });

  it("VIOLATE empty-secret 200: kind error, never coming, never fake unlock", async () => {
    const result = await startPropertyUnlock("48021:1", {
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({}),
        }) as unknown as Response) as typeof fetch,
    });
    expect(result.kind).toBe("error");
    expect(result).not.toEqual({ kind: "unlocked", mode: "dev-bypass" });
  });
});
