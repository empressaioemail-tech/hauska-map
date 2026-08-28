import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsModal } from "./SettingsModal";

// SETTINGS, AND THE LINE BETWEEN BUILT AND NOT BUILT.
//
// Three of the four panes are real. Team is not: "team" is a CHECKOUT TIER
// with a seat count, and there is no member list, invite, or role anywhere in
// the product. Billing is half real: checkout exists, a customer portal does
// not. The risk in a settings screen is shipping panes that LOOK operable and
// do nothing — dormant UI that reads as done and is only discovered by
// someone trying to use it. These pin the honesty, not the layout.

const noop = () => {};

describe("SettingsModal — the real panes", () => {
  it("is a standalone modal, not a dock tool", () => {
    const html = renderToStaticMarkup(
      <SettingsModal onClose={noop} onUpgrade={noop} />,
    );
    expect(html).toContain('data-testid="settings-modal"');
  });

  it("offers all four sections", () => {
    const html = renderToStaticMarkup(
      <SettingsModal onClose={noop} onUpgrade={noop} />,
    );
    for (const id of ["account", "plan", "connections", "team"]) {
      expect(html).toContain(`data-testid="settings-tab-${id}"`);
    }
  });

  it("reuses the REAL connector rows rather than a copy that can drift", () => {
    const html = renderToStaticMarkup(
      <SettingsModal onClose={noop} onUpgrade={noop} initialSection="connections" />,
    );
    // Sourced from USE_IN_AI_VENDORS, the same list the rail bubble drives.
    expect(html).toContain('data-testid="settings-connection-claude"');
    expect(html).toContain("Claude");
  });
});

describe("what Settings must NOT claim", () => {
  it("says plainly that team management does not exist", () => {
    const html = renderToStaticMarkup(
      <SettingsModal onClose={noop} onUpgrade={noop} initialSection="team" />,
    );
    expect(html).toMatch(/not built/i);
    // The failure mode this guards: an invite control that goes nowhere.
    expect(html).not.toMatch(/invite a member|add member|manage members/i);
  });

  it("does not offer billing controls that have no endpoint", () => {
    const html = renderToStaticMarkup(
      <SettingsModal onClose={noop} onUpgrade={noop} initialSection="plan" />,
    );
    // There is no customer portal in this repo. Offering these would send the
    // reader looking for a control that does not exist.
    expect(html).not.toMatch(/update payment method|download invoice|cancel subscription/i);
    expect(html).toMatch(/not available here yet/i);
  });

  it("does not price anything itself — upgrade routes to the one checkout", () => {
    const html = renderToStaticMarkup(
      <SettingsModal onClose={noop} onUpgrade={noop} initialSection="plan" />,
    );
    expect(html).toContain('data-testid="settings-upgrade"');
    // A second price list is how two surfaces start disagreeing.
    expect(html).not.toMatch(/\$\d/);
  });

  it("does not print an email it was never given", () => {
    // fetchSession returns { authenticated, hasSession } and carries no
    // identity. An invented address would be worse than none.
    const src = readFileSync(resolve(__dirname, "SettingsModal.tsx"), "utf8");
    expect(src).not.toMatch(/session\.email|user\.email/);
  });
});

describe("the rail opens it", () => {
  it("ExplorerMap mounts the bubble and the modal", () => {
    const src = readFileSync(resolve(__dirname, "ExplorerMap.tsx"), "utf8");
    expect(src).toContain("<SettingsBubble");
    expect(src).toContain("<SettingsModal");
  });

  it("Settings upgrade opens the SAME pricing modal, not a second one", () => {
    const src = readFileSync(resolve(__dirname, "ExplorerMap.tsx"), "utf8");
    expect(src).toContain("setPaywallOpen(true)");
  });
});
