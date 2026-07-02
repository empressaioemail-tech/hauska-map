/**
 * Command Center — the first React consumer of @hauska/map-renderer.
 *
 * This is the in-repo rendering proof: it imports FloatingMap from the package
 * (not a relative path) and mounts it. Track C (cortex-tiles) will import the
 * same way.
 */

import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FloatingMap,
  LAYER_REGISTRY,
  DEFAULT_VISIBLE_LAYERS,
  type FloatingMapHandle,
  type OverlaySpec,
  type ParcelSelection,
} from "@hauska/map-renderer";
import "@hauska/map-renderer/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";

// Sample SpatialProvider-style overlays exercising all three geometry shapes:
// a FEMA flood-zone polygon (fill+line), a drainage line, and a rent-heat point
// choropleth. Toggled on/off to prove idempotent add + remove.
const CENTER = { latitude: 30.1109, longitude: -97.3153 };
const SAMPLE_OVERLAYS: OverlaySpec[] = [
  {
    layerKey: "ovl-flood-zone",
    layerKind: "fema-nfhl-flood-zone",
    provider: "fema",
    paint: { "fill-color": "#3a7bd5", "fill-opacity": 0.35, "line-color": "#5aa0ff" },
    geojson: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { FLD_ZONE: "AE" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-97.319, 30.108],
                [-97.312, 30.108],
                [-97.312, 30.114],
                [-97.319, 30.114],
                [-97.319, 30.108],
              ],
            ],
          },
        },
      ],
    },
  },
  {
    layerKey: "ovl-drainage",
    layerKind: "drainage",
    paint: { "line-color": "#2ec4b6", "line-width": 2.2 },
    geojson: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [-97.318, 30.109],
          [-97.315, 30.111],
          [-97.313, 30.113],
        ],
      },
    },
  },
  {
    layerKey: "ovl-rent-heat",
    layerKind: "rent-heat",
    choropleth: {
      property: "rent",
      stops: [
        [1500, "#ffd166"],
        [2500, "#f3722c"],
        [3500, "#d00000"],
      ],
    },
    geojson: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { rent: 1600 }, geometry: { type: "Point", coordinates: [-97.316, 30.11] } },
        { type: "Feature", properties: { rent: 3200 }, geometry: { type: "Point", coordinates: [-97.314, 30.112] } },
      ],
    },
  },
];

function App() {
  const mapRef = useRef<FloatingMapHandle>(null);
  const [selected, setSelected] = useState<ParcelSelection | null>(null);
  const [overlaysOn, setOverlaysOn] = useState(true);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 16,
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 18 }}>Hauska Command Center (React)</h1>
      <p style={{ fontSize: 13, color: "#555" }}>
        Consumes <code>@hauska/map-renderer</code> as a workspace package.
        Registry has {LAYER_REGISTRY.length} layers; {DEFAULT_VISIBLE_LAYERS.size}{" "}
        visible by default. Drag the title bar; use the window controls.
      </p>
      {selected ? (
        <p style={{ fontSize: 13 }}>
          Selected parcel: <strong>{selected.address ?? selected.layerKey}</strong>
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "#999" }}>Click a parcel on the map.</p>
      )}

      <button
        type="button"
        onClick={() => setOverlaysOn((v) => !v)}
        style={{ fontSize: 13, marginBottom: 8 }}
      >
        {overlaysOn ? "Hide" : "Show"} SpatialProvider overlays
      </button>

      <FloatingMap
        ref={mapRef}
        title="E6 Floating map — @hauska/map-renderer"
        center={CENTER}
        address="Bastrop, TX (fixture)"
        useFixture
        overlays={overlaysOn ? SAMPLE_OVERLAYS : []}
        onParcelSelect={(sel) => setSelected(sel)}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
