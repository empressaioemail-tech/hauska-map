/**
 * Mounts Stripe Custom Checkout into a ref. Used by /checkout and unlock.
 */

import { useEffect, useRef, useState } from "react";
import {
  applyPromotionCode,
  CHECKOUT_SESSION_MISSING,
  checkoutSubmitEnabled,
  confirmStripeCheckout,
  mountStripeCheckout,
  removeStripePromotionCode,
  resolveCheckoutMountCredentials,
  type CheckoutSessionSummary,
  type MountedCheckout,
  type StripeJsLoader,
} from "./stripeCheckoutMount";

export type CheckoutMountStatus =
  | "blocked"
  | "mounting"
  | "ready"
  | "confirming"
  | "error";

export function useStripeCheckoutMount(input: {
  clientSecret?: string | null;
  publishableKey?: string | null;
  mountFn?: typeof mountStripeCheckout;
  confirmFn?: typeof confirmStripeCheckout;
  loadStripe?: StripeJsLoader;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const checkoutRef = useRef<MountedCheckout | null>(null);
  const creds = resolveCheckoutMountCredentials(input);
  const [status, setStatus] = useState<CheckoutMountStatus>(
    creds.ok ? "mounting" : "error",
  );
  const [error, setError] = useState<string | null>(
    creds.ok ? null : CHECKOUT_SESSION_MISSING,
  );
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "applying" | "applied" | "error"
  >("idle");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [session, setSession] = useState<CheckoutSessionSummary | null>(null);

  useEffect(() => {
    if (!creds.ok) {
      setStatus("error");
      setError(CHECKOUT_SESSION_MISSING);
      return;
    }
    const el = mountRef.current;
    if (!el) {
      setStatus("error");
      setError(CHECKOUT_SESSION_MISSING);
      return;
    }
    let cancelled = false;
    const mount = input.mountFn ?? mountStripeCheckout;
    void (async () => {
      try {
        const result = await mount({
          clientSecret: creds.clientSecret,
          publishableKey: creds.publishableKey,
          element: el,
          loadStripe: input.loadStripe,
        });
        if (cancelled) return;
        if (!result.ok) {
          setStatus("error");
          setError(result.error);
          return;
        }
        checkoutRef.current = result.checkout;
        setStatus("ready");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : CHECKOUT_SESSION_MISSING);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creds.ok, creds.ok ? creds.clientSecret : "", creds.ok ? creds.publishableKey : ""]);

  const submit = async (returnUrl?: string) => {
    if (!checkoutSubmitEnabled(status)) {
      return { ok: false as const, error: error ?? CHECKOUT_SESSION_MISSING };
    }
    setStatus("confirming");
    const confirm = input.confirmFn ?? confirmStripeCheckout;
    try {
      const result = await confirm(checkoutRef.current, { returnUrl });
      if (!result.ok) {
        setStatus("ready");
        setError(result.error);
      }
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : CHECKOUT_SESSION_MISSING;
      setStatus("ready");
      setError(message);
      return { ok: false as const, error: message };
    }
  };

  const applyPromo = async (code: string) => {
    setPromoStatus("applying");
    setPromoError(null);
    try {
      const result = await applyPromotionCode(checkoutRef.current, code);
      if (!result.ok) {
        setPromoStatus("error");
        setPromoError(result.error);
        return result;
      }
      setSession(result.session);
      setPromoStatus("applied");
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : CHECKOUT_SESSION_MISSING;
      setPromoStatus("error");
      setPromoError(message);
      return { ok: false as const, error: message };
    }
  };

  const removePromo = async () => {
    setPromoStatus("applying");
    setPromoError(null);
    try {
      const result = await removeStripePromotionCode(checkoutRef.current);
      if (!result.ok) {
        setPromoStatus("applied");
        setPromoError(result.error);
        return result;
      }
      setSession(result.session);
      setPromoStatus("idle");
      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : CHECKOUT_SESSION_MISSING;
      setPromoStatus("applied");
      setPromoError(message);
      return { ok: false as const, error: message };
    }
  };

  return {
    mountRef,
    status,
    error,
    canSubmit: checkoutSubmitEnabled(status),
    submit,
    session,
    promoStatus,
    promoError,
    applyPromo,
    removePromo,
  } as const;
}
