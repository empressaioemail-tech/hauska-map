import { describe, expect, it, vi } from "vitest";
import {
  applyPromotionCode,
  CHECKOUT_SESSION_MISSING,
  removeStripePromotionCode,
  STRIPE_MOUNT_LOAD_FAILED,
  STRIPE_MOUNT_MISSING_ELEMENT,
  STRIPE_MOUNT_MISSING_KEY,
  STRIPE_MOUNT_MISSING_SECRET,
  checkoutSubmitEnabled,
  confirmStripeCheckout,
  mountStripeCheckout,
  resolveCheckoutMountCredentials,
} from "./stripeCheckoutMount";
import { STRIPE_APPEARANCE } from "./stripeAppearance";

function fakeElement(): HTMLElement {
  return { tagName: "DIV" } as HTMLElement;
}

function fakeStripe(opts?: {
  stripe?: null;
  initError?: Error;
  confirm?: ReturnType<typeof vi.fn>;
}) {
  const mount = vi.fn();
  const createPaymentElement = vi.fn(() => ({ mount }));
  const confirm = opts?.confirm ?? vi.fn(async () => ({ type: "success" as const }));
  const initCheckout = vi.fn(async () => ({ createPaymentElement, confirm }));
  const stripe = opts?.stripe === null ? null : { initCheckout };
  const loadStripe = vi.fn(async () => stripe);
  return { loadStripe, initCheckout, createPaymentElement, mount, confirm };
}

describe("resolveCheckoutMountCredentials — fail closed (WDLL item 7)", () => {
  it("refuses a missing clientSecret", () => {
    expect(
      resolveCheckoutMountCredentials({ publishableKey: "pk_test" }),
    ).toEqual({ ok: false, error: STRIPE_MOUNT_MISSING_SECRET });
  });

  it("refuses a missing publishableKey", () => {
    expect(
      resolveCheckoutMountCredentials({ clientSecret: "cs_test" }),
    ).toEqual({ ok: false, error: STRIPE_MOUNT_MISSING_KEY });
  });

  it("accepts trimmed secret + key", () => {
    expect(
      resolveCheckoutMountCredentials({
        clientSecret: "  cs_test_1  ",
        publishableKey: "  pk_test  ",
      }),
    ).toEqual({
      ok: true,
      clientSecret: "cs_test_1",
      publishableKey: "pk_test",
    });
  });
});

describe("mountStripeCheckout — refuse before loadStripe", () => {
  it("throws when clientSecret is missing and never loads Stripe", async () => {
    const { loadStripe } = fakeStripe();
    await expect(
      mountStripeCheckout({
        publishableKey: "pk_test",
        element: fakeElement(),
        loadStripe,
      }),
    ).rejects.toThrow(STRIPE_MOUNT_MISSING_SECRET);
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it("throws when clientSecret is whitespace", async () => {
    const { loadStripe } = fakeStripe();
    await expect(
      mountStripeCheckout({
        clientSecret: "   ",
        publishableKey: "pk_test",
        element: fakeElement(),
        loadStripe,
      }),
    ).rejects.toThrow(STRIPE_MOUNT_MISSING_SECRET);
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it("throws when publishableKey is missing", async () => {
    const { loadStripe } = fakeStripe();
    await expect(
      mountStripeCheckout({
        clientSecret: "cs_test",
        element: fakeElement(),
        loadStripe,
      }),
    ).rejects.toThrow(STRIPE_MOUNT_MISSING_KEY);
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it("throws when mount element is missing", async () => {
    const { loadStripe } = fakeStripe();
    await expect(
      mountStripeCheckout({
        clientSecret: "cs_test",
        publishableKey: "pk_test",
        loadStripe,
      }),
    ).rejects.toThrow(STRIPE_MOUNT_MISSING_ELEMENT);
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it("returns load-failed when loadStripe resolves null", async () => {
    const loadStripe = vi.fn(async () => null);
    const result = await mountStripeCheckout({
      clientSecret: "cs_test",
      publishableKey: "pk_test",
      element: fakeElement(),
      loadStripe,
    });
    expect(result).toEqual({ ok: false, error: STRIPE_MOUNT_LOAD_FAILED });
  });

  it("calls loadStripe, initCheckout with appearance, and mounts Payment Element", async () => {
    const { loadStripe, initCheckout, createPaymentElement, mount } = fakeStripe();
    const el = fakeElement();
    const result = await mountStripeCheckout({
      clientSecret: "cs_test_secret",
      publishableKey: "pk_test_123",
      element: el,
      loadStripe,
    });
    expect(result.ok).toBe(true);
    expect(loadStripe).toHaveBeenCalledWith("pk_test_123");
    expect(initCheckout).toHaveBeenCalledTimes(1);
    const options = initCheckout.mock.calls[0][0] as {
      fetchClientSecret: () => Promise<string>;
      elementsOptions: { appearance: typeof STRIPE_APPEARANCE };
    };
    expect(options.elementsOptions.appearance).toEqual(STRIPE_APPEARANCE);
    await expect(options.fetchClientSecret()).resolves.toBe("cs_test_secret");
    expect(createPaymentElement).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledWith(el);
  });
});

describe("confirmStripeCheckout", () => {
  it("throws when checkout is missing", async () => {
    await expect(confirmStripeCheckout(null)).rejects.toThrow(
      "Stripe Checkout cannot confirm without a mounted session",
    );
  });

  it("surfaces a Stripe confirm error and never claims success", async () => {
    const checkout = {
      createPaymentElement: () => ({ mount: () => {} }),
      confirm: vi.fn(async () => ({
        type: "error" as const,
        error: { message: "Your card was declined." },
      })),
    };
    const result = await confirmStripeCheckout(checkout);
    expect(result).toEqual({ ok: false, error: "Your card was declined." });
  });

  it("never forwards returnUrl — the session already carries return_url from creation, and Stripe rejects a duplicate", async () => {
    const confirm = vi.fn(async () => ({ type: "success" as const }));
    const checkout = {
      createPaymentElement: () => ({ mount: () => {} }),
      confirm,
    };
    await confirmStripeCheckout(checkout, { returnUrl: "https://smartsite.cloud/?checkout=success" });
    expect(confirm).toHaveBeenCalledWith({ redirect: "always" });
  });
});

describe("applyPromotionCode", () => {
  const fakeSession = {
    total: { total: { amount: "$0.00", minorUnitsAmount: 0 } },
    discountAmounts: [
      { displayName: "SMARTSITEQA", promotionCode: "SMARTSITEQA" },
    ],
  };

  it("throws when checkout is missing", async () => {
    await expect(applyPromotionCode(null, "SMARTSITEQA")).rejects.toThrow(
      "Stripe Checkout cannot confirm without a mounted session",
    );
  });

  it("refuses a blank code without calling Stripe", async () => {
    const applyPromotionCodeFn = vi.fn();
    const checkout = { applyPromotionCode: applyPromotionCodeFn } as never;
    const result = await applyPromotionCode(checkout, "   ");
    expect(result).toEqual({ ok: false, error: "Enter a promo code first." });
    expect(applyPromotionCodeFn).not.toHaveBeenCalled();
  });

  it("trims the code and returns the updated session on success", async () => {
    const applyPromotionCodeFn = vi.fn(async () => ({
      type: "success" as const,
      session: fakeSession,
    }));
    const checkout = { applyPromotionCode: applyPromotionCodeFn } as never;
    const result = await applyPromotionCode(checkout, "  SMARTSITEQA  ");
    expect(applyPromotionCodeFn).toHaveBeenCalledWith("SMARTSITEQA");
    expect(result).toEqual({ ok: true, session: fakeSession });
  });

  it("surfaces a Stripe error and never claims success", async () => {
    const checkout = {
      applyPromotionCode: vi.fn(async () => ({
        type: "error" as const,
        error: { message: "This code doesn't exist." },
      })),
    } as never;
    const result = await applyPromotionCode(checkout, "BOGUS");
    expect(result).toEqual({ ok: false, error: "This code doesn't exist." });
  });
});

describe("removeStripePromotionCode", () => {
  it("throws when checkout is missing", async () => {
    await expect(removeStripePromotionCode(null)).rejects.toThrow(
      "Stripe Checkout cannot confirm without a mounted session",
    );
  });

  it("returns the updated session on success", async () => {
    const fakeSession = { total: { total: { amount: "$129.00", minorUnitsAmount: 12900 } }, discountAmounts: null };
    const checkout = {
      removePromotionCode: vi.fn(async () => ({
        type: "success" as const,
        session: fakeSession,
      })),
    } as never;
    const result = await removeStripePromotionCode(checkout);
    expect(result).toEqual({ ok: true, session: fakeSession });
  });
});

describe("checkoutSubmitEnabled", () => {
  it("only ready can submit", () => {
    expect(checkoutSubmitEnabled("ready")).toBe(true);
    expect(checkoutSubmitEnabled("mounting")).toBe(false);
    expect(checkoutSubmitEnabled("error")).toBe(false);
    expect(checkoutSubmitEnabled("blocked")).toBe(false);
    expect(checkoutSubmitEnabled("confirming")).toBe(false);
  });
});

describe("customer-facing missing session copy", () => {
  it("does not say paid", () => {
    expect(CHECKOUT_SESSION_MISSING.toLowerCase()).not.toMatch(/\bpaid\b/);
    expect(CHECKOUT_SESSION_MISSING).toMatch(/Nothing was charged/);
  });
});
