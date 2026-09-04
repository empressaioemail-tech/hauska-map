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
 *  promo-code and email-collection UI actually read — total due, the applied
 *  discount if any, and the email Stripe has on file (or null when this
 *  account's own record has none — see updateEmail below). */
export type CheckoutSessionSummary = {
  total: { total: { amount: string; minorUnitsAmount: number } };
  discountAmounts: Array<{
    displayName: string;
    promotionCode: string | null;
  }> | null;
  email: string | null;
};

export type PromotionCodeResult =
  | { type: "success"; session: CheckoutSessionSummary }
  | { type: "error"; error: { message: string } };

/** Mirrors Stripe's `StripeCheckoutUpdateEmailResult` (7.9.0): the `code` is
 *  the source of truth for what went wrong, not any client-side regex. */
export type UpdateEmailResult =
  | { type: "success"; session: CheckoutSessionSummary }
  | {
      type: "error";
      error: { message: string; code: "incompleteEmail" | "invalidEmail" };
    };

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
  updateEmail: (email: string) => Promise<UpdateEmailResult>;
  session: () => CheckoutSessionSummary;
};

export type StripeMountResult =
  | { ok: false; error: string }
  | { ok: true; checkout: MountedCheckout; session: CheckoutSessionSummary };

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

/**
 * True only once the session is known AND it still has no email — never
 * while the session hasn't loaded yet, and never once Stripe has an email on
 * file (the common case now that legacy-design-tools #599 attaches whatever
 * is on the user record). Showing this field when it isn't needed would be a
 * regression on its own.
 */
export function checkoutNeedsEmail(
  session: CheckoutSessionSummary | null | undefined,
): boolean {
  return session != null && !session.email;
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
    // Read the session Stripe already has (it knows the account's email, if
    // any, from the moment the Checkout Session was created) so callers know
    // immediately — without waiting on a promo-code round trip — whether this
    // account needs to be asked for an email before it can confirm.
    const session = checkout.session();
    return { ok: true, checkout, session };
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

export const CHECKOUT_EMAIL_REQUIRED = "Enter your email address first.";

/**
 * Some accounts reach checkout with a blank `email` on the user record (both
 * OAuth paths request the scope and extract it with a fallback — this is not
 * a parsing bug here, and may be identity-provider-side). Stripe requires an
 * email to confirm a Checkout Session, so when `session.email` is null the
 * UI shows a field and calls this before confirmStripeCheckout.
 *
 * Only an empty/whitespace string is rejected client-side — real format
 * validation is Stripe's job (`incompleteEmail` / `invalidEmail` on the
 * result), not duplicated here.
 */
export async function updateStripeCheckoutEmail(
  checkout: MountedCheckout | null | undefined,
  email: string,
): Promise<{ ok: true; session: CheckoutSessionSummary } | { ok: false; error: string }> {
  if (!checkout) {
    throw new Error("Stripe Checkout cannot confirm without a mounted session");
  }
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: CHECKOUT_EMAIL_REQUIRED };
  }
  const result = await checkout.updateEmail(trimmed);
  if (result.type === "error") {
    return {
      ok: false,
      error: result.error?.message?.trim() || "That email didn't work. Nothing was charged.",
    };
  }
  return { ok: true, session: result.session };
}

export async function confirmStripeCheckout(
  checkout: MountedCheckout | null | undefined,
  // `returnUrl` is accepted for backward-compatible call sites but never
  // forwarded to Stripe: the server already sets `return_url` on the
  // Checkout Session at creation (createPeSubscriptionCheckoutSession /
  // createPePropertyUnlockCheckoutSession both call applyPeCheckoutUiMode,
  // which sets it from the same value this app computes here). Passing it
  // again at confirm() is not a harmless duplicate — Stripe rejects it:
  // "You cannot provide `returnUrl` to confirm() when `return_url` was
  // already provided when creating the Checkout Session."
  _opts?: { returnUrl?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!checkout) {
    throw new Error("Stripe Checkout cannot confirm without a mounted session");
  }
  const result = await checkout.confirm({ redirect: "always" });
  if (result.type === "error") {
    return {
      ok: false,
      error: result.error?.message?.trim() || "Payment could not be confirmed. Nothing was charged.",
    };
  }
  return { ok: true };
}
