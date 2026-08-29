// TIER-AWARE SUBSCRIPTION CHECKOUT (2026-08-24 cortex contract) — the body
// carries EXACTLY the tier the caller passed (a tierless body defaults to
// Solo on cortex: the audit defect where a Studio click charged the Solo
// price), interval is the cortex enum month|year (omitted defaults to month
// on cortex: the A1 defect where an annual Studio click charged monthly),
// seats travel only when provided, and the 503 checkout_unavailable
// refusal surfaces honestly — never retried as another tier, never routed to
// the legacy install-scoped fallback (that seam is 404/403 feature-detect
// only).

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_UNAVAILABLE_MESSAGE,
  startPeCheckout,
  type PeCheckoutTier,
} from "./billingClient";
import { PE_PRICING } from "./pricing";

const DEEP_CHECKOUT_URL =
  "/api/spine-deep/api/property-explorer/v1/billing/checkout";
const LEGACY_INSTALL_SCOPED_URL =
  "/api/spine/cortex/api/brokerage/v1/property-explorer/billing/checkout";

type Captured = { url: string; body: Record<string, unknown> };

/** Stub global fetch (startPeCheckout has no fetchImpl seam), capturing calls. */
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

describe("startPeCheckout — the tier on the wire matches the button the user saw", () => {
  it.each(["solo", "studio", "team"] as PeCheckoutTier[])(
    "body carries tier %s exactly as passed",
    async (tier) => {
      const { calls } = stubCheckoutFetch(200, {
        checkoutUrl: "https://checkout.stripe.com/pay/cs_test_1",
      });
      const result = await startPeCheckout({
        parcelNodeId: "48021:1",
        tier,
        interval: "month",
      });
      expect(result.ok).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(DEEP_CHECKOUT_URL);
      expect(calls[0].body.tier).toBe(tier);
      expect(calls[0].body.interval).toBe("month");
      expect(calls[0].body.interval).not.toBe("annual");
      expect(calls[0].body.uiMode).toBe("elements");
      expect(calls[0].body.successUrl).toEqual(
        expect.stringContaining("checkout=success"),
      );
      expect(calls[0].body.cancelUrl).toEqual(
        expect.stringContaining("checkout=cancel"),
      );
    },
  );

  it("seats are included when provided (Team) — the TOTAL desired seat count", async () => {
    const { calls } = stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_2",
    });
    await startPeCheckout({ tier: "team", interval: "month", seats: 14 });
    expect(calls[0].body.tier).toBe("team");
    expect(calls[0].body.interval).toBe("month");
    expect(calls[0].body.seats).toBe(14);
  });

  it("annual Studio POST body has interval year — not month, not annual", async () => {
    const { calls } = stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_annual_studio",
    });
    await startPeCheckout({ tier: "studio", interval: "year" });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.tier).toBe("studio");
    expect(calls[0].body.interval).toBe("year");
    expect(calls[0].body.interval).not.toBe("month");
    expect(calls[0].body.interval).not.toBe("annual");
  });

  it("monthly Studio POST body has interval month", async () => {
    const { calls } = stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_monthly_studio",
    });
    await startPeCheckout({ tier: "studio", interval: "month" });
    expect(calls[0].body.tier).toBe("studio");
    expect(calls[0].body.interval).toBe("month");
  });

  it("annual Team never sends seats above the base cap (14 → 3 on the wire)", async () => {
    const { calls } = stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_annual_team",
    });
    await startPeCheckout({ tier: "team", interval: "year", seats: 14 });
    expect(calls[0].body.interval).toBe("year");
    expect(calls[0].body.seats).toBe(PE_PRICING.team.baseSeats);
    expect(Number(calls[0].body.seats)).toBeLessThanOrEqual(PE_PRICING.team.baseSeats);
  });

  it("UI token annual is refused on the wire — cortex enum only, no POST", async () => {
    const { calls } = stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_should_not_fire",
    });
    const result = await startPeCheckout({
      tier: "studio",
      interval: "annual" as unknown as "year",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/interval/i);
    expect(calls).toHaveLength(0);
  });

  it("missing interval refuses closed — no POST, no silent month default", async () => {
    const { calls } = stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_should_not_fire",
    });
    const result = await startPeCheckout({
      tier: "studio",
    } as Parameters<typeof startPeCheckout>[0]);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/interval/i);
    expect(calls).toHaveLength(0);
  });

  it("the seats KEY is absent when seats is undefined — never a defaulted/null seat count", async () => {
    const { calls } = stubCheckoutFetch(200, {
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_3",
    });
    await startPeCheckout({ tier: "solo", interval: "month" });
    await startPeCheckout({ tier: "team", interval: "year" });
    expect("seats" in calls[0].body).toBe(false);
    expect("seats" in calls[1].body).toBe(false);
  });

  it("503 checkout_unavailable → honest ok:false refusal; ONE request only — never retried as another tier, NEVER the install-scoped fallback", async () => {
    const { calls } = stubCheckoutFetch(503, {
      error: "checkout_unavailable",
      missing: "STRIPE_PE_STUDIO_PRICE_ID",
    });
    const result = await startPeCheckout({ tier: "studio", interval: "year" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe(CHECKOUT_UNAVAILABLE_MESSAGE);
    expect(result.checkoutUrl).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DEEP_CHECKOUT_URL);
    expect(calls[0].url).not.toBe(LEGACY_INSTALL_SCOPED_URL);
  });

  it("NOT-VACUOUS CONTROL: 404 feature-detect DOES reach the install-scoped fallback (proves the 503 test could fail)", async () => {
    const { calls } = stubCheckoutFetch(404, {});
    await startPeCheckout({ tier: "solo", interval: "month" });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(DEEP_CHECKOUT_URL);
    expect(calls[1].url).toBe(LEGACY_INSTALL_SCOPED_URL);
  });
});
