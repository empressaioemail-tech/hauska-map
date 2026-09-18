// P-353 falsifiers F1 and F2 — the BFF's mapping carries the coverage answer.
//
// FIXTURES ARE THE LIVE UPSTREAM SHAPES, read at source, not from the brief:
// legacy-design-tools origin/main 25d1782f2e59bd5098b8459196ea828ae3580027,
// artifacts/api-server/src/lib/txgioAddressResolve.ts lines 1179-1198
// (`type SitusSearchMissClass` with the four classes + the budget refuse, and
// `PlaceSearchResult` with missClass / outOfCoverageState /
// outOfCoverageCounty{countyFips,countyName,state} /
// coverageCheckUnavailableReason), serialised verbatim by
// artifacts/api-server/src/routes/brokeragePlaceSitusSearch.ts. The county
// blocks are the ones the customer-leg probe already grades (see CP1).
//
// IMPORT NOTE (deliberate, and load-bearing for the falsifier): this file
// imports ONLY `mapSitusSearchResponse`, which exists at the pre-change
// commit 163fde32. That is what makes the revert-and-run direction possible —
// the same file, with the source reverted to 163fde32 under it, must FAIL
// these assertions rather than fail to load. A test that cannot be executed
// against the old code cannot show both directions.

import { describe, expect, it } from "vitest";
import { mapSitusSearchResponse } from "../../api/_lib/pe-situs-search-core";

/** Read the wire body without depending on the post-change response type. */
function body(json: unknown): Record<string, unknown> {
  return mapSitusSearchResponse(json) as unknown as Record<string, unknown>;
}

/** The four subjects the probe drives, and the exact body cortex answers with. */
const SUBJECTS = [
  {
    key: "coverage:austin",
    query: "99999 ZZYZX RD, AUSTIN, TX 78701",
    upstream: { hits: [], missClass: "no-hit" },
    owed: "no-hit",
  },
  {
    key: "coverage:cameron",
    query: "99999 ZZYZX RD, CAMERON, TX 76520",
    upstream: {
      hits: [],
      missClass: "county_out_of_coverage",
      outOfCoverageCounty: {
        countyFips: "48331",
        countyName: "Milam County",
        state: "TX",
      },
    },
    owed: "county_out_of_coverage",
    owedCounty: { countyFips: "48331", countyName: "Milam County", state: "TX" },
  },
  {
    key: "coverage:marble-falls",
    query: "99999 ZZYZX RD, MARBLE FALLS, TX 78654",
    upstream: {
      hits: [],
      missClass: "county_out_of_coverage",
      outOfCoverageCounty: {
        countyFips: "48053",
        countyName: "Burnet County",
        state: "TX",
      },
    },
    owed: "county_out_of_coverage",
    owedCounty: { countyFips: "48053", countyName: "Burnet County", state: "TX" },
  },
  {
    key: "coverage:denver",
    query: "1600 BROADWAY, DENVER, CO 80202",
    upstream: { hits: [], missClass: "out_of_coverage", outOfCoverageState: "CO" },
    owed: "out_of_coverage",
    owedState: "CO",
  },
] as const;

describe("F1 — every class cortex can send survives the BFF mapping", () => {
  for (const subject of SUBJECTS) {
    it(`${subject.key} serves missClass "${subject.owed}" beside an empty hits`, () => {
      const served = body(subject.upstream);
      expect(served.hits).toEqual([]);
      expect(served.missClass).toBe(subject.owed);
    });
  }

  it("county_out_of_coverage names the county, its FIPS and its state", () => {
    for (const subject of SUBJECTS) {
      if (!("owedCounty" in subject)) continue;
      expect(body(subject.upstream).outOfCoverageCounty).toEqual(subject.owedCounty);
    }
  });

  it("the two county subjects answer with DIFFERENT counties (the control can discriminate)", () => {
    const cameron = body(SUBJECTS[1].upstream).outOfCoverageCounty;
    const marbleFalls = body(SUBJECTS[2].upstream).outOfCoverageCounty;
    expect(cameron).not.toEqual(marbleFalls);
  });

  it("out_of_coverage names the state", () => {
    const served = body({
      hits: [],
      missClass: "out_of_coverage",
      outOfCoverageState: "CO",
    });
    expect(served.outOfCoverageState).toBe("CO");
  });

  it("a class NOBODY recognises is passed through, never relabelled", () => {
    // Upstream also refuses on a search budget: SITUS_SEARCH_BUDGET_ERROR,
    // "situs-search-budget-exceeded" (txgioAddressResolve.ts line 602). The
    // BFF does not know that class and must not fold it into one of the four.
    const served = body({
      hits: [],
      missClass: "situs-search-budget-exceeded",
    });
    expect(served.missClass).toBe("situs-search-budget-exceeded");
    expect(served).not.toHaveProperty("outOfCoverageCounty");
    expect(served).not.toHaveProperty("outOfCoverageState");
    expect(served).not.toHaveProperty("coverageCheckUnavailableReason");
  });

  it("an empty body with NO class stays empty — a class is never invented", () => {
    const served = body({ hits: [] });
    expect(served).toEqual({ hits: [] });
    expect(served).not.toHaveProperty("missClass");
  });

  it("malformed coverage blocks are dropped rather than served half-read", () => {
    const served = body({
      hits: [],
      missClass: "county_out_of_coverage",
      // countyName missing: a county answer the customer cannot read is not
      // an answer. The class still travels; the unreadable block does not.
      outOfCoverageCounty: { countyFips: "48331", state: "TX" },
    });
    expect(served.missClass).toBe("county_out_of_coverage");
    expect(served).not.toHaveProperty("outOfCoverageCounty");
  });
});

describe("F2 — a search that found hits is unchanged byte for byte", () => {
  // One node-bearing situs row and one address-point row, which is the shape
  // cortex's PlaceSearchHit union produces on the happy path.
  const liveHits = {
    hits: [
      {
        parcelNodeId: "48021:58867",
        situsAddress: "1010 PECAN ST, BASTROP, TX",
        countyFips: "48021",
        latitude: 30.11,
        longitude: -97.31,
        source: "parcel-situs",
      },
      {
        parcelNodeId: null,
        situsAddress: "1010 PECAN ST, BASTROP, TX, 78602",
        countyFips: "48021",
        latitude: 30.12,
        longitude: -97.32,
        source: "address-point",
      },
    ],
  };

  it("the served body is exactly { hits } — the keys are NAMED, not merely deep-equal", () => {
    const served = body(liveHits);
    expect(Object.keys(served)).toEqual(["hits"]);
  });

  it("even a contradictory class on a hits-carrying body is not forwarded", () => {
    // The coverage question was never asked when something was found, so an
    // answer to it would be a lie about what happened.
    const served = body({ ...liveHits, missClass: "no-hit" });
    expect(Object.keys(served)).toEqual(["hits"]);
    expect(served).not.toHaveProperty("missClass");
  });

  it("the hit mapping itself is untouched", () => {
    const served = body(liveHits);
    expect(served.hits).toEqual([
      {
        parcelNodeId: "48021:58867",
        situsAddress: "1010 PECAN ST, BASTROP, TX",
        countyFips: "48021",
        latitude: 30.11,
        longitude: -97.31,
        source: "parcel-situs",
      },
      {
        parcelNodeId: null,
        situsAddress: "1010 PECAN ST, BASTROP, TX, 78602",
        countyFips: "48021",
        latitude: 30.12,
        longitude: -97.32,
        source: "address-point",
      },
    ]);
  });

  it("the old dropping rules still hold: a row with no id and no point is gone", () => {
    const served = body({
      hits: [
        { parcelNodeId: "48209:1", situsAddress: "1 MAIN", countyFips: "48209" },
        { parcelNodeId: "", situsAddress: "bad" },
      ],
    });
    expect(served.hits).toHaveLength(1);
    expect(Object.keys(served)).toEqual(["hits"]);
  });
});
