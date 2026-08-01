// Tests for the R1 brief view-model derivation: fact→payload traceability,
// citation wiring, honest absence, unknown-section generic rendering, and the
// ported Alder freshness verdict.

import { describe, expect, it } from "vitest";
import {
  deriveBriefViewModel,
  freshnessVerdict,
} from "./brief-view-model";
import {
  FIXTURE_NOW_MS,
  UNKNOWN_SECTION_BRIEF,
  UNZONED_BRIEF,
  ZONED_BRIEF,
} from "./__fixtures__/research-brief.fixture";

describe("freshnessVerdict (ported Alder thresholds)", () => {
  const now = FIXTURE_NOW_MS;
  it("fresh under 90 days", () => {
    expect(freshnessVerdict("2026-07-01", now)).toBe("fresh");
  });
  it("aging between 90 and 365 days", () => {
    expect(freshnessVerdict("2025-11-02", now)).toBe("aging");
  });
  it("stale over 365 days", () => {
    expect(freshnessVerdict("2024-01-01", now)).toBe("stale");
  });
  it("unknown on missing or malformed dates", () => {
    expect(freshnessVerdict(null, now)).toBe("unknown");
    expect(freshnessVerdict("not-a-date", now)).toBe("unknown");
  });
});

describe("deriveBriefViewModel — zoned parcel (all sections)", () => {
  const vm = deriveBriefViewModel(ZONED_BRIEF, FIXTURE_NOW_MS);

  it("header carries the payload provenance verbatim", () => {
    expect(vm.header.parcelNodeId).toBe("tx-bastrop-parcel-000123");
    expect(vm.header.runId).toBe("pe-r1-dGVzdA.MjAyNg");
    expect(vm.header.reportFamily).toBe("R1");
    expect(vm.header.mode).toBe("baked-facet-intel-v1");
    expect(vm.header.source).toBe("baked-snapshot");
    expect(vm.header.bakedAt).toBe("2026-07-21T09:00:00.000Z");
  });

  it("zoning renders the district with its GIS-layer citation", () => {
    const zoning = vm.sections.find((s) => s.id === "zoning")!;
    expect(zoning.kind).toBe("facts");
    const district = zoning.facts.find((f) => f.label === "District")!;
    expect(district.value).toBe("P-2");
    expect(district.provenance?.source).toBe(
      "City zoning districts map (Bastrop, TX)",
    );
    expect(district.provenance?.vintage).toBe("2026-07-10T00:00:00.000Z");
    expect(district.provenance?.url).toContain("Zoning_Districts/FeatureServer");
    expect(district.citationIndex).not.toBeNull();
  });

  it("setbacks render as a readable spec honoring not_specified axes", () => {
    const env = vm.sections.find((s) => s.id === "setbacks-envelope")!;
    expect(env.kind).toBe("facts");
    const setbacks = env.facts.find((f) => f.label === "Setbacks")!;
    // side/rear are code-silent — never rendered as a real 0 ft.
    expect(setbacks.value).toContain("F 10′");
    expect(setbacks.value).toContain("S not specified");
    expect(setbacks.value).toContain("R not specified");
    expect(setbacks.value).toContain("build-to-line governs");
    const envelope = env.facts.find((f) => f.label === "Buildable envelope")!;
    expect(envelope.value).toBe("6,100 sq ft (70% of the lot)");
    const parcelArea = env.facts.find((f) => f.label === "Parcel area")!;
    expect(parcelArea.value).toBe("8,712 sq ft");
    // approximate flag surfaces as a note — no survey-grade claim.
    expect(env.notes).toContain("Approximate — not survey grade.");
    // Municode citation attached.
    expect(setbacks.provenance?.url).toContain("municode.com");
  });

  it("dimensional caps trace to the payload", () => {
    const env = vm.sections.find((s) => s.id === "setbacks-envelope")!;
    expect(env.facts.find((f) => f.label === "Max lot coverage")?.value).toBe("60%");
    expect(env.facts.find((f) => f.label === "Max height")?.value).toBe("35 ft");
    expect(env.facts.find((f) => f.label === "Max footprint")?.value).toBe(
      "5,227 sq ft",
    );
  });

  it("flood renders the plain-English SFHA meaning from the payload status", () => {
    const flood = vm.sections.find((s) => s.id === "flood")!;
    expect(flood.kind).toBe("facts");
    const det = flood.facts.find((f) => f.label === "Determination")!;
    expect(det.value).toContain("Zone AE");
    expect(det.value).toContain("Special Flood Hazard Area");
    expect(det.provenance?.source).toBe("FEMA NFHL");
    expect(det.provenance?.vintage).toBe("2026-07-20T04:12:00.000Z");
    expect(flood.facts.find((f) => f.label === "Zone subtype")?.value).toBe(
      "FLOODWAY",
    );
    expect(
      flood.facts.find((f) => f.label === "Base flood elevation")?.value,
    ).toBe("341.2 ft");
  });

  it("land use renders description, code, and vintage", () => {
    const lu = vm.sections.find((s) => s.id === "land-use")!;
    const c = lu.facts.find((f) => f.label === "Classification")!;
    expect(c.value).toBe("Single family residence (code A1)");
    expect(c.provenance?.source).toBe("bastrop-cad");
    expect(lu.facts.find((f) => f.label === "Vintage")?.value).toBe("2025-11-02");
  });

  it("citation appendix groups by section with freshness verdicts", () => {
    expect(vm.citations.length).toBeGreaterThanOrEqual(3);
    const zoningCite = vm.citations.find((c) => c.sectionTitle === "Zoning")!;
    expect(zoningCite.freshness).toBe("fresh"); // stamped 2026-07-10, now 07-28
    const luCite = vm.citations.find((c) => c.sectionTitle === "Land use")!;
    expect(luCite.freshness).toBe("aging"); // vintage 2025-11-02
    // Municode has no vintage — freshness falls back to bakedAt (fresh).
    const codeCite = vm.citations.find((c) =>
      (c.url ?? "").includes("municode.com"),
    )!;
    expect(codeCite.vintage).toBeNull();
    expect(codeCite.freshness).toBe("fresh");
    // 1-based, unique indices.
    expect(new Set(vm.citations.map((c) => c.index)).size).toBe(
      vm.citations.length,
    );
    expect(Math.min(...vm.citations.map((c) => c.index))).toBe(1);
  });

  it("disclosures pass through verbatim", () => {
    expect(vm.disclosures).toEqual([
      "One or more scalar setbacks are not specified in the code (build-to-line governs).",
    ]);
  });

  it("never invents confidence — no fact mentions confidence", () => {
    for (const section of vm.sections) {
      for (const fact of section.facts) {
        expect(fact.label.toLowerCase()).not.toContain("confidence");
        expect(fact.value.toLowerCase()).not.toContain("confidence");
      }
    }
  });
});

describe("deriveBriefViewModel — unzoned parcel (honest absences)", () => {
  const vm = deriveBriefViewModel(UNZONED_BRIEF, FIXTURE_NOW_MS);

  it("zoning is honest-absent in the app idiom", () => {
    const zoning = vm.sections.find((s) => s.id === "zoning")!;
    expect(zoning.kind).toBe("absent");
    expect(zoning.absentMessage).toContain("not verified here");
    expect(zoning.absentMessage).toContain("no zoning stamp");
    expect(zoning.facts).toHaveLength(0);
  });

  it("declined envelope is absent and carries the decline reason", () => {
    const env = vm.sections.find((s) => s.id === "setbacks-envelope")!;
    expect(env.kind).toBe("absent");
    expect(env.absentMessage).toContain("not verified here");
    expect(env.absentMessage).toContain("no zoning stamp");
    // Payload disclosure surfaces verbatim as a note.
    expect(env.notes.join(" ")).toContain("honest absence");
  });

  it("unavailable flood is absent with the honest reason — never a fabricated zone", () => {
    const flood = vm.sections.find((s) => s.id === "flood")!;
    expect(flood.kind).toBe("absent");
    expect(flood.absentMessage).toContain("FEMA NFHL fetch failed");
    expect(flood.facts).toHaveLength(0);
  });

  it("null land use is absent", () => {
    const lu = vm.sections.find((s) => s.id === "land-use")!;
    expect(lu.kind).toBe("absent");
    expect(lu.absentMessage).toContain("not verified here");
  });

  it("null bakedAt surfaces as null (renderers say not recorded)", () => {
    expect(vm.header.bakedAt).toBeNull();
  });

  it("no citations are fabricated for an absence-only payload", () => {
    expect(vm.citations).toHaveLength(0);
  });
});

describe("deriveBriefViewModel — unknown section ids (forward compatibility)", () => {
  const vm = deriveBriefViewModel(UNKNOWN_SECTION_BRIEF, FIXTURE_NOW_MS);

  it("renders an unknown section generically as a key-value fact list", () => {
    const wildfire = vm.sections.find((s) => s.id === "wildfire-risk")!;
    expect(wildfire.kind).toBe("facts");
    expect(wildfire.title).toBe("Wildfire risk");
    const byLabel = Object.fromEntries(
      wildfire.facts.map((f) => [f.label, f.value]),
    );
    expect(byLabel["score"]).toBe("3");
    expect(byLabel["band"]).toBe("moderate");
    expect(byLabel["inputs.fuelModel"]).toBe("GR2");
    expect(byLabel["inputs.slopeClass"]).toBe("low");
    expect(byLabel["tags"]).toBe("wui, state-assessed");
  });

  it("unknown-section facts never fabricate a source", () => {
    const wildfire = vm.sections.find((s) => s.id === "wildfire-risk")!;
    for (const fact of wildfire.facts) {
      expect(fact.provenance).toBeNull();
    }
  });

  it("the unknown section's citation URLs still reach the appendix", () => {
    const cite = vm.citations.find((c) => c.sectionTitle === "Wildfire risk")!;
    expect(cite.url).toBe("https://example.gov/wildfire-layer");
  });

  it("an unknown section with null data is honest-absent, not a crash", () => {
    const school = vm.sections.find((s) => s.id === "school-district")!;
    expect(school.kind).toBe("absent");
    expect(school.absentMessage).toContain("not verified here");
  });
});
