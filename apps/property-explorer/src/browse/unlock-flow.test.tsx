// R1 PAYWALL — the unified unlock flow renders BOTH choices with prices from
// the ONE config module; the Studio-only (terrain) variant offers ONLY Studio.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaywallGate } from "./PaywallGate";
import { UnlockChoices } from "./UnlockFlow";
import {
  PE_PRICING,
  propertyChoiceLabel,
  soloChoiceLabel,
  studioChoiceLabel,
} from "../lib/pricing";

describe("UnlockChoices — one flow, two choices, config prices", () => {
  it("renders the $15 property choice AND the Solo choice with config prices + the Solo nudge", () => {
    const html = renderToStaticMarkup(
      <UnlockChoices parcelNodeId="48021:1" />,
    );
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-solo-choice"');
    expect(html).toContain(propertyChoiceLabel());
    expect(html).toContain(soloChoiceLabel());
    expect(html).toContain(PE_PRICING.property.blurb);
    expect(html).toContain(PE_PRICING.solo.blurb);
    expect(html).toContain('data-testid="unlock-solo-nudge"');
    expect(html).toContain(PE_PRICING.soloNudge);
    expect(propertyChoiceLabel()).toContain("$15");
    expect(soloChoiceLabel()).toContain("$49/mo");
    expect(html).toContain("30 days");
  });

  it("STUDIO-ONLY variant (terrain): ONLY the Studio choice + the studio-only note", () => {
    const html = renderToStaticMarkup(
      <UnlockChoices
        parcelNodeId="48021:1"
        proOnly
        proOnlyNote="Terrain is Studio-only."
      />,
    );
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-studio-choice"');
    expect(html).toContain('data-testid="unlock-studio-only-note"');
    expect(html).toContain("Terrain is Studio-only.");
    expect(html).not.toContain('data-testid="unlock-solo-nudge"');
    expect(html).toContain(studioChoiceLabel());
  });

  it("never renders a success/unlocked state without a real unlock event", () => {
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
    expect(html).toContain('data-testid="unlock-solo-choice"');
    expect(html).not.toContain("R1–R10");
    expect(html).not.toContain("Pro entitlement");
    expect(html).not.toContain("Checkout runs in test or live mode");
    expect(html).toContain("stay free");
  });

  it("proOnly modal renders the Studio-only variant", () => {
    const html = renderToStaticMarkup(
      <PaywallGate
        parcelNodeId="48021:1"
        valueLine="Terrain export is a Studio feature."
        proOnly
        onClose={() => {}}
      />,
    );
    expect(html).toContain("This is a Studio feature");
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-studio-choice"');
  });
});
