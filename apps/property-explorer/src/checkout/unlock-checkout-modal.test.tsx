import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UnlockCheckoutModal } from "./UnlockCheckoutModal";
import { CheckoutSuccessCard, successCardTitle } from "./CheckoutSuccessCard";
import { UNLOCK_PRICE, UNLOCK_SUBMIT } from "./checkoutCopy";
import { PE_PRICING } from "../lib/pricing";

describe("UnlockCheckoutModal — situs + $15.00 + 30 days + Pay $15.00", () => {
  it("renders the frame chrome and a Payment Element mount slot", () => {
    const html = renderToStaticMarkup(
      <UnlockCheckoutModal
        situs="906 Farm St"
        clientSecret="cs_unlock"
        publishableKey="pk_test"
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-testid="unlock-checkout-modal"');
    expect(html).toContain("906 Farm St");
    expect(html).toContain(UNLOCK_PRICE);
    expect(html).toContain(`${PE_PRICING.property.durationDays} days`);
    expect(html).toContain(UNLOCK_SUBMIT);
    expect(html).toContain('data-testid="stripe-payment-element"');
    expect(html).not.toContain("checkout.stripe.com");
    expect(html).not.toMatch(/Card number|ZIP|Name on card|4242/);
  });

  it("missing secret is an honest error and does not render a fake Element slot", () => {
    const html = renderToStaticMarkup(
      <UnlockCheckoutModal situs="906 Farm St" onClose={() => {}} />,
    );
    expect(html).toContain('data-testid="checkout-mount-error"');
    expect(html).toContain("Nothing was charged");
    expect(html).not.toContain('data-testid="stripe-payment-element"');
    expect(html).toContain(UNLOCK_SUBMIT);
  });
});

describe("CheckoutSuccessCard — confirmed vs timeout", () => {
  it("confirmed names the plan and never says confirming failed", () => {
    const html = renderToStaticMarkup(
      <CheckoutSuccessCard
        status="confirmed"
        purchase={{ kind: "subscription", tier: "studio" }}
        originLabel={null}
      />,
    );
    expect(html).toContain("Studio is active");
    expect(html).toContain("Open reports");
    expect(html).toContain("Billing");
    expect(html).not.toMatch(/Confirming failed/i);
  });

  it("timeout says confirming failed and never paid", () => {
    const html = renderToStaticMarkup(
      <CheckoutSuccessCard status="timeout" purchase={{ kind: "unlock" }} />,
    );
    expect(html).toContain("Confirming failed");
    expect(html.toLowerCase()).not.toMatch(/\bpaid\b/);
    expect(successCardTitle("timeout", { kind: "unlock" })).toBe(
      "Confirming failed",
    );
  });
});
