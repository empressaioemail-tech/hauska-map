// apps/property-explorer/src/browse/consumer-layers.test.ts
//
// SS-W10 / P-46. The road-nodes default is enforced by a FAILING TEST, not by
// care. Adding a registry row with `live: true` puts it in the PE known set
// automatically, and the cold-open set is "everything known except the
// off-by-default list" — so forgetting the off-by-default entry silently ships
// the OPPOSITE of what the operator asked for, with no error anywhere. That is
// the shape of defect this file exists to catch.
//
// Operator, 2026-08-19: "in the map tools i need a way to turn our road nodes
// on and off and they should probably be defaulted to off for now".

import { describe, expect, it } from "vitest";

import {
  consumerKnownLayers,
  consumerColdOpenVisible,
  COLD_OPEN_OFF_BY_DEFAULT,
  CONSUMER_EXCLUDED_LAYERS,
} from "./consumer-layers";
import { ROAD_NODES_TOGGLE_KEY } from "./road-overlay";

describe("consumer layer defaults (SS-W10 / P-46)", () => {
  it("lists road nodes as a togglable row", () => {
    // The row must EXIST. Defaulting a layer off by hiding it is not a toggle,
    // it is a removal, and the operator asked for on/off.
    expect(consumerKnownLayers().has(ROAD_NODES_TOGGLE_KEY as never)).toBe(true);
  });

  it("lands with road nodes OFF on a cold open", () => {
    expect(consumerColdOpenVisible().has(ROAD_NODES_TOGGLE_KEY as never)).toBe(
      false,
    );
  });

  it("declares road nodes off-by-default rather than excluding them", () => {
    // Two different mechanisms with two different meanings: EXCLUDED means the
    // layer has no row at all; OFF_BY_DEFAULT means it has a row that starts
    // unchecked. Road nodes must be the second, never the first.
    expect(COLD_OPEN_OFF_BY_DEFAULT.has(ROAD_NODES_TOGGLE_KEY as never)).toBe(
      true,
    );
    expect(CONSUMER_EXCLUDED_LAYERS.has(ROAD_NODES_TOGGLE_KEY as never)).toBe(
      false,
    );
  });

  it("leaves sidewalks and road nodes as separate rows", () => {
    // Streets and pedestrian ways are one data family and two controls. A
    // future tidy-up that collapses them into one row would silently remove a
    // control the operator uses.
    const known = consumerKnownLayers();
    expect(known.has("pedestrian-ways" as never)).toBe(true);
    expect(known.has(ROAD_NODES_TOGGLE_KEY as never)).toBe(true);
  });

  it("lands with buildable envelope ON on a cold open", () => {
    expect(consumerColdOpenVisible().has("buildable-envelope" as never)).toBe(
      true,
    );
  });

  it("changes no other cold-open default", () => {
    // Regression fence. Off-by-default: zoning (2026-08-03), road nodes
    // (2026-08-19), and P-60 atom-backed optional layers (footprint, mud-pid).
    expect([...COLD_OPEN_OFF_BY_DEFAULT].sort()).toEqual([
      "building-footprint",
      "mud-pid",
      "road-nodes",
      "zoning",
    ]);
  });

  it("keeps the cold-open set a strict subset of the known set", () => {
    // The invariant behind both mechanisms: you cannot default-on a layer that
    // has no row to be on.
    const known = consumerKnownLayers();
    for (const key of consumerColdOpenVisible()) {
      expect(known.has(key)).toBe(true);
    }
  });
});
