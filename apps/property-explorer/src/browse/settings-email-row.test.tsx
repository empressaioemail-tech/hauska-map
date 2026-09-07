// P-123 — the "Signed in as" row, now read from the ACCOUNT entitlement
// (the same wire Access, Tier name and Billing interval already read).
//
// Same four-state shape as accessLabel, pinned the same way
// settings-plan-rows.test.tsx pins its three rows: the label function is
// pure and exported, so the branches run without a DOM, and a static-markup
// block pins the FIRST PAINT — nothing has resolved, so the row still says
// "Not read" exactly as it did before this card, because an unresolved read
// is still unknown regardless of what the wire can now carry.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsModal, emailLabel } from "./SettingsModal";
import type { AccountEntitlementRead } from "../lib/useAccountEntitlement";
import type { AccountEntitlement } from "../lib/accountEntitlementClient";

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
      hasBillingAccount: false,
      email: "operator@example.com",
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

describe("emailLabel", () => {
  it("prints the server's own answer once the account read resolves", () => {
    expect(emailLabel(account({ email: "operator@example.com" }))).toBe(
      "operator@example.com",
    );
  });

  it("VIOLATION: an unresolved read and every failure kind stay Not read", () => {
    for (const read of FAILURES) {
      expect(emailLabel(read)).toBe(NOT_READ);
    }
  });

  it("VIOLATION: a signed-out ready read never prints an address", () => {
    // The route answers anonymous callers with a 200; printing an address
    // next to the sign-in buttons would claim a person who has not signed in.
    expect(emailLabel(account({ authenticated: false }))).toBe(NOT_READ);
  });

  it("VIOLATION: a null email — a pre-P-123 server — is Not read, never a placeholder", () => {
    expect(emailLabel(account({ email: null }))).toBe(NOT_READ);
  });
});

describe("first paint — the row falls to Not read before the read resolves", () => {
  const render = () =>
    renderToStaticMarkup(
      <SettingsModal onClose={() => {}} onUpgrade={() => {}} initialSection="account" />,
    );

  it("SURVIVES this card — renderToStaticMarkup runs no effects", () => {
    const html = render();
    expect(html).toContain(`<span data-testid="settings-email">${NOT_READ}</span>`);
    expect(html).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
});
