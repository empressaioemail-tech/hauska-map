// OPS-16 P-185 — PROMOTEKIT AFFILIATE REFERRAL ON CHECKOUT.
//
// The PromoteKit tag sets `window.promotekit_referral` from a `?via=` visit.
// The id must ride BOTH checkout POST bodies (`billing/checkout` and
// `entitlement/checkout`) so cortex can put it on the Stripe Checkout Session,
// and it must be read AT CALL TIME — the tag is `async`, so a value cached at
// module load would be empty on a cold visit where the customer clicks before
// the script lands.
//
// Both directions are asserted, because either one alone is satisfiable by a
// broken implementation: with a referral the key is on the wire, WITHOUT one
// the key is ABSENT (never null/empty), which is the falsifier the dispatch
// names ("if a session created without a referral carries the field, the
// client cached a stale value").
//
// A malformed value is dropped, never sent — a bad attribution token must not
// be able to block a purchase.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readPromotekitReferral,
  startPeCheckout,
  startPropertyUnlock,
} from "./billingClient";

const DEEP_CHECKOUT_URL =
  "/api/spine-deep/api/property-explorer/v1/billing/checkout";
const DEEP_UNLOCK_URL =
  "/api/spine-deep/api/property-explorer/v1/entitlement/checkout";

type Captured = { url: string; body: Record<string, unknown> };

/** jsdom is not this suite's environment; the window is stubbed explicitly. */
function stubWindow(referral?: unknown): void {
  vi.stubGlobal("window", {
    location: { origin: "https://smartsite.cloud" },
    ...(referral === undefined ? {} : { promotekit_referral: referral }),
  });
}

function stubCheckoutFetch(
  payload: unknown = { checkoutUrl: "https://checkout.stripe.com/pay/cs_test_pk" },
): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal("fetch", (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response;
  }) as typeof fetch);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readPromotekitReferral — read at call time, lenient to ignore", () => {
  it("no window at all -> undefined", () => {
    expect(readPromotekitReferral()).toBeUndefined();
  });

  it("a set id is returned trimmed", () => {
    stubWindow("  aff_abc123  ");
    expect(readPromotekitReferral()).toBe("aff_abc123");
  });

  it.each([
    ["absent", undefined],
    ["a non-string", 42],
    ["an object", { via: "aff" }],
    ["empty", ""],
    ["whitespace only", "   "],
    ["embedded whitespace", "aff abc"],
    ["over the length cap", "x".repeat(129)],
  ])("%s -> undefined (dropped, never thrown)", (_name, raw) => {
    stubWindow(raw);
    expect(readPromotekitReferral()).toBeUndefined();
  });
});

describe("startPeCheckout — the referral rides the subscription body", () => {
  it("WITH a referral: the key is on the wire next to a valid tier", async () => {
    stubWindow("aff_abc123");
    const calls = stubCheckoutFetch();
    const result = await startPeCheckout({ tier: "studio", interval: "year" });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DEEP_CHECKOUT_URL);
    expect(calls[0].body.promotekitReferral).toBe("aff_abc123");
    expect(calls[0].body.tier).toBe("studio");
  });

  it("WITHOUT a referral: the key is ABSENT — not null, not empty", async () => {
    stubWindow();
    const calls = stubCheckoutFetch();
    await startPeCheckout({ tier: "solo", interval: "month" });
    expect(calls).toHaveLength(1);
    expect("promotekitReferral" in calls[0].body).toBe(false);
  });

  it("a malformed window value is dropped rather than sent", async () => {
    stubWindow("has whitespace");
    const calls = stubCheckoutFetch();
    await startPeCheckout({ tier: "solo", interval: "month" });
    expect("promotekitReferral" in calls[0].body).toBe(false);
  });
});

describe("startPropertyUnlock — the referral rides the unlock body", () => {
  it("WITH a referral: the key is on the wire", async () => {
    stubWindow("aff_abc123");
    const calls: Captured[] = [];
    const result = await startPropertyUnlock("48055:10068", {
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            checkoutUrl: "https://checkout.stripe.com/pay/cs_test_unlock_pk",
          }),
        } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    expect(result.kind).toBe("checkout");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DEEP_UNLOCK_URL);
    expect(calls[0].body.promotekitReferral).toBe("aff_abc123");
    expect(calls[0].body.parcelNodeId).toBe("48055:10068");
  });

  it("WITHOUT a referral: the key is ABSENT", async () => {
    stubWindow();
    const calls: Captured[] = [];
    await startPropertyUnlock("48055:10068", {
      fetchImpl: (async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            checkoutUrl: "https://checkout.stripe.com/pay/cs_test_unlock_plain",
          }),
        } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    expect(calls).toHaveLength(1);
    expect("promotekitReferral" in calls[0].body).toBe(false);
  });
});
