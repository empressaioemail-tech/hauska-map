import { describe, it, expect } from "vitest";
import { personaHeadline, extractPersonaFacts } from "./personaRegister";
import type { BakedCardModel } from "./baked-facets";

describe("personaRegister", () => {
  const baked = {
    zoning: { state: "present" as const, value: "SF-R" },
    setbacks: { state: "present" as const, value: "F 25′ · S 5′ · R 10′" },
    buildablePct: { state: "present" as const, value: "62%" },
    landUse: { state: "present" as const, value: "Residential" },
    apn: { state: "unknown" as const },
    county: { state: "unknown" as const },
    acreage: { state: "unknown" as const },
    situsAddress: { state: "unknown" as const },
    envelopeStatus: null,
    envelopeApproximate: false,
    envelopeEmptyReason: null,
    provenance: {},
    bakedAt: null,
  } satisfies BakedCardModel;

  const facts = extractPersonaFacts(baked);

  it("homeowner register uses plain verdict language", () => {
    expect(personaHeadline("homeowner", facts)).toMatch(/Likely buildable/i);
    expect(personaHeadline("homeowner", facts)).toMatch(/62%/);
  });

  it("investor register emphasizes constraints", () => {
    expect(personaHeadline("investor", facts)).toMatch(/Constraints/);
    expect(personaHeadline("investor", facts)).toMatch(/SF-R/);
  });

  it("architect register carries citation-style setbacks", () => {
    expect(personaHeadline("architect", facts)).toMatch(/Tier-1 approximate/);
    expect(personaHeadline("architect", facts)).toMatch(/SF-R/);
  });

  it("same facts across personas — no contradictory zoning", () => {
    for (const persona of ["homeowner", "investor", "architect"] as const) {
      expect(personaHeadline(persona, facts)).toContain("SF-R");
    }
  });
});
