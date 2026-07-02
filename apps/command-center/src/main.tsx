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
  type ParcelSelection,
} from "@hauska/map-renderer";
import "@hauska/map-renderer/styles.css";
import "maplibre-gl/dist/maplibre-gl.css";

function App() {
  const mapRef = useRef<FloatingMapHandle>(null);
  const [selected, setSelected] = useState<ParcelSelection | null>(null);

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

      <FloatingMap
        ref={mapRef}
        title="E6 Floating map — @hauska/map-renderer"
        center={{ latitude: 30.1109, longitude: -97.3153 }}
        address="Bastrop, TX (fixture)"
        useFixture
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
