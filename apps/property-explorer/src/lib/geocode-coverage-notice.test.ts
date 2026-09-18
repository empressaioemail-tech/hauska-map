// P-353 — the coverage notice the typeahead dropdown shows.
//
// The suppression of geocoded rows is falsified in `geocode-coverage.test.ts`
// (which runs against the reverted tree). THIS file asserts the other half: the
// customer is TOLD why there are no rows, in the class's own words, instead of
// being shown "No matches, try a fuller address".
//
// POST-CHANGE ONLY: `fetchMergedSearchResult` and `coverageMissSentence` did
// not exist at 163fde32, so this file cannot load against the reverted tree.
// Its pre-change direction is that absence — recorded as a module-collection
// failure — plus the fact that the old merged fetcher could return no reason at
// all (its return type was `Suggestion[]`).

import { describe, expect, it, vi } from "vitest";
import { fetchMergedSearchResult } from "./geocodeClient";
import { coverageMissSentence } from "./coverage-miss";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function legFetch(situs: unknown) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.includes("pe-situs-search")) return jsonResponse(situs);
    if (href.includes("pe-geocode")) return jsonResponse({ features: [] });
    throw new Error(`unexpected leg: ${href}`);
  }) as unknown as typeof fetch;
}

const QUERY = "99999 Zzyzx Rd, Cameron, TX 76520";
const signal = () => new AbortController().signal;

describe("the typeahead's coverage notice", () => {
  it("county_out_of_coverage: the notice names the county and the state", async () => {
    const json = {
      hits: [],
      missClass: "county_out_of_coverage",
      outOfCoverageCounty: {
        countyFips: "48331",
        countyName: "Milam County",
        state: "TX",
      },
    };
    const { suggestions, coverageNotice } = await fetchMergedSearchResult(
      QUERY,
      null,
      signal(),
      { fetchImpl: legFetch(json) },
    );
    expect(suggestions).toEqual([]);
    expect(coverageNotice).toBe(coverageMissSentence({
      missClass: "county_out_of_coverage",
      recognised: true,
      county: { countyFips: "48331", countyName: "Milam County", state: "TX" },
      state: null,
      unavailableReason: null,
      displayText: null,
    }));
    expect(coverageNotice).toContain("Milam County");
    expect(coverageNotice).toContain("TX");
  });

  it("out_of_coverage: the notice names the state", async () => {
    const { suggestions, coverageNotice } = await fetchMergedSearchResult(
      "1600 Broadway, Denver, CO 80202",
      null,
      signal(),
      {
        fetchImpl: legFetch({
          hits: [],
          missClass: "out_of_coverage",
          outOfCoverageState: "CO",
        }),
      },
    );
    expect(suggestions).toEqual([]);
    expect(coverageNotice).toContain("CO");
  });

  it("no-hit: NO notice — the ordinary 'keep typing' empty state stays the typeahead's job", async () => {
    const { suggestions, coverageNotice } = await fetchMergedSearchResult(
      QUERY,
      null,
      signal(),
      { fetchImpl: legFetch({ hits: [], missClass: "no-hit" }) },
    );
    expect(suggestions).toEqual([]);
    expect(coverageNotice).toBeNull();
  });

  it("coverage_check_unavailable: NO notice in a TYPEAHEAD (a partial query can trigger it)", async () => {
    const { coverageNotice } = await fetchMergedSearchResult(QUERY, null, signal(), {
      fetchImpl: legFetch({
        hits: [],
        missClass: "coverage_check_unavailable",
        coverageCheckUnavailableReason: "cortex timed out after 9000ms",
      }),
    });
    expect(coverageNotice).toBeNull();
  });

  it("hits, or no class at all: no notice, and the rows are the old rows", async () => {
    const noClass = await fetchMergedSearchResult(QUERY, null, signal(), {
      fetchImpl: legFetch({ hits: [] }),
    });
    expect(noClass.coverageNotice).toBeNull();
    const withHits = await fetchMergedSearchResult(QUERY, null, signal(), {
      fetchImpl: legFetch({
        hits: [
          {
            parcelNodeId: "48331:1",
            situsAddress: "1010 PECAN ST, CAMERON, TX",
            countyFips: "48331",
          },
        ],
      }),
    });
    expect(withHits.coverageNotice).toBeNull();
    expect(withHits.suggestions).toHaveLength(1);
  });
});
