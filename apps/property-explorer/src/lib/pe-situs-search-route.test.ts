// P-353 item 4 — a failure to OBTAIN a coverage answer is the fourth owed
// class, not a miss and not a bare 5xx.
//
// Drives the real handler (`api/pe-situs-search.ts`) with a stubbed global
// fetch, the same way `pe-share-instrument.test.ts` drives handlePeShareGrant.
//
// POST-CHANGE ONLY: the handler imports `coverageUnavailableResponse` from the
// core, which did not exist at 163fde32 — so against the reverted tree this
// file fails at module load, not on an assertion. That absence IS the
// pre-change direction here, and it is the honest one: at 163fde32 a timeout
// left the handler with no class to serve at all. The observable consequence is
// recorded in the CLOSE: the customer-leg probe grades a body carrying `error`
// as UNMEASURED (surface-probe.mjs), so this failure mode was invisible to the
// instrument that is supposed to catch it.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/pe-situs-search";

const KEY = "CORTEX_SERVICE_API_KEY";

interface Recorder {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
}

function mockRes(): { rec: Recorder; res: VercelResponse } {
  const rec: Recorder = { headers: {}, statusCode: 0, body: undefined };
  const res = {
    setHeader(k: string, v: string) {
      rec.headers[k] = v;
      return res;
    },
    status(n: number) {
      rec.statusCode = n;
      return res;
    },
    json(b: unknown) {
      rec.body = b;
      return res;
    },
  };
  return { rec, res: res as unknown as VercelResponse };
}

function mockReq(method: string, query: Record<string, string>): VercelRequest {
  return { method, query } as unknown as VercelRequest;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    return impl(href);
  });
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return fn;
}

/** Never answers until its own signal aborts — the real timeout path. */
function hangingFetch() {
  const fn = vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  );
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return fn;
}

const CAMERON_Q = { q: "99999 ZZYZX RD, CAMERON, TX 76520" };

async function serve(query: Record<string, string> = CAMERON_Q) {
  const { rec, res } = mockRes();
  await handler(mockReq("GET", query), res);
  return rec;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env[KEY];
  delete process.env.CORTEX_API_URL;
});

describe("P-353 item 4 — a timeout is the fourth class, not a miss", () => {
  it("serves coverage_check_unavailable at HTTP 200, uncached, with a named reason", async () => {
    vi.useFakeTimers();
    process.env[KEY] = "test-key";
    hangingFetch();
    const { rec, res } = mockRes();
    const pending = handler(mockReq("GET", CAMERON_Q), res);
    // The handler's own 9s ceiling, advanced rather than waited out.
    await vi.advanceTimersByTimeAsync(9_100);
    await pending;
    expect(rec.statusCode).toBe(200);
    expect(rec.body).toEqual({
      hits: [],
      missClass: "coverage_check_unavailable",
      coverageCheckUnavailableReason: "cortex timed out after 9000ms",
    });
    // A transient outage must not be cached for 60s by the edge.
    expect(rec.headers["Cache-Control"]).toBe("no-store");
  });

  it("a refusing cortex (503) is also the fourth class, not a 502 the customer cannot read", async () => {
    process.env[KEY] = "test-key";
    stubFetch(() => jsonResponse({ error: "down" }, 503));
    const rec = await serve();
    expect(rec.statusCode).toBe(200);
    expect(rec.body).toEqual({
      hits: [],
      missClass: "coverage_check_unavailable",
      coverageCheckUnavailableReason: "cortex responded 503",
    });
    expect(rec.headers["Cache-Control"]).toBe("no-store");
  });

  it("a body we cannot read is an answer we do not have — same class", async () => {
    process.env[KEY] = "test-key";
    stubFetch(() => new Response("<html>not json</html>", { status: 200 }));
    const rec = await serve();
    expect(rec.statusCode).toBe(200);
    expect(rec.body).toEqual({
      hits: [],
      missClass: "coverage_check_unavailable",
      coverageCheckUnavailableReason: "cortex returned a non-JSON body",
    });
  });

  it("a transport failure (not a timeout) is also a failure to obtain an answer", async () => {
    process.env[KEY] = "test-key";
    stubFetch(() => {
      throw new Error("socket hang up");
    });
    const rec = await serve();
    expect(rec.statusCode).toBe(200);
    expect((rec.body as { missClass?: string }).missClass).toBe(
      "coverage_check_unavailable",
    );
    expect((rec.body as { coverageCheckUnavailableReason?: string })
      .coverageCheckUnavailableReason).toContain("socket hang up");
  });

  it("the 9s ceiling leaves the probe's 12s leg room to measure it", async () => {
    // Read, not guessed: the number is asserted so a later edit cannot quietly
    // push the BFF past the instrument's own budget and turn a timeout into an
    // unmeasurable dead surface.
    vi.useFakeTimers();
    process.env[KEY] = "test-key";
    hangingFetch();
    const { rec, res } = mockRes();
    const pending = handler(mockReq("GET", CAMERON_Q), res);
    await vi.advanceTimersByTimeAsync(12_100);
    await pending;
    expect(rec.statusCode).toBe(200);
    expect(
      (rec.body as { coverageCheckUnavailableReason?: string })
        .coverageCheckUnavailableReason,
    ).toBe("cortex timed out after 9000ms");
  });
});

describe("P-353 — the four classes travel through the real route", () => {
  it("serves each class's own fields, beside an empty hits", async () => {
    process.env[KEY] = "test-key";
    stubFetch(() =>
      jsonResponse({
        hits: [],
        missClass: "county_out_of_coverage",
        outOfCoverageCounty: {
          countyFips: "48331",
          countyName: "Milam County",
          state: "TX",
        },
      }),
    );
    const rec = await serve();
    expect(rec.statusCode).toBe(200);
    expect(rec.body).toEqual({
      hits: [],
      missClass: "county_out_of_coverage",
      outOfCoverageCounty: {
        countyFips: "48331",
        countyName: "Milam County",
        state: "TX",
      },
    });
  });

  it("a hits-carrying body is served as { hits } only (F2 through the route)", async () => {
    process.env[KEY] = "test-key";
    stubFetch(() =>
      jsonResponse({
        hits: [
          {
            parcelNodeId: "48021:58867",
            situsAddress: "1010 PECAN ST, BASTROP, TX",
            countyFips: "48021",
          },
        ],
      }),
    );
    const rec = await serve({ q: "1010 Pecan" });
    expect(rec.statusCode).toBe(200);
    expect(Object.keys(rec.body as Record<string, unknown>)).toEqual(["hits"]);
  });
});

describe("P-353 — the route's ordinary refusals are untouched", () => {
  it("a missing service key stays a 503 deployment fact, not a coverage answer", async () => {
    delete process.env[KEY];
    stubFetch(() => jsonResponse({ hits: [] }));
    const rec = await serve();
    expect(rec.statusCode).toBe(503);
    expect(rec.body).toEqual({
      error: "proxy_not_configured",
      missing: KEY,
    });
  });

  it("invalid params stay a 400", async () => {
    process.env[KEY] = "test-key";
    stubFetch(() => jsonResponse({ hits: [] }));
    const rec = await serve({ q: "" });
    expect(rec.statusCode).toBe(400);
    expect((rec.body as { error?: string }).error).toBe("invalid_request");
  });

  it("non-GET stays a 405", async () => {
    process.env[KEY] = "test-key";
    stubFetch(() => jsonResponse({ hits: [] }));
    const { rec, res } = mockRes();
    await handler(mockReq("POST", CAMERON_Q), res);
    expect(rec.statusCode).toBe(405);
  });
});
