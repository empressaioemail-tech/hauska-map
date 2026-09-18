// P-353 falsifier F4 — the geocoder fall-through stops where it should, and
// ONLY where it should.
//
// The defect this pins: with no situs pin, `resolveLookupToParcelNodeId` walks
// the envelope ladder, whose last rung is a fuzzy geocode. For an address in a
// county we do not cover that ladder still returns a parcel id — a geocoded pin
// standing in for "we do not cover this county", which the dispatch calls a
// worse answer than an empty list.
//
// IMPORT NOTE (deliberate, and load-bearing): this file imports only
// `resolveLookupToParcelNodeId`, which exists at the pre-change commit
// 163fde32, and reads the class through a structural cast rather than the new
// type. The pre-change direction is therefore a REAL RUN of this same file
// with the source reverted: case (a) fails on `expect(result.ok).toBe(false)`
// because the old ladder hands back a geocoded pin. Cases (b), (c) and (d) pass
// in both directions on purpose — they are the controls against a stop that is
// too broad.

import { describe, expect, it, vi } from "vitest";
import { resolveLookupToParcelNodeId } from "./parcel-lookup";

const CORTEX = "/api/spine/cortex/api";
const SITUS = "/api/pe-situs-search";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function envelopeOk(nodeId: string) {
  return {
    status: "ok",
    parcel_node_id: nodeId,
    placeKey: "coord:30.459:-97.635",
    payload: { parcel: { parcel_node_id: nodeId } },
  };
}

/**
 * The failure shape this test asserts, read structurally: the field does not
 * exist at 163fde32, and the revert-and-run direction must fail on the
 * ASSERTION rather than on a missing property read.
 */
interface ClassedFailure {
  missClass: string;
  countyName: string | null;
  state: string | null;
  sentence: string;
}

function classed(result: unknown): ClassedFailure | undefined {
  return (result as { coverageMiss?: ClassedFailure }).coverageMiss;
}

/** Answers the situs leg with `situs`; counts every ladder call. */
function routeFetch(opts: { situs: unknown; envelope?: () => Response }) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    calls.push(href);
    if (href.includes("situs-search")) return jsonResponse(opts.situs);
    if (opts.envelope) return opts.envelope();
    return jsonResponse(envelopeOk("48021:34137"));
  }) as unknown as typeof fetch;
  const envelopeCalls = () =>
    calls.filter((href) => !href.includes("situs-search")).length;
  return { fetchImpl, envelopeCalls };
}

describe("F4 — out-of-coverage stops the ladder; the other classes do not", () => {
  it("(a) county_out_of_coverage: the ladder is never reached, and the class is carried out", async () => {
    const { fetchImpl, envelopeCalls } = routeFetch({
      situs: {
        hits: [],
        missClass: "county_out_of_coverage",
        outOfCoverageCounty: {
          countyFips: "48331",
          countyName: "Milam County",
          state: "TX",
        },
      },
      envelope: () => jsonResponse(envelopeOk("48331:1")),
    });
    const result = await resolveLookupToParcelNodeId(
      "99999 Zzyzx Rd, Cameron, TX 76520",
      { cortexBase: CORTEX, situsSearchUrl: SITUS, fetchImpl },
    );
    // The pre-change failure lands HERE: ok:true, source:"geocoded".
    expect(result.ok).toBe(false);
    // The ladder — the fuzzy geocode's host — is where the bad answer came from.
    expect(envelopeCalls()).toBe(0);
    if (result.ok) throw new Error("unreachable");
    const miss = classed(result);
    expect(miss?.missClass).toBe("county_out_of_coverage");
    expect(miss?.countyName).toBe("Milam County");
    expect(miss?.state).toBe("TX");
    // The customer's sentence names the county AND the state.
    expect(miss?.sentence).toContain("Milam County");
    expect(miss?.sentence).toContain("TX");
    expect(result.reason).toBe(miss?.sentence);
  });

  it("(a2) out_of_coverage stops it too, naming the state", async () => {
    const { fetchImpl, envelopeCalls } = routeFetch({
      situs: { hits: [], missClass: "out_of_coverage", outOfCoverageState: "CO" },
      envelope: () => jsonResponse(envelopeOk("08031:1")),
    });
    const result = await resolveLookupToParcelNodeId(
      "1600 Broadway, Denver, CO 80202",
      { cortexBase: CORTEX, situsSearchUrl: SITUS, fetchImpl },
    );
    expect(result.ok).toBe(false);
    expect(envelopeCalls()).toBe(0);
    if (result.ok) throw new Error("unreachable");
    expect(classed(result)?.missClass).toBe("out_of_coverage");
    expect(result.reason).toContain("CO");
  });

  it("(b) no-hit is a covered miss: the ladder still runs and still resolves", async () => {
    const { fetchImpl, envelopeCalls } = routeFetch({
      situs: { hits: [], missClass: "no-hit" },
      envelope: () => jsonResponse(envelopeOk("48021:34137")),
    });
    const result = await resolveLookupToParcelNodeId(
      "99999 Zzyzx Rd, Austin, TX 78701",
      { cortexBase: CORTEX, situsSearchUrl: SITUS, fetchImpl },
    );
    expect(envelopeCalls()).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.parcelNodeId).toBe("48021:34137");
  });

  it("(c) coverage_check_unavailable does not refuse to look either", async () => {
    const { fetchImpl, envelopeCalls } = routeFetch({
      situs: {
        hits: [],
        missClass: "coverage_check_unavailable",
        coverageCheckUnavailableReason: "retrieval-api key not configured",
      },
      envelope: () => jsonResponse(envelopeOk("48021:34137")),
    });
    const result = await resolveLookupToParcelNodeId(
      "99999 Zzyzx Rd, Austin, TX 78701",
      { cortexBase: CORTEX, situsSearchUrl: SITUS, fetchImpl },
    );
    expect(envelopeCalls()).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("(c2) but when the ladder ALSO fails, unavailable is the answer — not a miss", async () => {
    const { fetchImpl } = routeFetch({
      situs: {
        hits: [],
        missClass: "coverage_check_unavailable",
        coverageCheckUnavailableReason: "coverage source threw",
      },
      envelope: () =>
        jsonResponse({
          status: "not-found",
          reason: "Address not matched to a parcel.",
        }),
    });
    const result = await resolveLookupToParcelNodeId(
      "99999 Zzyzx Rd, Austin, TX 78701",
      { cortexBase: CORTEX, situsSearchUrl: SITUS, fetchImpl },
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(classed(result)?.missClass).toBe("coverage_check_unavailable");
    // It must not read as a covered miss, and it must not read as "no results".
    expect(result.reason).not.toBe("Address not matched to a parcel.");
    expect(result.reason).not.toMatch(/no results/i);
  });

  it("(d) no class at all: the ladder's own honest miss is unchanged", async () => {
    const { fetchImpl } = routeFetch({
      situs: { hits: [] },
      envelope: () =>
        jsonResponse({
          status: "not-found",
          reason: "Address not matched to a parcel.",
        }),
    });
    const result = await resolveLookupToParcelNodeId("nowhere at all", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("Address not matched to a parcel.");
    expect(classed(result)).toBeUndefined();
  });

  it("(e) the parcel-id fast path never consults coverage (the bypass is intact)", async () => {
    const { fetchImpl, envelopeCalls } = routeFetch({ situs: { hits: [] } });
    const result = await resolveLookupToParcelNodeId("48209:156346", {
      cortexBase: CORTEX,
      situsSearchUrl: SITUS,
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      parcelNodeId: "48209:156346",
      source: "parcel-node-id",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(envelopeCalls()).toBe(0);
  });
});
