/**
 * Custom Checkout mount (WDLL items 4, 5, 7).
 * Stripe owns card / email / ZIP. PE owns the mount slot and submit.
 *
 * Fail closed: missing secret, publishableKey, or mount element never
 * reaches loadStripe.
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { STRIPE_APPEARANCE } from "./stripeAppearance";

export const STRIPE_MOUNT_MISSING_SECRET =
  "Stripe Checkout cannot mount without a clientSecret";

export const STRIPE_MOUNT_MISSING_KEY =
  "Stripe Checkout cannot mount without a publishableKey";

export const STRIPE_MOUNT_MISSING_ELEMENT =
  "Stripe Checkout cannot mount without a mount element";

export const STRIPE_MOUNT_LOAD_FAILED =
  "Stripe.js failed to load. Nothing was charged.";

export const CHECKOUT_SESSION_MISSING =
  "Checkout session is missing. Return to the map and start again. Nothing was charged.";

export type StripeJsLoader = (publishableKey: string) => Promise<Stripe | null>;

/** Trimmed down from Stripe's `StripeCheckoutSession` (7.9.0) to the fields the
 *  promo-code UI actually reads — total due and the applied discount, if any. */
export type CheckoutSessionSummary = {
  total: { total: { amount: string; minorUnitsAmount: number } };
  discountAmounts: Array<{
    displayName: string;
    promotionCode: string | null;
  }> | null;
};

export type PromotionCodeResult =
  | { type: "success"; session: CheckoutSessionSummary }
  | { type: "error"; error: { message: string } };

export type MountedCheckout = {
  createPaymentElement: () => {
    mount: (el: string | HTMLElement) => void;
  };
  confirm: (args?: {
    returnUrl?: string;
    redirect?: "always" | "if_required";
  }) => Promise<{
    type: "success" | "error";
    error?: { message: string };
  }>;
  applyPromotionCode: (promotionCode: string) => Promise<PromotionCodeResult>;
  removePromotionCode: () => Promise<PromotionCodeResult>;
  session: () => CheckoutSessionSummary;
};

export type StripeMountResult =
  | { ok: false; error: string }
  | { ok: true; checkout: MountedCheckout };

export type CheckoutMountCredentials =
  | { ok: true; clientSecret: string; publishableKey: string }
  | { ok: false; error: string };

export function resolveCheckoutMountCredentials(input: {
  clientSecret?: string | null;
  publishableKey?: string | null;
}): CheckoutMountCredentials {
  const clientSecret =
    typeof input.clientSecret === "string" ? input.clientSecret.trim() : "";
  if (!clientSecret) {
    return { ok: false, error: STRIPE_MOUNT_MISSING_SECRET };
  }
  const publishableKey =
    typeof input.publishableKey === "string" ? input.publishableKey.trim() : "";
  if (!publishableKey) {
    return { ok: false, error: STRIPE_MOUNT_MISSING_KEY };
  }
  return { ok: true, clientSecret, publishableKey };
}

export function checkoutSubmitEnabled(
  status: "blocked" | "mounting" | "ready" | "confirming" | "error",
): boolean {
  return status === "ready";
}

export async function mountStripeCheckout(input: {
  clientSecret?: string | null;
  publishableKey?: string | null;
  element?: HTMLElement | null;
  loadStripe?: StripeJsLoader;
}): Promise<StripeMountResult> {
  const creds = resolveCheckoutMountCredentials(input);
  if (!creds.ok) {
    throw new Error(creds.error);
  }
  if (!input.element) {
    throw new Error(STRIPE_MOUNT_MISSING_ELEMENT);
  }

  const loader = input.loadStripe ?? loadStripe;
  const stripe = await loader(creds.publishableKey);
  if (!stripe) {
    return { ok: false, error: STRIPE_MOUNT_LOAD_FAILED };
  }

  try {
    const checkout = await stripe.initCheckout({
      fetchClientSecret: async () => creds.clientSecret,
      elementsOptions: { appearance: STRIPE_APPEARANCE },
    });
    const paymentElement = checkout.createPaymentElement();
    paymentElement.mount(input.element);
    return { ok: true, checkout };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : STRIPE_MOUNT_LOAD_FAILED,
    };
  }
}

export async function applyPromotionCode(
  checkout: MountedCheckout | null | undefined,
  code: string,
): Promise<{ ok: true; session: CheckoutSessionSummary } | { ok: false; error: string }> {
  if (!checkout) {
    throw new Error("Stripe Checkout cannot confirm without a mounted session");
  }
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a promo code first." };
  }
  const result = await checkout.applyPromotionCode(trimmed);
  if (result.type === "error") {
    return {
      ok: false,
      error: result.error?.message?.trim() || "That code didn't work. Nothing was charged.",
    };
  }
  return { ok: true, session: result.session };
}

export async function removeStripePromotionCode(
  checkout: MountedCheckout | null | undefined,
): Promise<{ ok: true; session: CheckoutSessionSummary } | { ok: false; error: string }> {
  if (!checkout) {
    throw new Error("Stripe Checkout cannot confirm without a mounted session");
  }
  const result = await checkout.removePromotionCode();
  if (result.type === "error") {
    return {
      ok: false,
      error: result.error?.message?.trim() || "Could not remove the code. Nothing was charged.",
    };
  }
  return { ok: true, session: result.session };
}

export async function confirmStripeCheckout(
  checkout: MountedCheckout | null | undefined,
  opts?: { returnUrl?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!checkout) {
    throw new Error("Stripe Checkout cannot confirm without a mounted session");
  }
  const result = await checkout.confirm({
    redirect: "always",
    ...(opts?.returnUrl ? { returnUrl: opts.returnUrl } : {}),
  });
  if (result.type === "error") {
    return {
      ok: false,
      error: result.error?.message?.trim() || "Payment could not be confirmed. Nothing was charged.",
    };
  }
  return { ok: true };
}
