/**
 * Street-label raster spec for satellite mode — the pure half of the fix.
 *
 * THE DEFECT
 * ----------
 * The substrate basemap is ONE CARTO raster (`light_all`) with street names
 * baked into the image. `setSatelliteBase(map, true)` hides that raster so the
 * imagery can be seen, so satellite mode had zero street labels BY
 * CONSTRUCTION. Operator, on the live surface: "I cant see street names I think
 * this is important I have to click on a house to see the name of the street" —
 * and every screenshot in that QA pass was satellite mode.
 *
 * THE FIX
 * -------
 * CARTO publishes the label layer on its own at the same endpoints under the
 * same terms, so a labels-only raster drops in over the imagery with no new
 * provider and no new attribution obligation.
 *
 * WHY `light_only_labels` — measured 2026-08-18 by decoding both candidate
 * tiles at 16/15051/27015 (downtown Bastrop) and the Esri imagery over the same
 * ground:
 *
 *   light_only_labels   glyph #697b89 (luminance 120) fully opaque
 *                       halo  #f6f6f6 (luminance 246) at alpha 203-249
 *                       -> 4.14:1 glyph-on-halo
 *   dark_only_labels    glyph #6f6f6f (luminance 111) fully opaque
 *                       halo  #232323 (luminance 35)  at alpha ~204
 *                       -> 3.13:1 glyph-on-halo
 *   Esri World Imagery  mean luminance 120.5; 72.4% of pixels below 153,
 *                       only 7.3% above 204
 *
 * A white halo therefore separates from nearly three quarters of the frame and
 * fails only over the brightest 7.3%, and it carries the higher internal
 * contrast as well. `raster-contrast` is lifted slightly to widen the
 * glyph-to-halo separation further.
 *
 * This module holds the values and the layer spec so they are unit-testable
 * without a MapLibre instance; `chrome/satelliteBase.ts` does the map mutation.
 */

import { keyedCartoTileUrls } from "./carto-key.js";

export const SATELLITE_LABELS_SOURCE_ID = "explorer-satellite-labels";
export const SATELLITE_LABELS_LAYER_ID = "explorer-satellite-labels-layer";

/**
 * CARTO labels-only raster. Same host family and terms as the base raster.
 * MAP-BASEMAP-KEY (F-01): CARTO retired keyless raster tiles; keyed via
 * carto-key.js, same bare style path (no rastertiles/ rename) -- see that
 * module's header for the live verification.
 */
export function cartoLabelsTiles() {
  return keyedCartoTileUrls("light_only_labels");
}

/** The same OSM/CARTO credit the basemap source already carries. */
export const SATELLITE_LABELS_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

/** Raster source spec (idempotent add). */
export function labelsSourceSpec() {
  return {
    type: "raster",
    tiles: cartoLabelsTiles(),
    tileSize: 256,
    maxzoom: 19,
    attribution: SATELLITE_LABELS_ATTRIBUTION,
  };
}

/**
 * Raster layer spec.
 *
 * Starts hidden: visibility is bound to the satellite toggle, because with
 * satellite OFF the CARTO `light_all` basemap is showing and already carries
 * baked labels — two label rasters would double-print every street name.
 *
 * STATIC PAINT ONLY (the blank-map crash rule) and deliberately NO
 * `raster-brightness-*` / `raster-saturation`: the GROUND-role clamp on the
 * basemap exists to push streets BEHIND the data, and applying it here would
 * undo the whole point of the layer.
 */
export function labelsLayerSpec() {
  return {
    id: SATELLITE_LABELS_LAYER_ID,
    type: "raster",
    source: SATELLITE_LABELS_SOURCE_ID,
    layout: { visibility: "none" },
    paint: {
      "raster-opacity": 1,
      "raster-contrast": 0.2,
    },
  };
}
