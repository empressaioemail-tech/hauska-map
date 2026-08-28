// Option D Reports dock — picker + one document, not the stacked wall.
//
// Static render via react-dom/server. Pins:
//   - first paint is the picker, not three stacked engines;
//   - coming-soon names live in the picker menu;
//   - a store-seeded selection mounts exactly that engine;
//   - persisted site-plan / terrain snapshots still hydrate when that
//     document is selected; another property stays clean;
//   - no active property → My reports library, not select-first.

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
import { RECORDS_NOT_WIRED_NOTICE } from "../../lib/recordsRequestClient";
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
    expect(html).toContain("X-ray");
    expect(html).toContain("Flood and Drainage");
    expect(html).toContain("Site plan");
    expect(html).toContain("Terrain");
    expect(html).not.toContain('data-testid="reports-doc-option-FEAS"');
    expect(html).not.toContain('data-testid="reports-doc-option-COMP"');
    expect(html).not.toContain("Feasibility Study");
    expect(html).not.toContain("Comparison report");
    expect(html).not.toContain("ready of");
    expect(html).not.toContain("10 ready");
    expect(html).toContain('data-testid="reports-freshness"');
    expect(html).toContain("Reports and exports");
    expect(html).not.toContain(">Document<");
    expect(html).not.toContain("In-app instruments");
    expect(html).not.toContain('data-testid="site-plan-export-section"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
    expect(html).toContain("The inspect card and map layers stay free.");
  });

  it("selecting SITEPLAN mounts the site-plan engine with format picker", () => {
    primePropertyEntitlement("48021:123", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "SITEPLAN");
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="site-plan-export-section"');
    expect(html).toContain('data-testid="site-plan-export-run"');
    expect(html).toContain('data-testid="site-plan-format-picker"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
    expect(html).toContain('data-testid="reports-doc-card"');
    expect(html).toContain("Site plan");
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

  it("selecting REC mounts the records request scaffold", () => {
    primePropertyEntitlement("48021:123", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "REC");
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="records-request-section"');
    expect(html).toContain("Records request");
    expect(html).toContain("Property records");
    expect(html).toContain(RECORDS_NOT_WIRED_NOTICE);
    expect(html).toContain('data-testid="records-request-run"');
    expect(html).not.toContain('data-testid="site-plan-export-section"');
  });

  it("picker lists Records request as a live verb, not a Coming soon report", () => {
    primePropertyEntitlement("48021:123", ent());
    const html = render({ activeParcelNodeId: "48021:123" });
    expect(html).toContain('data-testid="reports-doc-option-REC"');
    expect(html).toContain("Records request");
  });

  it("selecting REC with Studio entitlement mounts the records section", () => {
    primePropertyEntitlement(
      "48021:123",
      ent({ subscriptionTier: "studio", devRole: false }),
    );
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "REC");
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="records-request-section"');
    expect(html).not.toContain('data-testid="records-studio-lock"');
  });

  it("selecting REC with Solo entitlement shows the Studio lock", () => {
    primePropertyEntitlement(
      "48021:123",
      ent({ subscriptionTier: "solo", devRole: false }),
    );
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "REC");
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="records-studio-lock"');
    expect(html).not.toContain('data-testid="records-request-section"');
  });

  it("no active property → My reports library, not select-a-parcel first", () => {
    const html = render({ activeParcelNodeId: null });
    expect(html).toContain('data-testid="reports-tool"');
    expect(html).toContain('data-testid="reports-tabs"');
    expect(html).not.toContain('data-testid="dock-no-property"');
    expect(html).not.toContain("Select a property first");
    expect(html).not.toContain('data-testid="site-plan-export-section"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
    // SUPERSEDED 2026-08-28. This used to assert the generator was ABSENT
    // with no parcel. The operator asked for the opposite: the generator
    // module is the top of this dock in both states, replacing the amber
    // notice. What must still be absent is a RUNNING engine, since those
    // need a parcel — pinned on the two engine sections above.
    expect(html).toContain('data-testid="reports-doc-picker"');
  });
});

describe("reports tool — per-property persistence via the chassis store", () => {
  it("reopen of SPPDF renders the persisted last result + download link", () => {
    primePropertyEntitlement("48021:123", ent());
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.selectedDoc", "SITEPLAN");
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
    store.set("48021:123", "reports.selectedDoc", "TERRAIN");
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
    store.set("48021:123", "reports.selectedDoc", "SITEPLAN");
    store.set("48021:123", "reports.sitePlan", SITE_PLAN_STATE);
    store.set("48021:123", "reports.terrain", TERRAIN_STATE);
    store.set("48491:999", "reports.selectedDoc", "SITEPLAN");
    const html = render({ activeParcelNodeId: "48491:999", store });
    expect(html).not.toContain('data-testid="site-plan-download-link"');
    expect(html).not.toContain('data-testid="terrain-download-link"');
    expect(html).not.toContain("Site plan ready");
  });
});

describe("the filed-report library is account-wide, so it renders in BOTH states", () => {
  // THE REGRESSION. `ReportsLibrary` used to render only on the
  // no-parcel branch, so selecting a property made the whole filed-report
  // list disappear — same account, same reports, hidden because you clicked
  // a parcel. Operator 2026-08-28 asked for the pre-selection presentation
  // in both states. Pinned on both branches so removing either fails.

  it("renders with NO property selected", () => {
    const html = render({ activeParcelNodeId: null });
    // The library fetches in an effect, so static markup catches its loading
    // state. That IS the library mounting; the loaded list is proven by the
    // pure reports-seen tests.
    expect(html).toContain('data-testid="reports-library-loading"');
  });

  it("renders WITH a property selected", () => {
    const html = render({ activeParcelNodeId: "48021:123" });
    expect(html).toContain('data-testid="reports-library-loading"');
  });

  it("keeps the no-property guidance only where it belongs", () => {
    // Guard against 'fixing' this by showing the picker prompt everywhere.
    expect(render({ activeParcelNodeId: null })).toContain(
      'data-testid="reports-no-property"',
    );
    expect(render({ activeParcelNodeId: "48021:123" })).not.toContain(
      'data-testid="reports-no-property"',
    );
  });

  it("puts the GENERATOR above the library, in both states", () => {
    // Operator 2026-08-28: the generator module replaces the amber notice at
    // the top, and My reports always lives under it. Order is the ask, so
    // order is what is pinned — not merely that both are present.
    for (const parcel of [null, "48021:123"]) {
      const html = render({ activeParcelNodeId: parcel });
      const gen = html.indexOf("reports-doc-picker");
      const lib = html.indexOf("reports-library");
      expect(gen).toBeGreaterThan(-1);
      expect(lib).toBeGreaterThan(-1);
      expect(gen).toBeLessThan(lib);
    }
  });

  it("no longer stacks a SECOND storage area above the generator", () => {
    // The records-runs inbox was a second list of filed work sitting above
    // the generator. Records requests stay reachable by picking Records in
    // the generator itself, so removing the duplicate list costs nothing.
    for (const parcel of [null, "48021:123"]) {
      expect(render({ activeParcelNodeId: parcel })).not.toContain(
        'data-testid="records-runs-inbox"',
      );
    }
  });
});

describe("picking a report BEFORE picking a property", () => {
  // useDockToolState refuses writes with no active parcel ("no phantom-
  // property writes") because that state is keyed BY property. Correct — but
  // it meant choosing a report first silently did nothing: the picker closed
  // on an empty module and the choice was gone. Operator 2026-08-28: let me
  // pick the report, then prompt me for the property via the header pill.

  it("shows the doc picker with no property selected", () => {
    const html = render({ activeParcelNodeId: null });
    expect(html).toContain('data-testid="reports-doc-picker"');
  });

  it("still tells you what is missing, in the header, not the body", () => {
    // The pill is chassis-rendered for any property-scoped tool.
    const html = render({ activeParcelNodeId: null });
    expect(html).toContain('data-testid="dock-select-property-reports"');
  });

  it("does NOT run an engine without a parcel", () => {
    // Holding a choice must never be mistaken for being able to act on it.
    const html = render({ activeParcelNodeId: null });
    expect(html).not.toContain('data-testid="site-plan-export-section"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
  });
});
