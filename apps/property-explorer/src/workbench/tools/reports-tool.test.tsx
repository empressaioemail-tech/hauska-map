// Option D Reports dock — picker + one document, not the stacked wall.
//
// Static render via react-dom/server. Pins:
//   - first paint is the picker, not three stacked engines;
//   - coming-soon names live in the picker menu;
//   - a store-seeded selection mounts exactly that engine;
//   - persisted site-plan / terrain snapshots still hydrate when that
//     document is selected; another property stays clean;
//   - no active property → the chassis' honest select-first state.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import type { SitePlanExportSectionState } from "../../browse/SitePlanExportSection";
import type { TerrainExportSectionState } from "../../browse/TerrainExportSection";
import {
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
  type PropertyEntitlementState,
} from "../../lib/entitlementClient";
import { afterEach } from "vitest";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  getActiveParcelFacts: () => ({
    address: "714 Spring St, Bastrop, TX",
    countyName: "Bastrop",
  }),
};
const noop = () => {};

function ent(
  overrides: Partial<PropertyEntitlementState> = {},
): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: true,
    tier: "paid",
    propertyUnlocked: true,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    subscriptionTier: "studio",
    devRole: false,
    entitlementSource: "stripe_sub",
    ...overrides,
  };
}

function render(opts: {
  activeParcelNodeId?: string | null;
  store?: ReturnType<typeof createWorkbenchToolStateStore>;
}): string {
  return renderToStaticMarkup(
    <Workbench
      tools={WORKBENCH_TOOLS}
      openToolId="reports"
      onOpenToolChange={noop}
      activeParcelNodeId={opts.activeParcelNodeId ?? null}
      host={host}
      store={opts.store ?? createWorkbenchToolStateStore({ storage: null })}
    />,
  );
}

const SITE_PLAN_STATE: SitePlanExportSectionState = {
  format: "pdf-site-plan",
  notice: "Site plan ready — download above.",
  result: {
    ok: true,
    parcelNodeId: "48021:123",
    atom: {
      parcelNodeId: "48021:123",
      sourceCitation: "Parcel GIS + setback-rule + USGS 3DEP",
      fetchedAt: "2026-07-28T00:00:00.000Z",
      confidence: { value: 0.92, kind: "asserted", provenance: "engine-api" },
      artifacts: {
        "pdf-site-plan": { format: "pdf-site-plan", byteCount: 204800 },
      },
    },
    selectedFormat: "pdf-site-plan",
    downloadUrl: "/api/pe-site-plan-export/download?format=pdf-site-plan",
    downloads: {
      "pdf-site-plan": "/api/pe-site-plan-export/download?format=pdf-site-plan",
    },
  },
};

const TERRAIN_STATE: TerrainExportSectionState = {
  format: "glb",
  notice: "Terrain export ready — download above.",
  result: {
    ok: true,
    parcelNodeId: "48021:123",
    atom: {
      parcelNodeId: "48021:123",
      sourceCitation: "USGS 3DEP",
      fetchedAt: "2026-07-28T00:00:00.000Z",
      confidence: { value: 0.9, kind: "asserted", provenance: "engine-api" },
      artifacts: { glb: { format: "glb", byteCount: 102400 } },
    },
    selectedFormat: "glb",
    downloadUrl: "/api/pe-terrain-export/download?format=glb",
    downloads: { glb: "/api/pe-terrain-export/download?format=glb" },
  },
};

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

describe("reports tool — Option D picker, not the stacked wall", () => {
  it("first paint is the picker; site-plan and flood engines are not both mounted", () => {
    primePropertyEntitlement("48021:123", ent());
    const html = render({ activeParcelNodeId: "48021:123" });
    expect(html).toContain('data-tool="reports"');
    expect(html).toContain('data-testid="reports-tool"');
    expect(html).toContain('data-testid="reports-doc-picker"');
    expect(html).toContain("Choose a report or export");
    expect(html).toContain("Feasibility Study");
    expect(html).toContain("Comparison report");
    expect(html).toContain("Coming soon");
    expect(html).not.toContain('data-testid="site-plan-export-section"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
    expect(html).toContain("The inspect card and map layers stay free.");
  });

  it("selecting SPPDF mounts only the site-plan engine", () => {
    primePropertyEntitlement("48021:123", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "SPPDF");
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="site-plan-export-section"');
    expect(html).toContain('data-testid="site-plan-export-run"');
    expect(html).not.toContain('data-testid="site-plan-format-picker"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
    expect(html).toContain('data-testid="reports-doc-card"');
    expect(html).toContain("Site plan sheet");
  });

  it("selecting FLOOD mounts only the flood engine", () => {
    primePropertyEntitlement("48021:123", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "FLOOD");
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="flood-drainage-section"');
    expect(html).toContain('data-testid="flood-run"');
    expect(html).not.toContain('data-testid="site-plan-export-section"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
  });

  it("no active property → the honest select-first state, no export UI", () => {
    const html = render({ activeParcelNodeId: null });
    expect(html).toContain('data-testid="dock-no-property"');
    expect(html).not.toContain('data-testid="site-plan-export-section"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
    expect(html).not.toContain('data-testid="reports-doc-picker"');
  });
});

describe("reports tool — per-property persistence via the chassis store", () => {
  it("reopen of SPPDF renders the persisted last result + download link", () => {
    primePropertyEntitlement("48021:123", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "SPPDF");
    store.set("48021:123", "reports.sitePlan", SITE_PLAN_STATE);
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="site-plan-export-result"');
    expect(html).toContain('data-testid="site-plan-download-link"');
    expect(html).toContain("Download PDF");
    expect(html).toContain("200 KB");
    expect(html).toContain("Site plan ready — download above.");
    expect(html).toContain("Re-run");
    expect(html).not.toContain("Download pdf-site-plan");
    expect(html).toContain("Parcel GIS + setback-rule + USGS 3DEP");
    expect(html).not.toContain('data-testid="terrain-download-link"');
  });

  it("reopen of TERGLB renders the persisted terrain result", () => {
    primePropertyEntitlement("48021:123", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "TERGLB");
    store.set("48021:123", "reports.terrain", TERRAIN_STATE);
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="terrain-export-result"');
    expect(html).toContain('data-testid="terrain-download-link"');
    expect(html).toContain("Download GLB");
    expect(html).toContain("100 KB");
    expect(html).toContain("USGS 3DEP");
    expect(html).not.toContain('data-testid="site-plan-download-link"');
  });

  it("another property renders CLEAN — persisted state never bleeds through", () => {
    primePropertyEntitlement("48491:999", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "SPPDF");
    store.set("48021:123", "reports.sitePlan", SITE_PLAN_STATE);
    store.set("48021:123", "reports.terrain", TERRAIN_STATE);
    store.set("48491:999", "reports.selectedDoc", "SPPDF");
    const html = render({ activeParcelNodeId: "48491:999", store });
    expect(html).not.toContain('data-testid="site-plan-download-link"');
    expect(html).not.toContain('data-testid="terrain-download-link"');
    expect(html).not.toContain("Site plan ready");
  });
});
