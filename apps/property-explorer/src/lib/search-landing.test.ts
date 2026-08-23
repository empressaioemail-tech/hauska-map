// Kind-routing landing tests — parcel-id fast path keeps today's direct
// behavior, address routes through the EXISTING address→parcel lookup (mocked)
// and NEVER fabricates a parcel on a miss (honest chip + map-only landing),
// street fits + highlights its extent, place docks over its bbox.

import { describe, expect, it, vi } from "vitest";
import {
  ADDRESS_LANDING_ZOOM,
  executeSearchLanding,
  OUTSIDE_COVERAGE_CHIP,
  PLACE_LANDING_ZOOM,
  type SearchLandingDeps,
} from "./search-landing";
import type { GeoExtent, Suggestion } from "./search-kinds";

function mkDeps(lookupResolves: boolean): SearchLandingDeps & {
  runParcelLookup: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  fitExtent: ReturnType<typeof vi.fn>;
  showChip: ReturnType<typeof vi.fn>;
  highlightStreet: ReturnType<typeof vi.fn>;
} {
  return {
    runParcelLookup: vi.fn(async () => lookupResolves),
    flyTo: vi.fn(),
    fitExtent: vi.fn(),
    showChip: vi.fn(),
    highlightStreet: vi.fn(),
  };
}

const EXTENT: GeoExtent = [-97.33, 30.12, -97.3, 30.1];

function sugg(over: Partial<Suggestion>): Suggestion {
  return {
    kind: "place",
    label: "x",
    sublabel: null,
    lat: 30.11,
    lng: -97.31,
    extent: null,
    parcelNodeId: null,
    lookupQuery: null,
    ...over,
  };
}

describe("parcel landing", () => {
  it("opens the parcel directly via the existing lookup flow", async () => {
    const deps = mkDeps(true);
    const out = await executeSearchLanding(
      sugg({ kind: "parcel", parcelNodeId: "48021:34177", label: "Open parcel 48021:34177" }),
      deps,
    );
    expect(deps.runParcelLookup).toHaveBeenCalledWith("48021:34177");
    expect(out).toEqual({ kind: "parcel", opened: true });
    expect(deps.flyTo).not.toHaveBeenCalled();
  });
});

describe("address landing", () => {
  it("IN coverage: resolves through the existing address→parcel lookup (card opens, no chip)", async () => {
    const deps = mkDeps(true);
    const out = await executeSearchLanding(
      sugg({
        kind: "address",
        label: "714 Spring Street",
        lookupQuery: "714 Spring Street, Bastrop, Texas",
      }),
      deps,
    );
    expect(deps.runParcelLookup).toHaveBeenCalledWith(
      "714 Spring Street, Bastrop, Texas",
      { quiet: true, lat: 30.11, lng: -97.31 },
    );
    expect(out).toEqual({ kind: "address", opened: true, coverageMiss: false });
    expect(deps.showChip).not.toHaveBeenCalled();
    expect(deps.flyTo).not.toHaveBeenCalled(); // lookup flow owns the camera
  });

  it("OUTSIDE coverage: lands the map + honest chip, NEVER fabricates a parcel", async () => {
    const deps = mkDeps(false);
    const out = await executeSearchLanding(
      sugg({
        kind: "address",
        label: "1 Ferry Building",
        lat: 37.7955,
        lng: -122.3937,
        lookupQuery: "1 Ferry Building, San Francisco, California",
      }),
      deps,
    );
    expect(deps.flyTo).toHaveBeenCalledWith(37.7955, -122.3937, ADDRESS_LANDING_ZOOM);
    expect(deps.showChip).toHaveBeenCalledWith(OUTSIDE_COVERAGE_CHIP);
    expect(out).toEqual({ kind: "address", opened: false, coverageMiss: true });
  });

  it("the coverage-miss chip copy is the ratified honest string", () => {
    expect(OUTSIDE_COVERAGE_CHIP).toBe("Outside parcel coverage — map view only");
  });
});

describe("street landing", () => {
  it("fits the street extent and briefly highlights it", async () => {
    const deps = mkDeps(false);
    const out = await executeSearchLanding(
      sugg({ kind: "street", label: "Main Street", extent: EXTENT }),
      deps,
    );
    expect(deps.fitExtent).toHaveBeenCalledWith(EXTENT);
    expect(deps.highlightStreet).toHaveBeenCalledWith(EXTENT, "Main Street");
    expect(deps.runParcelLookup).not.toHaveBeenCalled();
    expect(out).toEqual({ kind: "street", fitted: true });
  });

  it("street without extent: flies to its point (no fake extent)", async () => {
    const deps = mkDeps(false);
    const out = await executeSearchLanding(
      sugg({ kind: "street", label: "Main Street", extent: null }),
      deps,
    );
    expect(deps.flyTo).toHaveBeenCalled();
    expect(deps.highlightStreet).not.toHaveBeenCalled();
    expect(out).toEqual({ kind: "street", fitted: false });
  });
});

describe("place landing", () => {
  it("docks over the place bbox when the geocoder returned one", async () => {
    const deps = mkDeps(false);
    const out = await executeSearchLanding(
      sugg({ kind: "place", label: "Austin", extent: EXTENT }),
      deps,
    );
    expect(deps.fitExtent).toHaveBeenCalledWith(EXTENT);
    expect(out).toEqual({ kind: "place", fitted: true });
  });

  it("no extent -> flyTo the place point at city altitude", async () => {
    const deps = mkDeps(false);
    await executeSearchLanding(sugg({ kind: "place", label: "Austin" }), deps);
    expect(deps.flyTo).toHaveBeenCalledWith(30.11, -97.31, PLACE_LANDING_ZOOM);
  });
});
