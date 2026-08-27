// Dossier PDF export — client assembly + BFF fold-in contract.
//   - verdictLine comes from the EXISTING brief-verdict composer;
//   - brief facts flatten through the EXISTING view-model derivation
//     (one flattening truth with the brief panel);
//   - missing pieces are honestly omitted, never defaulted;
//   - the request goes to the FOLDED pe-site-plan-export function with
//     kind=dossier (no new serverless function).

import { describe, expect, it, vi } from "vitest";
import {
  ZONED_BRIEF,
  UNZONED_BRIEF,
} from "../../browse/__fixtures__/research-brief.fixture";
import type { PropertyDossier } from "../../lib/propertyDossier";
import {
  XRAY_PIPELINE_ABSENT_ERROR,
  XRAY_PIPELINE_ABSENT_MESSAGE,
} from "../../../api/_lib/pe-dossier-export-core";
import {
  assembleDossierExportBody,
  dossierExportNotice,
  flattenBriefForDossier,
  requestDossierExport,
} from "./dossier-export";

const READY_BODY = {
  parcelNodeId: "48021:27303",
  verdictLine: "Buildable · outside mapped flood hazard.",
  brief: {
    sections: [
      {
        id: "zoning",
        title: "Zoning",
        facts: [{ label: "District", value: "P-2" }],
      },
    ],
  },
} as const;

const DOSSIER: PropertyDossier = {
  savedAt: "2026-07-28T00:00:00.000Z",
  address: "1127 N Pine St",
  chatSummary: {
    summary: "AI summary of the chat.",
    savedAt: "2026-07-28T12:00:00.000Z",
    turnCount: 6,
    disclaimer: "AI-generated — verify before relying on it.",
  },
  notes: "Walk the lot before offering.",
};

describe("flattenBriefForDossier", () => {
  it("flattens fact sections with per-fact source and vintage", () => {
    const flattened = flattenBriefForDossier(ZONED_BRIEF);
    expect(flattened).toBeDefined();
    const zoning = flattened!.sections.find((s) => s.id === "zoning");
    expect(zoning).toBeDefined();
    const district = zoning!.facts.find((f) => f.label.toLowerCase().includes("district"));
    expect(district?.value).toContain("P-2");
    // Every flattened fact carries label + value; provenance only when the
    // payload carried it (honest — never fabricated).
    for (const section of flattened!.sections) {
      for (const fact of section.facts) {
        expect(fact.label.length).toBeGreaterThan(0);
        expect(typeof fact.value).toBe("string");
      }
    }
  });

  it("omits honest-absent sections (the engine renders absence honestly)", () => {
    const flattened = flattenBriefForDossier(UNZONED_BRIEF);
    // The unzoned fixture has absent zoning; its facts sections may remain.
    const ids = (flattened?.sections ?? []).map((s) => s.id);
    expect(ids).not.toContain("zoning");
  });
});

describe("assembleDossierExportBody", () => {
  it("assembles verdict + brief + chat summary + notes from stored data", () => {
    const body = assembleDossierExportBody({
      parcelNodeId: "48021:27303",
      dossier: DOSSIER,
      brief: ZONED_BRIEF,
      facts: { address: null, countyName: "Bastrop" },
    });
    expect(body.parcelNodeId).toBe("48021:27303");
    expect(body.address).toBe("1127 N Pine St");
    expect(body.countyName).toBe("Bastrop");
    // UPDATED (P-39): the verdict line is the SUBJECT'S sealed sentence, from
    // the one composer. With no subject set in this unit test the line is
    // OMITTED rather than composed a second time from the brief payload —
    // omission is the honest state, an invented headline is not.
    expect(body.verdictLine).toBeUndefined();
    expect(body.brief?.sections.length).toBeGreaterThan(0);
    expect(body.chatSummary).toEqual({
      summary: "AI summary of the chat.",
      savedAt: "2026-07-28T12:00:00.000Z",
      disclaimer: "AI-generated — verify before relying on it.",
    });
    expect(body.notes).toBe("Walk the lot before offering.");
    expect(body.liveViewUrl).toBe("/?parcelNodeId=48021%3A27303");
  });

  it("honestly omits everything unavailable", () => {
    const body = assembleDossierExportBody({
      parcelNodeId: "48021:27303",
      dossier: null,
      brief: null,
    });
    expect(body).toEqual({
      parcelNodeId: "48021:27303",
      liveViewUrl: "/?parcelNodeId=48021%3A27303",
    });
  });

  it("falls back to active-parcel facts for the address when the dossier has none", () => {
    const body = assembleDossierExportBody({
      parcelNodeId: "48021:27303",
      dossier: { notes: "n" },
      brief: null,
      facts: { address: "200 Main St", countyName: null },
    });
    expect(body.address).toBe("200 Main St");
    expect(body.countyName).toBeUndefined();
  });
});

describe("requestDossierExport — BFF fold-in contract", () => {
  it("POSTs to pe-site-plan-export with kind=dossier (no new function)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          parcelNodeId: "48021:27303",
          format: "pdf-dossier",
          downloadUrl:
            "/api/pe-site-plan-export?parcelNodeId=48021%3A27303&kind=dossier&action=download",
          pageCount: 5,
          sitePlanAppended: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await requestDossierExport(
      { ...READY_BODY, notes: "n" },
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/pe-site-plan-export?kind=dossier");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      ...READY_BODY,
      notes: "n",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.downloadUrl).toContain("kind=dossier");
      expect(result.pageCount).toBe(5);
    }
  });

  it("maps a 402 to the paywall outcome", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: "payment_required", message: "Unlock this property." }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await requestDossierExport(
      READY_BODY,
      fetchMock as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(402);
      expect(result.error).toBe("payment_required");
    }
    expect(dossierExportNotice(result)).toMatch(/unlock/i);
  });

  it("notice carries the honest site-plan-absent state", () => {
    expect(
      dossierExportNotice({
        ok: true,
        parcelNodeId: "48021:27303",
        downloadUrl: "/x",
        pageCount: 3,
        sitePlanAppended: false,
        sitePlanUnavailableReason: "parcel geometry could not be resolved for this parcel",
      }),
    ).toMatch(/Site-plan sheets were not appended — parcel geometry/);
  });
});

describe("W4.P0 three-way blank — fail closed vs omit", () => {
  it("refuses a request with no verdict: fetch is never called (no PDF bytes)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch must not run on a hollow X-ray");
    });
    const result = await requestDossierExport(
      {
        parcelNodeId: "48021:34161",
        brief: READY_BODY.brief,
      },
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toBe(XRAY_PIPELINE_ABSENT_ERROR);
      expect(result.message).toBe(XRAY_PIPELINE_ABSENT_MESSAGE);
    }
    expect(dossierExportNotice(result)).toMatch(/hollow report will not be downloaded/i);
  });

  it("refuses a request with no brief facts: fetch is never called (no PDF bytes)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch must not run on a hollow X-ray");
    });
    const result = await requestDossierExport(
      {
        parcelNodeId: "48021:34161",
        verdictLine: READY_BODY.verdictLine,
      },
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(XRAY_PIPELINE_ABSENT_ERROR);
    }
  });

  it("omits owner notes and still exports when verdict + brief exist", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          parcelNodeId: "48021:34161",
          format: "pdf-dossier",
          downloadUrl:
            "/api/pe-site-plan-export?parcelNodeId=48021%3A34161&kind=dossier&action=download",
          pageCount: 4,
          sitePlanAppended: true,
          notesIncluded: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const assembled = assembleDossierExportBody({
      parcelNodeId: "48021:34161",
      dossier: null,
      brief: ZONED_BRIEF,
      verdictLine: READY_BODY.verdictLine,
    });
    expect(assembled.notes).toBeUndefined();
    expect(assembled.chatSummary).toBeUndefined();
    expect(assembled.verdictLine).toBe(READY_BODY.verdictLine);
    expect(assembled.brief?.sections.length).toBeGreaterThan(0);

    const result = await requestDossierExport(
      assembled,
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const posted = JSON.parse(
      String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ) as { notes?: string; chatSummary?: unknown };
    expect(posted.notes).toBeUndefined();
    expect(posted.chatSummary).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});
