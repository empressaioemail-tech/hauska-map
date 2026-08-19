// packages/map-renderer/src/chrome/mapToolsController.ts
//
// MEASURE + DRAW + MARKER + NOTE interaction controller for the shared layered
// map shell (PE + CC). Owns its own MapLibre geojson sources + layers +
// handlers. Never touches parcel browse / subject glow / envelope — substrate
// owns those.
//
// PAINT DISCIPLINE (the blank-map crash rule): every layer here uses STATIC
// paint only. line-dasharray is a static constant (safe); there is NO
// feature-state-driven dasharray/gradient anywhere. The geometry is plain
// geojson the tool re-setData()s; no feature-state is used at all. The
// highlight halo is a LAYER FILTER over a plain `hl` property, which is an
// ordinary data expression on the source, not feature-state.
//
// The React MapTools component creates ONE controller per map handle and calls
// destroy() on unmount. The controller renders NO DOM of its own — the React
// toolbar drives it via activate()/setMeasureMode()/finish()/undo()/remove*()
// and reads snapshot() for the readout, the committed-measurement list and the
// shape areas. This keeps all chrome in React (Empressa styling) while the map
// interaction stays vanilla-maplibre, matching the extension's proven pattern.
//
// W4 INSTRUMENT REBUILD (2026-08-18). Before this pass measure held exactly ONE
// measurement in a bare `measureVerts` array with no commit path, so length and
// width could not both be taken; double-click popped a vertex and never
// finished, so the line ran forever; and the only removal operation was
// clearAll(), so the trash button nuked every measurement at once. Draw had a
// commit path but nothing ever measured what it committed. All four are fixed
// here: committed measurements, explicit finish, undo, per-item removal,
// per-segment plus running totals, and area/square-footage on both tools.

import type { Map as MaplibreMap, MapMouseEvent } from "maplibre-gl";
import {
  polylineLengthMeters,
  ringAreaSqMeters,
  formatDistance,
  formatArea,
  type LngLat,
} from "./geoMeasure";

const MEASURE_SRC = "explorer-tools-measure";
const MEASURE_HALO_ID = "explorer-tools-measure-halo";
const MEASURE_LINE_ID = "explorer-tools-measure-line";
const MEASURE_FILL_ID = "explorer-tools-measure-fill";
const MEASURE_VERT_ID = "explorer-tools-measure-verts";

const DRAW_SRC = "explorer-tools-draw";
const DRAW_HALO_ID = "explorer-tools-draw-halo";
const DRAW_LINE_ID = "explorer-tools-draw-line";
const DRAW_FILL_ID = "explorer-tools-draw-fill";
const DRAW_VERT_ID = "explorer-tools-draw-verts";

const MARKER_SRC = "explorer-tools-marker";
const MARKER_ID = "explorer-tools-marker-pts";

// W4: notes are their own tool slot (operator ruling — NOT folded into Location
// and NOT folded into marker). A note is the first artifact in the app carrying
// the USER's judgement rather than ours, so it gets its own source, its own
// colour, and its own rows in the panel.
const NOTE_SRC = "explorer-tools-note";
const NOTE_ID = "explorer-tools-note-pts";
const NOTE_PENDING_ID = "explorer-tools-note-pending";

// WB6 dossier overlay — READ-ONLY redraw of a saved property's drawings.
// Own source + layers, static paint only (the blank-map crash rule), violet
// so restored annotations read distinctly from live draw (amber) / measure
// (blue) / notes (emerald).
const DOSSIER_SRC = "explorer-tools-dossier";
const DOSSIER_FILL_ID = "explorer-tools-dossier-fill";
const DOSSIER_LINE_ID = "explorer-tools-dossier-line";
const DOSSIER_PT_ID = "explorer-tools-dossier-pts";

type FC = { type: "FeatureCollection"; features: unknown[] };
const EMPTY_FC: FC = { type: "FeatureCollection", features: [] };

export type ToolKind = "measure" | "draw" | "marker" | "note" | null;
export type MeasureMode = "line" | "area";

/** A committed measurement, reported with BOTH its raw and formatted values. */
export interface MeasureSummary {
  id: string;
  /** 1-based display order, so the panel row and the map read the same. */
  index: number;
  mode: MeasureMode;
  points: number;
  /** Polyline length for `line`; ring PERIMETER for `area`. Meters. */
  lengthMeters: number;
  /** Square meters for `area`; null for `line` (an open line has no area). */
  areaSqMeters: number | null;
  /** Formatted headline, e.g. "240 ft" or "12,340 sqft". */
  primary: string;
  /** Formatted supporting line, e.g. "perimeter 480 ft · 4 pts". */
  secondary: string;
}

/** A committed draw shape, measured the same way a measurement is. */
export interface ShapeSummary {
  id: string;
  index: number;
  kind: "polygon" | "line";
  points: number;
  lengthMeters: number;
  areaSqMeters: number | null;
  primary: string;
  secondary: string;
}

/** A user note pinned to a map point. */
export interface NoteSummary {
  id: string;
  index: number;
  text: string;
  /** The parcel (or other host scope) selected when the note was dropped. */
  scopeId: string | null;
  scopeLabel: string | null;
  at: LngLat;
}

/** Snapshot the React toolbar renders (active tool, mode, running readout). */
export interface ToolsSnapshot {
  active: ToolKind;
  measureMode: MeasureMode;
  readout: string | null;
  /** Committed measurements, oldest first. Empty until something is finished. */
  measurements: MeasureSummary[];
  /** Committed draw shapes with their area / length. */
  shapes: ShapeSummary[];
  /** User notes pinned to the map. */
  notes: NoteSummary[];
  /** Per-segment formatted lengths of the IN-PROGRESS geometry. */
  draftSegments: string[];
  /** Vertex count of the in-progress measure/draw geometry. */
  draftPoints: number;
  markerCount: number;
  /** True when undo() would change something. */
  canUndo: boolean;
  /** True when finish() would commit something. */
  canFinish: boolean;
  /** Measurement/shape id currently haloed on the map. */
  highlightId: string | null;
  /** Note dropped but not yet given text — the panel focuses its input. */
  pendingNoteId: string | null;
}

/** The empty snapshot, so every consumer starts from ONE shape. */
export const EMPTY_TOOLS_SNAPSHOT: ToolsSnapshot = {
  active: null,
  measureMode: "line",
  readout: null,
  measurements: [],
  shapes: [],
  notes: [],
  draftSegments: [],
  draftPoints: 0,
  markerCount: 0,
  canUndo: false,
  canFinish: false,
  highlightId: null,
  pendingNoteId: null,
};

export interface NoteScope {
  id: string | null;
  label: string | null;
}

export interface MapToolsController {
  activate: (tool: Exclude<ToolKind, null>) => void;
  setMeasureMode: (mode: MeasureMode) => void;
  /** Commit the in-progress measure/draw geometry. No-op when nothing is drawn. */
  finish: () => void;
  /**
   * Undo the last thing this tool did: drop the last point of the in-progress
   * geometry, else UN-FINISH the most recently committed item back into
   * progress, else drop the last marker/note. Never clears everything.
   */
  undo: () => void;
  removeMeasurement: (id: string) => void;
  removeShape: (id: string) => void;
  removeNote: (id: string) => void;
  removeMarker: (index: number) => void;
  /** Free text on a note (the pending one, or an existing one being edited). */
  setNoteText: (id: string, text: string) => void;
  /** Host tells the tools which parcel a new note would belong to. */
  setNoteScope: (scope: NoteScope | null) => void;
  /** Halo one committed measurement/shape so a panel row maps to the map. */
  setHighlight: (id: string | null) => void;
  /** Remove EVERY measurement, shape, marker and note. The blunt instrument. */
  clear: () => void;
  /** Remove only the measurements (committed + in-progress). */
  clearMeasurements: () => void;
  /** Remove only the draw shapes (committed + in-progress). */
  clearShapes: () => void;
  snapshot: () => ToolsSnapshot;
  /**
   * WB6 dossier seam: the CURRENT draw/measure/marker/note geometries as one
   * plain GeoJSON FeatureCollection. Committed draw shapes + the in-progress
   * shape, markers, notes (with their text), and EVERY measurement — committed
   * and in-progress (vertex helper dots excluded — markers/notes keep their
   * Points). Each feature carries `properties.tool`
   * ("draw" | "marker" | "measure" | "note"). Pure snapshot — no state change.
   */
  getDrawings: () => FC;
  /**
   * WB6 dossier seam: render (or clear, with null) a READ-ONLY overlay of a
   * saved property's drawings. Its own source/layers — never touches the live
   * draw/measure/marker state.
   */
  setDossierOverlay: (fc: FC | null) => void;
  destroy: () => void;
}

interface CommittedMeasure {
  id: string;
  mode: MeasureMode;
  verts: LngLat[];
}

interface CommittedShape {
  id: string;
  verts: LngLat[];
}

interface NoteRecord {
  id: string;
  at: LngLat;
  text: string;
  scopeId: string | null;
  scopeLabel: string | null;
}

/** Length + area of a vertex ring/line. Area is null unless the ring closes. */
function measureOf(
  verts: LngLat[],
  closed: boolean,
): { lengthMeters: number; areaSqMeters: number | null } {
  if (closed && verts.length >= 3) {
    return {
      lengthMeters: polylineLengthMeters([...verts, verts[0]]),
      areaSqMeters: ringAreaSqMeters(verts),
    };
  }
  return { lengthMeters: polylineLengthMeters(verts), areaSqMeters: null };
}

/**
 * Install the measure/draw/marker/note tool set onto a live map. `onChange`
 * fires on every state change so the React toolbar can re-render its
 * pressed/readout/list UI.
 */
export function installMapTools(
  map: MaplibreMap,
  onChange: (snap: ToolsSnapshot) => void,
): MapToolsController {
  const state = {
    active: null as ToolKind,
    measureMode: "line" as MeasureMode,
    /** The in-progress measurement (uncommitted). */
    measureVerts: [] as LngLat[],
    /** Committed measurements — this is what makes length AND width possible. */
    measurements: [] as CommittedMeasure[],
    drawVerts: [] as LngLat[],
    drawShapes: [] as CommittedShape[],
    markers: [] as LngLat[],
    notes: [] as NoteRecord[],
    noteScope: null as NoteScope | null,
    pendingNoteId: null as string | null,
    highlightId: null as string | null,
    /** Which list took the last append — undo target when no tool is active. */
    lastTouched: null as "measure" | "draw" | "marker" | "note" | null,
    readout: null as string | null,
  };

  let seq = 0;
  const nextId = (prefix: string): string => {
    seq += 1;
    return `${prefix}${seq}`;
  };

  /* ---------- summaries (the panel's data, computed not asserted) ---------- */

  function measureSummaries(): MeasureSummary[] {
    return state.measurements.map((m, i) => {
      const { lengthMeters, areaSqMeters } = measureOf(m.verts, m.mode === "area");
      const primary =
        areaSqMeters != null ? formatArea(areaSqMeters) : formatDistance(lengthMeters);
      const secondary =
        areaSqMeters != null
          ? `perimeter ${formatDistance(lengthMeters)} · ${m.verts.length} pts`
          : `${m.verts.length} pts`;
      return {
        id: m.id,
        index: i + 1,
        mode: m.mode,
        points: m.verts.length,
        lengthMeters,
        areaSqMeters,
        primary,
        secondary,
      };
    });
  }

  function shapeSummaries(): ShapeSummary[] {
    return state.drawShapes.map((s, i) => {
      const closed = s.verts.length >= 3;
      const { lengthMeters, areaSqMeters } = measureOf(s.verts, closed);
      const primary =
        areaSqMeters != null ? formatArea(areaSqMeters) : formatDistance(lengthMeters);
      const secondary =
        areaSqMeters != null
          ? `perimeter ${formatDistance(lengthMeters)} · ${s.verts.length} pts`
          : `${s.verts.length} pts`;
      return {
        id: s.id,
        index: i + 1,
        kind: closed ? ("polygon" as const) : ("line" as const),
        points: s.verts.length,
        lengthMeters,
        areaSqMeters,
        primary,
        secondary,
      };
    });
  }

  function noteSummaries(): NoteSummary[] {
    return state.notes.map((n, i) => ({
      id: n.id,
      index: i + 1,
      text: n.text,
      scopeId: n.scopeId,
      scopeLabel: n.scopeLabel,
      at: n.at,
    }));
  }

  function draftSegments(): string[] {
    const verts = state.active === "draw" ? state.drawVerts : state.measureVerts;
    const out: string[] = [];
    for (let i = 1; i < verts.length; i += 1) {
      out.push(formatDistance(polylineLengthMeters([verts[i - 1], verts[i]])));
    }
    return out;
  }

  function canFinish(): boolean {
    if (state.active === "measure") {
      return state.measureMode === "area"
        ? state.measureVerts.length >= 3
        : state.measureVerts.length >= 2;
    }
    if (state.active === "draw") return state.drawVerts.length >= 2;
    return false;
  }

  function undoTarget(): "measure" | "draw" | "marker" | "note" | null {
    if (state.active === "measure" || state.active === "draw") return state.active;
    if (state.active === "marker") return "marker";
    if (state.active === "note") return "note";
    return state.lastTouched;
  }

  function canUndo(): boolean {
    switch (undoTarget()) {
      case "measure":
        return state.measureVerts.length > 0 || state.measurements.length > 0;
      case "draw":
        return state.drawVerts.length > 0 || state.drawShapes.length > 0;
      case "marker":
        return state.markers.length > 0;
      case "note":
        return state.notes.length > 0;
      default:
        return false;
    }
  }

  function snapshot(): ToolsSnapshot {
    return {
      active: state.active,
      measureMode: state.measureMode,
      readout: state.readout,
      measurements: measureSummaries(),
      shapes: shapeSummaries(),
      notes: noteSummaries(),
      draftSegments: draftSegments(),
      draftPoints:
        state.active === "draw" ? state.drawVerts.length : state.measureVerts.length,
      markerCount: state.markers.length,
      canUndo: canUndo(),
      canFinish: canFinish(),
      highlightId: state.highlightId,
      pendingNoteId: state.pendingNoteId,
    };
  }

  const emit = () => onChange(snapshot());

  /* ---------- map sources/layers (added lazily, idempotent) ---------- */
  let layersAdded = false;
  function ensureLayers(): void {
    if (layersAdded) return;
    try {
      for (const src of [MEASURE_SRC, DRAW_SRC, MARKER_SRC, NOTE_SRC]) {
        if (!map.getSource(src)) {
          map.addSource(src, { type: "geojson", data: EMPTY_FC as never });
        }
      }
      // Measure: blue fill (area) + halo (highlight) + dashed line + vertex dots.
      if (!map.getLayer(MEASURE_FILL_ID)) {
        map.addLayer({
          id: MEASURE_FILL_ID,
          type: "fill",
          source: MEASURE_SRC,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#38bdf8", "fill-opacity": 0.14 },
        });
      }
      // Halo sits UNDER the main line (added first) — a plain data filter on
      // properties.hl, never feature-state.
      if (!map.getLayer(MEASURE_HALO_ID)) {
        map.addLayer({
          id: MEASURE_HALO_ID,
          type: "line",
          source: MEASURE_SRC,
          filter: ["==", ["get", "hl"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.45 },
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
      // Draw: amber fill + halo + solid line + vertex dots.
      if (!map.getLayer(DRAW_FILL_ID)) {
        map.addLayer({
          id: DRAW_FILL_ID,
          type: "fill",
          source: DRAW_SRC,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#f59e0b", "fill-opacity": 0.16 },
        });
      }
      if (!map.getLayer(DRAW_HALO_ID)) {
        map.addLayer({
          id: DRAW_HALO_ID,
          type: "line",
          source: DRAW_SRC,
          filter: ["==", ["get", "hl"], true],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.45 },
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
      // Notes: emerald pins, with a wider ring while a note is still untexted
      // so an empty note reads as unfinished rather than silently blank.
      if (!map.getLayer(NOTE_PENDING_ID)) {
        map.addLayer({
          id: NOTE_PENDING_ID,
          type: "circle",
          source: NOTE_SRC,
          filter: ["==", ["get", "pending"], true],
          paint: {
            "circle-radius": 10,
            "circle-color": "#34d399",
            "circle-opacity": 0.25,
          },
        });
      }
      if (!map.getLayer(NOTE_ID)) {
        map.addLayer({
          id: NOTE_ID,
          type: "circle",
          source: NOTE_SRC,
          paint: {
            "circle-radius": 6,
            "circle-color": "#34d399",
            "circle-stroke-color": "#065f46",
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

  function ringFeature(verts: LngLat[], props: Record<string, unknown>): unknown {
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...verts, verts[0]]] },
      properties: props,
    };
  }

  function lineFeature(verts: LngLat[], props: Record<string, unknown>): unknown {
    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [...verts] },
      properties: props,
    };
  }

  function pointFeature(at: LngLat, props: Record<string, unknown>): unknown {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: at },
      properties: props,
    };
  }

  function measureFc(): FC {
    const features: unknown[] = [];
    // Committed measurements first — they are the durable layer.
    for (const m of state.measurements) {
      const props = { id: m.id, hl: state.highlightId === m.id, committed: true };
      if (m.mode === "area" && m.verts.length >= 3) {
        features.push(ringFeature(m.verts, props));
      } else if (m.verts.length >= 2) {
        features.push(lineFeature(m.verts, props));
      }
      for (const v of m.verts) features.push(pointFeature(v, { id: m.id }));
    }
    // The in-progress measurement on top.
    const verts = state.measureVerts;
    for (const v of verts) features.push(pointFeature(v, { draft: true }));
    if (state.measureMode === "area" && verts.length >= 3) {
      features.push(ringFeature(verts, { draft: true }));
    } else if (verts.length >= 2) {
      features.push(lineFeature(verts, { draft: true }));
    }
    return { type: "FeatureCollection", features };
  }

  function drawFc(): FC {
    const features: unknown[] = [];
    for (const s of state.drawShapes) {
      const props = { id: s.id, hl: state.highlightId === s.id, committed: true };
      if (s.verts.length >= 3) features.push(ringFeature(s.verts, props));
      else if (s.verts.length === 2) features.push(lineFeature(s.verts, props));
    }
    const verts = state.drawVerts;
    for (const v of verts) features.push(pointFeature(v, { draft: true }));
    if (verts.length >= 2) features.push(lineFeature(verts, { draft: true }));
    if (verts.length >= 3) features.push(ringFeature(verts, { draft: true }));
    return { type: "FeatureCollection", features };
  }

  function markerFc(): FC {
    return {
      type: "FeatureCollection",
      features: state.markers.map((m) => pointFeature(m, {})),
    };
  }

  function noteFc(): FC {
    return {
      type: "FeatureCollection",
      features: state.notes.map((n) =>
        pointFeature(n.at, {
          id: n.id,
          text: n.text,
          pending: n.text.trim().length === 0,
        }),
      ),
    };
  }

  /* ---------- WB6 dossier drawings (capture + read-only redraw) ---------- */

  function getDrawings(): FC {
    const features: unknown[] = [];
    // Committed draw shapes.
    for (const s of state.drawShapes) {
      if (s.verts.length >= 3) features.push(ringFeature(s.verts, { tool: "draw" }));
      else if (s.verts.length === 2) features.push(lineFeature(s.verts, { tool: "draw" }));
    }
    // The in-progress draw shape (not yet committed) — same commit rules.
    if (state.drawVerts.length >= 3) {
      features.push(ringFeature(state.drawVerts, { tool: "draw" }));
    } else if (state.drawVerts.length === 2) {
      features.push(lineFeature(state.drawVerts, { tool: "draw" }));
    }
    // Markers (Points).
    for (const m of state.markers) features.push(pointFeature(m, { tool: "marker" }));
    // Notes (Points) carry the user's own words plus the parcel they were
    // recorded against — this is the judgement layer, so it must round-trip.
    for (const n of state.notes) {
      features.push(
        pointFeature(n.at, {
          tool: "note",
          text: n.text,
          scopeId: n.scopeId,
          scopeLabel: n.scopeLabel,
        }),
      );
    }
    // EVERY measurement — committed and in-progress. Helper vertex dots
    // excluded. Before W4 only one measurement could be captured, because only
    // one could exist.
    for (const m of state.measurements) {
      if (m.mode === "area" && m.verts.length >= 3) {
        features.push(ringFeature(m.verts, { tool: "measure", mode: m.mode }));
      } else if (m.verts.length >= 2) {
        features.push(lineFeature(m.verts, { tool: "measure", mode: m.mode }));
      }
    }
    const mv = state.measureVerts;
    if (state.measureMode === "area" && mv.length >= 3) {
      features.push(ringFeature(mv, { tool: "measure", mode: state.measureMode }));
    } else if (mv.length >= 2) {
      features.push(lineFeature(mv, { tool: "measure", mode: state.measureMode }));
    }
    return { type: "FeatureCollection", features };
  }

  let dossierLayersAdded = false;
  function ensureDossierLayers(): void {
    if (dossierLayersAdded) return;
    try {
      if (!map.getSource(DOSSIER_SRC)) {
        map.addSource(DOSSIER_SRC, { type: "geojson", data: EMPTY_FC as never });
      }
      if (!map.getLayer(DOSSIER_FILL_ID)) {
        map.addLayer({
          id: DOSSIER_FILL_ID,
          type: "fill",
          source: DOSSIER_SRC,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#a78bfa", "fill-opacity": 0.12 },
        });
      }
      if (!map.getLayer(DOSSIER_LINE_ID)) {
        map.addLayer({
          id: DOSSIER_LINE_ID,
          type: "line",
          source: DOSSIER_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          // STATIC dash — safe (not feature-state driven).
          paint: { "line-color": "#a78bfa", "line-width": 2, "line-dasharray": [2, 1.5] },
        });
      }
      if (!map.getLayer(DOSSIER_PT_ID)) {
        map.addLayer({
          id: DOSSIER_PT_ID,
          type: "circle",
          source: DOSSIER_SRC,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#a78bfa",
            "circle-stroke-color": "#4c1d95",
            "circle-stroke-width": 2,
          },
        });
      }
      dossierLayersAdded = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[map-tools] ensureDossierLayers failed:", err);
    }
  }

  function setDossierOverlay(fc: FC | null): void {
    if (fc && Array.isArray(fc.features) && fc.features.length > 0) {
      ensureDossierLayers();
      setData(DOSSIER_SRC, fc);
    } else {
      setData(DOSSIER_SRC, EMPTY_FC);
    }
  }

  /* ---------- rendering + readout ---------- */

  const savedSuffix = (): string =>
    state.measurements.length ? ` · ${state.measurements.length} saved` : "";

  function renderMeasure(): void {
    setData(MEASURE_SRC, measureFc());
    if (state.active !== "measure") return;
    const verts = state.measureVerts;
    if (verts.length < 1) {
      state.readout = state.measurements.length
        ? `Click to start another measurement · ${state.measurements.length} saved`
        : "Click to add points. Double-click, Enter or Esc to finish.";
      emit();
      return;
    }
    if (state.measureMode === "area") {
      if (verts.length >= 3) {
        const area = ringAreaSqMeters(verts);
        const perim = polylineLengthMeters([...verts, verts[0]]);
        state.readout = `Area ${formatArea(area)} · perimeter ${formatDistance(perim)} · ${verts.length} pts${savedSuffix()}`;
      } else {
        state.readout = `Add ${3 - verts.length} more point(s) to close an area · ${verts.length} pts${savedSuffix()}`;
      }
    } else {
      const total = polylineLengthMeters(verts);
      const leg =
        verts.length >= 2
          ? ` · last leg ${formatDistance(
              polylineLengthMeters([verts[verts.length - 2], verts[verts.length - 1]]),
            )}`
          : "";
      state.readout = `Distance ${formatDistance(total)}${leg} · ${verts.length} pts${savedSuffix()}`;
    }
    emit();
  }

  function renderDraw(): void {
    setData(DRAW_SRC, drawFc());
    setData(MARKER_SRC, markerFc());
    setData(NOTE_SRC, noteFc());
    if (state.active === "draw") {
      const verts = state.drawVerts;
      if (verts.length >= 3) {
        const area = ringAreaSqMeters(verts);
        const perim = polylineLengthMeters([...verts, verts[0]]);
        state.readout = `Area ${formatArea(area)} · perimeter ${formatDistance(perim)} · ${verts.length} pts`;
      } else if (verts.length === 2) {
        state.readout = `Length ${formatDistance(polylineLengthMeters(verts))} · 2 pts · one more point closes an area`;
      } else {
        state.readout = "Click to draw a shape. Double-click, Enter or Esc to finish.";
      }
      emit();
    } else if (state.active === "marker") {
      state.readout = "Click to drop markers. Esc or Marker again to finish.";
      emit();
    } else if (state.active === "note") {
      state.readout = state.pendingNoteId
        ? "Type your note in the panel, then Save."
        : "Click the map where the note belongs.";
      emit();
    }
  }

  function renderAll(): void {
    renderMeasure();
    renderDraw();
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
    if (state.drawVerts.length >= 2) {
      state.drawShapes.push({ id: nextId("s"), verts: [...state.drawVerts] });
      state.lastTouched = "draw";
    }
    state.drawVerts = [];
  }

  function commitMeasure(): void {
    const need = state.measureMode === "area" ? 3 : 2;
    if (state.measureVerts.length >= need) {
      state.measurements.push({
        id: nextId("m"),
        mode: state.measureMode,
        verts: [...state.measureVerts],
      });
      state.lastTouched = "measure";
    }
    state.measureVerts = [];
  }

  /** Commit whatever is in progress on BOTH tools (tool switch / deactivate). */
  function commitAll(): void {
    commitMeasure();
    commitDraw();
  }

  function activate(tool: Exclude<ToolKind, null>): void {
    if (state.active === tool) {
      deactivate();
      return;
    }
    commitAll();
    ensureLayers();
    state.active = tool;
    setCursor(true);
    try {
      map.doubleClickZoom.disable();
    } catch {
      /* ignore */
    }
    renderAll();
    emit();
  }

  function deactivate(): void {
    commitAll();
    state.active = null;
    state.readout = null;
    setCursor(false);
    try {
      map.doubleClickZoom.enable();
    } catch {
      /* ignore */
    }
    renderAll();
    emit();
  }

  /* ---------- finish / undo / per-item removal ---------- */

  function finish(): void {
    if (state.active === "measure") {
      commitMeasure();
      renderMeasure();
    } else if (state.active === "draw") {
      commitDraw();
      renderDraw();
    }
    emit();
  }

  function undo(): void {
    switch (undoTarget()) {
      case "measure": {
        if (state.measureVerts.length > 0) {
          state.measureVerts.pop();
        } else if (state.measurements.length > 0) {
          // UN-FINISH: finishing was an action, so undo reverses the finish and
          // puts the geometry back in progress rather than deleting it.
          const last = state.measurements.pop() as CommittedMeasure;
          state.measureMode = last.mode;
          state.measureVerts = [...last.verts];
        }
        renderMeasure();
        break;
      }
      case "draw": {
        if (state.drawVerts.length > 0) {
          state.drawVerts.pop();
        } else if (state.drawShapes.length > 0) {
          const last = state.drawShapes.pop() as CommittedShape;
          state.drawVerts = [...last.verts];
        }
        renderDraw();
        break;
      }
      case "marker": {
        state.markers.pop();
        renderDraw();
        break;
      }
      case "note": {
        const removed = state.notes.pop();
        if (removed && removed.id === state.pendingNoteId) state.pendingNoteId = null;
        renderDraw();
        break;
      }
      default:
        break;
    }
    emit();
  }

  function removeMeasurement(id: string): void {
    const before = state.measurements.length;
    state.measurements = state.measurements.filter((m) => m.id !== id);
    if (state.measurements.length !== before) {
      if (state.highlightId === id) state.highlightId = null;
      renderMeasure();
      emit();
    }
  }

  function removeShape(id: string): void {
    const before = state.drawShapes.length;
    state.drawShapes = state.drawShapes.filter((s) => s.id !== id);
    if (state.drawShapes.length !== before) {
      if (state.highlightId === id) state.highlightId = null;
      renderDraw();
      emit();
    }
  }

  function removeNote(id: string): void {
    const before = state.notes.length;
    state.notes = state.notes.filter((n) => n.id !== id);
    if (state.notes.length !== before) {
      if (state.pendingNoteId === id) state.pendingNoteId = null;
      renderDraw();
      emit();
    }
  }

  function removeMarker(index: number): void {
    if (index < 0 || index >= state.markers.length) return;
    state.markers.splice(index, 1);
    renderDraw();
    emit();
  }

  function setNoteText(id: string, text: string): void {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    note.text = text;
    if (text.trim().length > 0 && state.pendingNoteId === id) {
      state.pendingNoteId = null;
    }
    renderDraw();
    emit();
  }

  function setNoteScope(scope: NoteScope | null): void {
    state.noteScope = scope;
  }

  function setHighlight(id: string | null): void {
    if (state.highlightId === id) return;
    state.highlightId = id;
    setData(MEASURE_SRC, measureFc());
    setData(DRAW_SRC, drawFc());
    emit();
  }

  function clearMeasurements(): void {
    state.measurements = [];
    state.measureVerts = [];
    if (state.lastTouched === "measure") state.lastTouched = null;
    renderMeasure();
    emit();
  }

  function clearShapes(): void {
    state.drawShapes = [];
    state.drawVerts = [];
    if (state.lastTouched === "draw") state.lastTouched = null;
    renderDraw();
    emit();
  }

  function clearAll(): void {
    state.active = null;
    state.measureVerts = [];
    state.measurements = [];
    state.drawVerts = [];
    state.drawShapes = [];
    state.markers = [];
    state.notes = [];
    state.pendingNoteId = null;
    state.highlightId = null;
    state.lastTouched = null;
    state.readout = null;
    setData(MEASURE_SRC, EMPTY_FC);
    setData(DRAW_SRC, EMPTY_FC);
    setData(MARKER_SRC, EMPTY_FC);
    setData(NOTE_SRC, EMPTY_FC);
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
      state.lastTouched = "measure";
      renderMeasure();
    } else if (state.active === "draw") {
      state.drawVerts.push(pt);
      state.lastTouched = "draw";
      renderDraw();
    } else if (state.active === "marker") {
      state.markers.push(pt);
      state.lastTouched = "marker";
      renderDraw();
    } else if (state.active === "note") {
      const id = nextId("n");
      state.notes.push({
        id,
        at: pt,
        text: "",
        scopeId: state.noteScope?.id ?? null,
        scopeLabel: state.noteScope?.label ?? null,
      });
      state.pendingNoteId = id;
      state.lastTouched = "note";
      renderDraw();
    }
  };

  const onMapDblClick = (e: MapMouseEvent): void => {
    if (!state.active || state.active === "marker" || state.active === "note") return;
    // MapLibre fires click before dblclick — the extra click already pushed a
    // duplicate vertex, so pop it, then FINISH (commit). Before W4 the measure
    // branch popped and never committed, which is exactly why the line ran
    // forever and a second measurement could never be started. Don't zoom.
    if (state.active === "measure") {
      if (state.measureVerts.length > 1) state.measureVerts.pop();
      commitMeasure();
      renderMeasure();
    } else if (state.active === "draw") {
      if (state.drawVerts.length > 1) state.drawVerts.pop();
      commitDraw();
      renderDraw();
    }
    emit();
    e.preventDefault?.();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!state.active) return;
    const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
    const tag = (target?.tagName ?? "").toLowerCase();
    // Never steal keys from the note textarea / any text entry.
    if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
    if (e.key === "Escape") {
      // Esc FINISHES an in-progress geometry (what the readout has always
      // promised); a second Esc puts the tool away.
      if (canFinish()) finish();
      else deactivate();
      return;
    }
    if (e.key === "Enter") {
      if (canFinish()) {
        e.preventDefault();
        finish();
      }
      return;
    }
    if (
      e.key === "Backspace" ||
      e.key === "Delete" ||
      (e.key === "z" && (e.ctrlKey || e.metaKey))
    ) {
      if (canUndo()) {
        e.preventDefault();
        undo();
      }
    }
  };

  map.on("click", onMapClick);
  map.on("dblclick", onMapDblClick);
  // Guarded for non-browser callers (SSR / node tests) — Esc is a browser affordance.
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
  }

  return {
    activate,
    setMeasureMode(mode: MeasureMode) {
      if (mode === state.measureMode) return;
      // Switching mode mid-draft would silently reinterpret the geometry, so
      // commit what is there first (when it is committable) and start clean.
      commitMeasure();
      state.measureMode = mode;
      renderMeasure();
      emit();
    },
    finish,
    undo,
    removeMeasurement,
    removeShape,
    removeNote,
    removeMarker,
    setNoteText,
    setNoteScope,
    setHighlight,
    clear: clearAll,
    clearMeasurements,
    clearShapes,
    snapshot,
    getDrawings,
    setDossierOverlay,
    destroy() {
      try {
        map.off("click", onMapClick);
        map.off("dblclick", onMapDblClick);
        if (typeof window !== "undefined") {
          window.removeEventListener("keydown", onKeyDown);
        }
      } catch {
        /* ignore */
      }
      try {
        for (const id of [
          MEASURE_FILL_ID, MEASURE_HALO_ID, MEASURE_LINE_ID, MEASURE_VERT_ID,
          DRAW_FILL_ID, DRAW_HALO_ID, DRAW_LINE_ID, DRAW_VERT_ID,
          MARKER_ID,
          NOTE_PENDING_ID, NOTE_ID,
          DOSSIER_FILL_ID, DOSSIER_LINE_ID, DOSSIER_PT_ID,
        ]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const src of [MEASURE_SRC, DRAW_SRC, MARKER_SRC, NOTE_SRC, DOSSIER_SRC]) {
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
