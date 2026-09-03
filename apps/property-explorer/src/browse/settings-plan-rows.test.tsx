// P-98b — the three Settings rows that now read from the ACCOUNT entitlement:
// Access (Account tab and the Plan hero), Tier name, and Billing interval.
//
// The label functions are pure and exported, so these run without a DOM. The
// static-markup block at the bottom pins the FIRST PAINT, which is the state
// settings-access-not-read.test.tsx guards: nothing has resolved, so every one
// of the three says "Not read". That behaviour SURVIVES this card — an
// unresolved read is still unknown. What changed is only that the read can
// now resolve at all.
//
// THE FOUR ROWS THIS CARD DID NOT TOUCH — Renewal date, Payment method,
// Invoices, Cancel subscription — are pinned here too, because "we left them
// alone" is a claim and it should fail if somebody quietly lights one up off a
// field that does not exist.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SettingsModal,
  accessLabel,
  billingIntervalLabel,
  tierNameLabel,
} from "./SettingsModal";
import type { AccountEntitlementRead } from "../lib/useAccountEntitlement";
import type { AccountEntitlement } from "../lib/accountEntitlementClient";
import { PE_PRICING } from "../lib/pricing";

const NOT_READ = "Not read";

function account(overrides: Partial<AccountEntitlement> = {}): AccountEntitlementRead {
  return {
    kind: "ready",
    account: {
      authenticated: true,
      accessTier: "paid",
      subscriptionTier: "studio",
      entitlementSource: "stripe_sub",
      devRole: false,
      seatsPurchased: null,
      billingInterval: "month",
      preContract: false,
      ...overrides,
    },
  };
}

const FAILURES: AccountEntitlementRead[] = [
  null,
  { kind: "sign-in" },
  { kind: "blocked" },
  { kind: "not-built" },
  { kind: "error", message: "boom" },
];

// ---------------------------------------------------------------------------

describe("Access", () => {
  it("prints the server's own answer once the account read resolves", () => {
    expect(accessLabel(account({ accessTier: "paid" }))).toBe("Paid");
    expect(accessLabel(account({ accessTier: "free" }))).toBe(PE_PRICING.free.title);
  });

  it("VIOLATION: an unresolved read and every failure kind stay Not read, never Paid", () => {
    // A 404 is a fact about the route, a 403 is our own proxy refusing our own
    // path, a 401 is no session. None of them is "this account is on the free
    // plan", and none may print a plan word.
    for (const read of FAILURES) {
      expect(accessLabel(read)).toBe(NOT_READ);
    }
  });

  it("VIOLATION: a signed-out 200 claiming paid still refuses to print Paid", () => {
    // The guard that was missed in the shipped defect. The route answers
    // anonymous callers, so a 200 does not imply an account.
    expect(accessLabel(account({ authenticated: false, accessTier: "paid" }))).toBe(
      NOT_READ,
    );
    expect(accessLabel(account({ authenticated: false, accessTier: "free" }))).toBe(
      NOT_READ,
    );
  });

  it("VIOLATION: an unknown tier is Not read, never back-derived into Free", () => {
    // Today's route emits `tier`; the sibling's contract names it `accessTier`.
    // If a future server carries NEITHER, this row must say so rather than
    // picking the answer that happens to be cheap.
    expect(accessLabel(account({ accessTier: null }))).toBe(NOT_READ);
  });
});

describe("Tier name", () => {
  it("names the plan from PE_PRICING, so Settings keeps no second copy of it", () => {
    expect(tierNameLabel(account({ subscriptionTier: "solo" }))).toBe(
      PE_PRICING.solo.title,
    );
    expect(tierNameLabel(account({ subscriptionTier: "studio" }))).toBe(
      PE_PRICING.studio.title,
    );
    expect(tierNameLabel(account({ subscriptionTier: "team" }))).toBe(
      PE_PRICING.team.title,
    );
  });

  it("VIOLATION: a null tier is Not read — it is NOT inferred from paid/free", () => {
    // A paid account with no subscriptionTier is a real shape (a legacy Stripe
    // row, or today's pre-contract server). Calling it "Solo" would be the
    // client picking a plan name for somebody.
    expect(tierNameLabel(account({ accessTier: "paid", subscriptionTier: null }))).toBe(
      NOT_READ,
    );
    for (const read of FAILURES) {
      expect(tierNameLabel(read)).toBe(NOT_READ);
    }
  });
});

describe("Billing interval — the row the whole card turns on", () => {
  it("prints the two known values using the pricing popup's own labels", () => {
    // The wire values are Stripe's ("month"/"year", P-98b); the LABELS stay
    // the pricing popup's words. This is the render boundary, and it is the
    // only place on the client where the two vocabularies are allowed to meet.
    expect(billingIntervalLabel(account({ billingInterval: "month" }))).toBe(
      PE_PRICING.interval.monthlyLabel,
    );
    expect(billingIntervalLabel(account({ billingInterval: "year" }))).toBe(
      PE_PRICING.interval.annualLabel,
    );
  });

  it("VIOLATION: NULL PRINTS Not read AND NEVER PRINTS MONTHLY", () => {
    // Nothing backfills this column, so a live test-mode subscriber genuinely
    // reads null. Printing "Monthly" for them would be a claim about how
    // somebody is billed that nobody read — the same defect one row down from
    // the annual rung offering them an upgrade they already took.
    const label = billingIntervalLabel(account({ billingInterval: null }));
    expect(label).toBe(NOT_READ);
    expect(label).not.toBe(PE_PRICING.interval.monthlyLabel);
    for (const read of FAILURES) {
      expect(billingIntervalLabel(read)).toBe(NOT_READ);
    }
  });

  it("NOT VACUOUS: the same fixture with a known interval does print one", () => {
    // Guards the block above against passing because every fixture is broken.
    expect(billingIntervalLabel(account({ billingInterval: "year" }))).not.toBe(
      NOT_READ,
    );
  });
});

// ---------------------------------------------------------------------------

describe("first paint, and the rows this card did not touch", () => {
  const render = (section: "account" | "plan") =>
    renderToStaticMarkup(
      <SettingsModal onClose={() => {}} onUpgrade={() => {}} initialSection={section} />,
    );

  it("Access falls to Not read before the read resolves — the pin SURVIVES", () => {
    // renderToStaticMarkup runs no effects, so the account read never lands.
    // An unresolved read is still unknown, and the honest word is the one that
    // must show. This is the same property settings-access-not-read.test.tsx
    // pins; it is restated here against the new reader so a future change to
    // the reader fails in this file too.
    const html = render("account");
    expect(html).toContain('data-testid="settings-access"');
    expect(html).toContain(`<span data-testid="settings-access">${NOT_READ}</span>`);
    expect(html).not.toContain(">Paid<");
  });

  it("Tier name and Billing interval also start at Not read", () => {
    const html = render("plan");
    expect(html).toContain(`<span data-testid="settings-tier-name">${NOT_READ}</span>`);
    expect(html).toContain(
      `<span data-testid="settings-billing-interval">${NOT_READ}</span>`,
    );
  });

  it("A-062: Renewal date is STILL untouched, and the other three are now one row", () => {
    // WHAT THIS ASSERTED BEFORE A-062. Renewal date was genuinely not on the
    // entitlement wire and the other three needed a billing portal that did
    // not exist, so all four read "Not built"/"Not read" and this test counted
    // exactly three "Not built"s to catch a fourth being lit up by accident.
    //
    // A-062 BUILT THE PORTAL. Payment method, invoices and cancellation are
    // three doors into the same Stripe Customer Portal and are now one row.
    // The guard the old count provided is preserved in a stronger form: there
    // is now NO "Not built" anywhere on this tab, so a future card cannot add
    // one back without failing here, and Renewal date is still checked by name
    // as the row that stayed honest.
    const html = render("plan");
    expect(html).toContain("Renewal date");
    expect(html).toContain("Payment, invoices and cancellation");
    expect(html.match(/Not built/g)?.length ?? 0).toBe(0);

    // AND IT DID NOT QUIETLY LIGHT UP RENEWAL DATE. That value is still not on
    // the wire, so its row must still say Not read rather than having acquired
    // a control alongside the portal one.
    expect(html).toContain(">Renewal date</span><span");
    expect(html).not.toContain('data-testid="settings-renewal-date-control"');
  });
});
