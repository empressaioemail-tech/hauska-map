// WB7 compare — pure fact-column derivation tests. Pins:
//   - the R1-shaped adapter feeds the REUSED verdict composer (same section
//     mapping as the share view; red flag leads, honest absences survive);
//   - fact cells carry the CARD's honesty idioms (present / absent "not
//     verified here" / pending / provisional) — fixture matrix incl. absents
//     and a provisional envelope; nothing fabricated;
//   - per-fact source captions appear only where the payload carries them;
//   - difference emphasis: genuine assertions differing → true; two honest
//     absences NEVER "differ";
//   - payload fetch keeps the tier2 flood sibling and maps not_found honestly;
//   - slot reconciliation (drop un-saved, pre-fill A with the active saved
//     property, prune payloads).

import { describe, expect, it } from "vitest";
import type {
  BakedFacetPayload,
  BakedFacetsFetchResult,
} from "../../lib/baked-facets";
import {
  briefPayloadFromFacets,
  cellsDiffer,
  COMPARE_ROWS,
  deriveCompareColumn,
  envelopeSourceCaption,
  fetchComparePayload,
  floodCell,
  NOT_VERIFIED_HERE,
  reconcileCompareState,
  zoningSourceCaption,
  type CompareSlotData,
} from "./compare-facts";

// ---------------------------------------------------------------------------
// Fixtures (Bastrop wired-city shapes, mirroring the R1 brief fixtures).
// ---------------------------------------------------------------------------

const ZONED_FACETS = {
  parcelNodeId: "48021:123",
  countyFips: "48021",
  countyName: "Bastrop",
  baseFacts: {
    apn: "R12345",
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
    provisional: false,
    approximate: true,
    district: "P-2",
    setbacks: { front_ft: 10, side_ft: 5, rear_ft: 10 },
    buildableAreaPct: 70,
    buildableAreaSqFt: 6100,
    citationUrl: "https://library.municode.com/tx/bastrop/codes/code_of_ordinances",
  },
  facetCoverage: {
    baseFacts: true,
    landUse: true,
    acreage: true,
    zoning: true,
    envelope: true,
  },
  bakedAt: "2026-07-21T09:00:00.000Z",
} as unknown as BakedFacetPayload;

const FLOODWAY_TIER2 = {
  flood: {
    status: "in-sfha",
    floodZone: "AE",
    inSpecialFloodHazardArea: true,
    zoneSubtype: "FLOODWAY",
    provenance: { source: "fema-nfhl", vintage: "2026-07-20T04:12:00.000Z" },
  },
};

const ZONED: CompareSlotData = {
  parcelNodeId: "48021:123",
  facets: ZONED_FACETS,
  tier2: FLOODWAY_TIER2,
  snapshotAt: "2026-07-21T09:00:00.000Z",
  fetchedAt: "2026-07-29T00:00:00.000Z",
};

/** Unzoned / un-stamped parcel: honest absences across the board. */
const ABSENT: CompareSlotData = {
  parcelNodeId: "48055:987",
  facets: {
    parcelNodeId: "48055:987",
    baseFacts: {},
    zoning: null,
    envelope: {
      status: "declined",
      declineReason: "no-zoning-stamp",
    },
    facetCoverage: { envelope: false, zoning: false },
  } as unknown as BakedFacetPayload,
  tier2: null,
  snapshotAt: null,
  fetchedAt: "2026-07-29T00:00:00.000Z",
};

/** Provisional envelope with area — the provisional qualifier must survive. */
const PROVISIONAL: CompareSlotData = {
  parcelNodeId: "48021:456",
  facets: {
    parcelNodeId: "48021:456",
    baseFacts: {},
    zoning: { district: "P-3" },
    envelope: {
      status: "ok",
      provisional: true,
      approximate: true,
      district: "P-3",
      setbacks: { front_ft: 20, side_ft: 5, rear_ft: 10 },
      buildableAreaPct: 42,
    },
    facetCoverage: { zoning: true, envelope: true },
    bakedAt: "2026-07-21T09:00:00.000Z",
  } as unknown as BakedFacetPayload,
  tier2: { flood: { status: "outside-sfha", floodZone: null } },
  snapshotAt: null,
  fetchedAt: "2026-07-29T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Verdict reuse through the adapter.
// ---------------------------------------------------------------------------

describe("briefPayloadFromFacets → composeBriefVerdict (reuse, not fork)", () => {
  it("maps the four share-brief sections from facets + tier2", () => {
    const payload = briefPayloadFromFacets(ZONED);
    expect(payload.brief.sections.map((s) => s.id)).toEqual([
      "zoning",
      "setbacks-envelope",
      "flood",
      "land-use",
    ]);
    expect(payload.brief.sections[0].data).toBe(ZONED_FACETS.zoning);
    expect(payload.brief.sections[2].data).toBe(FLOODWAY_TIER2.flood);
  });

  it("floodway red flag LEADS the zoned verdict (composer semantics intact)", () => {
    const { verdict } = deriveCompareColumn(ZONED);
    expect(verdict.tone).toBe("flag");
    expect(verdict.line).toBe(
      "Inside a FEMA floodway (Zone AE) · buildable · zoned P-2 · single family residence per county record.",
    );
  });

  it("all-absent parcel gets the honest caution verdict — never a clean bill", () => {
    const { verdict } = deriveCompareColumn(ABSENT);
    expect(verdict.tone).toBe("caution");
    // Sentence-cased because the envelope segment LEADS the caution line.
    expect(verdict.line).toContain("Buildable envelope not derived here");
    expect(verdict.line).toContain("flood not verified here");
    expect(verdict.line).toContain("zoning not verified here");
    expect(verdict.line).not.toContain("no red flags");
  });
});

// ---------------------------------------------------------------------------
// Fact-cell honesty matrix.
// ---------------------------------------------------------------------------

describe("deriveCompareColumn — the card's honesty idioms per cell", () => {
  it("zoned parcel: present cells with the card's own display strings", () => {
    const col = deriveCompareColumn(ZONED);
    expect(col.address).toBe("104 Main St, Bastrop, TX");
    expect(col.cells.zoning).toMatchObject({ state: "present", value: "P-2" });
    expect(col.cells.setbacks.state).toBe("present");
    expect(col.cells.setbacks.value).toBe("F 10′ · S 5′ · R 10′");
    expect(col.cells.buildable).toMatchObject({ state: "present", value: "70%" });
    expect(col.cells.flood).toMatchObject({
      state: "present",
      value: "Inside a FEMA floodway (Zone AE)",
    });
    // Land use / acreage carry provenance INLINE (card idiom).
    expect(col.cells.landUse.value).toBe(
      "A1 — Single family residence (bastrop-cad · 2025-11-02)",
    );
    expect(col.cells.acreage.value).toBe("1.2 ac (cad-roll)");
    expect(col.cells.status).toMatchObject({
      state: "present",
      value: "baked snapshot · 2026-07-21",
    });
  });

  it("absent parcel: every cell is an HONEST absence, never a fabricated value", () => {
    const col = deriveCompareColumn(ABSENT);
    expect(col.cells.zoning).toMatchObject({
      state: "absent",
      value: "no zoning stamp here",
    });
    expect(col.cells.setbacks).toMatchObject({
      state: "absent",
      value: NOT_VERIFIED_HERE,
    });
    expect(col.cells.buildable).toMatchObject({
      state: "absent",
      value: NOT_VERIFIED_HERE,
    });
    expect(col.cells.flood).toMatchObject({
      state: "absent",
      value: `flood ${NOT_VERIFIED_HERE}`,
    });
    expect(col.cells.landUse.state).toBe("absent");
    expect(col.cells.acreage.state).toBe("absent");
    expect(col.cells.status).toMatchObject({
      state: "absent",
      value: "snapshot date not recorded",
    });
    // Absent cells never carry a fabricated source caption.
    for (const { id } of COMPARE_ROWS) {
      if (col.cells[id].state === "absent") expect(col.cells[id].source).toBeNull();
    }
  });

  it("provisional envelope keeps the provisional qualifier on buildable", () => {
    const col = deriveCompareColumn(PROVISIONAL);
    expect(col.cells.buildable).toMatchObject({
      state: "present",
      value: "42% (provisional)",
    });
    expect(col.cells.flood.value).toBe("Outside mapped flood hazard");
  });
});

describe("per-fact source captions (only where the payload carries them)", () => {
  it("zoning caption from wire provenance (layer · stamp date)", () => {
    expect(zoningSourceCaption(ZONED_FACETS)).toBe("Zoning_Districts · 2026-07-10");
    expect(zoningSourceCaption(ABSENT.facets)).toBeNull();
  });

  it("envelope caption is the cited code URL's hostname", () => {
    expect(envelopeSourceCaption(ZONED_FACETS)).toBe("library.municode.com");
    expect(envelopeSourceCaption(ABSENT.facets)).toBeNull();
  });

  it("flood caption from tier2 provenance; honest null when absent", () => {
    expect(floodCell(FLOODWAY_TIER2).source).toBe("fema-nfhl · 2026-07-20");
    expect(floodCell(null).source).toBeNull();
    expect(floodCell({ flood: { status: "unavailable" } }).state).toBe("absent");
    // Unknown enum value → honest absence, never a guess.
    expect(floodCell({ flood: { status: "banana" } }).state).toBe("absent");
  });
});

// ---------------------------------------------------------------------------
// Difference emphasis.
// ---------------------------------------------------------------------------

describe("cellsDiffer — genuine assertions only", () => {
  const zoned = deriveCompareColumn(ZONED);
  const absent = deriveCompareColumn(ABSENT);

  it("present vs different present → differs", () => {
    const other = deriveCompareColumn(PROVISIONAL);
    expect(cellsDiffer(zoned.cells.zoning, other.cells.zoning)).toBe(true);
  });

  it("equal present values → no difference", () => {
    expect(cellsDiffer(zoned.cells.zoning, zoned.cells.zoning)).toBe(false);
  });

  it("present vs honest absence → differs (one asserts, one does not)", () => {
    expect(cellsDiffer(zoned.cells.zoning, absent.cells.zoning)).toBe(true);
  });

  it("two honest absences NEVER differ (neither asserts anything)", () => {
    expect(cellsDiffer(absent.cells.landUse, absent.cells.landUse)).toBe(false);
    expect(
      cellsDiffer(absent.cells.zoning, {
        state: "absent",
        value: NOT_VERIFIED_HERE,
        source: null,
      }),
    ).toBe(false);
  });

  it("missing column → no emphasis (nothing to compare yet)", () => {
    expect(cellsDiffer(zoned.cells.zoning, undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Payload fetch — tier2 kept, not_found honest.
// ---------------------------------------------------------------------------

describe("fetchComparePayload", () => {
  it("keeps the tier2 flood sibling the typed facets shape drops", async () => {
    const fetcher = async (): Promise<BakedFacetsFetchResult> =>
      ({
        kind: "ok",
        data: {
          parcelNodeId: "48021:123",
          adapterKey: "baked",
          source: "baked-snapshot",
          snapshotAt: "2026-07-21T09:00:00.000Z",
          facets: ZONED_FACETS,
          tier2: FLOODWAY_TIER2,
        } as never,
      }) as BakedFacetsFetchResult;
    const outcome = await fetchComparePayload("48021:123", fetcher);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.data.tier2).toBe(FLOODWAY_TIER2);
      expect(outcome.data.facets).toBe(ZONED_FACETS);
      expect(outcome.data.snapshotAt).toBe("2026-07-21T09:00:00.000Z");
    }
  });

  it("not_found → no-snapshot; transient → unavailable with the message", async () => {
    expect(
      await fetchComparePayload("x", async () => ({ kind: "not_found" })),
    ).toEqual({ kind: "no-snapshot" });
    expect(
      await fetchComparePayload("x", async () => ({
        kind: "transient",
        message: "HTTP 503",
        status: 503,
      })),
    ).toEqual({ kind: "unavailable", message: "HTTP 503" });
  });
});

// ---------------------------------------------------------------------------
// Slot reconciliation.
// ---------------------------------------------------------------------------

describe("reconcileCompareState", () => {
  const saved = new Set(["p1", "p2", "p3"]);

  it("pre-fills slot A with the ACTIVE property when saved and A empty", () => {
    const next = reconcileCompareState(null, saved, "p2");
    expect(next).toEqual({ a: "p2", b: null, payloads: {} });
  });

  it("does not steal slot B's property into A, and never pre-fills unsaved", () => {
    expect(
      reconcileCompareState({ a: null, b: "p2", payloads: {} }, saved, "p2"),
    ).toBeNull();
    expect(reconcileCompareState(null, saved, "not-saved")).toBeNull();
  });

  it("drops selections that are no longer saved and prunes their payloads", () => {
    const payload = { parcelNodeId: "gone" } as CompareSlotData;
    const next = reconcileCompareState(
      { a: "gone", b: "p1", payloads: { gone: payload } },
      saved,
      null,
    );
    expect(next).toEqual({ a: null, b: "p1", payloads: {} });
  });

  it("returns null when nothing changed (no redundant store writes)", () => {
    expect(
      reconcileCompareState({ a: "p1", b: "p2", payloads: {} }, saved, "p1"),
    ).toBeNull();
  });
});
