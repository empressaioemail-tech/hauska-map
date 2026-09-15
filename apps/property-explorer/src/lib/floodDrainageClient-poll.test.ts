// G-129 — the SmartCity mount's async-tolerant refresh. See the mechanism
// comment on requestFloodDrainageRefreshWithPoll (floodDrainageClient.ts) for
// why polling after a 503 engine_timeout is honest rather than hopeful.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParcelFactSheet } from "@empressaio/parcel-fact-sheet";
import { requestFloodDrainageRefreshWithPoll } from "./floodDrainageClient";
import { subjectStore } from "./subject-store";

const PROV = {
  source: "cad-roll",
  sourceLabel: "Bastrop County appraisal roll",
  vintage: null,
  method: null,
  retrievedAt: null,
  confidence: null,
  confidenceBasis: "asserted" as const,
  sourceUrl: null,
};

function sheet(parcelNodeId: string): ParcelFactSheet {
  return {
    factSheetId: `fs_${parcelNodeId.replace(":", "")}`,
    resolverVersion: "test",
    sealedAt: "2026-08-18T00:00:00.000Z",
    identity: {
      parcelNodeId,
      county: { fips: parcelNodeId.split(":")[0], name: "Bastrop" },
      apn: { state: "absent-covered", reason: "n/a", provenance: PROV },
      situsAddress: { state: "absent-covered", reason: "n/a", provenance: PROV },
      owner: { state: "absent-covered", reason: "n/a", provenance: PROV },
    },
    geometry: {
      rings: [],
      centroid: { lat: 30.11, lng: -97.32 },
      bbox: [-97.32, 30.11, -97.32, 30.11],
      lotArea: { value: 1, unit: "sqft" },
      crs: "EPSG:4326",
    },
    landUse: { state: "absent-covered", reason: "n/a", provenance: PROV },
    zoning: { state: "absent-covered", reason: "n/a", provenance: PROV },
    setbacks: { state: "absent-covered", reason: "n/a", provenance: PROV },
    envelope: { kind: "not-derived", reason: "n/a", missing: [] },
    flood: { state: "absent-covered", reason: "n/a", provenance: PROV },
    site: {
      elevationRange: null,
      contourInterval: null,
      frontage: { state: "absent-covered", reason: "n/a", provenance: PROV },
    },
    verdict: "v.",
  };
}

const PARCEL = "48021:34049";
const noSleep = () => Promise.resolve();

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

describe("requestFloodDrainageRefreshWithPoll", () => {
  afterEach(() => {
    subjectStore.clear();
    vi.unstubAllGlobals();
  });

  it("P-240: settles fast (no OUTER poll) when the job accepts and the INNER study poll comes back ready right away", async () => {
    // requestFloodDrainageRefresh (called first, below) now ALWAYS gets a
    // 202 job-accepted body from the POST, then polls /study internally —
    // there is no more "one call, done" fast path at the wire level. This
    // still counts as "no OUTER poll" because the 503 engine_timeout branch
    // below never engages: `result.polled` stays undefined.
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { state: "queued", jobRef: "job-1", pollAfterMs: 1 }))
      .mockResolvedValueOnce(
        jsonResponse(200, { study: { parcelNodeId: PARCEL, rainfallDepthInches: 9.5 } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestFloodDrainageRefreshWithPoll(PARCEL);
    expect(result.ok).toBe(true);
    expect(result.polled).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT poll a non-transient failure (401) -- one call, honest answer", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "authentication_required" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestFloodDrainageRefreshWithPoll(PARCEL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("on 503 engine_timeout, polls the study endpoint until it is ready", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(503, { error: "engine_timeout", retryable: true, message: "…" }),
      )
      .mockResolvedValueOnce(jsonResponse(404, { error: "study_unavailable" })) // not ready yet
      .mockResolvedValueOnce(
        jsonResponse(200, {
          study: { parcelNodeId: PARCEL, rainfallDepthInches: 9.5, rainfallSource: "default" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    let preparing = false;
    const result = await requestFloodDrainageRefreshWithPoll(
      PARCEL,
      undefined,
      { intervalMs: 0, budgetMs: 50, sleep: noSleep, onPreparing: () => (preparing = true) },
    );
    expect(preparing).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.polled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("SAFETY: refuses a polled study at the WRONG depth -- never shows a stale run's answer", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(503, { error: "engine_timeout", retryable: true, message: "…" }),
      )
      // A stale cached study from an EARLIER default-depth run -- not the 4"
      // run this call asked for. Must be rejected, not shown.
      .mockResolvedValue(
        jsonResponse(200, {
          study: { parcelNodeId: PARCEL, rainfallDepthInches: 9.5, rainfallSource: "default" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestFloodDrainageRefreshWithPoll(
      PARCEL,
      { rainfallDepthInches: 4 },
      { intervalMs: 0, budgetMs: 30, sleep: noSleep },
    );
    // Budget exhausted without ever accepting the mismatched-depth study.
    expect(result.ok).toBe(false);
    expect(result.polled).toBe(true);
  });
});
