import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  planChangeNeedsConfirmation,
  resolveSubscriptionNavigation,
  resolveUnlockNavigation,
} from "./useCheckoutActions";

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

// Defense-in-depth only (Smart Site UI review 2026-09-04: an account held
// two simultaneously-active billing plans). Does NOT close the actual gap —
// see the doc comment on useCheckoutActions' currentPlan option.
describe("planChangeNeedsConfirmation", () => {
  it("requires confirmation for a real tier change (positive)", () => {
    expect(
      planChangeNeedsConfirmation({ tier: "solo", interval: "month" }, "studio", "month", null),
    ).toBe(true);
  });

  it("requires confirmation for a same-tier interval change (positive)", () => {
    expect(
      planChangeNeedsConfirmation({ tier: "studio", interval: "month" }, "studio", "year", null),
    ).toBe(true);
  });

  it("does not confirm once the same tier has already been confirmed (proceeds on the second click)", () => {
    expect(
      planChangeNeedsConfirmation({ tier: "solo", interval: "month" }, "studio", "month", "studio"),
    ).toBe(false);
  });

  it("does not block clicking the exact plan the account is already on (falsifier: not every click is a change)", () => {
    expect(
      planChangeNeedsConfirmation({ tier: "studio", interval: "year" }, "studio", "year", null),
    ).toBe(false);
  });

  it("does not block when there is no known current plan — unread must not read as a change (falsifier)", () => {
    expect(planChangeNeedsConfirmation(null, "studio", "year", null)).toBe(false);
    expect(planChangeNeedsConfirmation(undefined, "studio", "year", null)).toBe(false);
  });

  it("a pending confirmation for a DIFFERENT tier does not carry over (clicking a second tier resets it)", () => {
    expect(
      planChangeNeedsConfirmation({ tier: "solo", interval: "month" }, "studio", "month", "team"),
    ).toBe(true);
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
