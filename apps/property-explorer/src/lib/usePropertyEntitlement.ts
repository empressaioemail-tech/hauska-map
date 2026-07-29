// apps/property-explorer/src/lib/usePropertyEntitlement.ts
//
// R1 PAYWALL — the shared PROACTIVE entitlement hook. Every paid bubble reads
// this BEFORE running, so a locked bubble opens the dock with its locked state
// instead of firing a request it knows will 402. The decisions:
//
//   signedOut → status ready + not authenticated → sign-in-first state
//   locked    → status ready + authenticated + not entitled → LOCKED state
//               (value line + the unified unlock flow)
//   otherwise (loading / error / entitled) → run as today — a proactive read
//   that is missing or failed NEVER hard-blocks; the server-402 reactive
//   paths stay the authoritative belt.
//
// Cached per property (entitlementClient module cache); refreshed on unlock
// events and consumed free messages via invalidatePropertyEntitlement (sign-in
// is a full-page OAuth redirect, so the cache is fresh after sign-in by
// construction).

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import {
  ensurePropertyEntitlement,
  freeMessagesLeft,
  getPropertyEntitlementSnapshot,
  invalidatePropertyEntitlement,
  isEntitled,
  isPro,
  subscribePropertyEntitlements,
} from "./entitlementClient";
import { PE_PRICING } from "./pricing";

export interface UsePropertyEntitlement {
  /** "loading" until the property's first read lands. */
  status: "loading" | "ready" | "error";
  authenticated: boolean;
  /** Pro subscription. */
  pro: boolean;
  /** The per-property $15 unlock. */
  propertyUnlocked: boolean;
  /** pro || propertyUnlocked — may this property's paid bubbles run? */
  entitled: boolean;
  freeMessagesUsed: number;
  freeMessagesLimit: number;
  freeMessagesLeft: number;
  /** Property block was client-assumed (older backend / read error) — soft. */
  softFallback: boolean;
  /** Ready + NOT authenticated → paid bubbles show sign-in-first. */
  signedOut: boolean;
  /** Ready + authenticated + NOT entitled → paid bubbles show LOCKED. */
  locked: boolean;
  /** Drop this property's cached read and re-fetch. */
  refresh: () => void;
}

const LOADING: UsePropertyEntitlement = {
  status: "loading",
  authenticated: false,
  pro: false,
  propertyUnlocked: false,
  entitled: false,
  freeMessagesUsed: 0,
  freeMessagesLimit: PE_PRICING.freeMessages.limit,
  freeMessagesLeft: PE_PRICING.freeMessages.limit,
  softFallback: false,
  signedOut: false,
  locked: false,
  refresh: () => {},
};

/**
 * The proactive per-property entitlement read (null property → permanent
 * loading state; property-scoped tools never reach that — the dock
 * short-circuits to the honest no-property state first).
 */
export function usePropertyEntitlement(
  parcelNodeId: string | null,
): UsePropertyEntitlement {
  const snapshot = useSyncExternalStore(
    subscribePropertyEntitlements,
    () => (parcelNodeId ? getPropertyEntitlementSnapshot(parcelNodeId) : null),
    () => (parcelNodeId ? getPropertyEntitlementSnapshot(parcelNodeId) : null),
  );

  // Kick the fetch when nothing is cached (also after an invalidate — the
  // subscription re-renders with a null snapshot and this effect re-fires).
  useEffect(() => {
    if (parcelNodeId && !snapshot) void ensurePropertyEntitlement(parcelNodeId);
  }, [parcelNodeId, snapshot]);

  if (!parcelNodeId || !snapshot) return LOADING;

  const pro = isPro(snapshot);
  const entitled = isEntitled(snapshot);
  const ready = snapshot.status === "ready";
  return {
    status: snapshot.status,
    authenticated: snapshot.authenticated,
    pro,
    propertyUnlocked: snapshot.propertyUnlocked,
    entitled,
    freeMessagesUsed: snapshot.freeMessagesUsed,
    freeMessagesLimit: snapshot.freeMessagesLimit,
    freeMessagesLeft: freeMessagesLeft(snapshot),
    softFallback: snapshot.softFallback,
    signedOut: ready && !snapshot.authenticated,
    // "error" never locks — tools run optimistically; the server 402 decides.
    locked: ready && snapshot.authenticated && !entitled,
    refresh: () => invalidatePropertyEntitlement(parcelNodeId),
  };
}
