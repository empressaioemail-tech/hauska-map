/**
 * Animated D8 hydrology flow channels — fixture GeoJSON, glowing blue lines.
 */

export const FLOW_SOURCE_ID = "hauska-gis-hydrology-flow";
export const FLOW_LAYER_IDS = [
  "hauska-gis-hydrology-flow-glow",
  "hauska-gis-hydrology-flow-core",
  "hauska-gis-hydrology-flow-highlight",
];

/** Paint for the three-layer glow stack. */
export const FLOW_PAINT = {
  glow: {
    "line-color": "#1a6fd4",
    "line-width": 8,
    "line-opacity": 0.22,
    "line-blur": 4,
  },
  core: {
    "line-color": "#3db8ff",
    "line-width": 3.2,
    "line-opacity": 0.78,
  },
  highlight: {
    "line-color": "#b8ecff",
    "line-width": 1.1,
    "line-opacity": 0.92,
  },
};

let flowAnimFrame = null;

/**
 * Flow lines are intentionally STATIC (solid glowing channels via the 3-layer
 * glow stack). The old approach animated `line-dasharray` per requestAnimationFrame
 * frame, setting a NEW unique dash pattern every frame. That exhausts MapLibre's
 * LineAtlas ("LineAtlas out of space") and crashes setConstantDashPositions
 * ("Cannot read properties of null (reading 'y')") on EVERY render frame, which
 * kills the render loop and blanks the entire map (the flash-to-dark regression,
 * 1000+ console errors). No dash = no crash. If motion is wanted later, use a
 * crash-safe technique (line-gradient + line-progress with the lineMetrics source
 * already enabled), never per-frame dasharray mutation.
 */
export function startFlowAnimation() {
  stopFlowAnimation();
}

export function stopFlowAnimation() {
  if (flowAnimFrame != null) {
    cancelAnimationFrame(flowAnimFrame);
    flowAnimFrame = null;
  }
}

/**
 * Upsert hydrology flow line layers.
 * @param {import('maplibre-gl').Map} map
 * @param {object} fc GeoJSON FeatureCollection
 * @param {boolean} visible
 */
export function upsertFlowLayers(map, fc, visible = true) {
  if (!map || !fc) return;
  if (map.getSource(FLOW_SOURCE_ID)) {
    map.getSource(FLOW_SOURCE_ID).setData(fc);
  } else {
    map.addSource(FLOW_SOURCE_ID, { type: "geojson", data: fc, lineMetrics: true });
  }

  const layers = [
    { id: FLOW_LAYER_IDS[0], paint: FLOW_PAINT.glow },
    { id: FLOW_LAYER_IDS[1], paint: FLOW_PAINT.core },
    { id: FLOW_LAYER_IDS[2], paint: FLOW_PAINT.highlight },
  ];

  for (const { id, paint } of layers) {
    if (!map.getLayer(id)) {
      map.addLayer({
        id,
        type: "line",
        source: FLOW_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          ...paint,
          "line-opacity-transition": { duration: 420, delay: 0 },
        },
      });
    }
    map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    if (visible) startFlowAnimation(map);
  }
  if (!visible) stopFlowAnimation();
}

export function hideFlowLayers(map) {
  for (const id of FLOW_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
  }
  stopFlowAnimation();
}
