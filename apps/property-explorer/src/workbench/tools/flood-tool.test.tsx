// FD2 FLOOD & DRAINAGE — the report SECTION inside the Reports & exports
// bubble (the standalone flood bubble is GONE) + persistence + honest-empty
// + dossier-attach + map-overlay-hint tests.
//
// Static render via react-dom/server through the REAL Workbench + registry
// (the repo's component-test idiom: effects don't run; entitlement primed
// via the module cache; per-property state seeded through the chassis
// store). Pins:
//   - NO standalone flood bubble; the section renders inside the Reports
//     tool alongside site-plan + terrain;
//   - PAID gate is the Reports tool's whole-tool lock: anon → sign-in-first;
//     free signed-in → LOCKED with the unified two-choice flow (flood is IN
//     the $15 unlock — NEVER Pro-only); property-unlocked and Pro render
//     the run state (terrain alone keeps its per-section Pro lock);
//   - run state: generate button (honest ~15-45 s copy lives in the busy
//     state, not asserted here — static render can't click);
//   - a persisted study renders the mini grid viz (KEPT per operator) —
//     zones + ponding + exits + parcel ring — legend, provenance line,
//     briefing, and the PDF export link, PLUS the map-overlay hint when the
//     host implements setFloodMapOverlay (one study feeds dock AND map);
//   - PERSISTENCE MIGRATION: the chassis-store key stays "flood" — a study
//     persisted before the bubble folded into Reports hydrates unchanged;
//   - honest-empty renders the ENGINE reason verbatim, no viz, no export;
//   - persistence is per-property (another parcel renders clean);
//   - the dossier attach maps the flood export to a kind:"flood-drainage"
//     entry carrying the RE-DOWNLOAD path (never bytes).

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import {
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
  type PropertyEntitlementState,
} from "../../lib/entitlementClient";
import {
  floodDrainageDownloadPath,
  type FloodDrainageStudyView,
} from "../../lib/floodDrainageClient";
import type { FloodToolStoredState } from "./FloodTool";
import { exportEntryFromResult, attachExportToDossier } from "./reports-dossier";

const PARCEL = "48021:54321";
const OTHER = "48055:99999";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  getActiveParcelFacts: () => ({ address: "714 Spring St", countyName: "Bastrop" }),
};
/** A host WITH the map-overlay seam (ExplorerMap's real shape). */
const overlayHost: WorkbenchHostActions = {
  ...host,
  setFloodMapOverlay: () => {},
};
const noop = () => {};

function ent(overrides: Partial<PropertyEntitlementState>): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: true,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    ...overrides,
  };
}

function render(opts: {
  activeParcelNodeId?: string | null;
  store?: ReturnType<typeof createWorkbenchToolStateStore>;
  host?: WorkbenchHostActions;
}): string {
  return renderToStaticMarkup(
    <Workbench
      tools={WORKBENCH_TOOLS}
      openToolId="reports"
      onOpenToolChange={noop}
      activeParcelNodeId={
        opts.activeParcelNodeId === undefined ? PARCEL : opts.activeParcelNodeId
      }
      host={opts.host ?? host}
      store={opts.store ?? createWorkbenchToolStateStore({ storage: null })}
    />,
  );
}

function fixtureStudy(): FloodDrainageStudyView {
  return {
    parcelNodeId: PARCEL,
    catchmentGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.324, 30.106],
                [-97.314, 30.106],
                [-97.314, 30.116],
                [-97.324, 30.116],
                [-97.324, 30.106],
              ],
            ],
          },
          properties: { zone: "catchment" },
        },
      ],
    },
    drainageZonesGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.322, 30.108],
                [-97.316, 30.108],
                [-97.316, 30.114],
                [-97.322, 30.114],
                [-97.322, 30.108],
              ],
            ],
          },
          properties: { zone: "catchment" },
        },
      ],
    },
    rainfallResultGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.3195, 30.1105],
                [-97.3185, 30.1105],
                [-97.3185, 30.1115],
                [-97.3195, 30.1115],
                [-97.3195, 30.1105],
              ],
            ],
          },
          properties: {},
        },
      ],
    },
    flowLinesGeoJson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-97.321, 30.113],
              [-97.3185, 30.1102],
            ],
          },
          properties: { accumulation: 120 },
        },
      ],
    },
    rainfallDepthInches: 9.5,
    rainfallSource: "noaa-atlas14",
    demProvenance: { source: "usgs:3dep-dem", resolutionMeters: 10 },
    briefing:
      "The upstream catchment delivers runoff toward the parcel pour point; verify finished-floor elevation against the ponding scenario before locking the envelope.",
    flowExits: [{ lng: -97.3185, lat: 30.1102, bearingDeg: 135 }],
    parcelRingWgs84: [
      [-97.32, 30.11],
      [-97.318, 30.11],
      [-97.318, 30.112],
      [-97.32, 30.112],
      [-97.32, 30.11],
    ],
    catchmentBbox: {
      westLng: -97.324,
      southLat: 30.106,
      eastLng: -97.314,
      northLat: 30.116,
    },
  };
}

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

describe("flood & drainage — folded INSIDE the Reports bubble (no standalone bubble)", () => {
  it("no flood bubble in the cluster; the section renders inside the reports dock", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const html = render({});
    expect(html).not.toContain('data-testid="workbench-bubble-flood"');
    expect(html).toContain('data-tool="reports"');
    expect(html).toContain('data-testid="flood-drainage-section"');
    // Alongside the sibling report sections, in the ONE dock.
    expect(html).toContain('data-testid="site-plan-export-section"');
  });

  it("anon → the Reports sign-in-first state (no flood run UI)", () => {
    primePropertyEntitlement(PARCEL, ent({ authenticated: false }));
    const html = render({});
    expect(html).toContain('data-testid="reports-locked-sign-in"');
    expect(html).not.toContain('data-testid="flood-run"');
  });

  it("free signed-in → the Reports LOCK with the unified two-choice flow — NEVER Pro-only", () => {
    primePropertyEntitlement(PARCEL, ent({}));
    const html = render({});
    expect(html).toContain('data-testid="reports-locked"');
    // Flood & drainage is IN the $15 property unlock: the standard
    // two-choice flow, not the Pro-only variant, and the value line names it.
    expect(html).toMatch(/data-testid="reports-locked"[^>]*data-pro-only="false"/);
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).toContain("flood &amp; drainage study");
    expect(html).not.toContain('data-testid="flood-run"');
  });

  it("property-unlocked ($15) → the run state renders (terrain alone stays Pro-locked)", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const html = render({});
    expect(html).toContain('data-testid="flood-drainage-section"');
    expect(html).toContain('data-testid="flood-run"');
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).toContain('data-testid="terrain-pro-lock"');
  });

  it("Pro → the run state renders", () => {
    primePropertyEntitlement(PARCEL, ent({ tier: "paid" }));
    const html = render({});
    expect(html).toContain('data-testid="flood-run"');
  });

  it("no active property → the chassis' honest select-first state", () => {
    const html = render({ activeParcelNodeId: null });
    expect(html).toContain("Select a property");
    expect(html).not.toContain('data-testid="flood-drainage-section"');
  });
});

describe("flood section — persisted study renders the mini viz (KEPT) + map-overlay hint", () => {
  it("viz + legend + provenance + briefing + PDF export link", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: fixtureStudy(),
      notice: null,
    } satisfies FloodToolStoredState);
    const html = render({ store });

    expect(html).toContain('data-testid="flood-result"');
    expect(html).toContain('data-testid="flood-viz"');
    expect(html).toContain('data-testid="flood-viz-parcel"');
    expect(html).toContain('data-testid="flood-viz-catchment"');
    expect(html).toContain('data-testid="flood-viz-zone"');
    expect(html).toContain('data-testid="flood-viz-ponding"');
    expect(html).toContain('data-testid="flood-viz-flow"');
    expect(html).toContain('data-testid="flood-viz-exit"');
    expect(html).toContain('data-testid="flood-viz-legend"');

    // Honest provenance: DEM source/res + rainfall forcing + source.
    expect(html).toContain("usgs:3dep-dem");
    expect(html).toContain("10 m");
    expect(html).toContain("NOAA Atlas 14");
    expect(html).toContain('9.5&quot;');

    // Layman briefing verbatim.
    expect(html).toContain("verify finished-floor elevation");

    // PDF export via the gated BFF download (folded function, report param).
    expect(html).toContain('data-testid="flood-download-link"');
    expect(html).toContain(
      "/api/pe-site-plan-export?report=flood-drainage&amp;action=download",
    );
    expect(html).toContain("48021_54321_flood_drainage.pdf");
  });

  it("host WITH the map seam → the map-overlay hint renders (one study feeds dock AND map)", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: fixtureStudy(),
      notice: null,
    } satisfies FloodToolStoredState);
    const html = render({ store, host: overlayHost });
    expect(html).toContain('data-testid="flood-map-overlay-hint"');
    expect(html).toContain("Drainage overlay drawn on the map");
    // Host WITHOUT the seam (older injected test hosts) → no hint, dock only.
    const bare = render({ store });
    expect(bare).not.toContain('data-testid="flood-map-overlay-hint"');
  });

  it("PERSISTENCE MIGRATION: the pre-consolidation chassis key \"flood\" hydrates unchanged", () => {
    // A study persisted while flood was its own bubble lives under the tool
    // id "flood". The section reads the SAME key — no migration, no loss.
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: fixtureStudy(),
      notice: null,
    } satisfies FloodToolStoredState);
    const html = render({ store });
    expect(html).toContain('data-testid="flood-result"');
    expect(html).toContain("Re-run study");
  });

  it("persistence is per-property: another parcel renders the clean run state", () => {
    primePropertyEntitlement(OTHER, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: fixtureStudy(),
      notice: null,
    } satisfies FloodToolStoredState);
    const html = render({ store, activeParcelNodeId: OTHER });
    expect(html).toContain('data-testid="flood-run"');
    expect(html).not.toContain('data-testid="flood-result"');
  });

  it("honest-empty renders the ENGINE reason verbatim — no viz, no export link", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const reason =
      "No significant drainage concentration modeled here (flat terrain within DEM resolution).";
    const study: FloodDrainageStudyView = {
      ...fixtureStudy(),
      catchmentGeoJson: { type: "FeatureCollection", features: [] },
      drainageZonesGeoJson: { type: "FeatureCollection", features: [] },
      rainfallResultGeoJson: null,
      flowLinesGeoJson: { type: "FeatureCollection", features: [] },
      flowExits: [],
      honestEmpty: { reason },
    };
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", { study, notice: null } satisfies FloodToolStoredState);
    const html = render({ store });
    expect(html).toContain('data-testid="flood-honest-empty"');
    expect(html).toContain(
      "No significant drainage concentration modeled here (flat terrain within DEM resolution).",
    );
    expect(html).not.toContain('data-testid="flood-viz"');
    expect(html).not.toContain('data-testid="flood-download-link"');
  });

  it("FD6 HONEST EMPTY PONDING: a real study with NO modeled ponding SAYS so", () => {
    // Zero ponding is a real result, not a rendering failure — but a legend
    // listing "Ponding" over a map drawing none reads as broken. The dock
    // states it in words and drops the swatch.
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: { ...fixtureStudy(), rainfallResultGeoJson: null },
      notice: null,
    } satisfies FloodToolStoredState);
    const html = render({ store });
    // Still a full, valid study — zones, flow and the export all render.
    expect(html).toContain('data-testid="flood-result"');
    expect(html).toContain('data-testid="flood-viz-zone"');
    expect(html).toContain('data-testid="flood-download-link"');
    // …and it says WHY there is no ponding, rather than showing nothing.
    expect(html).toContain('data-testid="flood-no-ponding"');
    expect(html).toContain("No modeled ponding on this parcel");
    expect(html).not.toContain("Ponding — standing water");
  });

  it("FD6: ponding SERVED but undrawable (null geometry) also reads as no ponding", () => {
    // The dock counts what the MAP will draw, so it can never claim ponding
    // the overlay is silently dropping.
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: {
        ...fixtureStudy(),
        rainfallResultGeoJson: {
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: null, properties: {} }],
        },
      } as FloodDrainageStudyView,
      notice: null,
    } satisfies FloodToolStoredState);
    const html = render({ store });
    expect(html).toContain('data-testid="flood-no-ponding"');
  });

  it("FD6: a study WITH ponding keeps the swatch and shows no empty-state line", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: fixtureStudy(),
      notice: null,
    } satisfies FloodToolStoredState);
    const html = render({ store });
    expect(html).toContain("Ponding — standing water");
    expect(html).not.toContain('data-testid="flood-no-ponding"');
  });

  it("a persisted error notice re-renders honestly", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", {
      study: null,
      notice: "Drainage study could not be produced for this parcel.",
    } satisfies FloodToolStoredState);
    const html = render({ store });
    expect(html).toContain('data-testid="flood-notice"');
    expect(html).toContain("could not be produced");
  });

  it("a study carrying the FD1 gradient note surfaces it in the provenance line", () => {
    primePropertyEntitlement(PARCEL, ent({ propertyUnlocked: true }));
    const study: FloodDrainageStudyView = {
      ...fixtureStudy(),
      gradient: {
        pngBase64: "iVBORw0KGgo=",
        bbox: { westLng: -97.324, southLat: 30.106, eastLng: -97.314, northLat: 30.116 },
        note: "Drainage field ramp from the D8 accumulation grid.",
      },
    };
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(PARCEL, "flood", { study, notice: null } satisfies FloodToolStoredState);
    const html = render({ store });
    expect(html).toContain('data-testid="flood-gradient-note"');
    expect(html).toContain("D8 accumulation grid");
  });
});

describe("flood export — dossier auto-attach (WB6 seam)", () => {
  it("maps the flood export to a kind:flood-drainage entry with the re-download path", () => {
    const entry = exportEntryFromResult(
      "flood-drainage",
      {
        selectedFormat: "pdf-flood-drainage",
        downloadUrl: floodDrainageDownloadPath(PARCEL),
      },
      () => "2026-07-29T00:00:00.000Z",
    );
    expect(entry.kind).toBe("flood-drainage");
    expect(entry.format).toBe("pdf-flood-drainage");
    expect(entry.downloadPath).toContain("report=flood-drainage");
    expect(entry.downloadPath).toContain("action=download");
  });

  it("attaches through the dossier upsert (deduped kind+format, latest wins)", async () => {
    const patches: unknown[] = [];
    const sentinel = { kind: "not-saved" } as const;
    const outcome = await attachExportToDossier(
      PARCEL,
      "flood-drainage",
      {
        selectedFormat: "pdf-flood-drainage",
        downloadUrl: floodDrainageDownloadPath(PARCEL),
      },
      {
        update: async (parcelNodeId, patch) => {
          expect(parcelNodeId).toBe(PARCEL);
          patches.push(
            typeof patch === "function" ? patch({ exports: [] } as never) : patch,
          );
          return sentinel;
        },
        now: () => "2026-07-29T00:00:00.000Z",
      },
    );
    expect(outcome).toBe(sentinel);
    expect(patches).toHaveLength(1);
    const exportsPatch = (patches[0] as { exports: Array<{ kind: string }> }).exports;
    expect(exportsPatch).toHaveLength(1);
    expect(exportsPatch[0].kind).toBe("flood-drainage");
  });
});
