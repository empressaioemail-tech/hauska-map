// Component tests for InspectCard via react-dom/server static render (same
// pattern as PropertyBriefPanel.test.tsx — node env, no effects run).
//
// Map UX cluster item 4: the persona UI ("View as" Homeowner/Investor/
// Architect + the persona summary sentence) is REMOVED from the card. These
// tests pin that removal and keep the honest status lines that are NOT
// persona copy.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InspectCard } from "./InspectCard";
import type { ParcelCardData } from "./liveGis";

const noop = () => {};

const CARD: ParcelCardData = {
  apn: "141209",
  situsAddress: "714 Spring St",
  owner: null,
  landUseDescription: "Single family",
  county: "Bastrop",
  provider: "Bastrop County GIS",
  notSurveyGrade: true,
  retrievedAt: "2026-07-25T00:00:00.000Z",
  lat: 30.11,
  lng: -97.31,
};

const html = renderToStaticMarkup(
  <InspectCard
    card={CARD}
    parcelNodeId={null}
    onClose={noop}
    onMakeSubject={noop}
    onResearch={noop}
  />,
);

describe("InspectCard — persona UI removed (map UX cluster item 4)", () => {
  it("renders no persona block, no View-as row, no persona buttons", () => {
    expect(html).not.toContain('data-testid="persona-register"');
    expect(html).not.toContain('data-testid="persona-headline"');
    expect(html).not.toContain('data-testid="persona-homeowner"');
    expect(html).not.toContain('data-testid="persona-investor"');
    expect(html).not.toContain('data-testid="persona-architect"');
    expect(html).not.toContain("View as");
    expect(html).not.toContain("Homeowner");
    expect(html).not.toContain("Investor");
    expect(html).not.toContain("Architect");
    // The persona summary sentence family is gone with it.
    expect(html).not.toContain("Likely buildable area");
  });

  it("keeps the card facts and the non-persona actions", () => {
    expect(html).toContain('data-testid="inspect-card"');
    expect(html).toContain("714 Spring St");
    expect(html).toContain('data-testid="inspect-apn"');
    expect(html).toContain('data-testid="make-subject"');
    expect(html).toContain('data-testid="research-this"');
    // Live-fallback provenance line (honest, not persona copy) survives.
    expect(html).toContain("Source: Bastrop County GIS");
  });
});

describe("InspectCard — export sections moved to the workbench (W2)", () => {
  // Even WITH a baked node id (the condition that used to gate the export
  // sections in), the card renders NO export UI: site-plan + terrain exports
  // live in the workbench "Reports & exports" dock now.
  const withNodeId = renderToStaticMarkup(
    <InspectCard
      card={CARD}
      parcelNodeId="48021:141209"
      onClose={noop}
      onMakeSubject={noop}
      onResearch={noop}
      onSaveProperty={noop}
    />,
  );

  it("renders neither the site-plan nor the terrain export section", () => {
    expect(withNodeId).not.toContain('data-testid="site-plan-export-section"');
    expect(withNodeId).not.toContain('data-testid="terrain-export-section"');
    expect(withNodeId).not.toContain("Export site plan");
    expect(withNodeId).not.toContain("Export terrain");
    expect(withNodeId).not.toContain('data-testid="site-plan-format-picker"');
    expect(withNodeId).not.toContain('data-testid="terrain-format-picker"');
  });

  it("keeps the leaner card's actions: Research / Make subject / Save", () => {
    expect(withNodeId).toContain('data-testid="research-this"');
    expect(withNodeId).toContain('data-testid="make-subject"');
    expect(withNodeId).toContain('data-testid="save-property"');
  });
});
