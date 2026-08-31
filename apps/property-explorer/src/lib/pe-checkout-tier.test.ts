// TIER-AWARE SUBSCRIPTION CHECKOUT (2026-08-24 cortex contract) — the body
// carries EXACTLY the tier the caller passed (a tierless body defaults to
// Solo on cortex: the audit defect where a Studio click charged the Solo
// price), interval is the cortex enum month|year (omitted defaults to month
// on cortex: the A1 defect where an annual Studio click charged monthly),
// seats travel only when provided, and the 503 checkout_unavailable
// refusal surfaces honestly — never retried as another tier, never routed to
// the legacy install-scoped fallback.
//
// 2026-08-31 (P-97): that fallback is RETIRED. 403 and 404 now refuse exactly
// as 503 does, so no status routes to another tier. The bottom describe block
// is the control that keeps it that way.

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

});

// ---------------------------------------------------------------------------
// P-97 — THE 403/404 BRANCH MUST NEVER ROUTE TO ANOTHER TIER.
//
// This block replaces a test that asserted the DEFECT as a specification
// ("NOT-VACUOUS CONTROL: 404 feature-detect DOES reach the install-scoped
// fallback"). That fallback posted a hardcoded tier "pro" — the retired
// pre-ladder price — so the old test locked in a Studio/Team/annual click
// silently becoming a Pro checkout, and made the fix read as a regression.
//
// The instrument here models the world in which the defect actually bites:
// call 1 (the authenticated deep route) 403/404s, and call 2 (the legacy seam)
// WOULD succeed with a Pro-priced session. Under the fix there is no call 2.
// Under a restored fallback the same script yields ok:true, a checkout URL,
// and a request carrying tier "pro" — three independent assertion failures.
// Nothing here asserts on source text.
// ---------------------------------------------------------------------------

/** Per-call scripted fetch — response N answers call N, the last one repeats. */
function stubScriptedFetch(
  script: { status: number; payload: unknown }[],
): { calls: Captured[] } {
  const calls: Captured[] = [];
  vi.stubGlobal("fetch", (async (url: RequestInfo | URL, init?: RequestInit) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () => step.payload,
    } as unknown as Response;
  }) as typeof fetch);
  return { calls };
}

/** What the retired install-scoped seam returned on success — a Pro-priced session. */
const LEGACY_PRO_SUCCESS = {
  status: 200,
  payload: {
    mode: "live",
    checkoutUrl: "https://checkout.stripe.com/pay/cs_test_LEGACY_PRO_PRICE",
    sessionId: "cs_legacy_pro",
    stripeConfigured: true,
  },
};

const TIERS: PeCheckoutTier[] = ["solo", "studio", "team"];
const INTERVALS = ["month", "year"] as const;
const ROUTE_MISSING_STATUSES = [403, 404] as const;

const MATRIX = TIERS.flatMap((tier) =>
  INTERVALS.flatMap((interval) =>
    ROUTE_MISSING_STATUSES.map((status) => ({ tier, interval, status })),
  ),
);

describe("startPeCheckout — a missing deep route refuses; it never buys a different tier", () => {
  it.each(MATRIX)(
    "$status on a $tier/$interval click: one request, that tier only, nothing purchasable returned",
    async ({ tier, interval, status }) => {
      const { calls } = stubScriptedFetch([
        { status, payload: {} },
        LEGACY_PRO_SUCCESS,
      ]);

      const result = await startPeCheckout({ tier, interval });

      // BEHAVIOUR 1: the second scripted response is never consumed — the
      // client makes exactly the one authenticated request, then stops.
      expect(calls).toHaveLength(1);
      expect(calls.every((c) => c.url === DEEP_CHECKOUT_URL)).toBe(true);

      // BEHAVIOUR 2: no request anywhere carries a tier other than the one
      // clicked. A restored fallback puts "pro" on the wire and fails here.
      expect(calls[0].body.tier).toBe(tier);
      expect(calls.every((c) => c.body.tier === tier)).toBe(true);

      // BEHAVIOUR 3: nothing purchasable comes back. No URL to navigate to,
      // no secret to mount, no session id — so no amount can be charged.
      expect(result.ok).toBe(false);
      expect(result.checkoutUrl).toBeUndefined();
      expect(result.clientSecret).toBeUndefined();
      expect(result.sessionId).toBeUndefined();
      expect(result.message).toBe(CHECKOUT_UNAVAILABLE_MESSAGE);
    },
  );

  it("NOT-VACUOUS CONTROL 1: a 200 still succeeds — the refusals above are not a blanket refuser", async () => {
    const { calls } = stubScriptedFetch([LEGACY_PRO_SUCCESS]);
    const result = await startPeCheckout({ tier: "studio", interval: "year" });
    expect(result.ok).toBe(true);
    expect(result.checkoutUrl).toBe(LEGACY_PRO_SUCCESS.payload.checkoutUrl);
    expect(calls).toHaveLength(1);
  });

  it("NOT-VACUOUS CONTROL 2: the harness CAN observe two calls with differing bodies — so toHaveLength(1) is a measurement", async () => {
    const { calls } = stubScriptedFetch([LEGACY_PRO_SUCCESS]);
    await startPeCheckout({ tier: "solo", interval: "month" });
    await startPeCheckout({ tier: "team", interval: "year" });
    expect(calls).toHaveLength(2);
    expect(calls[0].body.tier).toBe("solo");
    expect(calls[1].body.tier).toBe("team");
  });

  it("NOT-VACUOUS CONTROL 3: 500 is NOT the unavailable message — the branch discriminates on status", async () => {
    const { calls } = stubScriptedFetch([
      { status: 500, payload: { error: "boom" } },
      LEGACY_PRO_SUCCESS,
    ]);
    const result = await startPeCheckout({ tier: "team", interval: "month" });
    expect(result.ok).toBe(false);
    expect(result.message).not.toBe(CHECKOUT_UNAVAILABLE_MESSAGE);
    expect(calls).toHaveLength(1);
  });
});
