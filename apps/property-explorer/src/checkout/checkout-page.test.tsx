import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutPage } from "./CheckoutPage";
import { isCheckoutPath, parseCheckoutQuery } from "./checkoutLanding";
import { PE_PRICING, tierHeadline } from "../lib/pricing";
import { includedLinesForTier, subscriptionSubmitLabel } from "./checkoutCopy";

describe("checkout landing — /checkout pathname (mirror /share)", () => {
  it("recognizes /checkout and trailing slash, not /share", () => {
    expect(isCheckoutPath("/checkout")).toBe(true);
    expect(isCheckoutPath("/checkout/")).toBe(true);
    expect(isCheckoutPath("/share")).toBe(false);
    expect(isCheckoutPath("/")).toBe(false);
  });

  it("App routes /checkout into CheckoutPage the same way /share uses ShareFunnelApp", () => {
    const appSource = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
    expect(appSource).toContain("isCheckoutPath");
    expect(appSource).toContain("CheckoutPage");
    expect(appSource).toContain("checkoutLanding");
  });

  it("CheckoutPage wires the Stripe mount hook and does not invent card fields", () => {
    const page = readFileSync(resolve(__dirname, "CheckoutPage.tsx"), "utf8");
    expect(page).toMatch(/from ["'].*useStripeCheckoutMount["']/);
    expect(page).toContain('data-testid="stripe-payment-element"');
    expect(page).not.toMatch(/Card number|ZIP|Name on card|4242/);
    expect(page).not.toMatch(/createPaymentIntent/);
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
    expect(html).toContain("Cancel any time");
    expect(html).toContain("Payments by Stripe");
    expect(html).not.toContain("checkout.stripe.com");
    expect(html).not.toContain("4242");
    expect(html).not.toMatch(/Card number|ZIP|Name on card/);
    for (const line of includedLinesForTier("studio")) {
      expect(html).toContain(line.replace(/&/g, "&amp;"));
    }
  });

  it("missing session is an honest error and does not render a fake Element slot", () => {
    const html = renderToStaticMarkup(
      <CheckoutPage search="?tier=studio&interval=year" session={null} />,
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
});
