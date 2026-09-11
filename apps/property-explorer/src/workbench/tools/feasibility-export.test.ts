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

// P-155 (OPS-23 FEASIBILITY, 2026-09-11): the second fetch call onward is
// the status poll (GET .../feasibility-export&action=status). These tests
// stub a SEQUENCE of responses (first the 202 accept, then one or more
// status reads) rather than vi.useFakeTimers — the poll's own sleep is a
// real setTimeout of a few seconds in production, which would make a
// faked clock fragile against the loop's internal Date.now() deadline
// check; a fetch stub that returns 'running' zero or one times before
// 'ready'/'failed' exercises the same branches in real (sub-second) time.
describe("requestFeasibilityExport — BFF fold-in contract (P-155 async: POST accepts, then polls status)", () => {
  it("POSTs to pe-site-plan-export with kind=feasibility (no new function), then polls status to ready", async () => {
    let call = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      call += 1;
      if (call === 1) {
        expect(String(url)).toBe("/api/pe-site-plan-export?kind=feasibility");
        return new Response(JSON.stringify({ state: "queued", jobRef: "job-1", pollAfterMs: 1 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      expect(String(url)).toContain("action=status");
      return new Response(
        JSON.stringify({
          ok: true,
          state: "ready",
          downloadUrl:
            "/api/pe-site-plan-export?parcelNodeId=48021%3A27303&kind=feasibility&action=download",
          pageCount: 22,
          feasibilityPageCount: 20,
          sitePlanAppended: true,
          sectionCount: 16,
          openItemCount: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const body = assembleFeasibilityExportBody({
      parcelNodeId: "48021:27303",
      facts: { address: "1127 N Pine St", countyName: "Bastrop" },
    });
    const result = await requestFeasibilityExport(
      body,
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.downloadUrl).toContain("kind=feasibility");
      expect(result.sectionCount).toBe(16);
      expect(result.openItemCount).toBe(2);
    }
  });

  it("a job still running/queued after one poll eventually settles to ready (exercises the wait branch)", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ state: "queued", jobRef: "job-2", pollAfterMs: 1 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      if (call === 2) {
        return new Response(JSON.stringify({ state: "running", jobRef: "job-2", pollAfterMs: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          state: "ready",
          downloadUrl: "/api/pe-site-plan-export?kind=feasibility&action=download",
          sectionCount: 5,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const result = await requestFeasibilityExport(
      { parcelNodeId: "48021:27303" },
      fetchMock as unknown as typeof fetch,
    );
    expect(call).toBe(3);
    expect(result.ok).toBe(true);
  });

  it("maps a 402 (studio_required) on the ACCEPT leg to the paywall outcome, never starts polling", async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(402);
      expect(result.error).toBe("studio_required");
    }
    expect(feasibilityExportNotice(result)).toMatch(/studio/i);
  });

  it("maps a 401 on the ACCEPT leg to the sign-in notice", async () => {
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

  it("maps a 422 engine refusal on the ACCEPT leg (e.g. bad request shape) honestly, never as a paywall", async () => {
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

  it("a job that settles to failed AFTER being accepted maps to the honest 422 outcome — never ready, never a paywall", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ state: "queued", jobRef: "job-3", pollAfterMs: 1 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          state: "failed",
          errorMessage: "No resolvable site plan for this parcel.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const result = await requestFeasibilityExport(
      { parcelNodeId: "48021:27303" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toBe("feasibility_export_failed");
    }
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
    ).toMatch(/Site-plan sheet was not appended: parcel geometry/);
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

  it("a network error DURING the poll (not the initial accept) is also mapped honestly, never thrown", async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ state: "queued", jobRef: "job-4", pollAfterMs: 1 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error("network down mid-poll");
    });
    const result = await requestFeasibilityExport(
      { parcelNodeId: "48021:27303" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network_error");
  });

  it("still_processing (client poll cap) reads as a running/honest notice, never 'failed'", () => {
    const notice = feasibilityExportNotice({
      ok: false,
      status: 202,
      error: "still_processing",
      message:
        "Feasibility Study is taking longer than expected. It is still being generated — click Generate again in a minute to check.",
    });
    expect(notice).not.toMatch(/fail/i);
    expect(notice).not.toMatch(/cold start/i);
    expect(notice).toMatch(/still being generated/i);
  });
});
