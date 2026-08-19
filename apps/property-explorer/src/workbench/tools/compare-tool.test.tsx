// WB7 compare — dock-tool render tests (react-dom/server static markup, same
// pattern as workbench.test.tsx: effects don't run, so store-fed states are
// what render). Pins:
//   - compare is APPENDED to the registry, LIVE, and NOT property-scoped: it
//     renders in the ONE shared dock with no active property (no
//     dock-no-property gate, no second surface);
//   - selector states: signed-out, honest <2-saved empty state, one selected
//     (pick-second prompt), two selected (the fact table);
//   - fact-table honesty rendering: absents say "not verified here" (and the
//     specific absence copy), provisional stays provisional, per-fact source
//     captions render where carried;
//   - difference emphasis: rows where the two properties genuinely assert
//     different values carry data-differs="true"; two absences do not;
//   - GLOBAL persistence: state lives under the synthetic
//     COMPARE_GLOBAL_STATE_KEY in the SAME chassis store (survives with no
//     active property; a persisted comparison renders immediately on reopen
//     while the saved list refreshes).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import type { SavedPropertyRow } from "../../lib/savedPropertiesClient";
import {
  COMPARE_GLOBAL_STATE_KEY,
  CompareView,
} from "./CompareTool";
import type {
  BakedFacetPayload,
} from "../../lib/baked-facets";
import type { CompareSlotData, CompareStoredState } from "./compare-facts";

const host: WorkbenchHostActions = { openPaywall: () => {} };
const noop = () => {};

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

const ROW_A: SavedPropertyRow = {
  parcelNodeId: "48021:123",
  label: "104 Main St",
  updatedAt: "2026-07-28T10:00:00Z",
  snapshot: null,
};
const ROW_B: SavedPropertyRow = {
  parcelNodeId: "48055:987",
  label: "Caldwell tract",
  updatedAt: "2026-07-27T10:00:00Z",
  snapshot: null,
};

const ZONED_PAYLOAD: CompareSlotData = {
  parcelNodeId: "48021:123",
  facets: {
    parcelNodeId: "48021:123",
    countyFips: "48021",
    countyName: "Bastrop",
    baseFacts: {
      situsAddress: "104 Main St, Bastrop, TX",
      landUse: {
        code: "A1",
        description: "Single family residence",
        source: "bastrop-cad",
        vintage: "2025-11-02",
      },
      acreage: { value: 1.2, method: "cad-roll" },
    },
    zoning: {
      district: "P-2",
      provenance: {
        layerName: "Zoning_Districts",
        stampedAt: "2026-07-10T00:00:00.000Z",
      },
    },
    envelope: {
      status: "ok",
      provisional: true,
      approximate: true,
      district: "P-2",
      setbacks: { front_ft: 10, side_ft: 5, rear_ft: 10 },
      buildableAreaPct: 70,
      citationUrl:
        "https://library.municode.com/tx/bastrop/codes/code_of_ordinances",
    },
    facetCoverage: {
      baseFacts: true,
      landUse: true,
      acreage: true,
      zoning: true,
      envelope: true,
    },
    bakedAt: "2026-07-21T09:00:00.000Z",
  } as unknown as BakedFacetPayload,
  tier2: {
    flood: {
      status: "in-sfha",
      floodZone: "AE",
      zoneSubtype: "FLOODWAY",
      provenance: { source: "fema-nfhl", vintage: "2026-07-20T04:12:00.000Z" },
    },
  },
  snapshotAt: "2026-07-21T09:00:00.000Z",
  fetchedAt: "2026-07-29T00:00:00.000Z",
};

const ABSENT_PAYLOAD: CompareSlotData = {
  parcelNodeId: "48055:987",
  facets: {
    parcelNodeId: "48055:987",
    baseFacts: {},
    zoning: null,
    envelope: { status: "declined", declineReason: "no-zoning-stamp" },
    facetCoverage: { envelope: false, zoning: false },
  } as unknown as BakedFacetPayload,
  tier2: null,
  snapshotAt: null,
  fetchedAt: "2026-07-29T00:00:00.000Z",
};

const BOTH_SELECTED: CompareStoredState = {
  a: "48021:123",
  b: "48055:987",
  payloads: {
    "48021:123": ZONED_PAYLOAD,
    "48055:987": ABSENT_PAYLOAD,
  },
};

function renderView(opts: {
  phase?:
    | { kind: "loading" }
    | { kind: "ready"; items: SavedPropertyRow[] }
    | { kind: "sign-in" }
    | { kind: "notice"; text: string };
  stored?: CompareStoredState | null;
  failures?: Record<string, string>;
  onView?: (id: string) => void;
}): string {
  return renderToStaticMarkup(
    <CompareView
      phase={opts.phase ?? { kind: "ready", items: [ROW_A, ROW_B] }}
      stored={opts.stored ?? null}
      failures={opts.failures ?? {}}
      onSelect={noop}
      onView={opts.onView}
    />,
  );
}

// ---------------------------------------------------------------------------
// Registry + dock (the design law: one dock, no second surface).
// ---------------------------------------------------------------------------

describe("compare in the registry + dock", () => {
  it("is APPENDED live and NOT property-scoped", () => {
    const def = WORKBENCH_TOOLS.find((t) => t.id === "compare");
    expect(def).toBeDefined();
    expect(def?.status).toBe("live");
    expect(def?.propertyScoped).toBe(false);
    expect(def?.label).toBe("Compare");
    expect(WORKBENCH_TOOLS[WORKBENCH_TOOLS.length - 1]?.id).toBe("compare");
  });

  it("renders INSIDE the one shared dock with NO active property", () => {
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="compare"
        onOpenToolChange={noop}
        activeParcelNodeId={null}
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(1);
    expect(html).toContain('data-tool="compare"');
    // Non-property-scoped: the chassis must NOT gate on "select a property".
    expect(html).not.toContain('data-testid="dock-no-property"');
    expect(html).not.toContain('data-testid="dock-coming"');
  });
});

// ---------------------------------------------------------------------------
// Selector states.
// ---------------------------------------------------------------------------

describe("selector states", () => {
  it("signed-out → the sign-in state (the saved list is auth-gated)", () => {
    const html = renderView({ phase: { kind: "sign-in" } });
    expect(html).toContain('data-testid="compare-sign-in"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain('data-testid="compare-table"');
  });

  it("fewer than two saved → the honest empty state", () => {
    for (const items of [[], [ROW_A]]) {
      const html = renderView({ phase: { kind: "ready", items } });
      expect(html).toContain('data-testid="compare-empty"');
      expect(html).toContain("Save two properties to compare");
      expect(html).not.toContain('data-testid="compare-select-a"');
    }
  });

  it("no selection → both selectors + the pick prompt, no table", () => {
    const html = renderView({});
    expect(html).toContain('data-testid="compare-select-a"');
    expect(html).toContain('data-testid="compare-select-b"');
    expect(html).toContain('data-testid="compare-pick-second"');
    expect(html).toContain("Pick two saved properties");
    expect(html).not.toContain('data-testid="compare-table"');
  });

  it("one selected → pick-second prompt; the other slot excludes the taken property", () => {
    const html = renderView({
      stored: { a: "48021:123", b: null, payloads: {} },
    });
    expect(html).toContain("Pick a second property to compare.");
    expect(html).not.toContain('data-testid="compare-table"');
    // Slot B's options must not offer slot A's property (no self-compare).
    const selectB = html.split('data-testid="compare-select-b"')[1] ?? "";
    expect(selectB).not.toContain('value="48021:123"');
    expect(selectB).toContain('value="48055:987"');
  });
});

// ---------------------------------------------------------------------------
// Fact table — honesty rendering + difference emphasis.
// ---------------------------------------------------------------------------

describe("fact table", () => {
  const html = renderView({ stored: BOTH_SELECTED });

  it("renders both columns with headers and verdict lines from the composer", () => {
    expect(html).toContain('data-testid="compare-table"');
    expect(html).toContain('data-testid="compare-header-a"');
    expect(html).toContain("104 Main St");
    expect(html).toContain("Caldwell tract");
    // UPDATED (P-39): a column's headline is CARRIED on its slot data, sealed
    // by the one composer at fetch. These fixtures predate the fact sheet and
    // carry no verdict, so both columns show the honest unresolved headline —
    // the per-fact cells below are unchanged and still assert their own values.
    expect(html).toContain("has not resolved a fact sheet");
  });

  it("honesty idioms: absents say so, provisional stays provisional", () => {
    expect(html).toContain("no zoning stamp here");
    expect(html).toContain("not verified here");
    expect(html).toContain("70% (provisional)");
    expect(html).toContain("F 10′ · S 5′ · R 10′");
    expect(html).toContain("snapshot date not recorded");
  });

  it("per-fact source captions render where the payload carries them", () => {
    expect(html).toContain('data-testid="compare-cell-source"');
    expect(html).toContain("Zoning_Districts · 2026-07-10");
    expect(html).toContain("library.municode.com");
    expect(html).toContain("fema-nfhl · 2026-07-20");
    // Inline card provenance for land use / acreage (no double caption).
    expect(html).toContain("A1 — Single family residence (bastrop-cad · 2025-11-02)");
    expect(html).toContain("1.2 ac (cad-roll)");
  });

  it("difference emphasis: differing rows flagged, double-absence rows not", () => {
    // Zoning: P-2 vs honest absence → genuinely different assertions.
    expect(html).toMatch(/data-testid="compare-row-zoning"[^>]*data-differs="true"/);
    expect(html).toMatch(/data-testid="compare-row-flood"[^>]*data-differs="true"/);
    // Land use: absent on BOTH? No — A asserts, B absent → differs. Acreage same.
    expect(html).toMatch(/data-testid="compare-row-acreage"[^>]*data-differs="true"/);
  });

  it("two absences do NOT get difference emphasis", () => {
    const bothAbsent = renderView({
      stored: {
        a: "48021:123",
        b: "48055:987",
        payloads: {
          "48021:123": { ...ABSENT_PAYLOAD, parcelNodeId: "48021:123" },
          "48055:987": ABSENT_PAYLOAD,
        },
      },
    });
    expect(bothAbsent).toMatch(
      /data-testid="compare-row-zoning"[^>]*data-differs="false"/,
    );
    expect(bothAbsent).toMatch(
      /data-testid="compare-row-flood"[^>]*data-differs="false"/,
    );
  });

  it('optional per-column "view" link renders only when the host can fly', () => {
    expect(renderView({ stored: BOTH_SELECTED, onView: noop })).toContain(
      'data-testid="compare-view-a"',
    );
    expect(html).not.toContain('data-testid="compare-view-a"');
  });

  it("selected slot with payload still fetching → honest loading column", () => {
    const partial = renderView({
      stored: {
        a: "48021:123",
        b: "48055:987",
        payloads: { "48021:123": ZONED_PAYLOAD },
      },
    });
    expect(partial).toContain('data-testid="compare-table"');
    expect(partial).toContain('data-testid="compare-column-loading"');
  });

  it("selected slot whose fetch failed → the failure copy, verbatim", () => {
    const failed = renderView({
      stored: {
        a: "48021:123",
        b: "48055:987",
        payloads: { "48021:123": ZONED_PAYLOAD },
      },
      failures: { "48055:987": "No baked snapshot exists for this parcel yet." },
    });
    expect(failed).toContain('data-testid="compare-column-failed"');
    expect(failed).toContain("No baked snapshot exists for this parcel yet.");
  });
});

// ---------------------------------------------------------------------------
// Global persistence (the synthetic non-property key).
// ---------------------------------------------------------------------------

describe("global persistence through the chassis store", () => {
  it("round-trips under COMPARE_GLOBAL_STATE_KEY like any property entry", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(COMPARE_GLOBAL_STATE_KEY, "compare", BOTH_SELECTED);
    expect(store.get(COMPARE_GLOBAL_STATE_KEY, "compare")).toEqual(BOTH_SELECTED);
    expect(store.propertyIds()).toContain(COMPARE_GLOBAL_STATE_KEY);
    // The synthetic key can never collide with a real "{fips}:{propId}" id.
    expect(COMPARE_GLOBAL_STATE_KEY).not.toContain(":");
  });

  it("a persisted comparison renders IMMEDIATELY on reopen, no active property", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set(COMPARE_GLOBAL_STATE_KEY, "compare", BOTH_SELECTED);
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="compare"
        onOpenToolChange={noop}
        activeParcelNodeId={null}
        host={host}
        store={store}
      />,
    );
    // Effects (saved-list fetch) don't run under static render — the table
    // must STILL render from the persisted payloads (labels fall back to the
    // facets' situs address / parcel id).
    expect(html).toContain('data-testid="compare-table"');
    expect(html).toContain("104 Main St, Bastrop, TX");
    expect(html).toContain("70% (provisional)");
    expect(html).toContain("no zoning stamp here");
  });

  it("nothing persisted + no active property → the loading state, not a crash", () => {
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="compare"
        onOpenToolChange={noop}
        activeParcelNodeId={null}
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html).toContain('data-testid="compare-loading"');
  });
});
