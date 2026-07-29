// packages/map-renderer/src/chrome/MapToolset.tsx
//
// ONE map control cluster: the TOOLS toolbar (satellite/aerial base toggle,
// measure, draw, marker, clear, and the in-panel "My location" geolocate
// button — the GeolocateControl itself is mounted hidden on the map and
// triggered from the panel, never shown as a floating map button) merged with
// the LAYERS checklist into a single coherent panel. Replaces the split
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
  // Crosshair / GPS glyph for the in-panel "My location" button.
  locate:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3",
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

/**
 * The TOOLS section of the toolset panel — pure presentational (no map/effect
 * dependency), exported so it is unit-testable via a static render. Includes
 * the in-panel "My location" button (the GeolocateControl now lives HIDDEN on
 * the map and is driven from here — no floating GPS button on the map corner).
 */
export function ToolsetToolsSection({
  active,
  measureMode,
  readout,
  satellite,
  tracking,
  onActivate,
  onClear,
  onSetMeasureMode,
  onSatelliteChange,
  onLocate,
}: {
  active: ToolsSnapshot["active"];
  measureMode: ToolsSnapshot["measureMode"];
  readout: string | null;
  satellite: boolean;
  /** True while the hidden GeolocateControl is tracking the user location. */
  tracking: boolean;
  onActivate: (tool: "measure" | "draw" | "marker") => void;
  onClear: () => void;
  onSetMeasureMode: (mode: "line" | "area") => void;
  onSatelliteChange: (on: boolean) => void;
  /** Trigger / toggle the hidden GeolocateControl. */
  onLocate: () => void;
}) {
  return (
    <div data-testid="map-toolset-tools">
      <div style={{ ...sectionHeaderStyle(), marginBottom: 7 }}>Tools</div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          title="Measure distance / area"
          aria-label="Measure distance or area"
          aria-pressed={active === "measure"}
          onClick={() => onActivate("measure")}
          style={toolButtonStyle(active === "measure")}
        >
          <ToolIcon path={ICONS.measure} />
        </button>
        <button
          type="button"
          title="Draw / annotate"
          aria-label="Draw or annotate"
          aria-pressed={active === "draw"}
          onClick={() => onActivate("draw")}
          style={toolButtonStyle(active === "draw")}
        >
          <ToolIcon path={ICONS.draw} />
        </button>
        <button
          type="button"
          title="Drop a marker"
          aria-label="Drop a marker"
          aria-pressed={active === "marker"}
          onClick={() => onActivate("marker")}
          style={toolButtonStyle(active === "marker")}
        >
          <ToolIcon path={ICONS.marker} />
        </button>
        <button
          type="button"
          title="Clear measure / draw"
          aria-label="Clear measure and draw"
          onClick={onClear}
          style={toolButtonStyle(false)}
        >
          <ToolIcon path={ICONS.clear} />
        </button>
        <button
          type="button"
          data-testid="map-toolset-locate"
          title="My location"
          aria-label="My location"
          aria-pressed={tracking}
          onClick={onLocate}
          style={toolButtonStyle(tracking)}
        >
          <ToolIcon path={ICONS.locate} />
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
              onClick={() => onSetMeasureMode(mode)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                color: measureMode === mode ? "#0b0f14" : MUTED,
                background: measureMode === mode ? ACCENT : "transparent",
              }}
            >
              {mode === "line" ? "Distance" : "Area"}
            </button>
          ))}
        </div>
      )}

      {/* Running measure/draw readout. */}
      {readout && (
        <div
          style={{
            marginTop: 7,
            fontSize: 11,
            fontWeight: 600,
            color: TEXT,
          }}
        >
          {readout}
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
          onChange={(e) => onSatelliteChange(e.target.checked)}
          style={{ accentColor: ACCENT, cursor: "pointer" }}
        />
        <span>Satellite / aerial</span>
      </label>
    </div>
  );
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
  // True while the hidden GeolocateControl is tracking the user's location —
  // drives the pressed state of the in-panel "My location" button.
  const [tracking, setTracking] = useState(false);

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
  //
  // The GeolocateControl is mounted HIDDEN (its own floating button is not
  // shown anywhere on the map): we call its IControl onAdd() directly and park
  // the returned element display:none inside the map container, then drive it
  // from the in-panel "My location" button via .trigger(). This keeps maplibre's
  // full track-user behaviour (watchPosition, user dot + accuracy circle,
  // camera lock, background states) with no floating GPS button outside the
  // toolset panel.
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
    let geolocateEl: HTMLElement | null = null;
    const onTrackStart = () => setTracking(true);
    const onTrackEnd = () => setTracking(false);
    try {
      geolocateEl = geolocate.onAdd(map);
      geolocateEl.style.display = "none";
      map.getContainer().appendChild(geolocateEl);
      geolocate.on("trackuserlocationstart", onTrackStart);
      geolocate.on("trackuserlocationend", onTrackEnd);
    } catch {
      /* control setup failed (unlikely) — GPS button simply inert */
    }

    return () => {
      controller.destroy();
      controllerRef.current = null;
      try {
        geolocate.off("trackuserlocationstart", onTrackStart);
        geolocate.off("trackuserlocationend", onTrackEnd);
        geolocate.onRemove();
      } catch {
        /* ignore */
      }
      try {
        geolocateEl?.remove();
      } catch {
        /* ignore */
      }
      geolocateRef.current = null;
      setTracking(false);
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

  // Operator revision 2026-07-29: the toolset lives as a small BUBBLE in the
  // lower-right corner; clicking it expands the panel upward. Collapsed by
  // default so the map (and the top-right brief) own the screen.
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid="map-toolset"
      style={{
        position: "absolute",
        bottom: 16,
        right: 12,
        zIndex: 9,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* THE unified panel: Tools section + Layers section (expanded only). */}
      <div
        style={{
          display: expanded ? "flex" : "none",
          width: 200,
          flexDirection: "column",
          gap: 9,
          padding: "10px 12px",
          borderRadius: 9,
          background: PANEL_BG,
          border: PANEL_BORDER,
          color: TEXT,
          fontSize: 11.5,
          boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
          maxHeight: "calc(100vh - 96px)",
          overflowY: "auto",
        }}
      >
        {/* --- TOOLS --- */}
        {toolsReady && (
          <ToolsetToolsSection
            active={active}
            measureMode={snap.measureMode}
            readout={snap.readout}
            satellite={satellite}
            tracking={tracking}
            onActivate={(tool) => controller()?.activate(tool)}
            onClear={() => controller()?.clear()}
            onSetMeasureMode={(mode) => controller()?.setMeasureMode(mode)}
            onSatelliteChange={setSatellite}
            onLocate={() => geolocateRef.current?.trigger()}
          />
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

      {/* Esri attribution while satellite is on (its terms require the credit).
          Shown even while collapsed — the credit must stay visible whenever
          the satellite base is. */}
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

      {/* The bubble: always visible, toggles the panel. */}
      <button
        type="button"
        data-testid="map-toolset-bubble"
        aria-label={expanded ? "Collapse map tools & layers" : "Expand map tools & layers"}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: PANEL_BORDER,
          background: expanded ? "rgba(125,211,252,0.18)" : PANEL_BG,
          color: expanded ? ACCENT : TEXT,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* layer-stack glyph */}
        <svg
          viewBox="0 0 24 24"
          width={20}
          height={20}
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2 2 7.5 12 13l10-5.5L12 2Zm-10 10L12 17.5 22 12M2 16.5 12 22l10-5.5" />
        </svg>
      </button>
    </div>
  );
}
