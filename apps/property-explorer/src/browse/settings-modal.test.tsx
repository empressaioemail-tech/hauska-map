import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsModal } from "./SettingsModal";

// SETTINGS v2 — the line between built and not built.
//
// The risk in a settings console is shipping panes that LOOK operable and do
// nothing. These pin the honesty contract, not the layout.
//
// NOTE ON AN EARLIER VERSION OF THIS FILE: it asserted that the strings
// "payment method", "invoices" and "cancel subscription" were ABSENT. That was
// a control broader than its claim — the v2 design shows exactly those three
// as rows labelled "Not built", which is the disclosure we want, not a
// violation. The claim is "no billing CONTROL without an endpoint", so that is
// what is checked now.


/**
 * Source with comments removed, the same treatment the chrome-kit gate gives
 * it. Without this these checks match the PROSE explaining the rule, which is
 * a control broader than its claim — and it fired on this very file.
 */
const codeOf = (file: string) =>
  readFileSync(resolve(__dirname, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const noop = () => {};

const render = (section?: "account" | "plan" | "connections" | "team") =>
  renderToStaticMarkup(
    <SettingsModal onClose={noop} onUpgrade={noop} initialSection={section} />,
  );

describe("SettingsModal — the shell", () => {
  it("is a standalone modal with all five sections", () => {
    // P-117 added the fifth tab, Affiliate. Terms and mechanics for that tab
    // are pinned in settings-affiliate.test.tsx; this file only guards that
    // the tab is reachable.
    const html = render();
    expect(html).toContain('data-testid="settings-modal"');
    for (const id of ["account", "plan", "connections", "team", "affiliate"]) {
      expect(html).toContain(`data-testid="settings-tab-${id}"`);
    }
  });

  it("uses the KIT Button for tabs, not a native one", () => {
    // W9 (P-93) makes a raw <button> in chrome a CI failure. A tab is still a
    // button, so it uses the kit with a style override.
    const jsxButtons = codeOf("SettingsModal.tsx").match(/<button[\s/>]/g) ?? [];
    expect(jsxButtons).toHaveLength(0);
  });
});

describe("Account — the address is NOT READ, and says so", () => {
  it("renders Not read instead of a specimen address", () => {
    // The session read returns { authenticated, hasSession } and the BFF holds
    // an opaque token. Printing an address would mean inventing one.
    const html = render("account");
    expect(html).toContain('data-testid="settings-email-not-read"');
    expect(html).toContain("Not read");
  });

  it("never renders an email-shaped string", () => {
    expect(render("account")).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it("states the real sign-in method", () => {
    // The design drop's earlier revision claimed a magic link. There is no
    // magic-link code in this product; sign-in is Google or Microsoft.
    const html = render("account");
    expect(html).toMatch(/Google or Microsoft/);
    expect(html).not.toMatch(/magic link/i);
  });
});

describe("Plan — half real, and declares which half", () => {
  it("A-062: the three unbuilt billing rows are now ONE REAL CONTROL", () => {
    // WHAT THIS TEST USED TO ASSERT, and why it changed. Until A-062 the panel
    // showed "Payment method / Invoices / Cancel subscription", each valued
    // "Not built", and their PRESENCE was the disclosure — hiding them would
    // have left a reader hunting for a cancel control that did not exist.
    //
    // They are three doors into the SAME Stripe Customer Portal, which is
    // Stripe's surface and not ours, so they are one row now. The old labels
    // must be GONE rather than kept beside the new one: leaving "Cancel
    // subscription — Not built" next to a working control would contradict
    // itself on screen, and it is the exact sentence terms.html was accused of
    // contradicting.
    const html = render("plan");
    for (const retired of ["Payment method", "Invoices", "Cancel subscription"]) {
      expect(html).not.toContain(retired);
    }
    expect(html).toContain("Payment, invoices and cancellation");
    // "Not built" is gone from this tab entirely: nothing on it is unbuilt any
    // more. Renewal date is "Not read", which is a different claim — the value
    // is genuinely not on the wire.
    expect(html).not.toContain("Not built");
  });

  it("A-062: the control WAITS for the account read rather than guessing", () => {
    // First paint has an unresolved read. The honest answer there is "Not
    // read", not a button: offering a portal to an account we have not read is
    // how a customer lands on a 409 while trying to cancel. The `manage` arm
    // is proven separately, without rendering, in
    // src/lib/pe-terms-cancellation.test.tsx.
    const html = render("plan");
    expect(html).toContain('data-testid="settings-billing-not-read"');
    expect(html).not.toContain('data-testid="settings-billing-portal"');
    expect(html).not.toContain('data-testid="settings-billing-none"');
  });

  it("marks tier, interval and renewal as Not read", () => {
    const html = render("plan");
    for (const label of ["Tier name", "Billing interval", "Renewal date"]) {
      expect(html).toContain(label);
    }
  });

  it("prices nothing itself — upgrade routes to the one checkout", () => {
    const html = render("plan");
    expect(html).toContain('data-testid="settings-upgrade"');
    expect(html).not.toMatch(/\$\d/);
  });
});

describe("Team — a read that does not exist yet", () => {
  it("renders the Not read state, never a fabricated roster", () => {
    // There is no members table and no endpoint. The first paint is the
    // reading state; nothing here invents rows.
    const html = render("team");
    expect(html).toContain('data-testid="settings-team"');
    expect(html).not.toContain('data-testid="settings-team-member"');
  });

  it("ships NO fixture roster in the component", () => {
    // The design comp carries specimen rows (you@bastrop-arch.com and so on).
    // Those are comp data. If they appear in the shipped file, the tab is
    // showing a roster nobody read.
    expect(codeOf("SettingsModal.tsx")).not.toMatch(/@bastrop-arch\.com|@structural\.co|@firm\.com/);
  });

  it("does not invent a role for the viewer", () => {
    // viewerRole comes off the read; it is never defaulted to owner.
    expect(codeOf("SettingsModal.tsx")).not.toMatch(/viewerRole\s*(\|\||\?\?)\s*["']owner["']/);
  });
});

describe("the kit, not the comp's own chrome", () => {
  it("imports no SmartCity kit and loads no Oxygen", () => {
    // The design drop links the SmartCity design system and Oxygen. PE has one
    // kit and Oxygen is retired; both are W9 acceptance items.
    expect(codeOf("SettingsModal.tsx")).not.toMatch(/smartcity|Oxygen/i);
  });

  it("paints from PE tokens, not raw hexes", () => {
    const src = readFileSync(resolve(__dirname, "SettingsModal.tsx"), "utf8");
    const hexes = src.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toHaveLength(0);
  });
});
