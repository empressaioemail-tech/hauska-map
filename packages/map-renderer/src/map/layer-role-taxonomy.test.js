/**
 * T-H01 — DATA layer mutex + taxonomy invariants.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLD_OPEN_VISIBLE_LAYERS,
  CONTEXT_FEMA,
  CONTEXT_FLOOD_TEAL,
  CONTEXT_PEDESTRIAN,
  CONTEXT_ROAD_BAND,
  DATA_LAYER_KEYS,
  DATA_LAND_USE_COLORS,
  INTERACTION_CYAN,
  LAYER_ROLE_BY_KEY,
  LAYER_ROLE_TAXONOMY,
  MAP_LAYER_PRESETS,
  ROLE_BUDGET,
  SUBJECT_AMBER,
  contextFillOpacity,
  enforceDataLayerMutex,
  femaNfhlFillColorExpr,
  femaNfhlFillOpacityExpr,
  hasDataLayerMutexViolation,
  isDataLayerVisible,
  roleForLayer,
} from "./layer-role-taxonomy.js";

describe("layer-role-taxonomy (T-H01)", () => {
  it("exports one taxonomy constant covering every role", () => {
    for (const role of ["GROUND", "CONTEXT", "DATA", "SUBJECT", "INTERACTION"]) {
      assert.ok(LAYER_ROLE_TAXONOMY[role], role);
      assert.equal(LAYER_ROLE_TAXONOMY[role].role, role);
      assert.ok(LAYER_ROLE_TAXONOMY[role].budget);
      assert.ok(LAYER_ROLE_TAXONOMY[role].paint);
    }
  });

  it("assigns every known layer key to exactly one role", () => {
    const roles = new Set(Object.values(LAYER_ROLE_BY_KEY));
    for (const r of ["GROUND", "CONTEXT", "DATA", "SUBJECT", "INTERACTION"]) {
      assert.ok(roles.has(r), r);
    }
    for (const [key, role] of Object.entries(LAYER_ROLE_BY_KEY)) {
      assert.equal(roleForLayer(key), role);
    }
  });

  it("reserves amber for SUBJECT and cyan for INTERACTION", () => {
    assert.equal(LAYER_ROLE_TAXONOMY.SUBJECT.paint.amber, SUBJECT_AMBER);
    assert.equal(LAYER_ROLE_TAXONOMY.INTERACTION.paint.cyan, INTERACTION_CYAN);
    assert.notEqual(SUBJECT_AMBER.toLowerCase(), INTERACTION_CYAN.toLowerCase());
  });

  it("keeps flood-study teal off SUBJECT amber and INTERACTION cyan", () => {
    const floodHues = Object.values(CONTEXT_FLOOD_TEAL).map((c) => c.toLowerCase());
    assert.ok(!floodHues.includes(SUBJECT_AMBER.toLowerCase()));
    assert.ok(!floodHues.includes(INTERACTION_CYAN.toLowerCase()));
    assert.equal(roleForLayer("pe-flood-zone-fill"), "CONTEXT");
    assert.equal(roleForLayer("buildable-envelope"), "SUBJECT");
  });

  it("caps Context fill under the wash-out budget", () => {
    assert.equal(ROLE_BUDGET.CONTEXT.fillOpacityMax, 0.2);
    assert.ok(contextFillOpacity(0.4) <= 0.2);
    assert.ok(contextFillOpacity(0.4, true) < contextFillOpacity(0.4, false));
  });

  it("FEMA severity ramp keys real NFHL fields only", () => {
    assert.ok(CONTEXT_FEMA.fillOpacityFloodway <= ROLE_BUDGET.CONTEXT.fillOpacityMax);
    assert.ok(CONTEXT_FEMA.fillOpacityAe <= ROLE_BUDGET.CONTEXT.fillOpacityMax);
    assert.ok(CONTEXT_FEMA.fillOpacityX < CONTEXT_FEMA.fillOpacityAe);
    assert.ok(CONTEXT_FEMA.fillOpacityAe <= CONTEXT_FEMA.fillOpacityFloodway);
    const color = JSON.stringify(femaNfhlFillColorExpr());
    const opacity = JSON.stringify(femaNfhlFillOpacityExpr());
    assert.ok(color.includes("ZONE_SUBTY"));
    assert.ok(color.includes("FLD_ZONE"));
    assert.ok(opacity.includes("FLOODWAY"));
  });

  it("pedestrian CONTEXT hue is distinct from road grey and reserved hues", () => {
    assert.notEqual(CONTEXT_PEDESTRIAN.line.toLowerCase(), CONTEXT_ROAD_BAND.toLowerCase());
    assert.notEqual(CONTEXT_PEDESTRIAN.line.toLowerCase(), SUBJECT_AMBER.toLowerCase());
    assert.notEqual(CONTEXT_PEDESTRIAN.line.toLowerCase(), INTERACTION_CYAN.toLowerCase());
    assert.notEqual(CONTEXT_PEDESTRIAN.line.toLowerCase(), "#c9b88a");
    assert.ok(CONTEXT_PEDESTRIAN.lineOpacityMax <= ROLE_BUDGET.CONTEXT.lineOpacity);
    assert.ok(CONTEXT_PEDESTRIAN.lineWidthMax < 5);
    assert.ok(Array.isArray(CONTEXT_PEDESTRIAN.lineDasharray));
    assert.ok(CONTEXT_PEDESTRIAN.lineDasharray[0] <= 0.5, "dot on-segment ≤ 0.5");
    assert.ok(
      CONTEXT_PEDESTRIAN.lineDasharray[0] < CONTEXT_PEDESTRIAN.lineDasharray[1],
      "dot gap longer than on-segment",
    );
    assert.equal(roleForLayer("pedestrian-ways"), "CONTEXT");
    assert.equal(roleForLayer("road-node-pedestrian"), "CONTEXT");
  });


  it("DATA land-use palette is categorical and defaultVisible is false", () => {
    assert.equal(ROLE_BUDGET.DATA.defaultVisible, false);
    assert.equal(ROLE_BUDGET.DATA.mutex, true);
    assert.ok(DATA_LAND_USE_COLORS.singleFamily.fill);
    assert.ok(DATA_LAYER_KEYS.includes("zoning"));
    assert.ok(DATA_LAYER_KEYS.includes("rent-heat"));
  });

  it("asserts no two DATA layers can be simultaneously visible", () => {
    const bad = new Set(["parcel-polygon", "zoning", "rent-heat"]);
    assert.equal(hasDataLayerMutexViolation(bad), true);
    const fixed = enforceDataLayerMutex(bad, "zoning");
    assert.equal(hasDataLayerMutexViolation(fixed), false);
    assert.equal(fixed.has("zoning"), true);
    assert.equal(fixed.has("rent-heat"), false);
    assert.equal(fixed.has("parcel-polygon"), true);
  });

  it("isDataLayerVisible detects Data role presence", () => {
    assert.equal(isDataLayerVisible(["parcel-polygon"]), false);
    assert.equal(isDataLayerVisible(["parcel-polygon", "zoning"]), true);
  });

  it("cold-open and presets stay within progressive-disclosure bounds", () => {
    assert.deepEqual([...COLD_OPEN_VISIBLE_LAYERS], ["parcel-polygon"]);
    assert.ok(COLD_OPEN_VISIBLE_LAYERS.length <= 3);
    for (const [name, layers] of Object.entries(MAP_LAYER_PRESETS)) {
      assert.ok(layers.length <= 3, name);
      assert.equal(hasDataLayerMutexViolation(layers), false, name);
    }
    assert.ok(MAP_LAYER_PRESETS.Flood.includes("flood-zone"));
    assert.ok(MAP_LAYER_PRESETS.Entitlement.includes("zoning"));
    assert.ok(MAP_LAYER_PRESETS.Terrain.includes("topography-contours"));
  });
});
