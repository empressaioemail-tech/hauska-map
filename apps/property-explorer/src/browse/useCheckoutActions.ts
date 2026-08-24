// apps/property-explorer/src/browse/useCheckoutActions.ts
//
// THE ONE checkout-handling implementation (2026-08-24 pricing-popup ruling).
// Extracted from UnlockFlow.tsx so the PricingModal (and any future purchase
// surface) shares identical result handling — checkout redirect, sign-in,
// honest "coming", error, honestNote — instead of duplicating the switches.
//
// Both actions hit the SAME billing seams as before:
//   - $15 unlock       → startPropertyUnlock(parcelNodeId)
//   - subscriptions    → startPeCheckout({ parcelNodeId, tier, seats? })
// NEVER a fake success; every terminal state traces to a server response.

import { useState } from "react";
import {
  startPeCheckout,
  startPropertyUnlock,
  type PeCheckoutTier,
} from "../lib/billingClient";
import { invalidatePropertyEntitlement } from "../lib/entitlementClient";
import { recordPeGtmEvent } from "../lib/gtmClient";

export type CheckoutBusy = "property" | PeCheckoutTier | null;

export interface CheckoutNote {
  text: string;
  tone: "muted" | "amber";
}

export function useCheckoutActions(
  parcelNodeId: string | null,
  opts: {
    /** Fires only on a REAL unlock (dev-bypass server unlock) — never faked. */
    onUnlocked?: () => void;
  } = {},
) {
  const [busy, setBusy] = useState<CheckoutBusy>(null);
  const [note, setNote] = useState<CheckoutNote | null>(null);

  const handleProperty = async () => {
    if (busy || !parcelNodeId) return;
    setBusy("property");
    setNote(null);
    void recordPeGtmEvent({
      eventType: "pe_upgrade_started",
      parcelNodeId,
    });
    const result = await startPropertyUnlock(parcelNodeId);
    switch (result.kind) {
      case "unlocked":
        setBusy(null);
        invalidatePropertyEntitlement(parcelNodeId);
        setNote({ text: "Property unlocked.", tone: "muted" });
        opts.onUnlocked?.();
        return;
      case "checkout":
        window.location.assign(result.checkoutUrl);
        return;
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

  const handleSubscription = async (tier: PeCheckoutTier, seats?: number) => {
    if (busy) return;
    setBusy(tier);
    setNote(null);
    void recordPeGtmEvent({
      eventType: "pe_upgrade_started",
      parcelNodeId,
    });
    const result = await startPeCheckout({
      parcelNodeId,
      tier,
      ...(tier === "team" ? { seats } : {}),
    });
    setBusy(null);
    if (!result.ok) {
      setNote({ text: result.message ?? "Checkout unavailable.", tone: "amber" });
      return;
    }
    if (result.honestNote) setNote({ text: result.honestNote, tone: "muted" });
    if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
  };

  return { busy, note, handleProperty, handleSubscription } as const;
}

/** Clamp a raw seat-input value to the Team seat bounds (min 1, max 500). */
export function clampTeamSeats(raw: number): number {
  return Math.min(500, Math.max(1, raw));
}
