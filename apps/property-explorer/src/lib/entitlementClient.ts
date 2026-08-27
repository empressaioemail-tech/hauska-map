// apps/property-explorer/src/lib/entitlementClient.ts
//
// R1 PAYWALL — the PROACTIVE per-property entitlement reader (client side).
//
// THE PINNED BACKEND CONTRACT (cortex leg builds in parallel — feature-detect):
//   GET api/property-explorer/v1/entitlement?parcelNodeId=<id>
//   (session Bearer via the deep proxy) →
//   { authenticated, tier: "free"|"paid", tenantId, userId,
//     devRole?: boolean, entitlementSource?: "stripe_sub"|"stripe_promo"|
//       "stripe_unlock"|"dev"|null,
//     property?: { parcelNodeId, unlocked, freeMessagesUsed, freeMessagesLimit } }
//
// SINGLE ENTITLEMENT SOURCE (WDLL item 5): `devRole` is the server-granted
// internal role (operator flips a DB field — no deploy, no env allowlist).
// It is a USER-level grant, not per-property, so it entitles every property
// exactly like a Pro subscription. There is no client-only paid check
// anywhere in this module — every state below traces to a server read.
//
// FEATURE-DETECT FALLBACK (CLIENT-SOFT): an older backend without the
// `property` block is treated as { unlocked: false, freeMessagesUsed: 0 } —
// soft. Softness means the proactive display may gate, but the SERVER stays
// authoritative: every reactive 402 path is kept intact, and an entitlement
// read that ERRORS never hard-locks a bubble (tools run optimistically and
// let the server 402 decide). NEVER a hard break.
//
// CACHING: one entry per parcelNodeId, module-level, shared by every paid
// bubble (they all read it BEFORE running). Refresh points:
//   - sign-in: OAuth is a full-page redirect, so the module cache is fresh
//     after every sign-in by construction;
//   - unlock events: invalidatePropertyEntitlement(id) after a dev-unlock or
//     a consumed free message re-fetches the property's state.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";
import { PE_PRICING } from "./pricing";

export type PeEntitlementTier = "free" | "paid";

/**
 * The subscription ladder tier on `/entitlement` (cortex, 2026-08-24 contract):
 * null = free or unlock-only; legacy paid rows read "solo"; dev-role reads
 * "team". A response missing the field (stale cache / older backend) parses
 * to null — and null NEVER grants Studio (fail closed: a Solo subscriber or
 * an unknown tier must not clear Studio gates).
 */
export type PeSubscriptionTier = "solo" | "studio" | "team";

/** Snapshot of what we know about the (user, property) entitlement. */
export interface PropertyEntitlementState {
  /** "ready" = usable answer; "error" = could not read (NEVER hard-locks). */
  status: "ready" | "error";
  authenticated: boolean;
  tier: PeEntitlementTier;
  /** The per-property $15 unlock (Pro implies access but not this flag). */
  propertyUnlocked: boolean;
  freeMessagesUsed: number;
  freeMessagesLimit: number;
  /**
   * True when the property block did not come from the server (older backend,
   * 402-only backend, or a read error) — CLIENT-SOFT: proactive display only,
   * server 402s stay authoritative.
   */
  softFallback: boolean;
  /**
   * Server-granted internal dev role (WDLL item 4/5) — a user-level grant,
   * so it entitles every property exactly like Pro. Read from the server
   * only; there is no client-side dev flag or env allowlist here.
   */
  devRole: boolean;
  /**
   * Provenance of the entitlement when the server reports one (e.g.
   * "stripe_sub", "stripe_promo", "stripe_unlock", "dev"); null for free or
   * when the server hasn't shipped the field yet (feature-detect).
   */
  entitlementSource: string | null;
  /** Ladder tier — null when free, unlock-only, or the field is absent. */
  subscriptionTier: PeSubscriptionTier | null;
}

/** Pro subscription? */
export function isPro(s: PropertyEntitlementState): boolean {
  return s.tier === "paid";
}

/**
 * Does this ladder tier grant the Studio-only surfaces (terrain export,
 * site-plan CAD, owner data)? Studio and Team do; Solo and null do NOT —
 * "Owner data is Studio, not Solo" is an operator ruling, and a missing
 * field (null) gates CLOSED even on a `tier === "paid"` row.
 */
export function subscriptionTierGrantsStudio(
  tier: PeSubscriptionTier | null,
): boolean {
  return tier === "studio" || tier === "team";
}

/** Entitled to this property's paid bubbles (per-property unlock, Pro, or dev role). */
export function isEntitled(s: PropertyEntitlementState): boolean {
  return isPro(s) || s.propertyUnlocked || s.devRole;
}

/**
 * Studio-only surfaces (terrain export, site-plan CAD where gated, owner data).
 * Dev role reads as team on the server; until refresh, client infers team from
 * devRole. While entitlement is still loading, return true so the dock does not
 * flash a false Studio lock — server 402 stays authoritative.
 */
export function studioGrantedForEntitlement(
  s: Pick<PropertyEntitlementState, "devRole" | "subscriptionTier" | "status">,
): boolean {
  if (s.status !== "ready") return true;
  return s.devRole || subscriptionTierGrantsStudio(s.subscriptionTier);
}

export function freeMessagesLeft(s: PropertyEntitlementState): number {
  return Math.max(0, s.freeMessagesLimit - s.freeMessagesUsed);
}

function signedOutState(): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: false,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: PE_PRICING.freeMessages.limit,
    softFallback: false,
    devRole: false,
    entitlementSource: null,
    subscriptionTier: null,
  };
}

function softFreeState(status: "ready" | "error"): PropertyEntitlementState {
  return {
    status,
    authenticated: true,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: PE_PRICING.freeMessages.limit,
    softFallback: true,
    devRole: false,
    entitlementSource: null,
    subscriptionTier: null,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * One entitlement read for one property — pure contract mapping, no cache.
 *
 *   proxy/upstream 401 → signed-out (ready, hard — the sign-in-first state)
 *   402               → authenticated free tier (older backend idiom), SOFT
 *   200 + property    → the full pinned contract (hard)
 *   200 w/o property  → feature-detect fallback: unlocked:false, used:0, SOFT
 *   anything else     → status "error" (tools run optimistically — never a
 *                       hard break; the server 402 belt stays authoritative)
 */
export async function fetchPropertyEntitlement(
  parcelNodeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PropertyEntitlementState> {
  try {
    const res = await fetchImpl(
      `${CORTEX_DEEP_PROXY_BASE}/api/property-explorer/v1/entitlement?parcelNodeId=${encodeURIComponent(parcelNodeId)}`,
      { credentials: "include", headers: { Accept: "application/json" } },
    );
    if (res.status === 401) return signedOutState();
    if (res.status === 402) return softFreeState("ready");
    if (!res.ok) return softFreeState("error");

    const body = asRecord(await res.json().catch(() => null));
    if (!body) return softFreeState("error");
    // Legacy shape tolerance: { entitlement: { tier } } or top-level tier.
    const legacy = asRecord(body.entitlement);
    const tier: PeEntitlementTier =
      body.tier === "paid" || legacy?.tier === "paid" ? "paid" : "free";
    const authenticated = body.authenticated !== false;
    // devRole is a USER-level grant (not per-property) — read at top level
    // regardless of whether the property block is present.
    const devRole = body.devRole === true || legacy?.devRole === true;
    const sourceRaw = body.entitlementSource ?? legacy?.entitlementSource;
    const entitlementSource = typeof sourceRaw === "string" ? sourceRaw : null;
    // Ladder tier — ONLY the three known strings parse; anything else
    // (absent field on a stale cache/older backend, unknown string) is null,
    // and null gates Studio surfaces CLOSED even when tier is "paid".
    // Exception: a server-granted devRole is the Team grant (cortex
    // contract: "dev-role reads team"). Live /entitlement elevates tier
    // to paid and sets entitlementSource "dev" but does not emit
    // subscriptionTier yet — infer team ONLY from explicit devRole so a
    // legacy paid Stripe row with a missing field still fail-closes.
    const subRaw = body.subscriptionTier ?? legacy?.subscriptionTier;
    let subscriptionTier: PeSubscriptionTier | null =
      subRaw === "solo" || subRaw === "studio" || subRaw === "team"
        ? subRaw
        : null;
    if (subscriptionTier === null && devRole) {
      subscriptionTier = "team";
    }
    const property = asRecord(body.property);
    if (!property) {
      // FEATURE-DETECT: older backend without the property block — CLIENT-SOFT.
      return {
        status: "ready",
        authenticated,
        tier,
        propertyUnlocked: false,
        freeMessagesUsed: 0,
        freeMessagesLimit: PE_PRICING.freeMessages.limit,
        softFallback: true,
        devRole,
        entitlementSource,
        subscriptionTier,
      };
    }
    return {
      status: "ready",
      authenticated,
      tier,
      propertyUnlocked: property.unlocked === true,
      freeMessagesUsed: num(property.freeMessagesUsed) ?? 0,
      freeMessagesLimit:
        num(property.freeMessagesLimit) ?? PE_PRICING.freeMessages.limit,
      softFallback: false,
      devRole,
      entitlementSource,
      subscriptionTier,
    };
  } catch {
    return softFreeState("error");
  }
}

// ---------------------------------------------------------------------------
// Module-level per-property cache + subscription (the shared proactive read).
// ---------------------------------------------------------------------------

const cache = new Map<string, PropertyEntitlementState>();
const inFlight = new Map<string, Promise<PropertyEntitlementState>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribePropertyEntitlements(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Sync snapshot — null while nothing is known yet (the hook's "loading"). */
export function getPropertyEntitlementSnapshot(
  parcelNodeId: string,
): PropertyEntitlementState | null {
  return cache.get(parcelNodeId) ?? null;
}

/** Fetch-if-absent; concurrent callers share one in-flight read. */
export function ensurePropertyEntitlement(
  parcelNodeId: string,
  fetcher: (
    parcelNodeId: string,
  ) => Promise<PropertyEntitlementState> = fetchPropertyEntitlement,
): Promise<PropertyEntitlementState> {
  const cached = cache.get(parcelNodeId);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(parcelNodeId);
  if (pending) return pending;
  const p = fetcher(parcelNodeId).then((state) => {
    inFlight.delete(parcelNodeId);
    cache.set(parcelNodeId, state);
    notify();
    return state;
  });
  inFlight.set(parcelNodeId, p);
  return p;
}

/**
 * Drop cached state (one property, or all) and notify subscribers — hooks
 * re-fetch. Call after an unlock event or a consumed free message.
 */
export function invalidatePropertyEntitlement(parcelNodeId?: string): void {
  if (parcelNodeId !== undefined) cache.delete(parcelNodeId);
  else cache.clear();
  notify();
}

/** Test seam: inject a known state (also usable for optimistic updates). */
export function primePropertyEntitlement(
  parcelNodeId: string,
  state: PropertyEntitlementState,
): void {
  cache.set(parcelNodeId, state);
  notify();
}

/** Test seam: full reset. */
export function resetPropertyEntitlementsForTests(): void {
  cache.clear();
  inFlight.clear();
  listeners.clear();
}
