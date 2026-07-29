// W2 Reports bubble — dock render + per-property persistence tests.
//
// Static render via react-dom/server (node env, effects do not run — the same
// pattern as workbench.test.tsx). Pins:
//   - the reports tool renders BOTH export sections (site-plan + terrain)
//     inside the ONE shared dock;
//   - a persisted snapshot in the chassis store re-renders the last export
//     result + download link on reopen (the store, not the mount, owns it);
//   - persisted state is per-property: another property renders clean;
//   - no active property → the chassis' honest select-first state.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import type { SitePlanExportSectionState } from "../../browse/SitePlanExportSection";
import type { TerrainExportSectionState } from "../../browse/TerrainExportSection";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  getActiveParcelFacts: () => ({ address: "714 Spring St", countyName: "Bastrop" }),
};
const noop = () => {};

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
  notice: "Site plan ready — download below.",
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
  notice: "Terrain export ready — download below.",
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

describe("reports tool — all three report sections render in the dock", () => {
  it("renders the site-plan, FLOOD & DRAINAGE (FD2), and terrain sections", () => {
    const html = render({ activeParcelNodeId: "48021:123" });
    expect(html).toContain('data-tool="reports"');
    expect(html).toContain('data-testid="reports-tool"');
    expect(html).toContain('data-testid="site-plan-export-section"');
    expect(html).toContain('data-testid="flood-drainage-section"');
    expect(html).toContain('data-testid="terrain-export-section"');
    expect(html).toContain('data-testid="site-plan-format-picker"');
    expect(html).toContain('data-testid="terrain-format-picker"');
    expect(html).toContain('data-testid="site-plan-export-run"');
    expect(html).toContain('data-testid="flood-run"');
    expect(html).toContain('data-testid="terrain-export-run"');
    // Section ORDER: the two $15-scope reports first, Pro-only terrain last.
    expect(html.indexOf('data-testid="site-plan-export-section"')).toBeLessThan(
      html.indexOf('data-testid="flood-drainage-section"'),
    );
    expect(html.indexOf('data-testid="flood-drainage-section"')).toBeLessThan(
      html.indexOf('data-testid="terrain-export-section"'),
    );
    // Fresh property: no stale results.
    expect(html).not.toContain('data-testid="site-plan-download-link"');
    expect(html).not.toContain('data-testid="terrain-download-link"');
    expect(html).not.toContain('data-testid="flood-result"');
  });

  it("no active property → the honest select-first state, no export UI", () => {
    const html = render({ activeParcelNodeId: null });
    expect(html).toContain('data-testid="dock-no-property"');
    expect(html).not.toContain('data-testid="site-plan-export-section"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
  });
});

describe("reports tool — per-property persistence via the chassis store", () => {
  it("reopen renders the persisted last result + download links (store-owned)", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.sitePlan", SITE_PLAN_STATE);
    store.set("48021:123", "reports.terrain", TERRAIN_STATE);
    const html = render({ activeParcelNodeId: "48021:123", store });
    expect(html).toContain('data-testid="site-plan-export-result"');
    expect(html).toContain('data-testid="site-plan-download-link"');
    expect(html).toContain("Site plan ready");
    expect(html).toContain('data-testid="terrain-export-result"');
    expect(html).toContain('data-testid="terrain-download-link"');
    // The honest provenance/confidence lines survive the round-trip too.
    expect(html).toContain("Parcel GIS + setback-rule + USGS 3DEP");
    expect(html).toContain("USGS 3DEP");
  });

  it("another property renders CLEAN — persisted state never bleeds through", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "reports.sitePlan", SITE_PLAN_STATE);
    store.set("48021:123", "reports.terrain", TERRAIN_STATE);
    const html = render({ activeParcelNodeId: "48491:999", store });
    expect(html).not.toContain('data-testid="site-plan-download-link"');
    expect(html).not.toContain('data-testid="terrain-download-link"');
    expect(html).not.toContain("Site plan ready");
  });
});
