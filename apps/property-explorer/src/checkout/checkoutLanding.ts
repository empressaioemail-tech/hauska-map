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
  seats: number | null;
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
  const rawSeats = params.get("seats")?.trim();
  const parsedSeats = rawSeats ? Number.parseInt(rawSeats, 10) : NaN;
  return {
    tier,
    interval,
    parcelNodeId: params.get("parcelNodeId")?.trim() || null,
    situs: params.get("situs")?.trim() || null,
    seats: Number.isFinite(parsedSeats) && parsedSeats > 0 ? parsedSeats : null,
  };
}

export function checkoutPageHref(input: {
  tier: PeCheckoutTier;
  interval: PeCheckoutInterval;
  parcelNodeId?: string | null;
  situs?: string | null;
  seats?: number | null;
}): string {
  const params = new URLSearchParams();
  params.set("tier", input.tier);
  params.set("interval", input.interval);
  if (input.parcelNodeId) params.set("parcelNodeId", input.parcelNodeId);
  if (input.situs) params.set("situs", input.situs);
  if (input.tier === "team" && input.seats != null) {
    params.set("seats", String(input.seats));
  }
  return `/checkout?${params.toString()}`;
}

/** Map URL that keeps the parcel inspect. /checkout itself is retired. */
export function checkoutDeepLinkMapHref(query: CheckoutQuery): string {
  const params = new URLSearchParams();
  if (query.parcelNodeId) params.set("parcelNodeId", query.parcelNodeId);
  params.set("peCheckout", "1");
  params.set("tier", query.tier);
  params.set("interval", query.interval);
  if (query.situs) params.set("situs", query.situs);
  if (query.tier === "team" && query.seats != null) {
    params.set("seats", String(query.seats));
  }
  return `/?${params.toString()}`;
}

/**
 * A /checkout?tier= deep link becomes the map plus a pending modal.
 * Never leaves the caller on a bare checkout page.
 */
export function consumeCheckoutDeepLink(input: {
  pathname: string;
  search: string;
}): { mapHref: string; query: CheckoutQuery } | null {
  if (!isCheckoutPath(input.pathname)) return null;
  const query = parseCheckoutQuery(input.search);
  return { mapHref: checkoutDeepLinkMapHref(query), query };
}

/** Pending Start from a consumed /checkout deep link (map URL). */
export function parsePendingCheckout(search: string): CheckoutQuery | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  if (params.get("peCheckout") !== "1") return null;
  return parseCheckoutQuery(search);
}

export function stripPendingCheckoutFromUrl(href: string): string {
  const url = new URL(href, "https://smartsite.cloud");
  url.searchParams.delete("peCheckout");
  url.searchParams.delete("tier");
  url.searchParams.delete("interval");
  url.searchParams.delete("situs");
  const qs = url.searchParams.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}

export function isKnownCheckoutTier(tier: string): tier is PeCheckoutTier {
  return (TIERS as readonly string[]).includes(tier);
}
