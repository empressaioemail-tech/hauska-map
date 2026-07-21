// apps/property-explorer/src/browse/satelliteBase.ts
//
// SATELLITE / aerial base-layer toggle for the persistent browse map.
//
// The substrate's base style paints a warm CARTO raster ("hauska-basemap"
// layer, source "hauska-carto-light") beneath every parcel + overlay layer.
// This helper adds a SECOND raster base — Esri World Imagery (free, no key) —
// as its own source + layer inserted directly ABOVE the CARTO basemap so it
// stays BENEATH every parcel line, fill, and data overlay (the OnX
// lot-lines-over-imagery look). Toggling swaps VISIBILITY only — no fetch, no
// map.setStyle, no remount. The live map instance is mutated in place.
//
// PAINT DISCIPLINE (the blank-map crash rule): the satellite layer is a plain
// raster with STATIC paint only. No feature-state, no data-driven dasharray or
// gradient anywhere. The substrate still owns the parcel/overlay layers.
//
// Attribution: Esri's terms require crediting World Imagery whenever it is
// shown. We surface the credit as a small on-map chip while satellite is on
// (the base style has no AttributionControl mounted here).

import type { Map as MaplibreMap } from "maplibre-gl";

/** Esri World Imagery — free, no API key. Standard {z}/{y}/{x} order. */
const SATELLITE_SOURCE_ID = "explorer-satellite-base";
const SATELLITE_LAYER_ID = "explorer-satellite-base-layer";

/** The substrate base raster layer id we insert the satellite above. */
const CARTO_BASEMAP_LAYER_ID = "hauska-basemap";

const ESRI_WORLD_IMAGERY_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];

export const SATELLITE_ATTRIBUTION =
  "Imagery: Esri, Maxar, Earthstar Geographics, GIS User Community";

/**
 * Coerce the renderer handle's `getMap(): unknown` into a maplibregl.Map we can
 * mutate. Returns null if the map is not ready or the shape is unexpected.
 */
export function asMaplibreMap(raw: unknown): MaplibreMap | null {
  const m = raw as Partial<MaplibreMap> | null | undefined;
  if (!m || typeof m.getLayer !== "function" || typeof m.addLayer !== "function") {
    return null;
  }
  return m as MaplibreMap;
}

/** True once the map has a loaded style we can add sources/layers to. */
function styleReady(map: MaplibreMap): boolean {
  try {
    return typeof map.isStyleLoaded === "function" ? !!map.isStyleLoaded() : true;
  } catch {
    return false;
  }
}

/**
 * Ensure the satellite source + layer exist on the live map (idempotent). The
 * layer is inserted directly above the CARTO basemap so parcels/overlays stay
 * on top. No-op (returns false) if the style is not ready yet.
 */
function ensureSatelliteLayer(map: MaplibreMap): boolean {
  if (!styleReady(map)) return false;
  try {
    if (!map.getSource(SATELLITE_SOURCE_ID)) {
      map.addSource(SATELLITE_SOURCE_ID, {
        type: "raster",
        tiles: ESRI_WORLD_IMAGERY_TILES,
        tileSize: 256,
        maxzoom: 19,
        attribution: SATELLITE_ATTRIBUTION,
      });
    }
    if (!map.getLayer(SATELLITE_LAYER_ID)) {
      // Insert just above the CARTO basemap (below every data layer). If the
      // basemap layer is somehow absent, append (still below nothing added yet).
      const beforeId = firstDataLayerId(map);
      map.addLayer(
        {
          id: SATELLITE_LAYER_ID,
          type: "raster",
          source: SATELLITE_SOURCE_ID,
          layout: { visibility: "none" },
          // STATIC paint only.
          paint: { "raster-opacity": 1 },
        },
        beforeId,
      );
    }
    return true;
  } catch (err) {
    // Style mid-teardown / rebuild — ignore; next toggle retries.
    // eslint-disable-next-line no-console
    console.warn("[satellite-base] ensure failed:", err);
    return false;
  }
}

/**
 * The id of the first layer that sits ABOVE the CARTO basemap in the style —
 * i.e. the first parcel/overlay/data layer. Inserting the satellite before it
 * keeps satellite beneath all data. Returns undefined if the basemap is the
 * top-most layer (append).
 */
function firstDataLayerId(map: MaplibreMap): string | undefined {
  try {
    const style = map.getStyle();
    const layers = style?.layers ?? [];
    const baseIdx = layers.findIndex((l) => l.id === CARTO_BASEMAP_LAYER_ID);
    if (baseIdx < 0) return undefined;
    const next = layers[baseIdx + 1];
    return next?.id;
  } catch {
    return undefined;
  }
}

/**
 * Apply satellite on/off to the live map. When ON, the satellite raster is made
 * visible and the CARTO basemap is hidden (so labels/streets do not bleed
 * through the imagery). When OFF, the reverse. Idempotent; safe to call before
 * the style loads (it retries on the map's next `idle`).
 */
export function setSatelliteBase(map: MaplibreMap | null, on: boolean): void {
  if (!map) return;

  const apply = () => {
    if (!ensureSatelliteLayer(map)) return;
    try {
      map.setLayoutProperty(
        SATELLITE_LAYER_ID,
        "visibility",
        on ? "visible" : "none",
      );
      if (map.getLayer(CARTO_BASEMAP_LAYER_ID)) {
        map.setLayoutProperty(
          CARTO_BASEMAP_LAYER_ID,
          "visibility",
          on ? "none" : "visible",
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[satellite-base] apply failed:", err);
    }
  };

  if (styleReady(map)) {
    apply();
  } else {
    map.once("idle", apply);
  }
}
