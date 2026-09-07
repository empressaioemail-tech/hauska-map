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
  PE_PRICING,
  teamSeatsOnWire,
  toCheckoutInterval,
  type PeCheckoutInterval,
  type PricingInterval,
} from "../lib/pricing";
import { invalidatePropertyEntitlement } from "../lib/entitlementClient";
import { recordPeGtmEvent } from "../lib/gtmClient";
import { notePropertyUnlockIntent } from "../lib/unlock-week";
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
  seats?: number;
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

/**
 * Pure decision for the defense-in-depth plan-change confirmation (see
 * useCheckoutActions' currentPlan doc comment). True exactly once per
 * requested tier: a real change (different tier and/or interval) that
 * hasn't already been confirmed by a repeat click on the SAME tier.
 */
export function planChangeNeedsConfirmation(
  currentPlan: { tier: PeCheckoutTier; interval: PeCheckoutInterval } | null | undefined,
  requestedTier: PeCheckoutTier,
  requestedInterval: PeCheckoutInterval,
  pendingConfirmTier: PeCheckoutTier | null,
): boolean {
  if (!currentPlan) return false;
  const isChange =
    currentPlan.tier !== requestedTier || currentPlan.interval !== requestedInterval;
  if (!isChange) return false;
  return pendingConfirmTier !== requestedTier;
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
    /**
     * The account's current active plan, when known (useAccountEntitlement).
     * DEFENSE IN DEPTH ONLY (Smart Site UI review 2026-09-04: an account held
     * two simultaneously-active billing plans). This warns before starting a
     * checkout that would change an already-active plan and requires a
     * second click on the same tier to confirm. It does NOT close the actual
     * gap — the real guard has to live where the subscription is created
     * (legacy-design-tools' checkout-session/webhook handling), which this
     * repo does not own and this change does not touch. Two browser tabs, or
     * anything hitting the checkout endpoint directly, still isn't caught by
     * this. Absent/undefined (e.g. account read still loading, or not
     * signed in) never blocks a checkout — an unread state must not read as
     * "no current plan" any more confidently than it reads as one.
     */
    currentPlan?: { tier: PeCheckoutTier; interval: PeCheckoutInterval } | null;
  } = {},
) {
  const [busy, setBusy] = useState<CheckoutBusy>(null);
  const [note, setNote] = useState<CheckoutNote | null>(null);
  const [unlockSession, setUnlockSession] = useState<UnlockCheckoutSession | null>(
    null,
  );
  const [subscriptionSession, setSubscriptionSession] =
    useState<SubscriptionCheckoutSession | null>(null);
  const [pendingPlanChangeTier, setPendingPlanChangeTier] =
    useState<PeCheckoutTier | null>(null);

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
    notePropertyUnlockIntent(parcelNodeId);
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
    const checkoutInterval = toCheckoutInterval(interval);

    // Defense in depth (see the currentPlan doc comment above): a real plan
    // CHANGE gets one confirmation click before it fires. Clicking the SAME
    // tier again (or clicking a different tier, which resets which one is
    // pending) proceeds.
    const current = opts.currentPlan;
    if (
      planChangeNeedsConfirmation(current, tier, checkoutInterval, pendingPlanChangeTier)
    ) {
      setPendingPlanChangeTier(tier);
      setNote({
        text: `You're already on the ${current!.tier} (${current!.interval === "year" ? "annual" : "monthly"}) plan. Click ${PE_PRICING[tier].ctaLabel} again to switch.`,
        tone: "amber",
      });
      return;
    }
    setPendingPlanChangeTier(null);

    setBusy(tier);
    setNote(null);
    void recordPeGtmEvent({
      eventType: "pe_upgrade_started",
      parcelNodeId,
    });
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
        seats: tier === "team" ? teamSeatsOnWire(interval, seats ?? PE_PRICING.team.baseSeats) : undefined,
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
