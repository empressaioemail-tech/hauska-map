// Feasibility Study export — client assembly + BFF fold-in contract.
//   - the ENGINE composes the entire report from atoms it already holds;
//     this module only forwards address/countyName/liveViewUrl, the SAME
//     fields the dossier-export refresh body sends today;
//   - the request goes to the FOLDED pe-site-plan-export function with
//     kind=feasibility (no new serverless function — mirrors kind=dossier).

import { describe, expect, it, vi } from "vitest";
import {
  assembleFeasibilityExportBody,
  feasibilityExportNotice,
  requestFeasibilityExport,
} from "./feasibility-export";

describe("assembleFeasibilityExportBody", () => {
  it("assembles address + countyName + liveViewUrl from what the parcel already holds", () => {
    const body = assembleFeasibilityExportBody({
      parcelNodeId: "48021:27303",
      facts: { address: "1127 N Pine St", countyName: "Bastrop" },
    });
    expect(body).toEqual({
      parcelNodeId: "48021:27303",
      address: "1127 N Pine St",
      countyName: "Bastrop",
      liveViewUrl: "/?parcelNodeId=48021%3A27303",
    });
  });

  it("honestly omits address/countyName when the parcel carries none — no fabricated fields", () => {
    const body = assembleFeasibilityExportBody({
      parcelNodeId: "48021:27303",
      facts: { address: null, countyName: null },
    });
    expect(body).toEqual({
      parcelNodeId: "48021:27303",
      liveViewUrl: "/?parcelNodeId=48021%3A27303",
    });
  });

  it("has no verdict/brief/notes fields at all — unlike dossier, there is no caller-supplied pipeline output", () => {
    const body = assembleFeasibilityExportBody({
      parcelNodeId: "48021:27303",
      facts: { address: "x", countyName: "y" },
    }) as Record<string, unknown>;
    expect(body.verdictLine).toBeUndefined();
    expect(body.brief).toBeUndefined();
    expect(body.notes).toBeUndefined();
    expect(body.chatSummary).toBeUndefined();
  });
});

describe("requestFeasibilityExport — BFF fold-in contract", () => {
  it("POSTs to pe-site-plan-export with kind=feasibility (no new function)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          parcelNodeId: "48021:27303",
          format: "pdf-feasibility",
          downloadUrl:
            "/api/pe-site-plan-export?parcelNodeId=48021%3A27303&kind=feasibility&action=download",
          pageCount: 22,
          feasibilityPageCount: 20,
          sitePlanAppended: true,
          sectionCount: 16,
          openItemCount: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const body = assembleFeasibilityExportBody({
      parcelNodeId: "48021:27303",
      facts: { address: "1127 N Pine St", countyName: "Bastrop" },
    });
    const result = await requestFeasibilityExport(
      body,
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/pe-site-plan-export?kind=feasibility");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.downloadUrl).toContain("kind=feasibility");
      expect(result.sectionCount).toBe(16);
      expect(result.openItemCount).toBe(2);
    }
  });

  it("maps a 402 (studio_required) to the paywall outcome, distinct from a generic payment_required", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "studio_required",
          message: "Feasibility Study is a Studio deliverable. Your plan does not include it.",
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await requestFeasibilityExport(
      { parcelNodeId: "48021:27303" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(402);
      expect(result.error).toBe("studio_required");
    }
    expect(feasibilityExportNotice(result)).toMatch(/studio/i);
  });

  it("maps a 401 to the sign-in notice", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "authentication_required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await requestFeasibilityExport(
      { parcelNodeId: "48021:27303" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(feasibilityExportNotice(result)).toMatch(/sign in/i);
  });

  it("maps a 422 engine refusal (e.g. no resolvable site plan) honestly, never as a paywall", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "feasibility_export_failed",
          message: "No resolvable site plan for this parcel.",
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await requestFeasibilityExport(
      { parcelNodeId: "48021:27303" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(422);
    expect(feasibilityExportNotice(result)).toBe("No resolvable site plan for this parcel.");
  });

  it("notice carries the honest site-plan-absent state on success", () => {
    expect(
      feasibilityExportNotice({
        ok: true,
        parcelNodeId: "48021:27303",
        downloadUrl: "/x",
        pageCount: 18,
        sitePlanAppended: false,
        sitePlanUnavailableReason: "parcel geometry could not be resolved for this parcel",
      }),
    ).toMatch(/Site-plan sheet was not appended — parcel geometry/);
  });

  it("a network error never crashes the caller — mapped to an honest client-side notice", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await requestFeasibilityExport(
      { parcelNodeId: "48021:27303" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network_error");
  });
});
