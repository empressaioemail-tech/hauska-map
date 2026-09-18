// P-353 — the situs client's own behaviour, including the rule that decides
// which variant's coverage answer wins.
//
// The four probe subjects each produce exactly ONE situs variant (their last
// token is a ZIP, so `situsQueryVariants` neither strips a state nor expands a
// street suffix). That means the probe cannot falsify the variant rule at all,
// and this file is the only thing that can: a query like `1308 Pecan Bastrop`
// asks the index twice, and `1308 Pecan` has had the locality stripped — which
// is exactly the locality the coverage check needs.
//
// POST-CHANGE ONLY: `fetchSitusSearchResult` did not exist at 163fde32 (the
// client returned the hit array and nothing else), so against the reverted tree
// this file fails at import, not on an assertion.

import { describe, expect, it, vi } from "vitest";
import { fetchSitusSearchResult } from "./situs-search-client";
import { situsQueryVariants } from "./search-kinds";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Answer each situs variant with the body keyed by its own `q`. */
function variantFetch(byQuery: Record<string, unknown>) {
  const seen: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const q = new URL(href, "http://local").searchParams.get("q") ?? "";
    seen.push(q);
    return jsonResponse(byQuery[q] ?? { hits: [] });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const signal = () => new AbortController().signal;

const CAMERON = {
  hits: [],
  missClass: "county_out_of_coverage",
  outOfCoverageCounty: {
    countyFips: "48331",
    countyName: "Milam County",
    state: "TX",
  },
};

describe("P-353 — the client reads the class out of the body it used to discard", () => {
  it("returns the miss beside an empty suggestion list", async () => {
    const { fetchImpl } = variantFetch({ "99999 Zzyzx Rd, Cameron, TX 76520": CAMERON });
    const { suggestions, miss } = await fetchSitusSearchResult(
      "99999 Zzyzx Rd, Cameron, TX 76520",
      signal(),
      { fetchImpl },
    );
    expect(suggestions).toEqual([]);
    expect(miss?.missClass).toBe("county_out_of_coverage");
    expect(miss?.county).toEqual({
      countyFips: "48331",
      countyName: "Milam County",
      state: "TX",
    });
  });

  it("hits are unchanged, and a hits-carrying body yields no miss", async () => {
    const { fetchImpl } = variantFetch({
      "1010 Pecan St, Bastrop, TX": {
        hits: [
          {
            parcelNodeId: "48021:58867",
            situsAddress: "1010 PECAN ST, BASTROP, TX",
            countyFips: "48021",
          },
        ],
      },
    });
    const { suggestions, miss } = await fetchSitusSearchResult(
      "1010 Pecan St, Bastrop, TX",
      signal(),
      { fetchImpl },
    );
    expect(miss).toBeNull();
    expect(suggestions.map((s) => s.label)).toEqual(["1010 PECAN ST"]);
  });

  it("a non-answer still throws, as it always did (the caller catches)", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("nope", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      fetchSitusSearchResult("1010 Pecan St, Bastrop, TX", signal(), { fetchImpl }),
    ).rejects.toThrow(/situs-search 500/);
  });
});

describe("P-353 — the variant rule: the query as TYPED answers first", () => {
  it("asks both variants, and the typed query's class wins when it has one", async () => {
    const { fetchImpl, seen } = variantFetch({
      "1308 Pecan Bastrop": { hits: [], missClass: "no-hit" },
      "1308 Pecan": CAMERON,
    });
    const { miss } = await fetchSitusSearchResult("1308 Pecan Bastrop", signal(), {
      fetchImpl,
    });
    expect(seen[0]).toBe("1308 Pecan Bastrop");
    expect(seen).toContain("1308 Pecan");
    // The derived variant stripped the only locality the coverage check had.
    expect(miss?.missClass).toBe("no-hit");
  });

  it("the four probe subjects ask exactly ONE variant each — their class is the typed query's", async () => {
    // Why the variant rule needed its own file: the probe cannot reach it.
    for (const q of [
      "99999 ZZYZX RD, AUSTIN, TX 78701",
      "99999 ZZYZX RD, CAMERON, TX 76520",
      "99999 ZZYZX RD, MARBLE FALLS, TX 78654",
      "1600 BROADWAY, DENVER, CO 80202",
    ]) {
      expect(situsQueryVariants(q)).toEqual([q]);
    }
  });

  it("a derived variant's class is used only when the typed query has none", async () => {
    const { fetchImpl } = variantFetch({
      "1308 Pecan Bastrop": { hits: [] },
      "1308 Pecan": CAMERON,
    });
    const { miss } = await fetchSitusSearchResult("1308 Pecan Bastrop", signal(), {
      fetchImpl,
    });
    expect(miss?.missClass).toBe("county_out_of_coverage");
  });

  it("hits from every variant are still unioned and deduped, class or no class", async () => {
    const { fetchImpl } = variantFetch({
      "1308 Pecan Bastrop": {
        hits: [
          {
            parcelNodeId: "48021:27479",
            situsAddress: "1308 PECAN ST, BASTROP, TX",
            countyFips: "48021",
          },
        ],
      },
      "1308 Pecan": {
        hits: [
          {
            parcelNodeId: "48021:27479",
            situsAddress: "1308 PECAN ST, BASTROP, TX",
            countyFips: "48021",
          },
          {
            parcelNodeId: "48187:29690",
            situsAddress: "1308 PECAN DR, CIBOLO, TX",
            countyFips: "48187",
          },
        ],
        missClass: "no-hit",
      },
    });
    const { suggestions, miss } = await fetchSitusSearchResult(
      "1308 Pecan Bastrop",
      signal(),
      { fetchImpl },
    );
    expect(suggestions.map((s) => s.parcelNodeId)).toEqual([
      "48021:27479",
      "48187:29690",
    ]);
    // A body with hits has no answer to give.
    expect(miss).toBeNull();
  });
});
