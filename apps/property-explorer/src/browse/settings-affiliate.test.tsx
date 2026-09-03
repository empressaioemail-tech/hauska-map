// P-117 — the affiliate program explainer in Settings.
//
// This pins two things: that the LOCKED terms appear stated plainly (not
// invented, not a different number than the GTM strategy doc carries), and
// that the tab never renders a control that opens nothing. The program is
// opt-in by application and the application pipeline does not exist yet
// (OPS-16 A-081), so the honest state is "not yet open" with no button and
// no next-action rung — the rail going quiet is the correct behaviour here,
// not a bug.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsModal } from "./SettingsModal";
import { AffiliateSection } from "./AffiliateSection";

const codeOf = (file: string) =>
  readFileSync(resolve(__dirname, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const noop = () => {};

const render = () => renderToStaticMarkup(<AffiliateSection />);

const renderModal = (
  section?: "account" | "plan" | "connections" | "team" | "affiliate",
) =>
  renderToStaticMarkup(
    <SettingsModal onClose={noop} onUpgrade={noop} initialSection={section} />,
  );

describe("Affiliate tab — reachable from the shell", () => {
  it("is one of the five tabs", () => {
    const html = renderModal();
    expect(html).toContain('data-testid="settings-tab-affiliate"');
    expect(html).toContain(">Affiliate<");
  });

  it("mounts AffiliateSection when selected, and only then", () => {
    expect(renderModal("affiliate")).toContain('data-testid="settings-affiliate"');
    expect(renderModal("account")).not.toContain('data-testid="settings-affiliate"');
  });
});

describe("Affiliate — the locked terms, stated plainly", () => {
  it("states the commission exactly as locked: 20%, recurring, twelve-month cap", () => {
    // Source: _smartsite_gtm/01_central_texas_gtm_strategy.md — "Terms are
    // locked at 20 percent, recurring, capped at twelve months." A different
    // number here would be inventing program terms, which the dispatch this
    // card came from explicitly forbids.
    const html = render();
    expect(html).toMatch(/20%/);
    expect(html).toMatch(/recurring/i);
    expect(html).toMatch(/twelve months/i);
  });

  it("names PromoteKit for attribution and PayPal for payouts", () => {
    const html = render();
    expect(html).toContain("PromoteKit");
    expect(html).toContain("PayPal");
  });

  it("states the program is opt-in by application, not a universal link", () => {
    // The 2026-08-31 operator ruling: "Subscribers do not automatically
    // receive an affiliate link." This card would misrepresent the program
    // if it implied every subscriber already has one.
    const html = render();
    expect(html).toMatch(/application/i);
    expect(html).not.toMatch(/automatically receive|every subscriber gets a link/i);
  });

  it("states self-referral is not payable", () => {
    const html = render();
    expect(html).toMatch(/own account is not payable/i);
  });

  it("prices nothing and pitches nothing — no dollar figure, no ROI or savings claim", () => {
    // The never-say list (_smartsite_masters) forbids cycle-time, savings and
    // ROI figures in any Smart Site copy. This tab is help text, not a kit
    // asset, but it draws from the same masters rather than inventing a
    // looser register for itself.
    const html = render();
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toMatch(/\bROI\b|savings|cycle.?time/i);
  });
});

describe("Affiliate — VIOLATION: no dead control", () => {
  it("renders no Apply / Sign up / Get started control", () => {
    // The GHL "Affiliate Recruiting" pipeline this tab would point an
    // application at has not been created (OPS-16 A-081) — the credential
    // that creates it is operator-local and unreachable from this build.
    // A button with nowhere to send its click is the dead-control defect
    // this product's own honesty discipline exists to catch.
    const html = render();
    expect(html).not.toMatch(/data-testid="[^"]*(apply|affiliate-apply|affiliate-signup)/i);
    expect(html).not.toMatch(/>\s*(Apply now|Apply|Sign up|Get started)\s*</i);
  });

  it("says plainly that applications are not open yet", () => {
    const html = render();
    expect(html).toContain('data-testid="settings-affiliate-not-open"');
    expect(html).toMatch(/not open yet/i);
  });

  it("the one link on the tab is the SAME support address the Account tab already uses, not an invented form", () => {
    const html = render();
    expect(html).toContain('data-testid="affiliate-support-email"');
    expect(html).toContain('href="mailto:support@empressa.io"');
  });

  it("NOT VACUOUS: the tab still renders its status chip", () => {
    const html = render();
    expect(html).toContain('data-testid="settings-affiliate-status"');
    expect(html).toContain("Not yet open");
  });
});

describe("Affiliate — the next-action rail goes quiet here", () => {
  it("mounts no next-action rail control on this tab", () => {
    // The ladder's NextActionContext type does not carry "affiliate"; the
    // mount passes null rather than widening that union, because there is
    // nothing to propose on a program nobody can join yet. NextActionCard
    // itself renders nothing for a null action (see NextActionCard.tsx), so
    // the correct assertion is that no action control mounts, not that the
    // rail chrome disappears.
    const html = renderModal("affiliate");
    expect(html).not.toContain('data-testid="next-action"');
    expect(html).not.toContain('data-testid="next-action-cta"');
  });
});

describe("Affiliate — the kit, not raw chrome", () => {
  it("uses the shared Row/Panel/Aside/Eyebrow primitives, not a second layout", () => {
    expect(codeOf("AffiliateSection.tsx")).toMatch(
      /import\s*\{[^}]*Row[^}]*\}\s*from\s*"\.\/SettingsModal"/,
    );
  });

  it("renders no raw <button>", () => {
    const jsxButtons = codeOf("AffiliateSection.tsx").match(/<button[\s/>]/g) ?? [];
    expect(jsxButtons).toHaveLength(0);
  });

  it("paints from PE tokens, not raw hexes", () => {
    const hexes =
      codeOf("AffiliateSection.tsx").match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toHaveLength(0);
  });
});
