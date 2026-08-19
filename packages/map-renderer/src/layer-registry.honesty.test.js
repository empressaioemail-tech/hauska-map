/**
 * SS-W10 / P-46 — honest-empty rows and reachable ceilings.
 *
 * Two rules under test, both of which the registry could previously violate
 * silently:
 *
 *  1. A layer that draws nothing says so, with its basis. Command Center seeds
 *     its LAYERS panel from the WHOLE registry, so every source-less row has
 *     been rendering as an ordinary checkbox that produces a blank map and no
 *     explanation. An empty layer and a broken layer looked identical.
 *
 *  2. A reachable ceiling is never invented. `ceiling: null` means nobody
 *     probed it, and it must read as unknown. Back-filling the denominator
 *     turns "unmeasured" into "reaches everywhere", which is the exact false
 *     claim the rrc-wells Harris-only source would otherwise make.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_VISIBLE_LAYERS,
  LAYER_REGISTRY,
  layerEmptyBasis,
  layerReach,
  layerReachSummary,
  layerStatusForGates,
  registryEntry,
} from "./layer-registry.js";
import { COLD_OPEN_VISIBLE_LAYERS } from "./map/layer-role-taxonomy.js";

/** Statuses at which the map stays blank when the box is ticked. */
const DRAWS_NOTHING = new Set(["no-data", "pending"]);

/** Status a row resolves to with no input gates supplied (the panel's case). */
function bareStatus(entry) {
  if (entry.pending) return "pending";
  if (entry.fixture) return "fixture";
  if (entry.live) return "live";
  if (entry.fuelGated) return "fuel-gated";
  return "no-data";
}

describe("honest-empty layer rows (P-46 work item 4)", () => {
  // NOTE ON WHAT THIS ASSERTS, and why it is not the obvious thing.
  //
  // The obvious assertion — "layerEmptyBasis() returns a non-empty string" —
  // is VACUOUS. The accessor falls back to a generic sentence when a row
  // declares nothing, so that assertion passes for every row no matter what,
  // and can never fail for the reason it was written. Verified by deliberately
  // stripping ssurgo-soils' emptyBasis on 2026-08-19: 110 pass / 0 fail. A gate
  // that cannot fail is not a gate.
  //
  // So this asserts the DECLARATION on the registry row. The runtime fallback
  // stays — a user must never meet silence — but the fallback must not be what
  // ships, and only an assertion on the declared field can tell the difference.
  it("gives every draws-nothing row a DECLARED basis, not the fallback", () => {
    const offenders = [];
    for (const entry of LAYER_REGISTRY) {
      if (!DRAWS_NOTHING.has(bareStatus(entry))) continue;
      if (
        typeof entry.emptyBasis !== "string" ||
        entry.emptyBasis.trim().length === 0
      ) {
        offenders.push(entry.key);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `layers that draw nothing with no DECLARED basis: ${offenders.join(", ")}`,
    );
  });

  it("still answers with the generic fallback rather than silence", () => {
    // The other half of the pair: a row that somehow reaches production without
    // a declared basis must still tell the user something true, not nothing.
    const undeclared = { key: "synthetic-undeclared" };
    const entry = LAYER_REGISTRY.find((e) => e.key === "texas-rrc");
    const saved = entry.emptyBasis;
    try {
      delete entry.emptyBasis;
      const basis = layerEmptyBasis("texas-rrc");
      assert.equal(typeof basis, "string");
      assert.ok(basis.length > 0);
      assert.match(basis, /draws nothing/);
    } finally {
      entry.emptyBasis = saved;
    }
    assert.equal(layerEmptyBasis(undeclared.key), null);
  });

  it("names the rows this covers, so a silent shrink of the set fails", () => {
    // Counting rule: one entry per LAYER_REGISTRY row whose bare status is
    // no-data or pending. Six of them as of 2026-08-19, out of 29 rows.
    const drawsNothing = LAYER_REGISTRY.filter((e) =>
      DRAWS_NOTHING.has(bareStatus(e)),
    ).map((e) => e.key);
    assert.deepEqual(drawsNothing.sort(), [
      "edwards-aquifer",
      "etj",
      "groundwater",
      "mud-pid",
      "ssurgo-soils",
      "texas-rrc",
    ]);
  });

  it("returns no basis for a layer that actually draws", () => {
    // The predicate must be able to say NO. A basis on every row would make the
    // control decorative — it would flag drawing layers as empty and be ignored.
    assert.equal(layerEmptyBasis("parcel-polygon"), null);
    assert.equal(layerEmptyBasis("flood-zone"), null);
    assert.equal(layerEmptyBasis("road-nodes"), null);
  });

  it("returns no basis for an unknown key rather than inventing one", () => {
    assert.equal(layerEmptyBasis("not-a-layer"), null);
  });
});

describe("reachable ceilings (P-46 work item 3)", () => {
  it("renders an unknown ceiling as unknown, never as the denominator", () => {
    const reach = layerReach("texas-rrc");
    assert.ok(reach, "texas-rrc must declare a reach");
    assert.equal(reach.ceiling, null);
    assert.equal(reach.denominator, 254);

    const summary = layerReachSummary("texas-rrc");
    assert.match(summary, /Reach unknown of 254 counties/);
    assert.doesNotMatch(
      summary,
      /Reaches 254 of 254/,
      "an unmeasured ceiling must never render as full statewide reach",
    );
  });

  it("carries the measurement instant with the figure", () => {
    // DEV_PROCESS 1.1 / 1.2 — a coverage figure travels with its denominator
    // and its counting rule at the point of use. A ceiling read from a
    // materialized ledger is a claim about that instant and nothing later.
    const summary = layerReachSummary("texas-rrc");
    assert.match(summary, /as of 2026-08-14/);
    assert.equal(layerReach("texas-rrc").asOf, "2026-08-14T17:41:22.500Z");
  });

  it("states the one-county well ceiling rather than implying statewide O&G", () => {
    const basis = layerReach("texas-rrc").basis;
    assert.match(basis, /1 of 254 counties/);
    assert.match(basis, /Harris/);
    assert.match(basis, /no capability probe defined/);
  });

  it("returns null for layers that declare no reach", () => {
    assert.equal(layerReach("parcel-polygon"), null);
    assert.equal(layerReachSummary("parcel-polygon"), null);
    assert.equal(layerReach("not-a-layer"), null);
  });
});

describe("road-nodes registry row (P-46 work item 1)", () => {
  it("exists as a live, non-fixture CONTEXT-eligible row", () => {
    const entry = registryEntry("road-nodes");
    assert.ok(entry, "road-nodes must be a registry row");
    assert.equal(entry.live, true);
    assert.equal(entry.fixture, false);
    assert.equal(entry.fuelGated, false);
    assert.equal(entry.label, "Road nodes (ROW)");
  });

  it("does not read as empty — it has a live source", () => {
    assert.equal(layerStatusForGates(null, "road-nodes"), "live");
    assert.equal(layerEmptyBasis("road-nodes"), null);
  });

  it("stays distinct from the pedestrian row", () => {
    // One data family, two controls. Collapsing them removes a control.
    assert.ok(registryEntry("pedestrian-ways"));
    assert.notEqual(
      registryEntry("road-nodes").label,
      registryEntry("pedestrian-ways").label,
    );
  });

  it("is NOT in either shared cold-open default set", () => {
    // The renderer-level defaults, read from the real exports rather than from
    // a literal restated here — a test that asserts against its own fixture
    // cannot fail for the right reason.
    assert.equal(DEFAULT_VISIBLE_LAYERS.has("road-nodes"), false);
    assert.equal(COLD_OPEN_VISIBLE_LAYERS.includes("road-nodes"), false);
    // And the guard fires: the set is non-empty, so `false` above is a real
    // absence rather than an empty-collection artefact.
    assert.equal(DEFAULT_VISIBLE_LAYERS.has("parcel-polygon"), true);
    assert.equal(COLD_OPEN_VISIBLE_LAYERS.includes("parcel-polygon"), true);
  });
});
