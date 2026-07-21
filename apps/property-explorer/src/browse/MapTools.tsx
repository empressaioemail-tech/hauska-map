// apps/property-explorer/src/browse/MapTools.tsx
//
// The map TOOLBAR for the browse surface: a satellite/aerial base toggle,
// measure (distance/area), draw, drop-marker, a clear button, and a GPS
// "where am I" GeolocateControl. All operate on the LIVE persistent map
// instance (obtained from the renderer handle's getMap()) — nothing here
// remounts FloatingMap. All interactions are client-side: the only network
// traffic is the satellite raster tiles. No AI, no backend calls, anonymous.
//
// Visual style matches LayersControl (dark glass panel, Empressa palette). Zero
// Hauska user-facing strings. Positioned bottom-right so it clears the Layers
// panel (top-right) and the live-state chips (bottom-left).

import { useEffect, useRef, useState } from "react";
import { GeolocateControl } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { FloatingMapHandle } from "@hauska/map-renderer";
import { asMaplibreMap, setSatelliteBase, SATELLITE_ATTRIBUTION } from "./satelliteBase";
import {
  installMapTools,
  type MapToolsController,
  type ToolsSnapshot,
} from "./mapToolsController";

const PANEL_BG = "rgba(13,17,23,0.9)";
const PANEL_BORDER = "0.5px solid rgba(154,166,178,0.28)";
const TEXT = "#e6edf3";
const MUTED = "#8b97a5";
const ACCENT = "#7dd3fc";

const ICONS = {
  measure:
    "M3 15l6 6 12-12-6-6L3 15Zm5-5 2 2m1-5 2 2m1-5 2 2",
  draw: "M12 19l7-7 3 3-7 7-3-3Zm6-6-1.5-7.5L2 2l3.5 14.5L13 18l5-5ZM2 2l7.6 7.6",
  marker: "M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  clear: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
} as const;

function ToolIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

function toolButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 7,
    cursor: "pointer",
    color: active ? "#0b0f14" : TEXT,
    background: active ? ACCENT : "rgba(154,166,178,0.12)",
    border: active ? `0.5px solid ${ACCENT}` : "0.5px solid rgba(154,166,178,0.22)",
    transition: "background 120ms ease, color 120ms ease",
  };
}

export function MapTools({ mapRef }: { mapRef: React.RefObject<FloatingMapHandle> }) {
  // The live maplibre map, resolved once the handle is ready.
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const controllerRef = useRef<MapToolsController | null>(null);
  const geolocateRef = useRef<GeolocateControl | null>(null);

  const [snap, setSnap] = useState<ToolsSnapshot>({
    active: null,
    measureMode: "line",
    readout: null,
  });
  const [satellite, setSatellite] = useState(false);

  // Resolve the live map from the renderer handle. FloatingMap mounts the map
  // asynchronously, so poll briefly until getMap() returns a usable instance.
  useEffect(() => {
    let raf = 0;
    let tries = 0;
    const tick = () => {
      const m = asMaplibreMap(mapRef.current?.getMap?.());
      if (m) {
        setMap(m);
        return;
      }
      if (tries++ < 120) raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [mapRef]);

  // Install the measure/draw controller + the GeolocateControl on the live map.
  // Torn down on unmount / map change — never remounts the map.
  useEffect(() => {
    if (!map) return;
    const controller = installMapTools(map, setSnap);
    controllerRef.current = controller;

    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    });
    geolocateRef.current = geolocate;
    try {
      map.addControl(geolocate, "bottom-right");
    } catch {
      /* control add failed (unlikely) — GPS button simply absent */
    }

    return () => {
      controller.destroy();
      controllerRef.current = null;
      try {
        if (geolocateRef.current) map.removeControl(geolocateRef.current);
      } catch {
        /* ignore */
      }
      geolocateRef.current = null;
    };
  }, [map]);

  // Apply satellite base on toggle change (operates on the live map in place).
  useEffect(() => {
    setSatelliteBase(map, satellite);
  }, [map, satellite]);

  if (!map) return null;

  const active = snap.active;
  const controller = () => controllerRef.current;

  return (
    <div
      data-testid="map-tools"
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 9,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Running measure/draw readout chip. */}
      {snap.readout && (
        <div
          style={{
            maxWidth: 260,
            padding: "5px 10px",
            borderRadius: 7,
            background: PANEL_BG,
            border: PANEL_BORDER,
            color: TEXT,
            fontSize: 11,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {snap.readout}
        </div>
      )}

      {/* Measure sub-mode (distance / area), only while measuring. */}
      {active === "measure" && (
        <div
          style={{
            display: "inline-flex",
            padding: 3,
            gap: 3,
            borderRadius: 8,
            background: PANEL_BG,
            border: PANEL_BORDER,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {(["line", "area"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => controller()?.setMeasureMode(mode)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                color: snap.measureMode === mode ? "#0b0f14" : MUTED,
                background: snap.measureMode === mode ? ACCENT : "transparent",
              }}
            >
              {mode === "line" ? "Distance" : "Area"}
            </button>
          ))}
        </div>
      )}

      {/* The toolbar panel. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "9px 10px",
          borderRadius: 9,
          background: PANEL_BG,
          border: PANEL_BORDER,
          boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          Tools
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            title="Measure distance / area"
            aria-label="Measure distance or area"
            aria-pressed={active === "measure"}
            onClick={() => controller()?.activate("measure")}
            style={toolButtonStyle(active === "measure")}
          >
            <ToolIcon path={ICONS.measure} />
          </button>
          <button
            type="button"
            title="Draw / annotate"
            aria-label="Draw or annotate"
            aria-pressed={active === "draw"}
            onClick={() => controller()?.activate("draw")}
            style={toolButtonStyle(active === "draw")}
          >
            <ToolIcon path={ICONS.draw} />
          </button>
          <button
            type="button"
            title="Drop a marker"
            aria-label="Drop a marker"
            aria-pressed={active === "marker"}
            onClick={() => controller()?.activate("marker")}
            style={toolButtonStyle(active === "marker")}
          >
            <ToolIcon path={ICONS.marker} />
          </button>
          <button
            type="button"
            title="Clear measure / draw"
            aria-label="Clear measure and draw"
            onClick={() => controller()?.clear()}
            style={toolButtonStyle(false)}
          >
            <ToolIcon path={ICONS.clear} />
          </button>
        </div>

        {/* Satellite / aerial base toggle. */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 11.5,
            color: TEXT,
          }}
        >
          <input
            type="checkbox"
            checked={satellite}
            onChange={(e) => setSatellite(e.target.checked)}
            style={{ accentColor: ACCENT, cursor: "pointer" }}
          />
          <span>Satellite / aerial</span>
        </label>
      </div>

      {/* Esri attribution while satellite is on (its terms require the credit). */}
      {satellite && (
        <div
          style={{
            maxWidth: 260,
            padding: "3px 9px",
            borderRadius: 5,
            background: "rgba(13,17,23,0.82)",
            border: "0.5px solid rgba(154,166,178,0.35)",
            color: MUTED,
            fontSize: 9.5,
            fontWeight: 600,
            pointerEvents: "none",
          }}
        >
          {SATELLITE_ATTRIBUTION}
        </div>
      )}
    </div>
  );
}
