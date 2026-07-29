// R1 PAYWALL — the unified unlock flow renders BOTH choices with prices from
// the ONE config module; the Pro-only (terrain) variant offers ONLY Pro.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaywallGate } from "./PaywallGate";
import { UnlockChoices } from "./UnlockFlow";
import {
  PE_PRICING,
  proChoiceLabel,
  propertyChoiceLabel,
} from "../lib/pricing";

describe("UnlockChoices — one flow, two choices, config prices", () => {
  it("renders the $15 property choice AND the Pro choice with config prices + the Pro nudge", () => {
    const html = renderToStaticMarkup(
      <UnlockChoices parcelNodeId="48021:1" />,
    );
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
    // Prices come from the config module — assert THROUGH it (no literals).
    expect(html).toContain(propertyChoiceLabel());
    expect(html).toContain(proChoiceLabel());
    expect(html).toContain(PE_PRICING.property.blurb);
    expect(html).toContain(PE_PRICING.pro.blurb);
    expect(html).toContain('data-testid="unlock-pro-nudge"');
    expect(html).toContain(PE_PRICING.proNudge);
    // And the config really carries the decided prices.
    expect(propertyChoiceLabel()).toContain("$15");
    expect(proChoiceLabel()).toContain("$99/mo");
    expect(proChoiceLabel()).toContain("$149/mo");
  });

  it("PRO-ONLY variant (terrain): ONLY the Pro choice + the pro-only note — the $15 unlock never claims it", () => {
    const html = renderToStaticMarkup(
      <UnlockChoices
        parcelNodeId="48021:1"
        proOnly
        proOnlyNote="Terrain is Pro-only."
      />,
    );
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
    expect(html).toContain('data-testid="unlock-pro-only-note"');
    expect(html).toContain("Terrain is Pro-only.");
    expect(html).not.toContain('data-testid="unlock-pro-nudge"');
  });

  it("never renders a success/unlocked state without a real unlock event", () => {
    // Fresh render carries no note and no success copy — success can only be
    // set by a REAL server unlock outcome (see property-unlock.test.ts).
    const html = renderToStaticMarkup(<UnlockChoices parcelNodeId="48021:1" />);
    expect(html).not.toContain("Property unlocked");
    expect(html).not.toContain('data-testid="unlock-note"');
  });
});

describe("PaywallGate — the unified modal (the reactive 402 belt)", () => {
  it("renders the value line + both choices; the old Pro-hardcoded copy is gone", () => {
    const html = renderToStaticMarkup(
      <PaywallGate
        parcelNodeId="48021:1"
        valueLine="The full cited property brief."
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-testid="paywall-gate"');
    expect(html).toContain("The full cited property brief.");
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
    expect(html).not.toContain("R1–R10");
    expect(html).not.toContain("Pro entitlement");
    expect(html).not.toContain("Checkout runs in test or live mode");
    // The free line stays honest.
    expect(html).toContain("stay free");
  });

  it("proOnly modal renders the Pro-only variant", () => {
    const html = renderToStaticMarkup(
      <PaywallGate
        parcelNodeId="48021:1"
        valueLine="Terrain export is a Pro feature."
        proOnly
        onClose={() => {}}
      />,
    );
    expect(html).toContain("This is a Pro feature");
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
  });
});
