// CTX-B4 (OPS-16 P-124, downstream of operator ruling A1) — the served
// valuation label must say what the value actually is.
//
// The violation this file exists to catch, in one sentence: a StratMap-sourced
// dollar and a genuine county-appraisal-export dollar rendered BYTE-IDENTICALLY
// on the card, both under the heading "Tax-assessed value" and both attributed
// to "<County> County appraisal roll".
//
// HOW THE VIOLATION WAS OBSERVED. These tests were written and run against a
// first commit on this branch in which `taxValuationRowHeading`,
// `taxValuationBasisLine` and `taxValuationSourceLabel` were STUBBED to their
// pre-CTX-B4 behaviour — one heading, one line, one source label for every
// basis — with the rest of the plumbing already in place. The stratmap cases
// below failed there and the county-assessed control passed. The second commit
// removed the stubs and every case passes. Checking out that first commit and
// running this file reproduces the failure; the transcript is in
// `_inbox/2026-09-10_ctx-b4_cp2.json`.
//
// The fixtures are the two parcels measured on the production Smart Site
// connector at paid depth on 2026-09-10 and named in the dispatch:
//
//   48309:184293  311 Austin Ave, Waco    market 6,506,490   StratMap-redistributed
//   48055:32541   308 W San Antonio       market 1,884,580   genuine county export

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FactRow, ROW_SPECS, toFactPresentation } from "./InspectCard";
import { taxValuationFromCadRoll } from "../lib/fact-sheet-resolver";
import { taxValuationFacetFromSheet } from "../lib/sheet-to-card-model";
import type { BakedFacetPayload } from "../lib/baked-facets";

/**
 * WHAT A VIEWER ACTUALLY SEES: tags stripped, entities decoded.
 *
 * Added after the first violation run, which produced two failures that were
 * defects in THIS FILE rather than in the code under test, both from asserting
 * against raw markup:
 *
 *   1. `toContain("... County's own appraisal-roll export.")` failed on a row
 *      that rendered exactly that, because React escapes the apostrophe to
 *      `&#x27;`. The county-assessed control was pre-registered as MUST PASS
 *      at commit 1, and it failing is what surfaced this.
 *   2. The "no market-opinion vocabulary" regex matched the string
 *      `data-testid="valuation-basis"` — the test tripping over its own hook.
 *
 * Copy assertions run on this. Structural assertions (data attributes, test
 * ids) still run on the raw markup, where they belong.
 */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The offline-baked field shape: no `state` key, an optional `valueBasis`. */
function bakedDollar(v: number, valueBasis?: string) {
  return valueBasis === undefined
    ? { v, source: "cad_property", vintage: "2025" }
    : { v, source: "cad_property", vintage: "2025", valueBasis };
}

function facetsFor(
  countyName: string,
  cadRoll: Record<string, unknown>,
): BakedFacetPayload {
  return {
    countyName,
    bakedAt: "2026-09-08T00:00:00.000Z",
    baseFacts: { cadRoll },
  } as BakedFacetPayload;
}

/**
 * The REAL production chain, end to end, minus the two lines inside
 * InspectCard that pick the label — which are pinned separately below by
 * reading the source, because `renderToStaticMarkup` never runs effects and
 * the full card cannot be driven past `source==="loading"` in this harness
 * (the same constraint every other InspectCard test in this directory works
 * around).
 *
 *   taxValuationFromCadRoll -> ParcelFactSheet.taxValuation
 *     -> taxValuationFacetFromSheet -> BakedCardModel.taxValuation
 *     -> toFactPresentation -> FactRow
 */
function renderRow(countyName: string, cadRoll: Record<string, unknown>) {
  const fact = taxValuationFromCadRoll(facetsFor(countyName, cadRoll));
  const facet = taxValuationFacetFromSheet(fact, countyName);
  const heading = facet.valuationBasis?.heading ?? "Tax-assessed value";
  const html = renderToStaticMarkup(
    <FactRow
      label={heading}
      fact={toFactPresentation(facet, ROW_SPECS.taxValuation)}
      testid="inspect-tax-valuation"
    />,
  );
  return { fact, facet, heading, html, text: visibleText(html) };
}

/** McLennan 48309:184293 — the StratMap-redistributed parcel. */
const STRATMAP_ROLL = {
  marketValue: bakedDollar(6506490, "stratmap-redistributed"),
  landValue: bakedDollar(6124540, "stratmap-redistributed"),
  improvementValue: bakedDollar(381950, "stratmap-redistributed"),
  // Structurally null on every StratMap row: the adapter hard-codes it, which
  // is the discriminator CTX-B1 derives the basis from in the first place.
  assessedValue: null,
};

/** Caldwell 48055:32541 — the genuine county-appraisal-export control. */
const COUNTY_ROLL = {
  marketValue: bakedDollar(1884580, "county-assessed"),
  landValue: bakedDollar(431050, "county-assessed"),
  improvementValue: bakedDollar(1453530, "county-assessed"),
  assessedValue: bakedDollar(1884580, "county-assessed"),
};

describe("CTX-B4 required violation: a stratmap-redistributed dollar must not render the county-appraisal wording", () => {
  const { html, text, heading, fact, facet } = renderRow("McLennan", STRATMAP_ROLL);

  it("does not render the heading 'Tax-assessed value'", () => {
    expect(heading).not.toBe("Tax-assessed value");
    expect(html).not.toContain("Tax-assessed value");
  });

  it("does not attribute the figure to the county appraisal roll, anywhere on the face", () => {
    expect(text).not.toContain("appraisal roll");
    expect(text).not.toContain("McLennan County's own appraisal-roll export.");
    expect(text).not.toMatch(/McLennan County[^.]*appraisal-roll export/);
  });

  it("does not carry the county-appraisal source label on the sheet's provenance either", () => {
    expect(fact.state).toBe("present");
    if (fact.state !== "present") return;
    expect(fact.provenance.sourceLabel).not.toContain("appraisal roll");
    expect(fact.provenance.sourceLabel).toBe("Texas StratMap statewide parcel file");
  });

  it("names the real source on the card FACE, with no tap and no tooltip", () => {
    expect(text).toContain("Texas StratMap statewide parcel file");
    expect(html).toContain('data-testid="valuation-basis"');
    expect(html).toContain('data-value-basis="stratmap-redistributed"');
  });

  it("still serves the dollars, present and unchanged — ruling A1 refused turning this into an absence", () => {
    expect(fact.state).toBe("present");
    if (fact.state !== "present") return;
    expect(fact.value.marketValue).toBe(6506490);
    expect(fact.value.landValue).toBe(6124540);
    expect(fact.value.improvementValue).toBe(381950);
    expect(html).toContain("Market $6,506,490");
    expect(html).toContain('data-state="present"');
    expect(html).not.toContain('data-absent="true"');
    expect(facet.state).toBe("present");
  });

  it("renders no confidence number, degraded badge or refusal", () => {
    expect(text).not.toMatch(/confiden/i);
    expect(text).not.toMatch(/\d{1,3}\s*%/);
    expect(text).not.toMatch(/degraded|unavailable|refused|unknown|not verified/i);
  });

  it("uses no market-opinion vocabulary, which A-103 item 5 and Masters 06 forbid", () => {
    // On the VISIBLE TEXT, not the markup. The first run of this assertion
    // matched `data-testid="valuation-basis"` and failed on the test's own
    // hook rather than on anything a viewer would read.
    expect(text).not.toMatch(/valuation|worth|estimate|estimated|modelled|modeled|approximate/i);
  });
});

describe("CTX-B4 control: a genuine county-assessed dollar is unchanged", () => {
  const { html, text, heading, fact } = renderRow("Caldwell", COUNTY_ROLL);

  it("keeps the heading operator ruling A-103 item 5 set", () => {
    expect(heading).toBe("Tax-assessed value");
    expect(text).toContain("Tax-assessed value");
  });

  it("keeps the county appraisal-roll source label on the sheet's provenance", () => {
    expect(fact.state).toBe("present");
    if (fact.state !== "present") return;
    expect(fact.provenance.sourceLabel).toBe("Caldwell County appraisal roll");
  });

  it("serves all four dollars, assessed included, exactly as before", () => {
    expect(fact.state).toBe("present");
    if (fact.state !== "present") return;
    expect(fact.value.display).toBe(
      "Market $1,884,580 · Land $431,050 · Improvement $1,453,530 · Assessed $1,884,580",
    );
    expect(html).toContain('data-value-basis="county-assessed"');
  });

  it("states its source positively on the face rather than by silence", () => {
    // Load-bearing. If the basis line appeared ONLY when something was off,
    // a row that lost the line to a bug or a stale bake would be
    // indistinguishable from a genuine county figure, and silence would read
    // as the strongest claim on the card.
    expect(html).toContain('data-testid="valuation-basis"');
    expect(text).toContain("From Caldwell County's own appraisal-roll export.");
  });

  it("says nothing about StratMap", () => {
    expect(text).not.toContain("StratMap");
  });
});

describe("CTX-B4: the two parcels are distinguishable, which is the whole point", () => {
  // ONE county name across both fixtures, deliberately. The first version of
  // this block rendered McLennan against Caldwell, and "renders different
  // basis lines" PASSED against the stubbed build — because the two county
  // names differed, not because the two bases did. A test that passes for a
  // reason unrelated to what it claims to check is not a check. Holding the
  // county constant leaves the basis as the only thing that can vary.
  const stratmap = renderRow("McLennan", STRATMAP_ROLL);
  const county = renderRow("McLennan", COUNTY_ROLL);

  it("renders different headings", () => {
    expect(stratmap.heading).not.toBe(county.heading);
  });

  it("renders different basis lines", () => {
    expect(stratmap.facet.valuationBasis?.line).not.toBe(
      county.facet.valuationBasis?.line,
    );
  });

  it("carries different machine-readable bases", () => {
    expect(stratmap.facet.valuationBasis?.basis).toBe("stratmap-redistributed");
    expect(county.facet.valuationBasis?.basis).toBe("county-assessed");
  });

  it("keeps ONE machine identity across both, so a compare surface still sees one row", () => {
    expect(stratmap.html).toContain('data-testid="inspect-tax-valuation"');
    expect(county.html).toContain('data-testid="inspect-tax-valuation"');
  });
});

describe("CTX-B4: an ABSENT valueBasis is its own state and is never defaulted", () => {
  // The explicit decision the dispatch demanded. An older baked payload
  // carries dollars and no basis at all. Reading that as county-assessed
  // would write the claim "someone checked and it is the county's" onto a
  // record where nothing checked.
  const noBasisRoll = {
    marketValue: bakedDollar(245000),
    landValue: bakedDollar(52000),
    improvementValue: bakedDollar(193000),
    assessedValue: bakedDollar(245000),
  };
  const { html, text, heading, fact, facet } = renderRow("Bastrop", noBasisRoll);

  it("resolves to `unstated`, not to either wire member", () => {
    expect(facet.valuationBasis?.basis).toBe("unstated");
    expect(html).toContain('data-value-basis="unstated"');
  });

  it("does not claim the county appraisal roll", () => {
    expect(heading).not.toBe("Tax-assessed value");
    expect(text).not.toContain("Tax-assessed value");
    expect(text).not.toContain("appraisal-roll export");
    expect(fact.state).toBe("present");
    if (fact.state !== "present") return;
    expect(fact.provenance.sourceLabel).toBe(
      "Bastrop County parcel record, source not stated",
    );
  });

  it("says so in words on the face", () => {
    expect(text).toContain("This record does not state which source the figure came from.");
  });

  it("still serves the dollars", () => {
    expect(text).toContain("Market $245,000");
    expect(html).toContain('data-state="present"');
  });
});

describe("CTX-B4: a basis this build cannot read is NOT folded into `unstated`", () => {
  // The record stated a source and the reader failed. That is a contract
  // drift this surface must show rather than absorb, and the raw token is
  // printed so it is diagnosable from a screenshot.
  const futureRoll = {
    marketValue: bakedDollar(100000, "some-future-tier"),
    landValue: bakedDollar(40000, "some-future-tier"),
    improvementValue: bakedDollar(60000, "some-future-tier"),
    assessedValue: null,
  };
  const { html, text, facet, fact } = renderRow("Hays", futureRoll);

  it("resolves to `unrecognised` and keeps the token", () => {
    expect(facet.valuationBasis?.basis).toBe("unrecognised");
    expect(facet.valuationBasis?.unrecognisedToken).toBe("some-future-tier");
    expect(html).toContain('data-value-basis="unrecognised"');
  });

  it("prints the token it could not read", () => {
    expect(text).toContain("some-future-tier");
    expect(fact.state).toBe("present");
    if (fact.state !== "present") return;
    expect(fact.provenance.sourceLabel).toContain("some-future-tier");
  });

  it("is a different state from `unstated`, not a synonym for it", () => {
    expect(text).not.toContain("This record does not state which source the figure came from.");
  });

  it("does not claim the county appraisal roll", () => {
    expect(text).not.toContain("Tax-assessed value");
    expect(text).not.toContain("appraisal-roll export");
  });
});

describe("CTX-B4: rails that disagree are reported, not rounded off", () => {
  // legacy-design-tools resolves ONE basis per parcel and stamps all four
  // rails with it, but that is an invariant of NEW bakes, not a property of
  // every payload already in the store. Taking the first rail silently would
  // hide exactly the finding worth having.
  const disagreeingRoll = {
    marketValue: bakedDollar(300000, "county-assessed"),
    landValue: bakedDollar(80000, "stratmap-redistributed"),
    improvementValue: bakedDollar(220000, "county-assessed"),
    assessedValue: null,
  };
  const { html, text, facet } = renderRow("Travis", disagreeingRoll);

  it("resolves to `mixed` rather than picking a rail", () => {
    expect(facet.valuationBasis?.basis).toBe("mixed");
    expect(html).toContain('data-value-basis="mixed"');
  });

  it("says so on the face", () => {
    expect(text).toContain("The amounts on this record do not agree on their source.");
  });

  it("does not claim the county appraisal roll on the strength of one agreeing rail", () => {
    expect(text).not.toContain("Tax-assessed value");
    expect(text).not.toContain("appraisal-roll export");
  });
});

describe("CTX-B4: the InspectCard label is no longer a constant", () => {
  // The two lines the render harness above cannot reach. Pinned by reading
  // the source, the same seam InspectCard.test.tsx already uses for the
  // persona-removal check.
  const src = readFileSync(resolve(__dirname, "InspectCard.tsx"), "utf8");

  it("no longer hard-codes the tax-valuation row heading", () => {
    expect(src).not.toContain('label: "Tax-assessed value"');
  });

  it("reads the heading off the resolved basis", () => {
    expect(src).toContain("baked.taxValuation.valuationBasis.heading");
  });

  it("keeps the row's machine identity fixed", () => {
    expect(src).toContain('key: "taxValuation"');
    expect(src).toContain('testid: "inspect-tax-valuation"');
  });
});
