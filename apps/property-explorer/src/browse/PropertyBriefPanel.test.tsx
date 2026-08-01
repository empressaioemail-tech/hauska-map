// Component tests for PropertyBriefPanel via react-dom/server static render —
// runs in the repo's node vitest environment with no new dependencies. Covers
// the three payload postures: fully-zoned, unzoned/honest-absent, and
// unknown-section forward compatibility.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PropertyBriefPanel } from "./PropertyBriefPanel";
import {
  UNKNOWN_SECTION_BRIEF,
  UNZONED_BRIEF,
  ZONED_BRIEF,
} from "./__fixtures__/research-brief.fixture";

const noop = () => {};

describe("PropertyBriefPanel — zoned parcel", () => {
  const html = renderToStaticMarkup(
    <PropertyBriefPanel brief={ZONED_BRIEF} onClose={noop} />,
  );

  it("keeps the research-brief testid and renders a brief, not JSON", () => {
    expect(html).toContain('data-testid="research-brief"');
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("{&quot;");
  });

  it("header provenance block surfaces parcel, bakedAt, run, source, report", () => {
    expect(html).toContain("tx-bastrop-parcel-000123");
    expect(html).toContain("2026-07-21T09:00:00.000Z");
    expect(html).toContain("pe-r1-dGVzdA.MjAyNg");
    expect(html).toContain("baked snapshot");
    expect(html).toContain("Report: R1");
  });

  it("renders zoning district, readable setbacks, flood meaning, land use", () => {
    expect(html).toContain("P-2");
    expect(html).toContain("F 10′");
    expect(html).toContain("build-to-line governs");
    expect(html).toContain("Zone AE");
    expect(html).toContain("Special Flood Hazard Area");
    expect(html).toContain("Single family residence (code A1)");
  });

  it("facts carry source lines and appendix references", () => {
    expect(html).toContain("City zoning districts map (Bastrop, TX)");
    expect(html).toContain("FEMA NFHL");
    expect(html).toContain('data-testid="brief-citations"');
  });

  it("has the close control and the Export X-ray PDF button", () => {
    expect(html).toContain('aria-label="Close"');
    expect(html).toContain('data-testid="brief-close"');
    expect(html).toContain("Export X-ray PDF");
  });

  it("renders the concept explanations (static copy, no parcel claims)", () => {
    expect(html).toContain("minimum distance a structure must be kept");
  });

  it("W2: the verdict line LEADS the brief, before the cited detail", () => {
    expect(html).toContain('data-testid="brief-verdict"');
    // ZONED_BRIEF carries in-SFHA + FLOODWAY — the red flag leads the line.
    expect(html).toContain("Inside a FEMA floodway (Zone AE)");
    expect(html).toContain('data-tone="flag"');
    // Leading = the verdict appears BEFORE the provenance block and sections.
    const verdictAt = html.indexOf('data-testid="brief-verdict"');
    const provenanceAt = html.indexOf('data-testid="brief-provenance"');
    const firstSectionAt = html.indexOf('data-testid="brief-section-');
    expect(verdictAt).toBeGreaterThan(-1);
    expect(verdictAt).toBeLessThan(provenanceAt);
    expect(verdictAt).toBeLessThan(firstSectionAt);
  });
});

describe("PropertyBriefPanel — unzoned parcel", () => {
  const html = renderToStaticMarkup(
    <PropertyBriefPanel brief={UNZONED_BRIEF} onClose={noop} />,
  );

  it("absent sections use the honest idiom", () => {
    expect(html).toContain("not verified here");
    expect(html).toContain("no zoning stamp");
    expect(html).toContain("FEMA NFHL fetch failed");
  });

  it("null bakedAt renders as (not recorded)", () => {
    expect(html).toContain("Baked at: (not recorded)");
  });

  it("does not fabricate sources or a populated appendix", () => {
    expect(html).toContain("No sources are recorded");
  });

  it("W2: the verdict renders absences AS absences (no clean tail)", () => {
    expect(html).toContain('data-testid="brief-verdict"');
    expect(html).toContain("flood not verified here");
    expect(html).toContain('data-tone="caution"');
    expect(html).not.toContain("no red flags");
  });
});

describe("PropertyBriefPanel — unknown sections", () => {
  it("renders unknown section ids generically without crashing", () => {
    const html = renderToStaticMarkup(
      <PropertyBriefPanel brief={UNKNOWN_SECTION_BRIEF} onClose={noop} />,
    );
    expect(html).toContain("Wildfire risk");
    expect(html).toContain("inputs.fuelModel");
    expect(html).toContain("source not recorded");
    expect(html).toContain('data-testid="brief-section-school-district"');
    expect(html).toContain("not verified here");
  });
});
