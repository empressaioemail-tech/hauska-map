/**
 * Subject markers — a drawn point of reference at the resolved parcel.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Nothing drew a marker anywhere. Operator, on the live surface: "when I hit
 * find I can not find the property, it will not zoom in or place an arrow on the
 * lot" and "I am comparing 2 properties and I have no idea where they are, there
 * should be some point of visual reference to show each location."
 *
 * The subject parcel does get a feature-state amber glow via `parcel-tiles.js`,
 * but that only lights up once the parcel's vector tile has painted, it is
 * invisible at low zoom where the parcel is a few pixels, and it cannot mark a
 * comparison property at all. A marker is a separate, always-drawable thing.
 *
 * ROLE DISCIPLINE
 * ---------------
 * Markers are SUBJECT role, so they wear the reserved amber and nothing else
 * does. Property A and property B are distinguished by SHAPE first (A is a solid
 * bullseye, B is a hollow ring) and by an optional letter second, so the pair
 * still reads if the glyph endpoint is unavailable and it does not lean on hue
 * — which would have meant minting a second reserved colour.
 *
 * CRASH-SAFETY: circle and symbol layers with static paint driven by ordinary
 * feature PROPERTIES. No feature-state anywhere, and no `line-dasharray` or
 * `line-gradient` — the documented setConstantDashPositions per-frame crash.
 *
 * SEAM: this module owns marker RENDERING only. It never touches the camera and
 * never reads subject state. `renderer.setSubjectMarkers(markers)` is the seam a
 * consumer (lane P-39, which owns the camera fly and the subject state) calls.
 */

export const SUBJECT_MARKER_SOURCE_ID = "hauska-subject-markers";
export const SUBJECT_MARKER_HALO_ID = "hauska-subject-markers-halo";
export const SUBJECT_MARKER_RING_ID = "hauska-subject-markers-ring";
export const SUBJECT_MARKER_CORE_ID = "hauska-subject-markers-core";
export const SUBJECT_MARKER_LABEL_ID = "hauska-subject-markers-label";

/**
 * Font stack for the marker letter. Verified available at the configured glyph
 * endpoint (protomaps basemaps-assets) on 2026-08-18: "Noto Sans Medium" and
 * "Noto Sans Regular" return 200, "Open Sans Regular" and "Noto Sans Bold"
 * return 404. Getting this wrong makes the symbol layer silently draw nothing,
 * which is why the shapes carry the A/B distinction on their own.
 */
export const SUBJECT_MARKER_FONT = ["Noto Sans Medium"];

const EMPTY_FC = { type: "FeatureCollection", features: [] };

/**
 * Normalise the consumer's marker list into a GeoJSON FeatureCollection.
 * Anything without finite coordinates is dropped rather than drawn at 0,0 —
 * a marker in the Gulf of Guinea is worse than no marker.
 *
 * @param {Array<{ id?: string|number, longitude?: number, latitude?: number,
 *                 lng?: number, lat?: number, role?: 'primary'|'secondary',
 *                 label?: string }>} markers
 * @returns {{ type: 'FeatureCollection', features: object[] }}
 */
export function markersToFeatureCollection(markers) {
  const list = Array.isArray(markers) ? markers : [];
  const features = [];
  for (let i = 0; i < list.length; i += 1) {
    const m = list[i];
    if (!m) continue;
    const lng = typeof m.longitude === "number" ? m.longitude : m.lng;
    const lat = typeof m.latitude === "number" ? m.latitude : m.lat;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const role = m.role === "secondary" ? "secondary" : "primary";
    features.push({
      type: "Feature",
      id: m.id ?? `${role}-${i}`,
      properties: {
        markerId: m.id != null ? String(m.id) : `${role}-${i}`,
        role,
        // Default letters make the compare case readable with no extra work
        // from the consumer, and an explicit label always wins.
        label: typeof m.label === "string" && m.label ? m.label : role === "secondary" ? "B" : "A",
      },
      geometry: { type: "Point", coordinates: [lng, lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

const isSecondary = ["==", ["get", "role"], "secondary"];

/** True when `map` exposes the MapLibre surface these helpers actually call. */
function mapLike(map) {
  return (
    !!map &&
    typeof map.getLayer === "function" &&
    typeof map.addLayer === "function" &&
    typeof map.getSource === "function"
  );
}

/**
 * Add the marker source and layers. Idempotent; call as often as you like.
 * Requires a loaded style (the caller gates on the map `load` event exactly as
 * the overlay and parcel-tile paths do).
 *
 * @param {import('maplibre-gl').Map} map
 */
export function addSubjectMarkers(map) {
  // Defensive shape check, not politeness: the renderer's own suites drive it
  // with partial map stubs, and a marker helper must never be the thing that
  // takes a mount or a teardown down.
  if (!mapLike(map)) return;

  if (!map.getSource(SUBJECT_MARKER_SOURCE_ID)) {
    map.addSource(SUBJECT_MARKER_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
  }

  // Soft outer halo — separates the marker from busy satellite imagery.
  if (!map.getLayer(SUBJECT_MARKER_HALO_ID)) {
    map.addLayer({
      id: SUBJECT_MARKER_HALO_ID,
      type: "circle",
      source: SUBJECT_MARKER_SOURCE_ID,
      paint: {
        "circle-color": "#f2a23c",
        "circle-opacity": 0.22,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 18, 18, 26],
        "circle-blur": 0.55,
      },
    });
  }

  // The ring. Primary and secondary share it; secondary is drawn thicker
  // because its centre stays hollow.
  if (!map.getLayer(SUBJECT_MARKER_RING_ID)) {
    map.addLayer({
      id: SUBJECT_MARKER_RING_ID,
      type: "circle",
      source: SUBJECT_MARKER_SOURCE_ID,
      paint: {
        // Hollow centre for B, dark centre for A so its amber core reads.
        "circle-color": "#16110c",
        "circle-opacity": ["case", isSecondary, 0.45, 0.8],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 7, 14, 10, 18, 14],
        "circle-stroke-color": "#ffe14d",
        "circle-stroke-width": ["case", isSecondary, 3.4, 2.2],
        "circle-stroke-opacity": 1,
      },
    });
  }

  // Solid amber core — PRIMARY ONLY. Radius 0 for secondary keeps property B a
  // ring, which is the shape difference that survives a glyph failure.
  if (!map.getLayer(SUBJECT_MARKER_CORE_ID)) {
    map.addLayer({
      id: SUBJECT_MARKER_CORE_ID,
      type: "circle",
      source: SUBJECT_MARKER_SOURCE_ID,
      paint: {
        "circle-color": "#f2a23c",
        "circle-opacity": ["case", isSecondary, 0, 1],
        "circle-radius": [
          "case",
          isSecondary,
          0,
          ["interpolate", ["linear"], ["zoom"], 8, 3.2, 14, 4.6, 18, 6.4],
        ],
      },
    });
  }

  // The letter. Offset above the ring so it never sits on the core.
  if (!map.getLayer(SUBJECT_MARKER_LABEL_ID)) {
    map.addLayer({
      id: SUBJECT_MARKER_LABEL_ID,
      type: "symbol",
      source: SUBJECT_MARKER_SOURCE_ID,
      layout: {
        "text-field": ["get", "label"],
        "text-font": SUBJECT_MARKER_FONT,
        "text-size": 12,
        "text-offset": [0, -1.7],
        "text-anchor": "bottom",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#fff2b0",
        "text-halo-color": "#16110c",
        "text-halo-width": 1.6,
      },
    });
  }
}

/**
 * Replace the drawn marker set. Passing an empty array (or nothing) clears it.
 * No-op when the source has not been added yet — the caller re-applies on load.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {Parameters<typeof markersToFeatureCollection>[0]} markers
 */
export function setSubjectMarkerData(map, markers) {
  if (!map || typeof map.getSource !== "function") return;
  const src = map.getSource(SUBJECT_MARKER_SOURCE_ID);
  if (!src || typeof src.setData !== "function") return;
  try {
    src.setData(markersToFeatureCollection(markers));
  } catch {
    /* style mid-swap — the caller re-applies on the next style load */
  }
}

/**
 * Lift the marker layers to the top of the stack. SUBJECT role owns the highest
 * z, and both `reorderGisLayers` and the overlay reconciler call `moveLayer`,
 * so the marker has to re-assert after them or it can end up buried.
 *
 * @param {import('maplibre-gl').Map} map
 */
export function raiseSubjectMarkers(map) {
  if (!mapLike(map) || typeof map.moveLayer !== "function") return;
  for (const id of [
    SUBJECT_MARKER_HALO_ID,
    SUBJECT_MARKER_RING_ID,
    SUBJECT_MARKER_CORE_ID,
    SUBJECT_MARKER_LABEL_ID,
  ]) {
    if (!map.getLayer(id)) continue;
    try {
      map.moveLayer(id);
    } catch {
      /* layer not ready on this frame */
    }
  }
}

/** Remove the marker layers and source (teardown / reconfigure). */
export function removeSubjectMarkers(map) {
  if (!mapLike(map)) return;
  for (const id of [
    SUBJECT_MARKER_LABEL_ID,
    SUBJECT_MARKER_CORE_ID,
    SUBJECT_MARKER_RING_ID,
    SUBJECT_MARKER_HALO_ID,
  ]) {
    if (map.getLayer(id)) {
      try {
        map.removeLayer(id);
      } catch {
        /* ignore */
      }
    }
  }
  if (map.getSource(SUBJECT_MARKER_SOURCE_ID)) {
    try {
      map.removeSource(SUBJECT_MARKER_SOURCE_ID);
    } catch {
      /* still referenced — ignore */
    }
  }
}
