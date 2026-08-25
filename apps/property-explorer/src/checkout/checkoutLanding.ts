/**
 * /checkout pathname + query — same idiom as share-landing (no router).
 */

import type { PeCheckoutTier } from "../lib/billingClient";
import type { PeCheckoutInterval } from "../lib/pricing";

export type CheckoutQuery = {
  tier: PeCheckoutTier;
  interval: PeCheckoutInterval;
  parcelNodeId: string | null;
  situs: string | null;
};

const TIERS: readonly PeCheckoutTier[] = ["solo", "studio", "team"];

export function isCheckoutPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/checkout";
}

export function parseCheckoutQuery(search: string): CheckoutQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const rawTier = params.get("tier")?.trim().toLowerCase();
  const tier: PeCheckoutTier =
    rawTier === "solo" || rawTier === "studio" || rawTier === "team"
      ? rawTier
      : "studio";
  const rawInterval = params.get("interval")?.trim();
  const interval: PeCheckoutInterval = rawInterval === "month" ? "month" : "year";
  return {
    tier,
    interval,
    parcelNodeId: params.get("parcelNodeId")?.trim() || null,
    situs: params.get("situs")?.trim() || null,
  };
}

export function checkoutPageHref(input: {
  tier: PeCheckoutTier;
  interval: PeCheckoutInterval;
  parcelNodeId?: string | null;
  situs?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("tier", input.tier);
  params.set("interval", input.interval);
  if (input.parcelNodeId) params.set("parcelNodeId", input.parcelNodeId);
  if (input.situs) params.set("situs", input.situs);
  return `/checkout?${params.toString()}`;
}

export function isKnownCheckoutTier(tier: string): tier is PeCheckoutTier {
  return (TIERS as readonly string[]).includes(tier);
}
