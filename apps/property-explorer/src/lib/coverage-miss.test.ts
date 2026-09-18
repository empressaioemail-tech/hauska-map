// P-353 — the sentence, one per class, and the two rules that make it honest.
//
// This file PINS THE WORDING (by literal) and the discriminability of the four
// sentences. The wiring — which surface shows which sentence — is asserted in
// `geocode-coverage-notice.test.ts`, `parcel-lookup-coverage.test.ts` and
// `SearchBar-coverage.test.tsx`; the wire-reading half is asserted here too.
//
// POST-CHANGE ONLY: `coverage-miss.ts` did not exist at 163fde32, so this file
// cannot be loaded against the reverted tree (it fails at import, not on an
// assertion). Its pre-change direction is the recorded import failure, plus the
// fact that before this change no module could turn a class into words at all —
// the two Find paths each printed a generic sentence (`HONEST_SEARCH_MISS` and
// "No matches, try a fuller address").

import { describe, expect, it } from "vitest";
import {
  COVERAGE_MISS_CLASSES,
  coverageMissFromWire,
  coverageMissSentence,
  isOutOfCoverage,
  type CoverageMiss,
} from "./coverage-miss";

const CAMERON = {
  hits: [],
  missClass: "county_out_of_coverage",
  outOfCoverageCounty: {
    countyFips: "48331",
    countyName: "Milam County",
    state: "TX",
  },
};

const MARBLE_FALLS = {
  hits: [],
  missClass: "county_out_of_coverage",
  outOfCoverageCounty: {
    countyFips: "48053",
    countyName: "Burnet County",
    state: "TX",
  },
};

const DENVER = { hits: [], missClass: "out_of_coverage", outOfCoverageState: "CO" };
const AUSTIN = { hits: [], missClass: "no-hit" };
const UNAVAILABLE = {
  hits: [],
  missClass: "coverage_check_unavailable",
  coverageCheckUnavailableReason: "cortex timed out after 9000ms",
};

function read(json: unknown): CoverageMiss {
  const miss = coverageMissFromWire(json);
  if (!miss) throw new Error("expected a coverage miss");
  return miss;
}

describe("reading the class out of a wire body", () => {
  it("reads every one of the four classes", () => {
    expect(read(AUSTIN).missClass).toBe("no-hit");
    expect(read(CAMERON).missClass).toBe("county_out_of_coverage");
    expect(read(DENVER).missClass).toBe("out_of_coverage");
    expect(read(UNAVAILABLE).missClass).toBe("coverage_check_unavailable");
  });

  it("reads the county block and the state code", () => {
    expect(read(CAMERON).county).toEqual({
      countyFips: "48331",
      countyName: "Milam County",
      state: "TX",
    });
    expect(read(DENVER).state).toBe("CO");
  });

  it("marks all four as recognised and an outside class as not", () => {
    for (const json of [AUSTIN, CAMERON, DENVER, UNAVAILABLE]) {
      expect(read(json).recognised).toBe(true);
    }
    const budget = read({ hits: [], missClass: "situs-search-budget-exceeded" });
    expect(budget.recognised).toBe(false);
    expect(COVERAGE_MISS_CLASSES).not.toContain("situs-search-budget-exceeded");
  });

  it("is null when there is nothing to read — no class is ever defaulted", () => {
    expect(coverageMissFromWire({ hits: [] })).toBeNull();
    expect(coverageMissFromWire({ hits: [], missClass: "  " })).toBeNull();
    expect(coverageMissFromWire(null)).toBeNull();
    expect(coverageMissFromWire("garbage")).toBeNull();
  });

  it("is null on a hits-carrying body: the question was never asked", () => {
    expect(
      coverageMissFromWire({ hits: [{ parcelNodeId: "48021:1" }], missClass: "no-hit" }),
    ).toBeNull();
  });

  it("only the two out-of-coverage classes mean 'this PLACE is outside'", () => {
    expect(isOutOfCoverage(read(CAMERON))).toBe(true);
    expect(isOutOfCoverage(read(DENVER))).toBe(true);
    expect(isOutOfCoverage(read(AUSTIN))).toBe(false);
    expect(isOutOfCoverage(read(UNAVAILABLE))).toBe(false);
    expect(isOutOfCoverage(null)).toBe(false);
  });
});

describe("F3 — the sentences are distinct and carry their own facts", () => {
  const sentences = {
    "no-hit": coverageMissSentence(read(AUSTIN)),
    county_out_of_coverage: coverageMissSentence(read(CAMERON)),
    out_of_coverage: coverageMissSentence(read(DENVER)),
    coverage_check_unavailable: coverageMissSentence(read(UNAVAILABLE)),
  };

  it("four classes, four DIFFERENT sentences (a control that can discriminate)", () => {
    const all = Object.values(sentences);
    expect(new Set(all).size).toBe(4);
  });

  it("no-hit reads as a covered miss — it looked, and it found nothing", () => {
    expect(sentences["no-hit"]).toBe("No parcel in our records matches that address.");
  });

  it("county_out_of_coverage names the county AND the state", () => {
    expect(sentences.county_out_of_coverage).toBe(
      "We don't cover Milam County, TX yet, so that address is outside the area we can search.",
    );
    // Two different counties do not produce the same sentence.
    expect(coverageMissSentence(read(MARBLE_FALLS))).toBe(
      "We don't cover Burnet County, TX yet, so that address is outside the area we can search.",
    );
  });

  it("out_of_coverage names the state", () => {
    expect(sentences.out_of_coverage).toBe(
      "That address is outside our coverage area — we don't cover CO yet.",
    );
  });

  it("coverage_check_unavailable refuses to read as 'no results'", () => {
    const sentence = sentences.coverage_check_unavailable;
    expect(sentence).toMatch(/couldn't check coverage/i);
    expect(sentence).toMatch(/not a no-results answer/i);
    expect(sentence).not.toMatch(/No parcel in our records/);
    expect(sentence).not.toMatch(/No matches/);
  });

  it("a county answer missing its county block does not invent one", () => {
    const bare = coverageMissSentence(
      read({ hits: [], missClass: "county_out_of_coverage" }),
    );
    expect(bare).toBe("That address is outside the area we cover.");
    expect(bare).not.toContain("County");
  });

  it("an out-of-state answer missing the state code does not invent one", () => {
    const bare = coverageMissSentence(read({ hits: [], missClass: "out_of_coverage" }));
    expect(bare).toBe("That address is outside our coverage area.");
    expect(bare).not.toMatch(/\b[A-Z]{2}\b/);
  });

  it("an UNRECOGNISED class is not rendered as a covered miss", () => {
    const budget = coverageMissSentence(
      read({ hits: [], missClass: "situs-search-budget-exceeded" }),
    );
    expect(budget).toBe("The parcel search could not answer for that address just now.");
    expect(budget).not.toBe(sentences["no-hit"]);
  });

  it("a future class authored AFTER this build is also not a covered miss", () => {
    const future = coverageMissSentence(
      read({ hits: [], missClass: "some-class-from-the-future" }),
    );
    expect(future).toBe("The parcel search could not answer for that address just now.");
  });
});
