/**
 * Track B3 / WDLL 5 — shared buildable vocabulary unit tests.
 * Locks the historical map-card vs PDF disagreement class.
 */

import { describe, it, expect } from "vitest";
import {
  mapBuildableDisplay,
  violatesHistoricalDisagreementGuard,
  type BuildableDisplayInput,
} from "./buildable-display-vocab";

describe("mapBuildableDisplay — historical disagreement class (B3)", () => {
  it("envelope area present → no surface says consumes-lot or bare pending %", () => {
    // 48021:34785 class: depth-warm ~13641 sqft, pct may be omitted on facets
    const input: BuildableDisplayInput = {
      envelopeStatus: "ok",
      buildableAreaSqFt: 13641,
      // intentionally omit buildableAreaPct (the historical PE pending path)
    };
    const vocab = mapBuildableDisplay(input);
    expect(vocab.kind).toBe("buildable-with-area");
    expect(vocab.cardState).toBe("present");
    expect(vocab.cardLabel).toMatch(/13,?641/);
    expect(vocab.cardLabel).not.toMatch(/pending/i);
    expect(vocab.pdfLabel).toMatch(/13,?641/);
    expect(vocab.pdfLabel.toLowerCase()).not.toMatch(/consumes/);
    expect(violatesHistoricalDisagreementGuard(vocab, input)).toBe(false);
  });

  it("warm buildable area preferred over local offset-degenerate consumes-lot", () => {
    const input: BuildableDisplayInput = {
      envelopeStatus: "ok",
      offsetDegenerate: true,
      offsetDegenerateReason:
        "setback-consumes-lot: inward offset collapsed or inverted",
      warmEnvelopeKind: "buildable",
      warmEnvelopeAreaSqFt: 13641,
    };
    const vocab = mapBuildableDisplay(input);
    expect(vocab.kind).toBe("buildable-with-area");
    expect(vocab.agreementToken).toMatch(/^buildable:/);
    expect(vocab.pdfLabel.toLowerCase()).not.toMatch(/consumes/);
    expect(vocab.cardLabel).not.toMatch(/pending/i);
    expect(violatesHistoricalDisagreementGuard(vocab, input)).toBe(false);
  });

  it("pct present → buildable-with-area (map/inspect/PDF share token family)", () => {
    const input: BuildableDisplayInput = {
      envelopeStatus: "ok",
      buildableAreaPct: 62.4,
      buildableAreaSqFt: 5100,
    };
    const vocab = mapBuildableDisplay(input);
    expect(vocab.kind).toBe("buildable-with-area");
    expect(vocab.cardLabel).toBe("62%");
    expect(vocab.pdfLabel).toMatch(/5,?100/);
  });

  it("honest shared pending when setbacks live but no area signal", () => {
    const input: BuildableDisplayInput = {
      envelopeStatus: "ok",
      // no pct, no sqft, no warm area
    };
    const vocab = mapBuildableDisplay(input);
    expect(vocab.kind).toBe("pending");
    expect(vocab.cardState).toBe("pending");
    expect(vocab.cardLabel).toMatch(/pending/i);
    expect(vocab.pdfLabel).toMatch(/pending/i);
    expect(vocab.agreementToken).toBe("pending");
  });

  it("not_specified axes never render as consume-lot", () => {
    const input: BuildableDisplayInput = {
      envelopeStatus: "ok",
      notSpecifiedAxes: true,
    };
    const vocab = mapBuildableDisplay(input);
    expect(vocab.kind).toBe("not_specified");
    expect(vocab.cardLabel).toMatch(/build-to-line/i);
    expect(vocab.pdfLabel.toLowerCase()).not.toMatch(/consumes/);
    expect(vocab.agreementToken).toBe("not_specified");
  });

  it("declined-consume only when no area and status/warm/offset agree", () => {
    const input: BuildableDisplayInput = {
      envelopeStatus: "no-buildable-area",
      buildableAreaPct: 0,
    };
    const vocab = mapBuildableDisplay(input);
    expect(vocab.kind).toBe("declined-consume");
    expect(vocab.cardLabel).toMatch(/consume/i);
    expect(vocab.agreementToken).toBe("declined-consume");
  });

  it("provisional-front-edge with area → provisional, not pending or consume", () => {
    const input: BuildableDisplayInput = {
      envelopeStatus: "ok",
      warmEnvelopeKind: "provisional-front-edge",
      buildableAreaSqFt: 9000,
      provisional: true,
    };
    const vocab = mapBuildableDisplay(input);
    expect(vocab.kind).toBe("provisional");
    expect(vocab.cardLabel).toMatch(/provisional/i);
    expect(vocab.pdfLabel).toMatch(/PROVISIONAL/);
    expect(violatesHistoricalDisagreementGuard(vocab, input)).toBe(false);
  });

  it("guard flags the old disagreement shape if a caller bypasses the mapper", () => {
    const input: BuildableDisplayInput = {
      envelopeStatus: "ok",
      buildableAreaSqFt: 13641,
    };
    const bad = {
      kind: "pending" as const,
      cardState: "pending" as const,
      cardLabel: "setbacks present · buildable % pending",
      pdfLabel: "unavailable — setback-consumes-lot",
      agreementToken: "broken",
    };
    expect(violatesHistoricalDisagreementGuard(bad, input)).toBe(true);
  });
});
