// THE ONE PRICING POPUP (2026-08-24 operator ruling) — replaces the retired
// UnlockFlow/PaywallGate pair (and their unlock-flow.test.tsx pins, carried
// forward here): every price from the ONE config module, the $15 unlock
// honest-disabled without a parcel, the Studio-only variant marks the unlock
// not-applicable, and no state ever renders a fake success.
//
// Node test environment (no jsdom): static-markup pins prove what renders;
// click WIRING is proven through the pure lockedPanelPaywallArgs helper
// (LockedToolPanel) and by the shared useCheckoutActions seam tests.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingModal } from "./PricingModal";
import { lockedPanelPaywallArgs } from "../workbench/tools/LockedToolPanel";
import { clampTeamSeats } from "./useCheckoutActions";
import {
  PE_PRICING,
  propertyChoiceLabel,
  soloChoiceLabel,
  studioChoiceLabel,
  teamChoiceLabel,
} from "../lib/pricing";

const noop = () => {};

/** Static markup HTML-escapes ampersands in config copy. */
const esc = (s: string) => s.replaceAll("&", "&amp;");

describe("PricingModal — ALL pricing in one popup, every string from config", () => {
  it("renders the header, free row, $15 unlock, and ALL THREE subscription tiers with config prices", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).toContain('data-testid="pricing-modal"');
    expect(html).toContain("SMART SITE");
    expect(html).toContain(PE_PRICING.header.title);
    expect(html).toContain(PE_PRICING.header.framing);
    expect(html).toContain('data-testid="pricing-free-row"');
    expect(html).toContain(PE_PRICING.free.blurb);
    expect(html).toContain('data-testid="pricing-unlock-card"');
    expect(html).toContain(propertyChoiceLabel());
    expect(html).toContain(PE_PRICING.property.blurb);
    for (const tier of ["solo", "studio", "team"] as const) {
      expect(html).toContain(`data-testid="pricing-${tier}-card"`);
      expect(html).toContain(`data-testid="pricing-${tier}-button"`);
      expect(html).toContain(esc(PE_PRICING[tier].blurb));
      expect(html).toContain(esc(PE_PRICING[tier].features));
    }
    expect(soloChoiceLabel()).toContain("$49/mo");
    expect(studioChoiceLabel()).toContain("$129/mo");
    expect(teamChoiceLabel()).toContain("$299/mo");
    expect(html).toContain(PE_PRICING.team.seatNote);
  });

  it("team seat input: default 10, min 1, max 500 (same semantics as the wire contract)", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).toContain('data-testid="pricing-team-seats"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="500"');
    expect(html).toContain('value="10"');
    expect(clampTeamSeats(0)).toBe(1);
    expect(clampTeamSeats(501)).toBe(500);
    expect(clampTeamSeats(14)).toBe(14);
  });

  it("NO active parcel → the unlock button is DISABLED with honest copy; subscriptions stay live", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId={null} onClose={noop} />,
    );
    expect(html).toMatch(/data-testid="pricing-unlock-button"[^>]*disabled/);
    expect(html).toContain('data-testid="pricing-unlock-needs-property"');
    expect(html).toContain(PE_PRICING.property.needsPropertyNote);
    expect(html).not.toMatch(/data-testid="pricing-solo-button"[^>]*disabled/);
  });

  it("with an active parcel the unlock button is NOT disabled and the needs-property note is absent", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).not.toMatch(/data-testid="pricing-unlock-button"[^>]*disabled/);
    expect(html).not.toContain('data-testid="pricing-unlock-needs-property"');
  });

  it("STUDIO-ONLY variant (terrain): unlock card marked not-applicable with the note; Studio AND Team emphasized, Solo not", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" studioOnly onClose={noop} />,
    );
    expect(html).toMatch(
      /data-testid="pricing-unlock-card"[^>]*data-not-applicable="true"/,
    );
    expect(html).toContain('data-testid="pricing-unlock-na-note"');
    expect(html).toContain(PE_PRICING.property.studioOnlyNote);
    expect(html).toMatch(/data-testid="pricing-studio-card"[^>]*data-emphasized="true"/);
    expect(html).toMatch(/data-testid="pricing-team-card"[^>]*data-emphasized="true"/);
    expect(html).toMatch(/data-testid="pricing-solo-card"[^>]*data-emphasized="false"/);
  });

  it("default variant: unlock applicable, nothing emphasized; highlightTier emphasizes exactly one card", () => {
    const plain = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(plain).toMatch(
      /data-testid="pricing-unlock-card"[^>]*data-not-applicable="false"/,
    );
    expect(plain).not.toContain('data-emphasized="true"');
    const solo = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" highlightTier="solo" onClose={noop} />,
    );
    expect(solo).toMatch(/data-testid="pricing-solo-card"[^>]*data-emphasized="true"/);
    expect(solo).toMatch(/data-testid="pricing-studio-card"[^>]*data-emphasized="false"/);
  });

  it("contextLine (the triggering tool's value line) renders near the top; absent when null", () => {
    const withLine = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        contextLine="Terrain export is a Studio feature."
        onClose={noop}
      />,
    );
    expect(withLine).toContain('data-testid="pricing-context-line"');
    expect(withLine).toContain("Terrain export is a Studio feature.");
    const without = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(without).not.toContain('data-testid="pricing-context-line"');
  });

  it("dialog semantics + BOTH close affordances (scrim and X) render; card scrolls internally", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"/);
    expect(html).toContain('data-testid="pricing-modal-scrim"');
    expect(html).toContain('data-testid="pricing-modal-close"');
    expect(html).toContain("overflow-y:auto");
    expect(html).toContain("min(560px, calc(100vw - 32px))");
  });

  it("honest status footnote renders when provided (ICC citation state)", () => {
    const html = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        statusNote="ICC citations run in fallback mode."
        onClose={noop}
      />,
    );
    expect(html).toContain('data-testid="pricing-status-note"');
    expect(html).toContain("ICC citations run in fallback mode.");
  });

  it("never renders a success/unlocked state without a real checkout event", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).not.toContain("Property unlocked");
    expect(html).not.toContain('data-testid="pricing-note"');
  });
});

describe("lockedPanelPaywallArgs — the dock button's exact host.openPaywall wiring", () => {
  it("standard tool → the value line, no variant opts", () => {
    expect(lockedPanelPaywallArgs("Deep research on this parcel.", false)).toEqual([
      "Deep research on this parcel.",
      undefined,
    ]);
  });

  it("Studio-only tool (terrain) → studioOnly + the Studio highlight", () => {
    expect(lockedPanelPaywallArgs("Terrain export.", true)).toEqual([
      "Terrain export.",
      { studioOnly: true, highlightTier: "studio" },
    ]);
  });
});
