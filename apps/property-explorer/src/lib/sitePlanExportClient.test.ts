// P-240 (OPS-24, 2026-09-15): requestSitePlanExport now polls internally —
// refresh_parcel_site_plan_export (via the BFF) always returns fast (a
// queued/running job envelope); this client polls the new action=status
// leg until the job settles or its own 5-minute cap is hit, keeping its
// ORIGINAL one-await contract for SitePlanExportSection.tsx. Mirrors
// feasibility-export.test.ts's sequenced-fetch-stub style (a real
// setTimeout of a few seconds in production; stubbing pollAfterMs: 1 keeps
// this test in real, sub-second time rather than faking the clock).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParcelFactSheet } from "@empressaio/parcel-fact-sheet";
import { requestSitePlanExport } from "./sitePlanExportClient";
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

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

describe("requestSitePlanExport — P-240 async: POST accepts, then polls status", () => {
  afterEach(() => {
    subjectStore.clear();
    vi.unstubAllGlobals();
  });

  it("POSTs to pe-site-plan-export (no format-driven URL), then polls action=status to ready", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    let call = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      call += 1;
      if (call === 1) {
        expect(String(url)).toBe("/api/pe-site-plan-export");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({ parcelNodeId: PARCEL, format: "pdf-site-plan" });
        return jsonResponse(202, { ok: true, parcelNodeId: PARCEL, state: "queued", jobRef: "job-1", pollAfterMs: 1 });
      }
      expect(String(url)).toContain("action=status");
      expect(String(url)).toContain("format=pdf-site-plan");
      return jsonResponse(200, {
        ok: true,
        state: "ready",
        parcelNodeId: PARCEL,
        atom: { parcelNodeId: PARCEL, artifacts: {} },
        selectedFormat: "pdf-site-plan",
        downloadUrl: "/api/pe-site-plan-export?parcelNodeId=48021%3A34049&format=pdf-site-plan&action=download",
        downloads: { "pdf-site-plan": "/api/pe-site-plan-export?parcelNodeId=48021%3A34049&format=pdf-site-plan&action=download" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSitePlanExport(PARCEL, "pdf-site-plan");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.parcelNodeId).toBe(PARCEL);
      expect(result.data.downloadUrl).toContain("action=download");
    }
  });

  it("a job still running/queued after one poll eventually settles to ready (exercises the wait branch)", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse(202, { ok: true, state: "queued", jobRef: "job-2", pollAfterMs: 1 });
      }
      if (call === 2) {
        return jsonResponse(200, { ok: true, state: "running", jobRef: "job-2", pollAfterMs: 1 });
      }
      return jsonResponse(200, {
        ok: true,
        state: "ready",
        parcelNodeId: PARCEL,
        atom: { parcelNodeId: PARCEL, artifacts: {} },
        selectedFormat: "pdf-site-plan",
        downloadUrl: "/api/pe-site-plan-export?parcelNodeId=48021%3A34049&format=pdf-site-plan&action=download",
        downloads: {},
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSitePlanExport(PARCEL, "pdf-site-plan");
    expect(call).toBe(3);
    expect(result.ok).toBe(true);
  });

  it("maps a 402 (studio_required) on the ACCEPT leg to the paywall outcome, never starts polling", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(402, { error: "studio_required", message: "Studio required." }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSitePlanExport(PARCEL, "pdf-site-plan");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(402);
      expect(result.error).toBe("studio_required");
    }
  });

  it("a job that settles to failed AFTER being accepted maps to an honest failure — never ready, never a fabricated export", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse(202, { ok: true, state: "queued", jobRef: "job-3", pollAfterMs: 1 });
      }
      return jsonResponse(200, {
        state: "failed",
        errorClass: "geometry_unavailable",
        errorMessage: "parcel geometry could not be resolved for this parcel",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSitePlanExport(PARCEL, "pdf-site-plan");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("site_plan_export_failed");
      expect(result.message).toMatch(/geometry/i);
      // Deliberately not 422 -- see the comment in sitePlanExportClient.ts:
      // SitePlanExportSection.tsx has a pre-existing hardcoded 422 branch
      // with a setback-specific message that this must not collide with.
      expect(result.status).not.toBe(422);
    }
  });

  it("a network error DURING the poll (not the initial accept) is also mapped honestly, never thrown", async () => {
    subjectStore.set({ sheet: sheet(PARCEL), origin: "search" });
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse(202, { ok: true, state: "queued", jobRef: "job-5", pollAfterMs: 1 });
      }
      throw new Error("network down mid-poll");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestSitePlanExport(PARCEL, "pdf-site-plan");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network_error");
  });
});
