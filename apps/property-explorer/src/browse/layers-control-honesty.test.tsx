// apps/property-explorer/src/browse/layers-control-honesty.test.tsx
//
// SS-W10 / P-46 work item 4. LayersControl is SHARED chrome — Property Explorer
// and Command Center render the same component — so this renders it with the
// COMMAND CENTER shape of `known` (the whole registry, per LiveMapTile) and
// asserts the empty rows explain themselves. No file under apps/command-center
// is touched; that surface belongs to lane SS-W8.
//
// The defect this pins: CC seeds `known` from every registry row, so six
// source-less layers (ssurgo-soils, groundwater, edwards-aquifer,
// texas-rrc, etj) render as ordinary checkboxes. mud-pid flipped live P-60. Ticking one produced a blank
// map and no explanation. An empty layer and a broken layer looked identical.
//
// Static markup only — renderToStaticMarkup, matching the existing PE pattern.
// No jsdom, no timers, nothing left running.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LayersControl } from "../../../../packages/map-renderer/src/chrome/LayersControl";
import { LAYER_REGISTRY } from "../../../../packages/map-renderer/src/layer-registry.js";
import { consumerKnownLayers } from "./consumer-layers";

type Key = Parameters<typeof consumerKnownLayers>[never] extends never
  ? string
  : string;

/** Command Center's seed: every registry row is a known layer. */
function ccKnownLayers(): Set<string> {
  return new Set((LAYER_REGISTRY as Array<{ key: string }>).map((e) => e.key));
}

function renderPanel(known: Set<string>, visible: Set<string>): string {
  return renderToStaticMarkup(
    <LayersControl
      known={known as Set<never>}
      visible={visible as Set<never>}
      onChange={() => {}}
    />,
  );
}

describe("LayersControl honest-empty rows (Command Center shape)", () => {
  const html = renderPanel(ccKnownLayers(), new Set(["parcel-polygon"]));

  it("marks every source-less layer with a no-data tag", () => {
    for (const key of [
      "ssurgo-soils",
      "groundwater",
      "edwards-aquifer",
      "texas-rrc",
      "etj",
    ]) {
      expect(html).toContain(`layers-empty-tag-${key}`);
    }
  });

  it("states the basis on each empty row rather than leaving it blank", () => {
    expect(html).toContain('data-testid="layers-empty-basis-texas-rrc"');
    expect(html).toContain("Turning this on draws nothing anywhere");
  });

  it("does NOT mark layers that actually draw", () => {
    // The control must be able to say no. If every row were tagged, the tag
    // would carry no information and would be ignored.
    for (const key of [
      "parcel-polygon",
      "flood-zone",
      "road-nodes",
      "mud-pid",
      "building-footprint",
      "buildable-envelope",
    ]) {
      expect(html).not.toContain(`layers-empty-tag-${key}`);
      expect(html).not.toContain(`layers-empty-basis-${key}`);
    }
  });

  it("keeps the checkbox operable on an empty row", () => {
    // Disabling it would hide the layer's existence. The point is disclosure.
    expect(html).toContain('data-testid="layers-row-texas-rrc"');
    expect(html).not.toContain("disabled");
  });
});

describe("LayersControl reachable ceilings (P-46 work item 3)", () => {
  const html = renderPanel(ccKnownLayers(), new Set(["parcel-polygon"]));

  it("renders the RRC ceiling as unknown, never as statewide", () => {
    expect(html).toContain('data-testid="layers-reach-texas-rrc"');
    expect(html).toContain("Reach unknown of 254 counties");
    expect(html).not.toContain("Reaches 254 of 254");
  });

  it("carries the ceiling's measurement date with the figure", () => {
    expect(html).toContain("as of 2026-08-14");
  });

  it("names the one-county well ceiling on the row itself", () => {
    // Not in a tooltip, not in an appendix. DEV_PROCESS 1.2: the counting rule
    // travels with the number at the point of use.
    expect(html).toContain("1 of 254 counties");
    expect(html).toContain("Harris");
  });

  it("adds no reach line to layers that declare none", () => {
    expect(html).not.toContain('data-testid="layers-reach-parcel-polygon"');
    expect(html).not.toContain('data-testid="layers-reach-road-nodes"');
  });
});

describe("LayersControl road-nodes row (P-46 work item 1)", () => {
  it("renders a road-nodes row on the consumer surface, unchecked by default", () => {
    const known = consumerKnownLayers() as unknown as Set<Key>;
    // Cold open on PE: parcel line plus everything except zoning and road
    // nodes. Simulate the OFF state the operator asked for.
    const visible = new Set([...known].filter((k) => k !== "road-nodes"));
    const html = renderPanel(
      known as Set<string>,
      visible as unknown as Set<string>,
    );
    expect(html).toContain('data-testid="layers-row-road-nodes"');
    expect(html).toContain("Road nodes (ROW)");
    // Sidewalks stay a separate row — one data family, two controls.
    expect(html).toContain('data-testid="layers-row-pedestrian-ways"');
    expect(html).toContain("Sidewalks / footpaths");
  });
});
