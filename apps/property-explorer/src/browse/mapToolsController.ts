// apps/property-explorer/src/browse/mapToolsController.ts
//
// MEASURE + DRAW + MARKER interaction controller for the persistent browse map,
// ported from the Brief extension's map-tools.js pattern into TS. It owns its
// OWN MapLibre geojson sources + layers + click/keyboard handlers, and cleans
// ALL of them up on destroy(). It never touches the parcel browse layer, the
// subject glow, the buildable envelope, or the layer-toggle panel — the
// substrate owns those.
//
// PAINT DISCIPLINE (the blank-map crash rule): every layer here uses STATIC
// paint only. line-dasharray is a static constant (safe); there is NO
// feature-state-driven dasharray/gradient anywhere. The geometry is plain
// geojson the tool re-setData()s; no feature-state is used at all.
//
// The React MapTools component creates ONE controller per map handle and calls
// destroy() on unmount. The controller renders NO DOM of its own — the React
// toolbar drives it via activate()/setMode()/clear() and reads readout() for
// the running distance/area chip. This keeps all chrome in React (Empressa
// styling) while the map interaction stays vanilla-maplibre, matching the
// extension's proven pattern.

import type { Map as MaplibreMap, MapMouseEvent } from "maplibre-gl";
import {
  polylineLengthMeters,
  ringAreaSqMeters,
  formatDistance,
  formatArea,
  type LngLat,
} from "./geoMeasure";

const MEASURE_SRC = "explorer-tools-measure";
const MEASURE_LINE_ID = "explorer-tools-measure-line";
const MEASURE_FILL_ID = "explorer-tools-measure-fill";
const MEASURE_VERT_ID = "explorer-tools-measure-verts";

const DRAW_SRC = "explorer-tools-draw";
const DRAW_LINE_ID = "explorer-tools-draw-line";
const DRAW_FILL_ID = "explorer-tools-draw-fill";
const DRAW_VERT_ID = "explorer-tools-draw-verts";

const MARKER_SRC = "explorer-tools-marker";
const MARKER_ID = "explorer-tools-marker-pts";

type FC = { type: "FeatureCollection"; features: unknown[] };
const EMPTY_FC: FC = { type: "FeatureCollection", features: [] };

export type ToolKind = "measure" | "draw" | "marker" | null;
export type MeasureMode = "line" | "area";

/** Snapshot the React toolbar renders (active tool, mode, running readout). */
export interface ToolsSnapshot {
  active: ToolKind;
  measureMode: MeasureMode;
  readout: string | null;
}

export interface MapToolsController {
  activate: (tool: Exclude<ToolKind, null>) => void;
  setMeasureMode: (mode: MeasureMode) => void;
  clear: () => void;
  snapshot: () => ToolsSnapshot;
  destroy: () => void;
}

/**
 * Install the measure/draw/marker tool set onto a live map. `onChange` fires on
 * every state change so the React toolbar can re-render its pressed/readout UI.
 */
export function installMapTools(
  map: MaplibreMap,
  onChange: (snap: ToolsSnapshot) => void,
): MapToolsController {
  const state = {
    active: null as ToolKind,
    measureMode: "line" as MeasureMode,
    measureVerts: [] as LngLat[],
    drawVerts: [] as LngLat[],
    drawShapes: [] as unknown[],
    markers: [] as unknown[],
    readout: null as string | null,
  };

  const emit = () =>
    onChange({
      active: state.active,
      measureMode: state.measureMode,
      readout: state.readout,
    });

  /* ---------- map sources/layers (added lazily, idempotent) ---------- */
  let layersAdded = false;
  function ensureLayers(): void {
    if (layersAdded) return;
    try {
      for (const src of [MEASURE_SRC, DRAW_SRC, MARKER_SRC]) {
        if (!map.getSource(src)) {
          map.addSource(src, { type: "geojson", data: EMPTY_FC as never });
        }
      }
      // Measure: blue fill (area) + solid dashed line + vertex dots.
      if (!map.getLayer(MEASURE_FILL_ID)) {
        map.addLayer({
          id: MEASURE_FILL_ID,
          type: "fill",
          source: MEASURE_SRC,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#38bdf8", "fill-opacity": 0.14 },
        });
      }
      if (!map.getLayer(MEASURE_LINE_ID)) {
        map.addLayer({
          id: MEASURE_LINE_ID,
          type: "line",
          source: MEASURE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          // STATIC dash — safe (not feature-state driven).
          paint: { "line-color": "#7dd3fc", "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
      }
      if (!map.getLayer(MEASURE_VERT_ID)) {
        map.addLayer({
          id: MEASURE_VERT_ID,
          type: "circle",
          source: MEASURE_SRC,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": "#ffffff",
            "circle-stroke-color": "#0ea5e9",
            "circle-stroke-width": 2,
          },
        });
      }
      // Draw: amber fill + solid line + vertex dots.
      if (!map.getLayer(DRAW_FILL_ID)) {
        map.addLayer({
          id: DRAW_FILL_ID,
          type: "fill",
          source: DRAW_SRC,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#f59e0b", "fill-opacity": 0.16 },
        });
      }
      if (!map.getLayer(DRAW_LINE_ID)) {
        map.addLayer({
          id: DRAW_LINE_ID,
          type: "line",
          source: DRAW_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#fbbf24", "line-width": 2.5 },
        });
      }
      if (!map.getLayer(DRAW_VERT_ID)) {
        map.addLayer({
          id: DRAW_VERT_ID,
          type: "circle",
          source: DRAW_SRC,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": "#ffffff",
            "circle-stroke-color": "#d97706",
            "circle-stroke-width": 2,
          },
        });
      }
      // Markers: standalone accent points.
      if (!map.getLayer(MARKER_ID)) {
        map.addLayer({
          id: MARKER_ID,
          type: "circle",
          source: MARKER_SRC,
          paint: {
            "circle-radius": 6,
            "circle-color": "#f59e0b",
            "circle-stroke-color": "#7c2d12",
            "circle-stroke-width": 2,
          },
        });
      }
      layersAdded = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[map-tools] ensureLayers failed:", err);
    }
  }

  function setData(srcId: string, fc: FC): void {
    try {
      const src = map.getSource(srcId) as { setData?: (d: unknown) => void } | undefined;
      src?.setData?.(fc ?? EMPTY_FC);
    } catch {
      /* source not present; ignore */
    }
  }

  /* ---------- geojson builders ---------- */
  function measureFc(): FC {
    const features: unknown[] = [];
    const verts = state.measureVerts;
    for (const v of verts) {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: v }, properties: {} });
    }
    if (state.measureMode === "area" && verts.length >= 3) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...verts, verts[0]]] },
        properties: {},
      });
    } else if (verts.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: verts },
        properties: {},
      });
    }
    return { type: "FeatureCollection", features };
  }

  function drawFc(): FC {
    const features: unknown[] = [...state.drawShapes];
    const verts = state.drawVerts;
    for (const v of verts) {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: v }, properties: {} });
    }
    if (verts.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: verts },
        properties: {},
      });
    }
    if (verts.length >= 3) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...verts, verts[0]]] },
        properties: {},
      });
    }
    return { type: "FeatureCollection", features };
  }

  function markerFc(): FC {
    return { type: "FeatureCollection", features: [...state.markers] };
  }

  /* ---------- rendering + readout ---------- */
  function renderMeasure(): void {
    setData(MEASURE_SRC, measureFc());
    if (state.active !== "measure") return;
    const verts = state.measureVerts;
    if (verts.length < 1) {
      state.readout = "Click to add points. Double-click or Esc to finish.";
      emit();
      return;
    }
    if (state.measureMode === "area") {
      if (verts.length >= 3) {
        const area = ringAreaSqMeters(verts);
        const perim = polylineLengthMeters([...verts, verts[0]]);
        state.readout = `Area ${formatArea(area)} · perimeter ${formatDistance(perim)} · ${verts.length} pts`;
      } else {
        state.readout = `Add ${3 - verts.length} more point(s) for an area · ${verts.length} pts`;
      }
    } else {
      state.readout = `Distance ${formatDistance(polylineLengthMeters(verts))} · ${verts.length} pts`;
    }
    emit();
  }

  function renderDraw(): void {
    setData(DRAW_SRC, drawFc());
    setData(MARKER_SRC, markerFc());
    if (state.active === "draw") {
      state.readout = state.drawVerts.length
        ? `Drawing · ${state.drawVerts.length} pts · double-click / Esc to finish`
        : "Click to draw a shape. Double-click or Esc to finish.";
      emit();
    } else if (state.active === "marker") {
      state.readout = "Click to drop markers. Esc or Marker again to finish.";
      emit();
    }
  }

  /* ---------- activation ---------- */
  function setCursor(on: boolean): void {
    try {
      map.getCanvas().style.cursor = on ? "crosshair" : "";
    } catch {
      /* ignore */
    }
  }

  function commitDraw(): void {
    if (state.drawVerts.length >= 3) {
      state.drawShapes.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...state.drawVerts, state.drawVerts[0]]] },
        properties: {},
      });
    } else if (state.drawVerts.length === 2) {
      state.drawShapes.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [...state.drawVerts] },
        properties: {},
      });
    }
    state.drawVerts = [];
  }

  function activate(tool: Exclude<ToolKind, null>): void {
    if (state.active === tool) {
      deactivate();
      return;
    }
    commitDraw();
    ensureLayers();
    state.active = tool;
    if (tool === "measure") {
      state.measureVerts = [];
      renderMeasure();
    } else if (tool === "draw") {
      state.drawVerts = [];
      renderDraw();
    } else if (tool === "marker") {
      renderDraw();
    }
    setCursor(true);
    try {
      map.doubleClickZoom.disable();
    } catch {
      /* ignore */
    }
    emit();
  }

  function deactivate(): void {
    commitDraw();
    state.active = null;
    state.readout = null;
    setCursor(false);
    try {
      map.doubleClickZoom.enable();
    } catch {
      /* ignore */
    }
    renderMeasure();
    renderDraw();
    emit();
  }

  function clearAll(): void {
    state.active = null;
    state.measureVerts = [];
    state.drawVerts = [];
    state.drawShapes = [];
    state.markers = [];
    state.readout = null;
    setData(MEASURE_SRC, EMPTY_FC);
    setData(DRAW_SRC, EMPTY_FC);
    setData(MARKER_SRC, EMPTY_FC);
    setCursor(false);
    try {
      map.doubleClickZoom.enable();
    } catch {
      /* ignore */
    }
    emit();
  }

  /* ---------- event handlers ---------- */
  const onMapClick = (e: MapMouseEvent): void => {
    if (!state.active) return;
    const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
    if (state.active === "measure") {
      state.measureVerts.push(pt);
      renderMeasure();
    } else if (state.active === "draw") {
      state.drawVerts.push(pt);
      renderDraw();
    } else if (state.active === "marker") {
      state.markers.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: pt },
        properties: {},
      });
      renderDraw();
    }
  };

  const onMapDblClick = (e: MapMouseEvent): void => {
    if (!state.active || state.active === "marker") return;
    // MapLibre fires click before dblclick — the extra click already pushed a
    // duplicate vertex, so pop it, then finish/commit. Don't zoom.
    if (state.active === "measure" && state.measureVerts.length > 1) {
      state.measureVerts.pop();
      renderMeasure();
    } else if (state.active === "draw") {
      if (state.drawVerts.length > 1) state.drawVerts.pop();
      commitDraw();
      renderDraw();
    }
    e.preventDefault?.();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && state.active) deactivate();
  };

  map.on("click", onMapClick);
  map.on("dblclick", onMapDblClick);
  window.addEventListener("keydown", onKeyDown);

  return {
    activate,
    setMeasureMode(mode: MeasureMode) {
      state.measureMode = mode;
      renderMeasure();
    },
    clear: clearAll,
    snapshot: () => ({
      active: state.active,
      measureMode: state.measureMode,
      readout: state.readout,
    }),
    destroy() {
      try {
        map.off("click", onMapClick);
        map.off("dblclick", onMapDblClick);
        window.removeEventListener("keydown", onKeyDown);
      } catch {
        /* ignore */
      }
      try {
        for (const id of [
          MEASURE_FILL_ID, MEASURE_LINE_ID, MEASURE_VERT_ID,
          DRAW_FILL_ID, DRAW_LINE_ID, DRAW_VERT_ID,
          MARKER_ID,
        ]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const src of [MEASURE_SRC, DRAW_SRC, MARKER_SRC]) {
          if (map.getSource(src)) map.removeSource(src);
        }
      } catch {
        /* style already torn down; ignore */
      }
      try {
        map.getCanvas().style.cursor = "";
        map.doubleClickZoom.enable();
      } catch {
        /* ignore */
      }
    },
  };
}
