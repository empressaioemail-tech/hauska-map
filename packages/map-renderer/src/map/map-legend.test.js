/**
 * W3 — legend model and the satellite street-label spec.
 *
 * The legend is the mandatory secondary encoding for a 7-class choropleth: past
 * three classes an all-pairs colour form is only legible with a key, so the key
 * ships with the palette or the palette is not shippable.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legendPanelHtml, legendSectionsFor } from "./map-legend.js";
import { LAND_USE_LEGEND } from "./land-use-classes.js";
import { FEMA_LEGEND } from "./fema-zones.js";
import {
  CARTO_LABELS_TILES,
  SATELLITE_LABELS_ATTRIBUTION,
  SATELLITE_LABELS_LAYER_ID,
  SATELLITE_LABELS_SOURCE_ID,
  labelsLayerSpec,
  labelsSourceSpec,
} from "./basemap-labels.js";

describe("map legend (W3)", () => {
  it("shows nothing when no layer with a legend is visible", () => {
    assert.deepEqual(legendSectionsFor([]), []);
    assert.deepEqual(legendSectionsFor(["parcel-polygon", "hydrography"]), []);
    assert.equal(legendPanelHtml([]), "");
  });

  it("shows the land-use key exactly when the zoning layer is on", () => {
    const sections = legendSectionsFor(["zoning"]);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].id, "land-use");
    assert.equal(sections[0].rows.length, LAND_USE_LEGEND.length);
    // The key is derived from the paint table, so it cannot go stale.
    assert.deepEqual(
      sections[0].rows.map((r) => r.swatch),
      LAND_USE_LEGEND.map((r) => r.fill),
    );
    const absent = sections[0].rows.find((r) => r.key === "unclassified");
    assert.match(absent.detail, /would be filled by/);
  });

  it("shows the flood key when either flood layer is on, with the in/out column", () => {
    for (const key of ["flood-zone", "floodway"]) {
      const sections = legendSectionsFor([key]);
      assert.equal(sections.length, 1, key);
      assert.equal(sections[0].id, "fema");
      assert.equal(sections[0].rows.length, FEMA_LEGEND.length);
    }
    const rows = legendSectionsFor(["flood-zone"])[0].rows;
    assert.equal(rows.filter((r) => r.inSfha === true).length, 5);
    assert.equal(rows.filter((r) => r.inSfha === false).length, 2);
    assert.equal(rows.filter((r) => r.inSfha === null).length, 2);
    // The OUT row is drawn hollow because that is literally how it paints.
    const minimal = rows.find((r) => r.key === "minimal");
    assert.equal(minimal.hollow, true);
    assert.equal(minimal.swatch, "transparent");
  });

  it("shows both sections together and notes flood multiplicity (I6)", () => {
    const sections = legendSectionsFor(new Set(["zoning", "flood-zone"]));
    assert.deepEqual(sections.map((s) => s.id), ["land-use", "fema"]);
    const fema = sections.find((s) => s.id === "fema");
    assert.match(fema.note, /more than one zone at once/);
  });

  it("renders every row and escapes its text", () => {
    const html = legendPanelHtml(legendSectionsFor(["zoning", "flood-zone"]));
    for (const row of LAND_USE_LEGEND) {
      assert.ok(html.includes(row.label), `missing land-use row: ${row.label}`);
    }
    for (const row of FEMA_LEGEND) {
      assert.ok(html.includes(row.label), `missing FEMA row: ${row.label}`);
    }
    const evil = legendPanelHtml([
      { id: "x", title: "<script>", rows: [{ key: "k", swatch: "#000", stroke: "#fff", label: "<img>", detail: null }] },
    ]);
    assert.ok(!evil.includes("<script>"));
    assert.ok(evil.includes("&lt;script&gt;"));
  });

  it("degrades to a no-op handle with no DOM", async () => {
    const { createMapLegend } = await import("./map-legend.js");
    const handle = createMapLegend(null);
    assert.equal(handle.element, null);
    assert.equal(handle.isOpen(), false);
    assert.doesNotThrow(() => handle.update(["zoning"]));
    assert.doesNotThrow(() => handle.destroy());
  });
});

describe("satellite street labels (W3)", () => {
  it("uses the CARTO labels-only raster on all three subdomains", () => {
    assert.equal(CARTO_LABELS_TILES.length, 3);
    for (const url of CARTO_LABELS_TILES) {
      assert.match(url, /^https:\/\/[abc]\.basemaps\.cartocdn\.com\/light_only_labels\/\{z\}\/\{x\}\/\{y\}@2x\.png$/);
    }
    // Same provider as the basemap, so the credit obligation does not change.
    assert.match(SATELLITE_LABELS_ATTRIBUTION, /openstreetmap\.org/);
    assert.match(SATELLITE_LABELS_ATTRIBUTION, /carto\.com/);
  });

  it("starts hidden — visibility is bound to the satellite toggle", () => {
    // With satellite OFF the CARTO light_all basemap is showing and already has
    // labels baked in; mounting this visible would double-print every street.
    assert.equal(labelsLayerSpec().layout.visibility, "none");
  });

  it("carries STATIC paint only and no GROUND-role brightness clamp", () => {
    const paint = labelsLayerSpec().paint;
    assert.deepEqual(Object.keys(paint).sort(), ["raster-contrast", "raster-opacity"]);
    assert.equal(paint["raster-opacity"], 1);
    assert.ok(paint["raster-contrast"] > 0, "contrast is lifted to widen glyph-on-halo separation");
    const serialized = JSON.stringify(labelsLayerSpec());
    assert.ok(!serialized.includes("brightness"), "the basemap clamp must not be copied here");
    assert.ok(!serialized.includes("saturation"));
    assert.ok(!serialized.includes("feature-state"));
  });

  it("wires the layer to its own source and keeps the ids namespaced", () => {
    assert.equal(labelsLayerSpec().source, SATELLITE_LABELS_SOURCE_ID);
    assert.equal(labelsLayerSpec().id, SATELLITE_LABELS_LAYER_ID);
    assert.notEqual(SATELLITE_LABELS_SOURCE_ID, SATELLITE_LABELS_LAYER_ID);
    assert.equal(labelsSourceSpec().type, "raster");
    assert.equal(labelsSourceSpec().tileSize, 256);
  });
});
