// R1 PAYWALL — the proactive entitlement reader: pinned-contract mapping,
// FEATURE-DETECT fallback (older backend without the property block →
// CLIENT-SOFT, never a hard break), cache + invalidate semantics.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePropertyEntitlement,
  fetchPropertyEntitlement,
  freeMessagesLeft,
  getPropertyEntitlementSnapshot,
  invalidatePropertyEntitlement,
  isEntitled,
  isPro,
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
  subscribePropertyEntitlements,
  subscriptionTierGrantsStudio,
  type PropertyEntitlementState,
} from "./entitlementClient";
import { PE_PRICING } from "./pricing";

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

function fakeFetch(status: number, payload: unknown): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    expect(String(url)).toContain(
      "/api/spine-deep/api/property-explorer/v1/entitlement?parcelNodeId=",
    );
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  }) as typeof fetch;
}

describe("fetchPropertyEntitlement — the pinned contract", () => {
  it("maps the full contract (property block) — hard, not soft", async () => {
    const state = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, {
        authenticated: true,
        tier: "free",
        tenantId: "t1",
        userId: "u1",
        property: {
          parcelNodeId: "48021:123",
          unlocked: true,
          freeMessagesUsed: 2,
          freeMessagesLimit: 3,
        },
      }),
    );
    expect(state).toEqual({
      status: "ready",
      authenticated: true,
      tier: "free",
      propertyUnlocked: true,
      freeMessagesUsed: 2,
      freeMessagesLimit: 3,
      softFallback: false,
      devRole: false,
      entitlementSource: null,
      subscriptionTier: null,
    });
    expect(isEntitled(state)).toBe(true); // per-property unlock counts
    expect(isPro(state)).toBe(false);
    expect(freeMessagesLeft(state)).toBe(1);
  });

  it("softFallback free tier is NOT entitled (proactive lock stays on)", async () => {
    const state = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(402, {}),
    );
    expect(state.softFallback).toBe(true);
    expect(state.tier).toBe("free");
    expect(isEntitled(state)).toBe(false);
  });

  it("pro tier is entitled regardless of the property flag", async () => {
    const state = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, {
        authenticated: true,
        tier: "paid",
        property: {
          parcelNodeId: "48021:123",
          unlocked: false,
          freeMessagesUsed: 0,
          freeMessagesLimit: 3,
        },
      }),
    );
    expect(isPro(state)).toBe(true);
    expect(isEntitled(state)).toBe(true);
  });

  it("devRole (WDLL item 4/5) entitles regardless of tier or the property flag — a user-level grant", async () => {
    const state = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, {
        authenticated: true,
        tier: "free",
        devRole: true,
        entitlementSource: "dev",
        property: {
          parcelNodeId: "48021:123",
          unlocked: false,
          freeMessagesUsed: 0,
          freeMessagesLimit: 3,
        },
      }),
    );
    expect(state.devRole).toBe(true);
    expect(state.entitlementSource).toBe("dev");
    expect(isPro(state)).toBe(false);
    expect(isEntitled(state)).toBe(true);
  });

  it("entitlementSource surfaces stripe provenance even when devRole is false", async () => {
    const state = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, {
        authenticated: true,
        tier: "paid",
        entitlementSource: "stripe_promo",
      }),
    );
    expect(state.devRole).toBe(false);
    expect(state.entitlementSource).toBe("stripe_promo");
    expect(isEntitled(state)).toBe(true);
  });

  it("FEATURE-DETECT: older backend without the property block → CLIENT-SOFT { unlocked:false, used:0 }", async () => {
    const state = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, { authenticated: true, tier: "free" }),
    );
    expect(state).toMatchObject({
      status: "ready",
      authenticated: true,
      tier: "free",
      propertyUnlocked: false,
      freeMessagesUsed: 0,
      freeMessagesLimit: PE_PRICING.freeMessages.limit,
      softFallback: true, // the gate may show, but server 402s stay authoritative
    });
  });

  it("legacy { entitlement: { tier } } shape still resolves the tier", async () => {
    const state = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, { entitlement: { tier: "paid" } }),
    );
    expect(state.tier).toBe("paid");
    expect(state.softFallback).toBe(true);
  });

  it("401 → the signed-out state (sign-in-first, hard)", async () => {
    const state = await fetchPropertyEntitlement("48021:123", fakeFetch(401, {}));
    expect(state).toMatchObject({
      status: "ready",
      authenticated: false,
      propertyUnlocked: false,
      softFallback: false,
    });
  });

  it("402 (older-backend free-tier idiom) → authenticated free, SOFT", async () => {
    const state = await fetchPropertyEntitlement("48021:123", fakeFetch(402, {}));
    expect(state).toMatchObject({
      status: "ready",
      authenticated: true,
      tier: "free",
      softFallback: true,
    });
  });

  it("parses subscriptionTier from the 2026-08-24 cortex contract (solo/studio/team)", async () => {
    for (const tier of ["solo", "studio", "team"] as const) {
      const state = await fetchPropertyEntitlement(
        "48021:123",
        fakeFetch(200, {
          authenticated: true,
          tier: "paid",
          subscriptionTier: tier,
        }),
      );
      expect(state.subscriptionTier).toBe(tier);
    }
  });

  it("FAIL CLOSED: absent or unknown subscriptionTier parses to null — even on a paid row", async () => {
    const absent = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, { authenticated: true, tier: "paid" }),
    );
    expect(absent.subscriptionTier).toBeNull();
    expect(isPro(absent)).toBe(true); // paid stays paid — only Studio is denied
    const unknown = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, {
        authenticated: true,
        tier: "paid",
        subscriptionTier: "enterprise",
      }),
    );
    expect(unknown.subscriptionTier).toBeNull();
  });

  it("devRole without subscriptionTier infers team — live cortex omits the field; Solo Stripe rows stay null", async () => {
    const dev = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, {
        authenticated: true,
        tier: "paid",
        devRole: true,
        entitlementSource: "dev",
        property: {
          parcelNodeId: "48021:123",
          unlocked: false,
          freeMessagesUsed: 0,
          freeMessagesLimit: 3,
        },
      }),
    );
    expect(dev.devRole).toBe(true);
    expect(dev.subscriptionTier).toBe("team");
    expect(subscriptionTierGrantsStudio(dev.subscriptionTier)).toBe(true);
    expect(isEntitled(dev)).toBe(true);
    const stripePaidNoLadder = await fetchPropertyEntitlement(
      "48021:123",
      fakeFetch(200, { authenticated: true, tier: "paid" }),
    );
    expect(stripePaidNoLadder.devRole).toBe(false);
    expect(stripePaidNoLadder.subscriptionTier).toBeNull();
    expect(subscriptionTierGrantsStudio(stripePaidNoLadder.subscriptionTier)).toBe(
      false,
    );
  });

  it("subscriptionTierGrantsStudio: studio|team GRANT; solo and null DENY (operator ruling: owner data is Studio, not Solo)", () => {
    expect(subscriptionTierGrantsStudio("studio")).toBe(true);
    expect(subscriptionTierGrantsStudio("team")).toBe(true);
    expect(subscriptionTierGrantsStudio("solo")).toBe(false);
    expect(subscriptionTierGrantsStudio(null)).toBe(false);
  });

  it("5xx / network error → status 'error' (NEVER a hard break — tools run optimistically)", async () => {
    const server = await fetchPropertyEntitlement("48021:123", fakeFetch(503, {}));
    expect(server.status).toBe("error");
    const network = await fetchPropertyEntitlement("48021:123", (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    expect(network.status).toBe("error");
    expect(network.softFallback).toBe(true);
  });
});

describe("cache + invalidate", () => {
  const READY: PropertyEntitlementState = {
    status: "ready",
    authenticated: true,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 1,
    freeMessagesLimit: 3,
    softFallback: false,
    devRole: false,
    entitlementSource: null,
  };

  it("ensure fetches once per property; snapshot serves the cached state", async () => {
    const fetcher = vi.fn(async () => READY);
    await ensurePropertyEntitlement("48021:1", fetcher);
    await ensurePropertyEntitlement("48021:1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getPropertyEntitlementSnapshot("48021:1")).toEqual(READY);
    expect(getPropertyEntitlementSnapshot("48021:other")).toBeNull();
  });

  it("invalidate drops the property's state and notifies subscribers (unlock / consumed-message refresh)", async () => {
    const fetcher = vi.fn(async () => READY);
    await ensurePropertyEntitlement("48021:1", fetcher);
    const listener = vi.fn();
    subscribePropertyEntitlements(listener);
    invalidatePropertyEntitlement("48021:1");
    expect(listener).toHaveBeenCalled();
    expect(getPropertyEntitlementSnapshot("48021:1")).toBeNull();
    await ensurePropertyEntitlement("48021:1", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("prime injects a state directly (test seam / optimistic update)", () => {
    primePropertyEntitlement("48021:9", READY);
    expect(getPropertyEntitlementSnapshot("48021:9")).toEqual(READY);
  });
});
