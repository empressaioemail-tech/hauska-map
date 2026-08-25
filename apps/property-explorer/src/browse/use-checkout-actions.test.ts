import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSubscriptionNavigation, resolveUnlockNavigation } from "./useCheckoutActions";

describe("resolveSubscriptionNavigation", () => {
  const ctx = {
    tier: "studio" as const,
    interval: "year" as const,
    parcelNodeId: "48021:1",
    situs: "906 Farm St",
  };

  it("clientSecret opens the payment modal — not /checkout and not a Stripe hosted assign", () => {
    const nav = resolveSubscriptionNavigation(
      { ok: true, clientSecret: "cs_test_1", publishableKey: "pk_test" },
      ctx,
    );
    expect(nav).toEqual({ action: "modal" });
    expect(nav).not.toEqual(expect.objectContaining({ href: expect.stringContaining("/checkout") }));
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

describe("handleSubscription — Start Studio does not navigate to /checkout", () => {
  it("success path sets the modal session and never assigns location to /checkout", () => {
    const src = readFileSync(resolve(__dirname, "useCheckoutActions.ts"), "utf8");
    expect(src).toContain('if (nav.action === "modal")');
    expect(src).toContain("setSubscriptionSession");
    expect(src).not.toMatch(/window\.location\.assign\(nav\.href\)/);
    expect(src).not.toMatch(/location\.assign\([^)]*checkoutPageHref/);
    expect(src).not.toMatch(/location\.href\s*=\s*nav\.href/);
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
