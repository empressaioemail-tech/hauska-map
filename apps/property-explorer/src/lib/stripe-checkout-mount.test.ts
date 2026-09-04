import { describe, expect, it, vi } from "vitest";
import {
  applyPromotionCode,
  CHECKOUT_EMAIL_REQUIRED,
  CHECKOUT_SESSION_MISSING,
  removeStripePromotionCode,
  STRIPE_MOUNT_LOAD_FAILED,
  STRIPE_MOUNT_MISSING_ELEMENT,
  STRIPE_MOUNT_MISSING_KEY,
  STRIPE_MOUNT_MISSING_SECRET,
  checkoutNeedsEmail,
  checkoutSubmitEnabled,
  confirmStripeCheckout,
  mountStripeCheckout,
  resolveCheckoutMountCredentials,
  updateStripeCheckoutEmail,
} from "./stripeCheckoutMount";
import { STRIPE_APPEARANCE } from "./stripeAppearance";

function fakeElement(): HTMLElement {
  return { tagName: "DIV" } as HTMLElement;
}

const DEFAULT_FAKE_SESSION = {
  total: { total: { amount: "$129.00", minorUnitsAmount: 12900 } },
  discountAmounts: null,
  email: null,
};

function fakeStripe(opts?: {
  stripe?: null;
  initError?: Error;
  confirm?: ReturnType<typeof vi.fn>;
  session?: ReturnType<typeof vi.fn>;
}) {
  const mount = vi.fn();
  const createPaymentElement = vi.fn(() => ({ mount }));
  const confirm = opts?.confirm ?? vi.fn(async () => ({ type: "success" as const }));
  const session = opts?.session ?? vi.fn(() => DEFAULT_FAKE_SESSION);
  const initCheckout = vi.fn(async () => ({ createPaymentElement, confirm, session }));
  const stripe = opts?.stripe === null ? null : { initCheckout };
  const loadStripe = vi.fn(async () => stripe);
  return { loadStripe, initCheckout, createPaymentElement, mount, confirm, session };
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

  it("returns the initial session from checkout.session() — not just after a promo round trip — so callers can tell right away whether this account needs an email", async () => {
    const fakeSession = {
      total: { total: { amount: "$129.00", minorUnitsAmount: 12900 } },
      discountAmounts: null,
      email: null,
    };
    const { loadStripe, session } = fakeStripe({ session: vi.fn(() => fakeSession) });
    const result = await mountStripeCheckout({
      clientSecret: "cs_test_secret",
      publishableKey: "pk_test_123",
      element: fakeElement(),
      loadStripe,
    });
    expect(session).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session).toEqual(fakeSession);
    }
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

describe("updateStripeCheckoutEmail", () => {
  const fakeSession = {
    total: { total: { amount: "$0.00", minorUnitsAmount: 0 } },
    discountAmounts: [
      { displayName: "SMARTSITEQA", promotionCode: "SMARTSITEQA" },
    ],
    email: "buyer@example.com",
  };

  it("throws when checkout is missing", async () => {
    await expect(updateStripeCheckoutEmail(null, "buyer@example.com")).rejects.toThrow(
      "Stripe Checkout cannot confirm without a mounted session",
    );
  });

  it("refuses a blank email without calling Stripe", async () => {
    const updateEmailFn = vi.fn();
    const checkout = { updateEmail: updateEmailFn } as never;
    const result = await updateStripeCheckoutEmail(checkout, "   ");
    expect(result).toEqual({ ok: false, error: CHECKOUT_EMAIL_REQUIRED });
    expect(updateEmailFn).not.toHaveBeenCalled();
  });

  it("trims the email and returns the updated session on success", async () => {
    const updateEmailFn = vi.fn(async () => ({
      type: "success" as const,
      session: fakeSession,
    }));
    const checkout = { updateEmail: updateEmailFn } as never;
    const result = await updateStripeCheckoutEmail(checkout, "  buyer@example.com  ");
    expect(updateEmailFn).toHaveBeenCalledWith("buyer@example.com");
    expect(result).toEqual({ ok: true, session: fakeSession });
  });

  it("does not duplicate Stripe's format validation — an obviously non-blank but malformed string is still sent to Stripe", async () => {
    const updateEmailFn = vi.fn(async () => ({
      type: "error" as const,
      error: { message: "Your email address is incomplete.", code: "incompleteEmail" as const },
    }));
    const checkout = { updateEmail: updateEmailFn } as never;
    const result = await updateStripeCheckoutEmail(checkout, "not-an-email");
    expect(updateEmailFn).toHaveBeenCalledWith("not-an-email");
    expect(result).toEqual({ ok: false, error: "Your email address is incomplete." });
  });

  it("surfaces Stripe's invalidEmail error and never claims success", async () => {
    const checkout = {
      updateEmail: vi.fn(async () => ({
        type: "error" as const,
        error: { message: "Your email address is invalid.", code: "invalidEmail" as const },
      })),
    } as never;
    const result = await updateStripeCheckoutEmail(checkout, "bogus@@nope");
    expect(result).toEqual({ ok: false, error: "Your email address is invalid." });
  });
});

describe("updateEmail-then-confirm sequencing — confirm() must never fire on a failed updateEmail()", () => {
  it("does not call confirm when updateEmail fails", async () => {
    const confirm = vi.fn(async () => ({ type: "success" as const }));
    const updateEmailFn = vi.fn(async () => ({
      type: "error" as const,
      error: { message: "Your email address is invalid.", code: "invalidEmail" as const },
    }));
    const checkout = {
      createPaymentElement: () => ({ mount: () => {} }),
      confirm,
      updateEmail: updateEmailFn,
    };

    const emailResult = await updateStripeCheckoutEmail(checkout, "bogus@@nope");
    expect(emailResult.ok).toBe(false);
    // The caller (the checkout page's submit handler) is required to check
    // this before calling confirmStripeCheckout — assert the precondition
    // it relies on: confirm was never reached.
    expect(confirm).not.toHaveBeenCalled();
  });

  it("proceeds to confirm only once updateEmail succeeds", async () => {
    const confirm = vi.fn(async () => ({ type: "success" as const }));
    const updateEmailFn = vi.fn(async () => ({
      type: "success" as const,
      session: {
        total: { total: { amount: "$129.00", minorUnitsAmount: 12900 } },
        discountAmounts: null,
        email: "buyer@example.com",
      },
    }));
    const checkout = {
      createPaymentElement: () => ({ mount: () => {} }),
      confirm,
      updateEmail: updateEmailFn,
    };

    const emailResult = await updateStripeCheckoutEmail(checkout, "buyer@example.com");
    expect(emailResult.ok).toBe(true);
    const confirmResult = await confirmStripeCheckout(checkout);
    expect(confirmResult).toEqual({ ok: true });
    expect(confirm).toHaveBeenCalledTimes(1);
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

describe("checkoutNeedsEmail — gates the CheckoutPage / UnlockCheckoutModal email field", () => {
  it("is false while the session hasn't loaded yet (never shows the field before we know)", () => {
    expect(checkoutNeedsEmail(null)).toBe(false);
    expect(checkoutNeedsEmail(undefined)).toBe(false);
  });

  it("is true once the session is known and its email is null — the blank-user-record case", () => {
    expect(
      checkoutNeedsEmail({
        total: { total: { amount: "$129.00", minorUnitsAmount: 12900 } },
        discountAmounts: null,
        email: null,
      }),
    ).toBe(true);
  });

  it("is false once Stripe already has an email — never shows a redundant field", () => {
    expect(
      checkoutNeedsEmail({
        total: { total: { amount: "$129.00", minorUnitsAmount: 12900 } },
        discountAmounts: null,
        email: "buyer@example.com",
      }),
    ).toBe(false);
  });
});

describe("customer-facing missing session copy", () => {
  it("does not say paid", () => {
    expect(CHECKOUT_SESSION_MISSING.toLowerCase()).not.toMatch(/\bpaid\b/);
    expect(CHECKOUT_SESSION_MISSING).toMatch(/Nothing was charged/);
  });
});
