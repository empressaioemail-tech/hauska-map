import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutPage } from "./CheckoutPage";
import { SubscriptionCheckoutModal } from "./SubscriptionCheckoutModal";
import {
  consumeCheckoutDeepLink,
  isCheckoutPath,
  parseCheckoutQuery,
  parsePendingCheckout,
} from "./checkoutLanding";
import { PE_PRICING, tierHeadline } from "../lib/pricing";
import { includedLinesForTier, subscriptionSubmitLabel } from "./checkoutCopy";

describe("checkout landing — /checkout pathname is consumed into the map", () => {
  it("recognizes /checkout and trailing slash, not /share", () => {
    expect(isCheckoutPath("/checkout")).toBe(true);
    expect(isCheckoutPath("/checkout/")).toBe(true);
    expect(isCheckoutPath("/share")).toBe(false);
    expect(isCheckoutPath("/")).toBe(false);
  });

  it("App never exclusive-routes /checkout onto a bare CheckoutPage", () => {
    const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(appSource).toContain("consumeCheckoutDeepLink");
    expect(appSource).toContain("CheckoutDeepLinkHost");
    expect(appSource).toContain("SubscriptionCheckoutModal");
    expect(appSource).toContain("ExplorerMap");
    expect(appSource).not.toMatch(/if \(checkoutLanding\) \{\s*return <CheckoutPage/);
  });

  it("deep link /checkout?tier= becomes the map plus a pending modal", () => {
    const consumed = consumeCheckoutDeepLink({
      pathname: "/checkout",
      search:
        "?tier=studio&interval=year&parcelNodeId=48021:34945&situs=1105%20Hill",
    });
    expect(consumed).not.toBeNull();
    expect(consumed?.mapHref).toContain("parcelNodeId=48021%3A34945");
    expect(consumed?.mapHref.startsWith("/?")).toBe(true);
    expect(consumed?.mapHref).not.toContain("/checkout");
    expect(parsePendingCheckout(consumed?.mapHref.split("?")[1] ?? "")).toMatchObject({
      tier: "studio",
      interval: "year",
      parcelNodeId: "48021:34945",
    });
  });

  it("CheckoutPage wires the Stripe mount hook and does not invent card fields", () => {
    const page = readFileSync(resolve(__dirname, "CheckoutPage.tsx"), "utf8");
    expect(page).toMatch(/from ["'].*useStripeCheckoutMount["']/);
    expect(page).toContain('data-testid="stripe-payment-element"');
    expect(page).not.toMatch(/Card number|ZIP|Name on card|4242/);
    expect(page).not.toMatch(/createPaymentIntent/);
  });

  // The email field's visibility depends on mount.session, which only
  // populates once Stripe.js's async initCheckout resolves inside a
  // useEffect — and useEffect never runs under renderToStaticMarkup (no
  // commit phase in SSR; verified directly, not assumed). So the gating
  // logic itself (checkoutNeedsEmail) gets full behavioral coverage in
  // stripe-checkout-mount.test.ts, and this reads the source to confirm
  // CheckoutPage actually wires that logic to the field and to the submit
  // sequence — the same technique the "wires the Stripe mount hook" test
  // above already uses for exactly this reason.
  it("CheckoutPage wires the email field to checkoutNeedsEmail and calls updateEmail before submit", () => {
    const page = readFileSync(resolve(__dirname, "CheckoutPage.tsx"), "utf8");
    expect(page).toMatch(/from ["'].*stripeCheckoutMount["']/);
    expect(page).toContain("checkoutNeedsEmail(mount.session)");
    expect(page).toContain('data-testid="checkout-email-input"');
    expect(page).toContain('data-testid="checkout-email-error"');
    expect(page).toContain("mount.updateEmail(email)");
    // The email step must be awaited and checked before submit is ever
    // reached — assert the ordering, not just that both calls exist.
    const updateEmailIdx = page.indexOf("mount.updateEmail(email)");
    const submitIdx = page.indexOf("mount.submit(checkoutReturnUrl");
    expect(updateEmailIdx).toBeGreaterThan(-1);
    expect(submitIdx).toBeGreaterThan(updateEmailIdx);
    expect(page).toMatch(/if\s*\(!result\.ok\)\s*return;/);
  });
});

const SESSION = {
  clientSecret: "cs_test_secret",
  publishableKey: "pk_test_123",
  kind: "subscription" as const,
};

describe("CheckoutPage — left column from PE_PRICING + frame 3b", () => {
  it("renders Studio annual amount, included lines, and Payment Element mount slot", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage
        search="?tier=studio&interval=year&situs=906%20Farm%20St"
        session={SESSION}
      />,
    );
    expect(html).toContain('data-testid="checkout-page"');
    expect(html).toContain("Smart Site Studio");
    expect(html).toContain(tierHeadline("studio", "annual").amount);
    expect(html).toContain('data-testid="stripe-payment-element"');
    expect(html).toContain("Started from");
    expect(html).toContain("906 Farm St");
    expect(html).toContain("Back to cart");
    expect(html).not.toContain("Back to the map");
    expect(html).toContain("Cancel any time");
    expect(html).toContain("Payments by Stripe");
    expect(html).not.toContain("checkout.stripe.com");
    expect(html).not.toContain("4242");
    expect(html).not.toMatch(/Card number|ZIP|Name on card/);
    for (const line of includedLinesForTier("studio")) {
      expect(html).toContain(line.replace(/&/g, "&amp;"));
    }
  });

  it("does not show the email field before the session is known — mount.session is null until Stripe.js resolves, and asking upfront would be a regression for the common case", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage search="?tier=solo&interval=month" session={SESSION} />,
    );
    expect(html).not.toContain('data-testid="checkout-email-input"');
    expect(html).not.toContain('data-testid="checkout-email-error"');
  });

  it("promo code form is wired and the payment mount is not a nested scroll box", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage search="?tier=solo&interval=month" session={SESSION} />,
    );
    // The mount slot must not carry its own independent scroll region — the
    // page-level `.pe-scroll` wrapper already scrolls, and stacking a second
    // fixed-height scrollbar inside it clipped the promo/order-summary area
    // out of view (customer-reported: "no where to put a promo code").
    expect(html).not.toContain("overflow-y:auto");
    expect(html).not.toMatch(/border:1px dashed/);
    expect(html).toContain('data-testid="checkout-promo-form"');
    expect(html).toContain('data-testid="checkout-promo-input"');
    expect(html).toContain('placeholder="Promo code"');
    expect(html).toContain('data-testid="checkout-promo-apply"');
    // No session applied yet in a static render — the "applied" state (with
    // its Remove control) must not show until a real discount exists.
    expect(html).not.toContain('data-testid="checkout-promo-remove"');
  });

  it("modal wrapper mounts the Payment Element when clientSecret exists", () => {
    const html = renderToStaticMarkup(
      <SubscriptionCheckoutModal
        search="?tier=studio&interval=year"
        session={SESSION}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-testid="subscription-checkout-modal"');
    expect(html).toContain('data-testid="stripe-payment-element"');
    expect(html).not.toMatch(/Card number|ZIP|Name on card|4242/);
  });

  it("missing session is an honest error and does not render a fake Element slot", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage search="?tier=studio&interval=year" session={null} />,
    );
    expect(html).toContain('data-testid="checkout-mount-error"');
    expect(html).toContain("Nothing was charged");
    expect(html).not.toContain('data-testid="stripe-payment-element"');
  });

  it("modal missing secret is an honest error", () => {
    const html = renderToStaticMarkup(
      <SubscriptionCheckoutModal
        search="?tier=studio&interval=year"
        session={null}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-testid="checkout-mount-error"');
    expect(html).toContain("Nothing was charged");
    expect(html).not.toContain('data-testid="stripe-payment-element"');
  });

  it("submit copy is Subscribe when no report origin", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage
        search="?tier=solo&interval=month"
        originLabel={null}
        session={SESSION}
      />,
    );
    expect(html).toContain(subscriptionSubmitLabel(false));
    expect(html).toContain(PE_PRICING.solo.title);
    expect(html).not.toContain("Subscribe and run my report");
  });

  it("submit copy is Subscribe and run my report when a report started the buy", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage
        search="?tier=studio&interval=year"
        originLabel="Site plan sheet"
        session={SESSION}
      />,
    );
    expect(html).toContain(subscriptionSubmitLabel(true));
    expect(html).toContain("Site plan sheet");
  });

  it("parseCheckoutQuery defaults interval to year (annual) when omitted", () => {
    expect(parseCheckoutQuery("?tier=team")).toMatchObject({
      tier: "team",
      interval: "year",
    });
  });

  it("Team checkout shows Change seats and 12-seat $524, never leftover $45", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage
        search="?tier=team&interval=month&seats=12"
        session={SESSION}
      />,
    );
    expect(html).toContain("Change seats");
    expect(html).toContain('data-testid="checkout-change-seats"');
    expect(html).toContain("$524");
    expect(html).not.toContain("$704");
    expect(html).not.toContain("$349");
    expect(html).not.toContain("$45");
    expect(html).toContain('data-testid="checkout-wallet-note"');
  });
});
