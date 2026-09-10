// CTX-B4 (OPS-16 P-124) — the valuation-basis vocabulary itself.
//
// The render-level violation lives in
// `src/browse/tax-valuation-basis-label.test.tsx`. This file pins the
// resolution rules underneath it, and in particular the three states that
// exist beyond the wire's own two, each of which is a state a previous version
// of this code would have collapsed into `county-assessed`.

import { describe, expect, it } from "vitest";
import {
  COUNTY_ASSESSED_BASIS,
  KNOWN_VALUE_BASIS_TOKENS,
  STRATMAP_REDISTRIBUTED_BASIS,
  presentValuationBasis,
  readValuationBasis,
  resolveValuationBasis,
  taxValuationBasisLine,
  taxValuationRowHeading,
  taxValuationSourceLabel,
  valueBasisTokenOf,
  type ValuationBasis,
} from "./valuation-basis";

const ALL_BASES: ValuationBasis[] = [
  COUNTY_ASSESSED_BASIS,
  STRATMAP_REDISTRIBUTED_BASIS,
  "unstated",
  "unrecognised",
  "mixed",
];

function baked(v: number, valueBasis?: string) {
  return valueBasis === undefined
    ? { v, source: "cad_property", vintage: "2025" }
    : { v, source: "cad_property", vintage: "2025", valueBasis };
}

describe("valueBasisTokenOf — reads a token off any shape the field arrives in", () => {
  it("reads the offline-baked shape (no `state` key)", () => {
    expect(valueBasisTokenOf(baked(1, "county-assessed"))).toBe("county-assessed");
  });

  it("reads the live-overlay `present` and `zero` wires", () => {
    expect(
      valueBasisTokenOf({ state: "present", v: 1, valueBasis: "stratmap-redistributed" }),
    ).toBe("stratmap-redistributed");
    expect(valueBasisTokenOf({ state: "zero", v: 0, valueBasis: "county-assessed" })).toBe(
      "county-assessed",
    );
  });

  it("returns null for an absence, a refusal, a null and a non-object", () => {
    expect(valueBasisTokenOf({ state: "absent" })).toBeNull();
    expect(valueBasisTokenOf({ state: "refused", code: "studio-gated" })).toBeNull();
    expect(valueBasisTokenOf(null)).toBeNull();
    expect(valueBasisTokenOf(undefined)).toBeNull();
    expect(valueBasisTokenOf(42)).toBeNull();
    expect(valueBasisTokenOf(["county-assessed"])).toBeNull();
  });

  it("refuses a sentinel: an empty or whitespace-only basis is the ABSENCE of a token", () => {
    expect(valueBasisTokenOf(baked(1, ""))).toBeNull();
    expect(valueBasisTokenOf(baked(1, "   "))).toBeNull();
  });

  it("refuses a non-string basis rather than coercing it", () => {
    expect(valueBasisTokenOf({ v: 1, valueBasis: 7 })).toBeNull();
    expect(valueBasisTokenOf({ v: 1, valueBasis: true })).toBeNull();
    expect(valueBasisTokenOf({ v: 1, valueBasis: null })).toBeNull();
  });
});

describe("resolveValuationBasis — one determination per record", () => {
  it("all four rails agreeing on county-assessed resolves to county-assessed", () => {
    expect(
      resolveValuationBasis({
        marketValue: baked(1, "county-assessed"),
        landValue: baked(2, "county-assessed"),
        improvementValue: baked(3, "county-assessed"),
        assessedValue: baked(4, "county-assessed"),
      }),
    ).toEqual({ basis: "county-assessed", unrecognisedToken: null });
  });

  it("the three rails a StratMap row can carry resolve to stratmap-redistributed", () => {
    expect(
      resolveValuationBasis({
        marketValue: baked(6506490, "stratmap-redistributed"),
        landValue: baked(6124540, "stratmap-redistributed"),
        improvementValue: baked(381950, "stratmap-redistributed"),
        assessedValue: null,
      }),
    ).toEqual({ basis: "stratmap-redistributed", unrecognisedToken: null });
  });

  it("a null record is `unstated`, never a member", () => {
    expect(resolveValuationBasis(null)).toEqual({
      basis: "unstated",
      unrecognisedToken: null,
    });
    expect(resolveValuationBasis(undefined)).toEqual({
      basis: "unstated",
      unrecognisedToken: null,
    });
  });

  it("dollars with no basis on any rail are `unstated`, never `county-assessed`", () => {
    expect(
      resolveValuationBasis({
        marketValue: baked(245000),
        landValue: baked(52000),
        improvementValue: baked(193000),
        assessedValue: baked(245000),
      }),
    ).toEqual({ basis: "unstated", unrecognisedToken: null });
  });

  it("a token this build does not know is `unrecognised` AND keeps its word", () => {
    expect(
      resolveValuationBasis({ marketValue: baked(1, "some-future-tier") }),
    ).toEqual({ basis: "unrecognised", unrecognisedToken: "some-future-tier" });
  });

  it("rails that disagree are `mixed` — not first-rail-wins", () => {
    const mixed = resolveValuationBasis({
      marketValue: baked(1, "county-assessed"),
      landValue: baked(2, "stratmap-redistributed"),
    });
    expect(mixed.basis).toBe("mixed");
    // The falsifier for this test: if the resolver took the first rail it
    // would answer "county-assessed" here, and this assertion is what makes
    // that visible rather than convenient.
    expect(mixed.basis).not.toBe("county-assessed");
  });

  it("disagreement is order-independent", () => {
    expect(
      resolveValuationBasis({
        marketValue: baked(1, "stratmap-redistributed"),
        landValue: baked(2, "county-assessed"),
      }).basis,
    ).toBe("mixed");
  });

  it("one basis plus rails that carry NO basis is not `mixed` — an absence is not a disagreement", () => {
    expect(
      resolveValuationBasis({
        marketValue: baked(1, "county-assessed"),
        landValue: baked(2),
        improvementValue: null,
        assessedValue: { state: "absent" },
      }).basis,
    ).toBe("county-assessed");
  });

  it("only the four dollar rails are consulted", () => {
    // A stray sibling must not become the record's basis.
    expect(
      resolveValuationBasis({
        marketValue: baked(1, "county-assessed"),
        livingAreaSqft: baked(2, "stratmap-redistributed"),
      }).basis,
    ).toBe("county-assessed");
  });
});

describe("readValuationBasis — narrowing a basis back after the sheet crossing", () => {
  it("the four determinate members pass through", () => {
    expect(readValuationBasis("county-assessed").basis).toBe("county-assessed");
    expect(readValuationBasis("stratmap-redistributed").basis).toBe(
      "stratmap-redistributed",
    );
    expect(readValuationBasis("unstated").basis).toBe("unstated");
    expect(readValuationBasis("mixed").basis).toBe("mixed");
  });

  it("`unrecognised` keeps the token it was handed", () => {
    expect(readValuationBasis("unrecognised", "some-future-tier")).toEqual({
      basis: "unrecognised",
      unrecognisedToken: "some-future-tier",
    });
  });

  it("an absent or blank field is `unstated`, never `county-assessed`", () => {
    expect(readValuationBasis(undefined).basis).toBe("unstated");
    expect(readValuationBasis(null).basis).toBe("unstated");
    expect(readValuationBasis("").basis).toBe("unstated");
    expect(readValuationBasis("   ").basis).toBe("unstated");
    expect(readValuationBasis(7).basis).toBe("unstated");
  });

  it("a string in neither vocabulary is `unrecognised` and keeps ITSELF as the token", () => {
    expect(readValuationBasis("county-assesed")).toEqual({
      basis: "unrecognised",
      unrecognisedToken: "county-assesed",
    });
  });

  it("round-trips every resolution the resolver can produce", () => {
    for (const basis of ALL_BASES) {
      const token = basis === "unrecognised" ? "some-future-tier" : null;
      const back = readValuationBasis(basis, token);
      expect(back.basis).toBe(basis);
      expect(back.unrecognisedToken).toBe(token);
    }
  });
});

describe("the copy — headings", () => {
  it("keeps the operator-ruled heading exactly where it is true", () => {
    expect(taxValuationRowHeading("county-assessed")).toBe("Tax-assessed value");
  });

  it("does not claim a tax assessment on any other basis", () => {
    for (const basis of ALL_BASES.filter((b) => b !== "county-assessed")) {
      expect(taxValuationRowHeading(basis)).not.toBe("Tax-assessed value");
      expect(taxValuationRowHeading(basis)).not.toMatch(/tax|assess|appraisal/i);
    }
  });

  it("uses no market-opinion vocabulary on any basis", () => {
    for (const basis of ALL_BASES) {
      expect(taxValuationRowHeading(basis)).not.toMatch(
        /valuation|worth|estimate|modell?ed|approximate/i,
      );
    }
  });
});

describe("the copy — basis lines and source labels", () => {
  const county = (basis: ValuationBasis, token: string | null = null) =>
    taxValuationBasisLine({ basis, unrecognisedToken: token }, "McLennan");

  it("every basis produces a non-empty sentence — no basis renders as silence", () => {
    for (const basis of ALL_BASES) {
      const line = county(basis, basis === "unrecognised" ? "some-future-tier" : null);
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line.trim().endsWith(".")).toBe(true);
    }
  });

  it("every basis produces a DISTINCT sentence — none is a synonym for another", () => {
    const lines = ALL_BASES.map((basis) =>
      county(basis, basis === "unrecognised" ? "some-future-tier" : null),
    );
    expect(new Set(lines).size).toBe(ALL_BASES.length);
  });

  it("every basis produces a distinct source label too", () => {
    const labels = ALL_BASES.map((basis) =>
      taxValuationSourceLabel(
        { basis, unrecognisedToken: basis === "unrecognised" ? "x" : null },
        "McLennan",
      ),
    );
    expect(new Set(labels).size).toBe(ALL_BASES.length);
  });

  it("no basis but county-assessed mentions the county appraisal roll AT ALL, denial included", () => {
    for (const basis of ALL_BASES.filter((b) => b !== "county-assessed")) {
      expect(county(basis, "some-future-tier")).not.toMatch(/appraisal/i);
    }
  });

  it("only county-assessed claims the county's own appraisal export", () => {
    expect(county("county-assessed")).toBe(
      "From McLennan County's own appraisal-roll export.",
    );
    for (const basis of ALL_BASES.filter((b) => b !== "county-assessed")) {
      const line = county(basis, "some-future-tier");
      expect(line).not.toContain("From McLennan County's own appraisal-roll export.");
    }
  });

  it("the stratmap line names the real source and does not repeat the false one, even to deny it", () => {
    expect(county("stratmap-redistributed")).toBe(
      "From the Texas StratMap statewide parcel file.",
    );
    // The denial form was rejected: on a muted 11.5px line the phrase a
    // skim-reader lands on would have been the county-appraisal claim this
    // lane exists to remove. The heading carries the non-claim instead.
    expect(county("stratmap-redistributed")).not.toMatch(/appraisal/i);
    expect(county("stratmap-redistributed")).not.toContain("McLennan");
  });

  it("an unrecognised token is printed, never swallowed", () => {
    expect(county("unrecognised", "some-future-tier")).toContain("some-future-tier");
    expect(
      taxValuationSourceLabel(
        { basis: "unrecognised", unrecognisedToken: "some-future-tier" },
        "McLennan",
      ),
    ).toContain("some-future-tier");
  });

  it("a missing county name degrades to a phrase, never to an empty slot or 'undefined'", () => {
    for (const name of [null, undefined, "", "   "]) {
      const line = taxValuationBasisLine(
        { basis: "county-assessed", unrecognisedToken: null },
        name,
      );
      expect(line).toBe("From the county's own appraisal-roll export.");
      expect(line).not.toMatch(/undefined|null/);
    }
  });

  it("no line or label carries a confidence number", () => {
    for (const basis of ALL_BASES) {
      const line = county(basis, "x");
      expect(line).not.toMatch(/\d+\s*%/);
      expect(line).not.toMatch(/confiden/i);
    }
  });

  it("no line tells the reader the value is missing — ruling A1 refused that", () => {
    for (const basis of ALL_BASES) {
      expect(county(basis, "x")).not.toMatch(
        /missing|unavailable|no value|not available|refused|degraded/i,
      );
    }
  });
});

describe("presentValuationBasis — composed once, at the boundary that knows the county", () => {
  it("carries basis, token, heading and line together", () => {
    expect(
      presentValuationBasis(
        { basis: "stratmap-redistributed", unrecognisedToken: null },
        "McLennan",
      ),
    ).toEqual({
      basis: "stratmap-redistributed",
      unrecognisedToken: null,
      heading: "Recorded value",
      line: "From the Texas StratMap statewide parcel file.",
    });
  });

  it("agrees with the two copy functions it composes, on every basis", () => {
    for (const basis of ALL_BASES) {
      const resolved = {
        basis,
        unrecognisedToken: basis === "unrecognised" ? "some-future-tier" : null,
      };
      const p = presentValuationBasis(resolved, "Caldwell");
      expect(p.heading).toBe(taxValuationRowHeading(basis));
      expect(p.line).toBe(taxValuationBasisLine(resolved, "Caldwell"));
    }
  });
});

describe("the known-token list is the same list the resolver recognises", () => {
  it("every listed token resolves to itself", () => {
    for (const token of KNOWN_VALUE_BASIS_TOKENS) {
      expect(resolveValuationBasis({ marketValue: baked(1, token) }).basis).toBe(token);
    }
  });

  it("a token NOT on the list does not resolve to a member", () => {
    const off = "some-future-tier";
    expect(KNOWN_VALUE_BASIS_TOKENS).not.toContain(off);
    expect(resolveValuationBasis({ marketValue: baked(1, off) }).basis).toBe(
      "unrecognised",
    );
  });
});
