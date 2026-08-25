import { describe, expect, it } from "vitest";
import {
  resolveSubscriptionNavigation,
  resolveUnlockNavigation,
} from "./useCheckoutActions";
import { checkoutPageHref } from "../checkout/checkoutLanding";

describe("resolveSubscriptionNavigation", () => {
  const ctx = {
    tier: "studio" as const,
    interval: "year" as const,
    parcelNodeId: "48021:1",
    situs: "906 Farm St",
  };

  it("clientSecret opens /checkout — not a Stripe hosted assign", () => {
    const nav = resolveSubscriptionNavigation(
      { ok: true, clientSecret: "cs_test_1", publishableKey: "pk_test" },
      ctx,
    );
    expect(nav).toEqual({
      action: "in-app",
      href: checkoutPageHref(ctx),
    });
    expect(nav.action === "in-app" && nav.href.startsWith("/checkout")).toBe(
      true,
    );
  });

  it("hosted Stripe URL is the item-3 fallback", () => {
    const nav = resolveSubscriptionNavigation(
      { ok: true, checkoutUrl: "https://checkout.stripe.com/pay/cs_x" },
      ctx,
    );
    expect(nav).toEqual({
      action: "hosted",
      url: "https://checkout.stripe.com/pay/cs_x",
    });
  });

  it("never assigns a non-Stripe URL", () => {
    const nav = resolveSubscriptionNavigation(
      {
        ok: true,
        checkoutUrl: "https://smartsite.cloud/?checkout=success",
      },
      ctx,
    );
    expect(nav.action).toBe("error");
  });
});

describe("resolveUnlockNavigation", () => {
  it("clientSecret opens the in-app modal", () => {
    expect(
      resolveUnlockNavigation({ kind: "checkout", clientSecret: "cs_u" }),
    ).toEqual({ action: "custom" });
  });

  it("never assigns a same-origin success URL", () => {
    const nav = resolveUnlockNavigation({
      kind: "checkout",
      checkoutUrl: "https://smartsite.cloud/?checkout=success",
    });
    expect(nav.action).toBe("error");
  });
});
