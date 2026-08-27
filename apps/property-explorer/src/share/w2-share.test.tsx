// W2 Share — lands on the property with notes; W0 pin stays a scalar.
// Each case names its violation. A check observed only passing is not a check.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isBrowserShareNavigation,
  resolveShareLanding,
  SHARE_FUNNEL_GRANT_STASH_KEY,
  shareAppLandingPath,
  type ShareStash,
} from "./share-landing";
import { shareFlightQuery, shareNotesFromDossier } from "./share-flight";
import { shareGrantFromInstrument } from "./share-grant-client";
import {
  SHARED_ANALYSIS_TOOL_ID,
  SharedDossierDock,
  type ShareFunnelBinding,
} from "./SharedDossierDock";
import { PdfViewer } from "../components/PdfViewer";
import { liveViewHref } from "../lib/live-view";
import {
  parseReceivedShares,
  recordReceivedShare,
  SHARE_RECEIVED_STORAGE_KEY,
} from "./share-received";
import { Workbench } from "../workbench/Workbench";
import { WORKBENCH_TOOLS } from "../workbench/registry";
import { createWorkbenchToolStateStore } from "../workbench/tool-state-store";
import {
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
} from "../lib/entitlementClient";
import { ZONED_BRIEF } from "../browse/__fixtures__/research-brief.fixture";
import type { ShareBriefResponse, SharePhase } from "./ShareView";
import { isShareGrantId } from "../../api/_lib/pe-share-grant.js";
import { handlePeShareGrant } from "../../api/pe-share-grant.js";
import { createMemoryShareGrantStore } from "../../api/_lib/pe-share-grant-store.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function memStash(seed: Record<string, string> = {}): ShareStash & {
  bag: Map<string, string>;
} {
  const bag = new Map(Object.entries(seed));
  return {
    bag,
    getItem: (k) => bag.get(k) ?? null,
    setItem: (k, v) => void bag.set(k, v),
    removeItem: (k) => void bag.delete(k),
  };
}

const GRANT_ID = "2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f";
const PARCEL = "48021:34137";
const NOTES = "Walk the drainage before offering.";

const READY_DATA: ShareBriefResponse = {
  property: {
    parcelNodeId: PARCEL,
    situsAddress: "801 Pine St",
    countyName: "Bastrop",
  },
  report: ZONED_BRIEF,
  share: { expiresAt: "2026-09-26T00:00:00.000Z" },
};

const READY_PHASE: SharePhase = { kind: "ready", data: READY_DATA };

const READY_WITH_NOTES: ShareFunnelBinding = {
  token: null,
  grantId: GRANT_ID,
  phase: READY_PHASE,
  dossier: {
    address: "801 Pine St",
    savedAt: "2026-08-20T00:00:00.000Z",
    drawings: null,
    chatSummary: null,
    notes: NOTES,
  },
  parcelNodeId: PARCEL,
};

describe("W2.1 share lands on the property with notes", () => {
  it("minted /s/{uuid} and /share?g= resolve to a share landing (violate: only /share#token)", () => {
    expect(isShareGrantId(GRANT_ID)).toBe(true);
    const fromPath = resolveShareLanding(
      { pathname: `/s/${GRANT_ID}`, hash: "", search: "" },
      memStash(),
    );
    expect(fromPath).toEqual({
      token: null,
      grantId: GRANT_ID,
      restored: false,
    });
    const fromQuery = resolveShareLanding(
      { pathname: "/share", hash: "", search: `?g=${GRANT_ID}` },
      memStash(),
    );
    expect(fromQuery).toEqual({
      token: null,
      grantId: GRANT_ID,
      restored: false,
    });
    expect(shareAppLandingPath(GRANT_ID)).toBe(`/share?g=${GRANT_ID}`);
  });

  it("HMAC in /s/ is not a grant landing (violate: treating token as grant id)", () => {
    const landing = resolveShareLanding(
      { pathname: "/s/eyJ2IjoxfQ.signature", hash: "", search: "" },
      memStash(),
    );
    expect(landing).toBeNull();
  });

  it("shareFlightQuery is the parcel id — fails if land drops the property", () => {
    expect(shareFlightQuery(READY_WITH_NOTES)).toBe(PARCEL);
    expect(
      shareFlightQuery({
        ...READY_WITH_NOTES,
        phase: { kind: "loading" },
        parcelNodeId: null,
      }),
    ).toBeNull();
    expect(
      shareFlightQuery({
        ...READY_WITH_NOTES,
        phase: {
          kind: "ready",
          data: {
            ...READY_DATA,
            property: { ...READY_DATA.property, parcelNodeId: "" },
          },
        },
        parcelNodeId: "",
      }),
    ).toBeNull();
  });

  it("notes survive the grant instrument mapping (violate: dropping notes)", () => {
    const loaded = shareGrantFromInstrument({
      kind: "grant-scoped-share-instrument",
      grantId: GRANT_ID,
      parcelNodeId: PARCEL,
      expiresAt: "2026-09-26T00:00:00.000Z",
      property: READY_DATA.property,
      brief: ZONED_BRIEF,
      dossier: { notes: NOTES, address: "801 Pine St", savedAt: null, drawings: null, chatSummary: null },
      artifacts: { xray: { state: "exported" }, sitePlan: { state: "withheld" }, terrain: { state: "withheld" } },
    });
    expect(loaded.parcelNodeId).toBe(PARCEL);
    expect(loaded.phase.kind).toBe("ready");
    expect(shareNotesFromDossier(loaded.dossier)).toBe(NOTES);
    expect(loaded.artifacts.xray).toBe(true);
    expect(loaded.artifacts.sitePlan).toBe(false);
    const html = renderToStaticMarkup(<SharedDossierDock share={READY_WITH_NOTES} />);
    expect(html).toContain('data-testid="share-dossier-notes"');
    expect(html).toContain(NOTES);
    expect(html).toContain('data-testid="share-live-view"');
  });

  it("an instrument without notes does not invent them (violate: fabricating notes)", () => {
    const loaded = shareGrantFromInstrument({
      parcelNodeId: PARCEL,
      property: READY_DATA.property,
      brief: ZONED_BRIEF,
      dossier: { notes: "   " },
    });
    expect(shareNotesFromDossier(loaded.dossier)).toBeNull();
  });

  it("post-sign-in restores a stashed grant id", () => {
    const stash = memStash({ [SHARE_FUNNEL_GRANT_STASH_KEY]: GRANT_ID });
    const landing = resolveShareLanding(
      { pathname: "/", hash: "", search: "?signed_in=1" },
      stash,
    );
    expect(landing).toEqual({ token: null, grantId: GRANT_ID, restored: true });
    expect(stash.bag.has(SHARE_FUNNEL_GRANT_STASH_KEY)).toBe(false);
  });
});

describe("W0 share pin stays a scalar — fails if share opens an array", () => {
  it("ExplorerMap still pins openToolId to SHARED_ANALYSIS_TOOL_ID, never an array", () => {
    const source = readFileSync(resolve(__dirname, "../browse/ExplorerMap.tsx"), "utf8");
    expect(source).toMatch(/share \? SHARED_ANALYSIS_TOOL_ID : null/);
    expect(source).not.toMatch(/share \? \[SHARED_ANALYSIS_TOOL_ID/);
    expect(source).not.toMatch(/openToolIds=\{share/);
    expect(SHARED_ANALYSIS_TOOL_ID).toBe("shared-analysis");
  });

  it("share flight keeps shared-analysis (violate: lookup steals Brief)", () => {
    const source = readFileSync(
      resolve(__dirname, "../browse/ExplorerMap.tsx"),
      "utf8",
    );
    const idx = source.indexOf("shareFlightDoneRef.current = true");
    expect(idx).toBeGreaterThan(0);
    const slice = source.slice(idx, idx + 220);
    expect(slice).toContain("keepDock: true");
    expect(slice).toContain("quiet: true");
  });
});

describe("W2.1 browser /s/{id} 302s to the SPA (violate: HTML instrument for navigations)", () => {
  it("document navigation without format redirects; format=html does not", async () => {
    expect(
      isBrowserShareNavigation({
        secFetchDest: "document",
        secFetchMode: "navigate",
      }),
    ).toBe(true);
    expect(
      isBrowserShareNavigation({
        queryFormat: "html",
        secFetchDest: "document",
      }),
    ).toBe(false);
    expect(
      isBrowserShareNavigation({
        queryFormat: "json",
        secFetchDest: "document",
      }),
    ).toBe(false);

    const rec: {
      headers: Record<string, string>;
      statusCode: number;
      ended: boolean;
    } = { headers: {}, statusCode: 0, ended: false };
    const res = {
      setHeader(k: string, v: string) {
        rec.headers[k] = v;
        return res;
      },
      status(n: number) {
        rec.statusCode = n;
        return res;
      },
      json() {
        return res;
      },
      send() {
        return res;
      },
      end() {
        rec.ended = true;
        return res;
      },
    };
    await handlePeShareGrant(
      {
        method: "GET",
        query: { grantId: GRANT_ID },
        headers: { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
      } as unknown as VercelRequest,
      res as unknown as VercelResponse,
      {
        store: createMemoryShareGrantStore([
          {
            id: GRANT_ID,
            grantorUserId: "user-1",
            grantorTenantId: "tenant-a",
            parcelNodeId: PARCEL,
            createdAt: "2026-08-27T00:00:00.000Z",
            expiresAt: "2026-09-26T00:00:00.000Z",
            revokedAt: null,
          },
        ]),
      },
    );
    expect(rec.statusCode).toBe(302);
    expect(rec.headers.Location).toBe(`/share?g=${GRANT_ID}`);
    expect(rec.ended).toBe(true);
  });
});

describe("W2.4 live-view href is fail-closed", () => {
  it("builds a parcel deep-link and a grant live view; empty parcel refuses", () => {
    expect(liveViewHref({ parcelNodeId: PARCEL })).toBe(
      `/?parcelNodeId=${encodeURIComponent(PARCEL)}`,
    );
    expect(liveViewHref({ parcelNodeId: PARCEL, grantId: GRANT_ID })).toBe(
      `/s/${GRANT_ID}`,
    );
    expect(liveViewHref({ parcelNodeId: "" })).toBeNull();
    expect(liveViewHref({ parcelNodeId: "not-a-parcel" })).toBeNull();
  });

  it("PDF viewer puts the live-view link at the top (violate: download-only chrome)", () => {
    const html = renderToStaticMarkup(
      <PdfViewer
        href="/api/pe-site-plan-export?kind=dossier"
        title="X-ray"
        parcelNodeId={PARCEL}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('data-testid="pdf-viewer"');
    expect(html).toContain('data-testid="pdf-live-view-link"');
    expect(html.indexOf("pdf-live-view-link")).toBeLessThan(
      html.indexOf("pdf-viewer-frame"),
    );
    expect(html).toContain('data-testid="pdf-viewer-download"');
  });
});

describe("W2.5 / W2.6 reports bubble tabs — not a new surface", () => {
  afterEach(() => {
    resetPropertyEntitlementsForTests();
  });

  it("Reports tool has My reports | Shared with me inside the existing dock", () => {
    primePropertyEntitlement(PARCEL, {
      status: "ready",
      authenticated: true,
      tier: "free",
      propertyUnlocked: false,
      freeMessagesUsed: 0,
      freeMessagesLimit: 3,
      softFallback: false,
      subscriptionTier: null,
      devRole: false,
      entitlementSource: null,
    });
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="reports"
        onOpenToolChange={() => {}}
        activeParcelNodeId={PARCEL}
        host={{ openPaywall: () => {} }}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html).toContain('data-testid="reports-tabs"');
    expect(html).toContain("My reports");
    expect(html).toContain("Shared with me");
    expect(html).toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
  });

  it("Shared with me lists a received share with notes; empty invents nothing", () => {
    expect(parseReceivedShares(null)).toEqual([]);
    expect(parseReceivedShares("{not-json")).toEqual([]);
    const store = {
      bag: new Map<string, string>(),
      getItem(k: string) {
        return this.bag.get(k) ?? null;
      },
      setItem(k: string, v: string) {
        this.bag.set(k, v);
      },
    };
    const rows = recordReceivedShare(
      {
        id: GRANT_ID,
        grantId: GRANT_ID,
        parcelNodeId: PARCEL,
        address: "801 Pine St",
        notes: NOTES,
        expiresAt: "2026-09-26T00:00:00.000Z",
        artifacts: { xray: true, sitePlan: false, terrain: false },
        receivedAt: "2026-08-27T00:00:00.000Z",
      },
      store,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.notes).toBe(NOTES);
    expect(store.bag.get(SHARE_RECEIVED_STORAGE_KEY)).toContain(NOTES);
    const dropped = recordReceivedShare(
      {
        id: "",
        grantId: null,
        parcelNodeId: "",
        address: null,
        notes: "should not land",
        expiresAt: null,
        artifacts: { xray: false, sitePlan: false, terrain: false },
        receivedAt: "2026-08-27T00:00:00.000Z",
      },
      store,
    );
    expect(dropped).toHaveLength(1);
    expect(JSON.stringify(dropped)).not.toContain("should not land");
  });
});
