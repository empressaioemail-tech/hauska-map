// P-353 falsifier F5 — the merged typeahead does not offer geocoder rows for a
// place we do not cover, and still offers them for a covered miss.
//
// The defect this pins (dispatch item 3, in its most-used form): the merged
// fetcher merged the Photon batches unconditionally, so typing an address in an
// uncovered county still showed geocoded address rows in the dropdown — a
// geocoded pin standing in for "we do not cover this county".
//
// IMPORT NOTE (deliberate, and load-bearing): this file calls
// `fetchMergedSearchSuggestions`, which exists at the pre-change commit
// 163fde32, and asserts only on the returned ROWS. The pre-change direction is
// therefore a REAL RUN of this same file with the source reverted: the first
// case fails with one geocoded row where zero are owed. The notice text itself
// (the fourth owed class, and the wording) is asserted in
// `geocode-coverage-notice.test.ts`, which cannot load at 163fde32 because the
// module it reads did not exist yet.

import { describe, expect, it, vi } from "vitest";
import { fetchMergedSearchSuggestions } from "./geocodeClient";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** A Photon address row for 99999 Zzyzx Rd, Denver-ish: a real-looking row. */
const GEOCODE_FEATURE = {
  name: "Zzyzx Road",
  housenumber: "99999",
  street: "Zzyzx Road",
  city: "Cameron",
  county: "Milam",
  state: "Texas",
  postcode: "76520",
  countrycode: "US",
  osmKey: "highway",
  osmValue: "residential",
  type: "house",
  lat: 30.85,
  lng: -96.97,
  extent: null,
};

/** The two legs the merged fetcher calls, keyed off the BFF path. */
function legFetch(situs: unknown) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    if (href.includes("pe-situs-search")) return jsonResponse(situs);
    if (href.includes("pe-geocode")) {
      return jsonResponse({ features: [GEOCODE_FEATURE] });
    }
    throw new Error(`unexpected leg: ${href}`);
  }) as unknown as typeof fetch;
}

const QUERY = "99999 Zzyzx Rd, Cameron, TX 76520";

describe("F5 — a geocoded row never stands in for an out-of-coverage answer", () => {
  it("county_out_of_coverage: zero rows, even though the geocoder offered one", async () => {
    const fetchImpl = legFetch({
      hits: [],
      missClass: "county_out_of_coverage",
      outOfCoverageCounty: {
        countyFips: "48331",
        countyName: "Milam County",
        state: "TX",
      },
    });
    const results = await fetchMergedSearchSuggestions(QUERY, null, new AbortController().signal, {
      fetchImpl,
    });
    expect(results.filter((s) => s.source === "photon")).toEqual([]);
    expect(results).toEqual([]);
  });

  it("out_of_coverage: zero rows too", async () => {
    const fetchImpl = legFetch({
      hits: [],
      missClass: "out_of_coverage",
      outOfCoverageState: "CO",
    });
    const results = await fetchMergedSearchSuggestions(
      "1600 Broadway, Denver, CO 80202",
      null,
      new AbortController().signal,
      { fetchImpl },
    );
    expect(results).toEqual([]);
  });

  it("no-hit is NOT out of coverage: the geocoded row is still offered (unchanged merge)", async () => {
    const fetchImpl = legFetch({ hits: [], missClass: "no-hit" });
    const results = await fetchMergedSearchSuggestions(QUERY, null, new AbortController().signal, {
      fetchImpl,
    });
    expect(results.map((s) => s.source)).toEqual(["photon"]);
    expect(results[0]?.label).toBe("99999 Zzyzx Road");
  });

  it("an unavailable check is NOT out of coverage either: we do not know, so we still look", async () => {
    const fetchImpl = legFetch({
      hits: [],
      missClass: "coverage_check_unavailable",
      coverageCheckUnavailableReason: "cortex timed out after 9000ms",
    });
    const results = await fetchMergedSearchSuggestions(QUERY, null, new AbortController().signal, {
      fetchImpl,
    });
    expect(results.map((s) => s.source)).toEqual(["photon"]);
  });

  it("no class at all: unchanged (the ordinary miss keeps its geocoded rows)", async () => {
    const fetchImpl = legFetch({ hits: [] });
    const results = await fetchMergedSearchSuggestions(QUERY, null, new AbortController().signal, {
      fetchImpl,
    });
    expect(results.map((s) => s.source)).toEqual(["photon"]);
  });

  it("situs HITS are never affected by this stop (the geocoded row still merges, as before)", async () => {
    const fetchImpl = legFetch({
      hits: [
        {
          parcelNodeId: "48331:1",
          situsAddress: "1010 PECAN ST, CAMERON, TX",
          countyFips: "48331",
        },
      ],
    });
    const results = await fetchMergedSearchSuggestions(QUERY, null, new AbortController().signal, {
      fetchImpl,
    });
    // The parcel ranks ahead of the geocoded address row, and the merge is the
    // ordinary one — this change only touches the empty-class answer.
    expect(results.map((s) => s.source)).toEqual(["situs-parcel", "photon"]);
  });
});
