/**
 * A-062 item 6 — the terms sentence is now TRUE, and this is the thing that
 * says so.
 *
 * On 2026-09-01 `public/terms.html` promised "You can cancel a paid plan
 * through the Stripe billing flow in the product" and no billing portal
 * existed anywhere in this app. The two halves are authored separately and
 * NOTHING NOTICED. This file is the consistency check between them.
 *
 * IT IS A MEANING-SHAPED CHECK, not a presence-shaped one. It has two
 * independently derived inputs — the legal text a lawyer-facing author wrote,
 * and the routing/UI a product author wrote — and it asks whether they agree.
 * No sentinel satisfies both sides: adding the path to the allowlist does not
 * write the sentence, and writing the sentence does not add the path.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import {
  termsClaimsInProductCancellation,
  termsPlainText,
} from "./pe-terms-cancellation";
import { isDeepPathAllowed } from "../../api/_lib/deep-allowlist.js";
import { BILLING_PORTAL_PATH, startBillingPortal } from "./portalClient";
import { SettingsModal, billingManagementState } from "../browse/SettingsModal";

const TERMS = readFileSync(
  resolve(__dirname, "../../public/terms.html"),
  "utf8",
);

describe("the detector itself, before it is trusted to judge anything", () => {
  it("fires on the real terms page", () => {
    expect(termsClaimsInProductCancellation(TERMS)).toBe(true);
  });

  it("IS NOT VACUOUS — it stays quiet on terms that make no such promise", () => {
    // A check that returns true for everything would pass the implication
    // below for free. These are the negative fixtures that say it does not.
    expect(
      termsClaimsInProductCancellation(
        "<p>Access follows your Stripe plan. Stripe processes payment.</p>",
      ),
    ).toBe(false);
    // Honest about a product with NO portal — must not trip, or the next
    // author routes around the check by rewording rather than by building.
    expect(
      termsClaimsInProductCancellation(
        "<p>To cancel a paid plan, email support and we will cancel it for you.</p>",
      ),
    ).toBe(false);
    // The three signals present but SPLIT ACROSS SENTENCES is not the claim.
    expect(
      termsClaimsInProductCancellation(
        "<p>You can cancel at any time. Billing is handled by Stripe. Everything else happens in the app.</p>",
      ),
    ).toBe(false);
    expect(termsClaimsInProductCancellation("")).toBe(false);
  });

  it("reads a sentence broken across source lines, the way the file writes it", () => {
    // The real file wraps this promise over three lines. Matching raw HTML
    // would make the check depend on where the formatter broke it.
    const wrapped =
      "<p>\n  You can cancel a paid\n  plan through the Stripe billing flow in\n  the product.\n</p>";
    expect(termsPlainText(wrapped)).toBe(
      "You can cancel a paid plan through the Stripe billing flow in the product.",
    );
    expect(termsClaimsInProductCancellation(wrapped)).toBe(true);
  });
});

describe("THE IMPLICATION — a promise in the terms requires a path in the product", () => {
  const claimed = termsClaimsInProductCancellation(TERMS);

  it("the terms still make the claim this card was raised about", () => {
    // Stated as its own assertion so that REMOVING the promise is a visible
    // decision that fails here, rather than a quiet way to make the checks
    // below vacuous. The ruling was to keep the promise and build the
    // capability; deleting the sentence instead must not slip through green.
    expect(claimed).toBe(true);
    expect(TERMS).toContain(
      "cancel a paid plan through the Stripe billing flow in",
    );
  });

  it("a client exists that posts to a billing portal path", () => {
    expect(claimed).toBe(true);
    expect(typeof startBillingPortal).toBe("function");
    expect(BILLING_PORTAL_PATH).toBe("api/property-explorer/v1/billing/portal");
  });

  it("THE ROUTE TABLE THE BROWSER SEES admits that path", () => {
    // The deep proxy is the only way this client reaches the server. A path
    // absent from the allowlist is a 403 for every signed-in customer, and it
    // is INVISIBLE to any probe because spine-deep.ts checks the session
    // cookie first — signed out, a listed and an unlisted path both answer
    // 401. That is exactly how the ai-connections card shipped dead on
    // 2026-08-31, and it is why this is asserted here rather than curled.
    expect(claimed).toBe(true);
    expect(isDeepPathAllowed("POST", BILLING_PORTAL_PATH)).toBe(true);
  });

  it("Settings renders a real control for an account that HAS billing", () => {
    expect(claimed).toBe(true);
    // The pure rule, both directions. `manage` is the ONLY state that renders
    // the control, and it comes off the server's own bit rather than off tier.
    expect(
      billingManagementState({
        kind: "ready",
        account: {
          authenticated: true,
          accessTier: "paid",
          subscriptionTier: "solo",
          entitlementSource: "stripe_sub",
          devRole: false,
          seatsPurchased: null,
          billingInterval: "month",
          preContract: false,
          hasBillingAccount: true,
        },
      }),
    ).toBe("manage");
  });

  it("and the honest state for an account that does NOT", () => {
    expect(
      billingManagementState({
        kind: "ready",
        account: {
          authenticated: true,
          accessTier: "free",
          subscriptionTier: null,
          entitlementSource: null,
          devRole: false,
          seatsPurchased: null,
          billingInterval: null,
          preContract: false,
          hasBillingAccount: false,
        },
      }),
    ).toBe("none");
    // NOT MERGED WITH `unread`. "you have never been billed" and "we could not
    // read your account" say different things to the reader.
    expect(billingManagementState(null)).toBe("unread");
    expect(billingManagementState({ kind: "sign-in" })).toBe("unread");
    expect(billingManagementState({ kind: "blocked" })).toBe("unread");
    expect(billingManagementState({ kind: "not-built" })).toBe("unread");
    expect(billingManagementState({ kind: "error", message: "x" })).toBe("unread");
    // A 200 for an anonymous caller is not an account state either.
    expect(
      billingManagementState({
        kind: "ready",
        account: {
          authenticated: false,
          accessTier: null,
          subscriptionTier: null,
          entitlementSource: null,
          devRole: false,
          seatsPurchased: null,
          billingInterval: null,
          preContract: false,
          hasBillingAccount: false,
        },
      }),
    ).toBe("unread");
  });

  it("VIOLATION: the Plan tab no longer tells a customer cancellation is Not built", () => {
    // The row the terms contradicted. First paint has an unresolved read, so
    // what must be gone is the CLAIM that cancellation is unbuilt — not the
    // control, which correctly waits for the account read.
    const html = renderToStaticMarkup(
      <SettingsModal onClose={() => {}} onUpgrade={() => {}} initialSection="plan" />,
    );
    expect(html).not.toContain("Cancel subscription");
    expect(html).toContain("Payment, invoices and cancellation");
    // Renewal date is STILL Not read, and that is correct: it is genuinely not
    // on the entitlement wire. This card licensed a control where one works,
    // not a sweep turning every honest absence into a button.
    expect(html).toContain("Renewal date");
    expect(html).toContain("Not read");
  });
});
