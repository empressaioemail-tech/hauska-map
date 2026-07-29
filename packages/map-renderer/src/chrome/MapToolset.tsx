// packages/map-renderer/src/chrome/MapToolset.tsx
//
// ONE upper-right map control cluster: the TOOLS toolbar (satellite/aerial
// base toggle, measure, draw, marker, clear, GeolocateControl) merged with the
// LAYERS checklist into a single coherent panel. Replaces the split
// LayersControl (top-right) + MapTools (bottom-right) pair on surfaces that
// want the unified toolset; the split components remain exported for
// consumers that still use them (CC).
//
// Same contracts as the split pair:
//   - Tools operate on the LIVE map via FloatingMapHandle.getMap() — never
//     remounts FloatingMap (installMapTools / setSatelliteBase).
//   - The layer VISIBILITY SET is owned by the substrate — seeded from
//     getVisibleLayers and driven back through the `visibleLayers` prop via
//     `onLayersChange`. No local shadow paint state.
//
// HONESTY SURFACE: `layerStates` lets the host surface a PERSISTENT per-layer
// state (degraded contours, not-survey-grade parcels, honest-empty hydrology)
// as a small colored dot + tooltip + caption on that layer's row. Transient
// toasts may fade; the honesty stays discoverable here.

import { useEffect, useRef, useState, type RefObject } from "react";
import { GeolocateControl } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { FloatingMapHandle } from "../FloatingMap";
import { LAYER_REGISTRY } from "../layer-registry.js";
import type { LayerKey, LayerDef } from "../postMessage";
import {
  asMaplibreMap,
  setSatelliteBase,
  SATELLITE_ATTRIBUTION,
} from "./satelliteBase";
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

/** Persistent per-layer state surfaced on the layer row (honesty constraint:
 *  a faded toast must stay discoverable here). */
export interface LayerStateBadge {
  /** ok = healthy live data; info = neutral note (e.g. tier label, provider);
   *  warn = degraded / no-coverage / not-survey-grade; error = failed. */
  tone: "ok" | "info" | "warn" | "error";
  /** Short honest note, shown as tooltip + caption under the row label. */
  note: string;
}

const BADGE_COLOR: Record<LayerStateBadge["tone"], string> = {
  ok: "#4ade80",
  info: "#9aa6b2",
  warn: "#fcd34d",
  error: "#fca5a5",
};

const ICONS = {
  measure: "M3 15l6 6 12-12-6-6L3 15Zm5-5 2 2m1-5 2 2m1-5 2 2",
  draw: "M12 19l7-7 3 3-7 7-3-3Zm6-6-1.5-7.5L2 2l3.5 14.5L13 18l5-5ZM2 2l7.6 7.6",
  marker:
    "M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
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

function sectionHeaderStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: MUTED,
  };
}

/** Registry entry lookup for a human label; fall back to the raw key. */
function labelFor(key: LayerKey): string {
  const entry = (LAYER_REGISTRY as LayerDef[]).find((l) => l.key === key);
  return entry?.label ?? key;
}

export function MapToolset({
  mapRef,
  known,
  visible,
  onLayersChange,
  layerStates,
}: {
  mapRef: RefObject<FloatingMapHandle | null>;
  /** Full layer set this surface knows about (mount seed) — a toggled-off
   *  layer stays listed so it can be re-enabled. */
  known: Set<LayerKey>;
  /** The substrate's current visible-layer set (a copy, never a shadow). */
  visible: Set<LayerKey>;
  /** Hand a NEW visible set up; the host threads it to `visibleLayers`. */
  onLayersChange: (next: Set<LayerKey>) => void;
  /** Persistent honest per-layer state (dot + tooltip + caption per row). */
  layerStates?: Partial<Record<LayerKey, LayerStateBadge>>;
}) {
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

  const active = snap.active;
  const controller = () => controllerRef.current;
  const toolsReady = map != null;

  const layerKeys = [...known].sort((a, b) =>
    labelFor(a).localeCompare(labelFor(b)),
  );
  const toggleLayer = (key: LayerKey) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onLayersChange(next);
  };

  return (
    <div
      data-testid="map-toolset"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 9,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* THE unified panel: Tools section + Layers section. */}
      <div
        style={{
          width: 200,
          display: "flex",
          flexDirection: "column",
          gap: 9,
          padding: "10px 12px",
          borderRadius: 9,
          background: PANEL_BG,
          border: PANEL_BORDER,
          color: TEXT,
          fontSize: 11.5,
          boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
        }}
      >
        {/* --- TOOLS --- */}
        {toolsReady && (
          <div data-testid="map-toolset-tools">
            <div style={{ ...sectionHeaderStyle(), marginBottom: 7 }}>Tools</div>
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

            {/* Measure sub-mode (distance / area), only while measuring. */}
            {active === "measure" && (
              <div
                style={{
                  display: "inline-flex",
                  marginTop: 7,
                  padding: 3,
                  gap: 3,
                  borderRadius: 8,
                  background: "rgba(154,166,178,0.1)",
                  border: "0.5px solid rgba(154,166,178,0.2)",
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
                      background:
                        snap.measureMode === mode ? ACCENT : "transparent",
                    }}
                  >
                    {mode === "line" ? "Distance" : "Area"}
                  </button>
                ))}
              </div>
            )}

            {/* Running measure/draw readout. */}
            {snap.readout && (
              <div
                style={{
                  marginTop: 7,
                  fontSize: 11,
                  fontWeight: 600,
                  color: TEXT,
                }}
              >
                {snap.readout}
              </div>
            )}

            {/* Satellite / aerial base toggle. */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
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
        )}

        {/* --- LAYERS --- */}
        <div
          data-testid="map-toolset-layers"
          style={
            toolsReady
              ? {
                  borderTop: "0.5px solid rgba(154,166,178,0.22)",
                  paddingTop: 9,
                }
              : undefined
          }
        >
          <div style={{ ...sectionHeaderStyle(), marginBottom: 7 }}>Layers</div>
          {layerKeys.map((key) => {
            const badge = layerStates?.[key];
            return (
              <div key={key} style={{ padding: "3px 0" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                  title={badge?.note}
                >
                  <input
                    type="checkbox"
                    checked={visible.has(key)}
                    onChange={() => toggleLayer(key)}
                    style={{ accentColor: ACCENT, cursor: "pointer" }}
                  />
                  <span style={{ flex: 1 }}>{labelFor(key)}</span>
                  {badge && (
                    <span
                      data-testid={`layer-state-${key}`}
                      title={badge.note}
                      aria-label={badge.note}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: BADGE_COLOR[badge.tone],
                        boxShadow: `0 0 5px ${BADGE_COLOR[badge.tone]}`,
                      }}
                    />
                  )}
                </label>
                {/* Persistent honest caption — the discoverable home of any
                    state whose toast has faded (warn/error always captioned;
                    info stays tooltip-only to keep the panel quiet). */}
                {badge && (badge.tone === "warn" || badge.tone === "error") && (
                  <div
                    style={{
                      marginLeft: 21,
                      fontSize: 9.5,
                      lineHeight: 1.35,
                      color: BADGE_COLOR[badge.tone],
                    }}
                  >
                    {badge.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Esri attribution while satellite is on (its terms require the credit). */}
      {satellite && (
        <div
          style={{
            maxWidth: 200,
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
