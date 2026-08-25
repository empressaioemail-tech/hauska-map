// apps/property-explorer/src/browse/useCheckoutActions.ts
//
// THE ONE checkout-handling implementation (2026-08-24 pricing-popup ruling).
// Custom clientSecret opens the subscription payment modal (map stays
// mounted) or the unlock modal. Hosted checkoutUrl still assigns to Stripe
// (WDLL item 3 fallback). Never assign a non-Stripe URL. Never assign
// /checkout — that route unmounted the map.

import { useState } from "react";
import {
  isStripeCheckoutUrl,
  startPeCheckout,
  startPropertyUnlock,
  type PeCheckoutResult,
  type PeCheckoutTier,
  type PropertyUnlockResult,
} from "../lib/billingClient";
import {
  persistCheckoutPurchase,
  persistCustomCheckoutSession,
} from "../lib/checkoutOrigin";
import {
  teamSeatsOnWire,
  toCheckoutInterval,
  type PeCheckoutInterval,
  type PricingInterval,
} from "../lib/pricing";
import { invalidatePropertyEntitlement } from "../lib/entitlementClient";
import { recordPeGtmEvent } from "../lib/gtmClient";
export type CheckoutBusy = "property" | PeCheckoutTier | null;

export interface CheckoutNote {
  text: string;
  tone: "muted" | "amber";
}

export type UnlockCheckoutSession = {
  clientSecret: string;
  publishableKey?: string;
  sessionId?: string;
  parcelNodeId: string;
  situs: string | null;
};

export type SubscriptionCheckoutSession = {
  clientSecret: string;
  publishableKey?: string;
  sessionId?: string;
  tier: PeCheckoutTier;
  interval: PeCheckoutInterval;
  parcelNodeId: string | null;
  situs: string | null;
};

export type CheckoutNav =
  | { action: "modal" }
  | { action: "hosted"; url: string }
  | { action: "error"; message: string }
  | { action: "idle" };

const NON_STRIPE_URL_MESSAGE =
  "Checkout could not be started — payment session URL was not from Stripe.";

export function resolveSubscriptionNavigation(
  result: PeCheckoutResult,
  _ctx: {
    tier: PeCheckoutTier;
    interval: PeCheckoutInterval;
    parcelNodeId?: string | null;
    situs?: string | null;
  },
): CheckoutNav {
  if (!result.ok) {
    return { action: "error", message: result.message ?? "Checkout unavailable." };
  }
  if (result.clientSecret) {
    return { action: "modal" };
  }
  if (result.checkoutUrl) {
    if (!isStripeCheckoutUrl(result.checkoutUrl)) {
      return { action: "error", message: NON_STRIPE_URL_MESSAGE };
    }
    return { action: "hosted", url: result.checkoutUrl };
  }
  return { action: "idle" };
}

export function resolveUnlockNavigation(
  result: Extract<PropertyUnlockResult, { kind: "checkout" }>,
): { action: "custom" } | { action: "hosted"; url: string } | { action: "error"; message: string } {
  if (result.clientSecret) return { action: "custom" };
  if (result.checkoutUrl) {
    if (!isStripeCheckoutUrl(result.checkoutUrl)) {
      return { action: "error", message: NON_STRIPE_URL_MESSAGE };
    }
    return { action: "hosted", url: result.checkoutUrl };
  }
  return { action: "error", message: NON_STRIPE_URL_MESSAGE };
}

export function useCheckoutActions(
  parcelNodeId: string | null,
  opts: {
    /** Fires only on a REAL unlock (dev-bypass server unlock) — never faked. */
    onUnlocked?: () => void;
    situsAddress?: string | null;
  } = {},
) {
  const [busy, setBusy] = useState<CheckoutBusy>(null);
  const [note, setNote] = useState<CheckoutNote | null>(null);
  const [unlockSession, setUnlockSession] = useState<UnlockCheckoutSession | null>(
    null,
  );
  const [subscriptionSession, setSubscriptionSession] =
    useState<SubscriptionCheckoutSession | null>(null);

  const handleProperty = async () => {
    if (busy || !parcelNodeId) return;
    setBusy("property");
    setNote(null);
    void recordPeGtmEvent({
      eventType: "pe_upgrade_started",
      parcelNodeId,
    });
    persistCheckoutPurchase({
      kind: "unlock",
      parcelNodeId,
      situs: opts.situsAddress ?? null,
    });
    const result = await startPropertyUnlock(parcelNodeId);
    switch (result.kind) {
      case "unlocked":
        setBusy(null);
        invalidatePropertyEntitlement(parcelNodeId);
        setNote({ text: "Property unlocked.", tone: "muted" });
        opts.onUnlocked?.();
        return;
      case "checkout": {
        const nav = resolveUnlockNavigation(result);
        if (nav.action === "custom" && result.clientSecret) {
          persistCustomCheckoutSession({
            clientSecret: result.clientSecret,
            publishableKey: result.publishableKey,
            sessionId: result.sessionId,
            kind: "unlock",
          });
          setUnlockSession({
            clientSecret: result.clientSecret,
            publishableKey: result.publishableKey,
            sessionId: result.sessionId,
            parcelNodeId,
            situs: opts.situsAddress ?? null,
          });
          setBusy(null);
          return;
        }
        if (nav.action === "hosted") {
          window.location.assign(nav.url);
          return;
        }
        setBusy(null);
        setNote({
          text: nav.action === "error" ? nav.message : NON_STRIPE_URL_MESSAGE,
          tone: "amber",
        });
        return;
      }
      case "sign-in":
        setBusy(null);
        setNote({
          text: "Your session expired — sign in again to unlock this property.",
          tone: "amber",
        });
        return;
      case "coming":
        setBusy(null);
        setNote({ text: result.message, tone: "muted" });
        return;
      case "error":
        setBusy(null);
        setNote({ text: result.message, tone: "amber" });
        return;
    }
  };

  const handleSubscription = async (
    tier: PeCheckoutTier,
    interval: PricingInterval,
    seats?: number,
  ) => {
    if (busy) return;
    setBusy(tier);
    setNote(null);
    void recordPeGtmEvent({
      eventType: "pe_upgrade_started",
      parcelNodeId,
    });
    const checkoutInterval = toCheckoutInterval(interval);
    persistCheckoutPurchase({
      kind: "subscription",
      tier,
      parcelNodeId,
      situs: opts.situsAddress ?? null,
    });
    const result = await startPeCheckout({
      parcelNodeId,
      tier,
      interval: checkoutInterval,
      ...(tier === "team" && seats !== undefined
        ? { seats: teamSeatsOnWire(interval, seats) }
        : {}),
    });
    setBusy(null);
    const nav = resolveSubscriptionNavigation(result, {
      tier,
      interval: checkoutInterval,
      parcelNodeId,
      situs: opts.situsAddress,
    });
    if (nav.action === "error") {
      setNote({ text: nav.message, tone: "amber" });
      return;
    }
    if (result.honestNote) setNote({ text: result.honestNote, tone: "muted" });
    if (nav.action === "modal") {
      if (!result.clientSecret) {
        setNote({ text: "Checkout session is missing. Nothing was charged.", tone: "amber" });
        return;
      }
      persistCustomCheckoutSession({
        clientSecret: result.clientSecret,
        publishableKey: result.publishableKey,
        sessionId: result.sessionId,
        kind: "subscription",
      });
      setSubscriptionSession({
        clientSecret: result.clientSecret,
        publishableKey: result.publishableKey,
        sessionId: result.sessionId,
        tier,
        interval: checkoutInterval,
        parcelNodeId: parcelNodeId,
        situs: opts.situsAddress ?? null,
      });
      return;
    }
    if (nav.action === "hosted") {
      window.location.assign(nav.url);
    }
  };

  return {
    busy,
    note,
    handleProperty,
    handleSubscription,
    unlockSession,
    dismissUnlock: () => setUnlockSession(null),
    subscriptionSession,
    dismissSubscription: () => setSubscriptionSession(null),
  } as const;
}

/** Clamp a raw seat-input value to the Team seat bounds (min 1, max 500). */
export function clampTeamSeats(raw: number): number {
  return Math.min(500, Math.max(1, raw));
}
