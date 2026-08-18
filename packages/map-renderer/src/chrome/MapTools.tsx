// packages/map-renderer/src/chrome/MapTools.tsx
//
// Shared PE + CC map toolbar (CC-A WDLL 7): satellite/aerial base toggle,
// measure, draw, marker, note, undo/finish, clear, GeolocateControl. Operates
// on the LIVE map via FloatingMapHandle.getMap() — never remounts FloatingMap.
//
// This is the SPLIT toolbar (bottom-right) that Command Center's LiveMapTile
// still uses; Property Explorer uses the unified MapToolset. Both drive the
// SAME controller, so the W4 instrument rebuild — committed measurements,
// explicit finish, undo, per-item removal, area on shapes — reaches both
// surfaces rather than only the one that was QA'd.

import { useEffect, useRef, useState, type RefObject } from "react";
import { GeolocateControl } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { FloatingMapHandle } from "../FloatingMap";
import { asMaplibreMap, setSatelliteBase, SATELLITE_ATTRIBUTION } from "./satelliteBase";
import { MAP_PANEL_Z } from "./panelLayering";
import {
  installMapTools,
  type MapToolsController,
  type ToolsSnapshot,
  EMPTY_TOOLS_SNAPSHOT,
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
  note: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h7M8 17h5",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  finish: "M20 6 9 17l-5-5",
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

function toolButtonStyle(active: boolean, disabled = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 7,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.38 : 1,
    color: active ? "#0b0f14" : TEXT,
    background: active ? ACCENT : "rgba(154,166,178,0.12)",
    border: active ? `0.5px solid ${ACCENT}` : "0.5px solid rgba(154,166,178,0.22)",
    transition: "background 120ms ease, color 120ms ease",
  };
}

export function MapTools({ mapRef }: { mapRef: RefObject<FloatingMapHandle | null> }) {
  // The live maplibre map, resolved once the handle is ready.
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const controllerRef = useRef<MapToolsController | null>(null);
  const geolocateRef = useRef<GeolocateControl | null>(null);

  const [snap, setSnap] = useState<ToolsSnapshot>(EMPTY_TOOLS_SNAPSHOT);
  const [satellite, setSatellite] = useState(false);
  // W4: the panel folds away — "How do i make the tools disappear so I can
  // read this" applies to the operator console too.
  const [open, setOpen] = useState(true);

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
  const hasAnything =
    snap.measurements.length > 0 ||
    snap.shapes.length > 0 ||
    snap.notes.length > 0 ||
    snap.markerCount > 0 ||
    snap.draftPoints > 0;

  return (
    <div
      data-testid="map-tools"
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: MAP_PANEL_Z.toolset,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Running measure/draw readout chip. */}
      {open && snap.readout && (
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

      {/* Committed measurements / shapes / notes, each removable on its own. */}
      {open && (snap.measurements.length > 0 || snap.shapes.length > 0) && (
        <div
          data-testid="map-tools-results"
          style={{
            maxWidth: 260,
            padding: "5px 10px",
            borderRadius: 7,
            background: PANEL_BG,
            border: PANEL_BORDER,
            color: TEXT,
            fontSize: 10.5,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {snap.measurements.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: MUTED, width: 12, textAlign: "right" }}>{m.index}</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{m.primary}</span>
              <span style={{ color: MUTED }}>{m.secondary}</span>
              <button
                type="button"
                aria-label={`Remove ${m.primary}`}
                onClick={() => controller()?.removeMeasurement(m.id)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: "0.5px solid rgba(154,166,178,0.25)",
                  background: "transparent",
                  color: MUTED,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
          {snap.shapes.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: MUTED, width: 12, textAlign: "right" }}>{s.index}</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{s.primary}</span>
              <span style={{ color: MUTED }}>{s.secondary}</span>
              <button
                type="button"
                aria-label={`Remove shape ${s.index}`}
                onClick={() => controller()?.removeShape(s.id)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: "0.5px solid rgba(154,166,178,0.25)",
                  background: "transparent",
                  color: MUTED,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Measure sub-mode (distance / area), only while measuring. */}
      {open && active === "measure" && (
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              flex: 1,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            Tools
          </span>
          <button
            type="button"
            data-testid="map-tools-collapse"
            aria-label={open ? "Collapse map tools" : "Expand map tools"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: "0.5px solid rgba(154,166,178,0.25)",
              background: "transparent",
              color: MUTED,
              cursor: "pointer",
              lineHeight: 1,
              fontSize: 12,
            }}
          >
            {open ? "−" : "+"}
          </button>
        </div>

        {open && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                title="Pin a note"
                aria-label="Pin a note"
                aria-pressed={active === "note"}
                onClick={() => controller()?.activate("note")}
                style={toolButtonStyle(active === "note")}
              >
                <ToolIcon path={ICONS.note} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                data-testid="map-tools-finish"
                title="Finish this measurement"
                aria-label="Finish this measurement"
                disabled={!snap.canFinish}
                onClick={() => controller()?.finish()}
                style={toolButtonStyle(false, !snap.canFinish)}
              >
                <ToolIcon path={ICONS.finish} />
              </button>
              <button
                type="button"
                data-testid="map-tools-undo"
                title="Undo the last point"
                aria-label="Undo the last point"
                disabled={!snap.canUndo}
                onClick={() => controller()?.undo()}
                style={toolButtonStyle(false, !snap.canUndo)}
              >
                <ToolIcon path={ICONS.undo} />
              </button>
              <button
                type="button"
                data-testid="map-tools-clear-all"
                title="Clear everything on the map"
                aria-label="Clear everything on the map"
                disabled={!hasAnything}
                onClick={() => controller()?.clear()}
                style={toolButtonStyle(false, !hasAnything)}
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
          </>
        )}
      </div>

      {/* Esri attribution while satellite is on (its terms require the credit). */}
      {open && satellite && (
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
