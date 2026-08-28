// packages/map-renderer/src/chrome/MapToolset.tsx
//
// ONE map control cluster: the TOOLS toolbar (measure, draw, marker, note,
// clear, undo/finish, and the in-panel "My location" geolocate button — the
// GeolocateControl itself is mounted hidden on the map and triggered from the
// panel, never shown as a floating map button), the RESULTS list (every
// committed measurement, shape and note, each removable on its own), and the
// LAYERS checklist, merged into a single coherent panel. The satellite/aerial
// base toggle lives in the LAYERS section (first row) — it reads as a basemap
// layer, not a tool. Replaces the split LayersControl (top-right) + MapTools
// (bottom-right) pair on surfaces that want the unified toolset; the split
// components remain exported for consumers that still use them (CC).
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
//
// W4 (2026-08-18): sections collapse and the panel can be put away, because
// three floating panels stacked with no collapse produced "How do i make the
// tools disappear so I can read this". Z-order comes from ONE table
// (panelLayering.ts) instead of hand-written literals. On mobile, activating a
// tool dismisses the sheet it was activated from — you cannot draw on a map
// that a sheet is covering.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { GeolocateControl } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { FloatingMapHandle } from "../FloatingMap";
import { LAYER_REGISTRY } from "../layer-registry.js";
import { legendSectionsFor, legendPanelHtml } from "../map/map-legend.js";
import {
  INTERACTION_CYAN,
  MAP_LAYER_PRESETS,
  enforceDataLayerMutex,
} from "../map/layer-role-taxonomy.js";
import type { LayerKey, LayerDef } from "../postMessage";
import { asMaplibreMap, setSatelliteBase } from "./satelliteBase";
import { MAP_PANEL_Z, dispatchPanelDismiss } from "./panelLayering";
import {
  installMapTools,
  type MapToolsController,
  type ToolsSnapshot,
  type NoteScope,
  EMPTY_TOOLS_SNAPSHOT,
} from "./mapToolsController";

const PANEL_BG = "rgba(11,14,19,0.9)";
const PANEL_BORDER = "0.5px solid rgba(154,166,178,0.28)";
const TEXT = "#e6edf3";
const MUTED = "#8b97a5";
const ACCENT = INTERACTION_CYAN;
const DANGER = "#fca5a5";

/**
 * Zoom the map settles at after a location fix. The hidden GeolocateControl is
 * given the SAME cap via fitBoundsOptions.maxZoom so the control's own camera
 * and the explicit flyTo below agree on a destination instead of fighting over
 * one — two camera drivers with different targets is a visible stutter.
 */
export const LOCATE_ZOOM = 17;


/** Persistent per-layer state surfaced on the layer row (honesty constraint:
 *  a faded toast must stay discoverable here). */
export interface LayerStateBadge {
  /** ok = healthy live data; info = neutral note (e.g. tier label, provider);
   *  warn = degraded / no-coverage / not-survey-grade; error = failed. */
  tone: "ok" | "info" | "warn" | "error";
  /** Short honest note, shown as tooltip + caption under the row label. */
  note: string;
}

/** A resolved device location handed to the host (W4 location seam). */
export interface LocatedPosition {
  longitude: number;
  latitude: number;
  /** GPS accuracy radius in meters, when the device reports one. */
  accuracyMeters: number | null;
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
  locate: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3",
  // Note: a page with a folded corner and two ruled lines.
  note: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h7M8 17h5",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  finish: "M20 6 9 17l-5-5",
  hide: "m2 2 20 20M6.7 6.7A10.5 10.5 0 0 0 2 12s3.6 6.5 10 6.5a9.8 9.8 0 0 0 4.6-1.2m2.7-2.1A10.6 10.6 0 0 0 22 12s-3.6-6.5-10-6.5c-.7 0-1.4.1-2 .2",
  collapse: "m6 15 6-6 6 6",
} as const;

/**
 * Left map utilities may all be open at once. One open uses the column
 * without a tiny max-height (that forced needless scroll). Two or more
 * share the remaining height.
 */
export function leftUtilityMaxHeight(openCount: number): string {
  if (openCount <= 0) return "0px";
  if (openCount === 1) return "min(56vh, calc(100vh - 168px))";
  return `min(36vh, calc((100vh - 176px) / ${openCount}))`;
}

/** Same toggle rule as workbench nextOpenToolIds — left utilities only. */
export function nextOpenLeftKinds(
  current: Array<"tools" | "layers">,
  tapped: "tools" | "layers",
): Array<"tools" | "layers"> {
  return current.includes(tapped)
    ? current.filter((id) => id !== tapped)
    : [...current, tapped];
}

/**
 * A bubble INSIDE the capsule (see the rail container below).
 *
 * The capsule owns the edge, the fill and the shadow, so a bubble carries
 * none of its own — it is a transparent 34px circle that tints on hover and
 * on open. Matches the workbench rail on the opposite edge exactly, which is
 * the point: two rails, one language.
 *
 * NO BLUE FILL (operator ruling 2026-08-27). The open state is a brighter
 * glass lift plus a blue GLYPH; the blue slab is gone.
 */
function chromeBubbleStyle(active: boolean): CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "none",
    background: active ? "rgba(255,255,255,.14)" : "transparent",
    color: active ? "#3B82F6" : "rgba(255,255,255,.58)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    boxShadow: "none",
    transition:
      "background 140ms cubic-bezier(.2,.6,.35,1), color 140ms cubic-bezier(.2,.6,.35,1)",
  };
}

/**
 * The left rail tooltip. LABEL ONLY (operator ruling 2026-08-27) and kit-04
 * glass with an arrow, matching the workbench BubbleTip on the opposite edge
 * so the two rails speak one language.
 */
/**
 * The LEGEND bubble, rendered by the host so it can live in the capsule with
 * the other three tools.
 *
 * The renderer is put in `legendChrome: "none"` and its MODEL is reused —
 * `legendSectionsFor` / `legendPanelHtml` are the same exported pure functions
 * its own DOM legend calls, so this is a second RENDERER of one model, never a
 * second copy of the rules.
 *
 * Bubble only. The PANEL renders in the left column (see LegendPanel), because
 * a 216px key has no business in the flow of a 46px rail.
 */
function LegendBubble({
  open,
  onToggle,
  side,
}: {
  open: boolean;
  onToggle: () => void;
  side: "left" | "right";
}) {
  return (
    <MapFlyTip side={side} label="Legend">
      <button
        type="button"
        data-testid="map-toolset-legend-bubble"
        aria-label={open ? "Hide legend" : "Legend"}
        aria-expanded={open}
        onClick={onToggle}
        style={chromeBubbleStyle(open)}
      >
        <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h10 M4 12h16 M4 18h7" />
        </svg>
      </button>
    </MapFlyTip>
  );
}

/** The legend key, as a panel in the left column. */
function LegendPanel({
  sections,
  onClose,
}: {
  sections: ReturnType<typeof legendSectionsFor>;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="map-toolset-legend-panel"
      className="pe-scroll"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        flex: "0 0 auto",
        maxHeight: "46vh",
        overflowY: "auto",
        borderRadius: 9,
        background: PANEL_BG,
        border: PANEL_BORDER,
        boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
        color: TEXT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 32,
          padding: "0 8px 0 12px",
          borderBottom: "1px solid rgba(154,166,178,.10)",
          flex: "0 0 auto",
        }}
      >
        <span style={{ ...sectionHeaderStyle(), flex: 1 }}>Legend</span>
        <button
          type="button"
          aria-label="Hide legend"
          onClick={onClose}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "transparent",
            border: "none",
            color: MUTED,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
            <path d="M18 6 6 18 M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div
        style={{ padding: "10px 12px", font: "400 11.5px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif" }}
        dangerouslySetInnerHTML={{ __html: legendPanelHtml(sections) }}
      />
    </div>
  );
}

function MapFlyTip({
  label,
  side,
  children,
}: {
  label: string;
  side: "left" | "right";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 60);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  const arrow: CSSProperties =
    side === "left"
      ? {
          right: -5,
          borderRight: "1px solid rgba(255,255,255,.18)",
          borderTop: "1px solid rgba(255,255,255,.18)",
        }
      : {
          left: -5,
          borderLeft: "1px solid rgba(255,255,255,.18)",
          borderBottom: "1px solid rgba(255,255,255,.18)",
        };
  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open ? (
        <div
          role="tooltip"
          data-testid="map-fly-tip"
          style={{
            position: "absolute",
            zIndex: 40,
            top: "50%",
            ...(side === "left"
              ? { right: "100%", marginRight: 13 }
              : { left: "100%", marginLeft: 13 }),
            transform: "translateY(-50%)",
            pointerEvents: "none",
            animation:
              "map-tip-in 180ms cubic-bezier(.2,.6,.35,1) both",
          }}
        >
          <style>{`@keyframes map-tip-in{from{opacity:0}to{opacity:1}}`}</style>
          <div
            style={{
              position: "relative",
              padding: "7px 12px",
              borderRadius: 8,
              background: "rgba(255,255,255,.10)",
              border: "1px solid rgba(255,255,255,.18)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              whiteSpace: "nowrap",
              fontSize: 12.5,
              fontWeight: 500,
              color: "#fff",
            }}
          >
            {label}
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                width: 9,
                height: 9,
                background: "rgba(255,255,255,.10)",
                transform: "translateY(-50%) rotate(45deg)",
                ...arrow,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolIcon({ path, size = 15 }: { path: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
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

function sectionHeaderStyle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: MUTED,
  };
}

/** A collapsible section header — the panel manager's unit of collapse. */
function SectionHeader({
  label,
  open,
  testId,
  onToggle,
  trailing,
}: {
  label: string;
  open: boolean;
  testId: string;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          flex: 1,
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          ...sectionHeaderStyle(),
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            transform: open ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform 120ms ease",
          }}
        >
          <ToolIcon path={ICONS.collapse} size={11} />
        </span>
        {label}
      </button>
      {trailing}
    </div>
  );
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
 *
 * Every W4 prop is OPTIONAL: this component is rendered directly by tests and
 * by Command Center's simpler toolbar, and a required prop would break them.
 */
export function ToolsetToolsSection({
  active,
  measureMode,
  readout,
  tracking,
  onActivate,
  onClear,
  onSetMeasureMode,
  onLocate,
  canUndo = false,
  canFinish = false,
  onUndo,
  onFinish,
  hasAnything = false,
  locateError = null,
  located = null,
  onFlyToLocation,
}: {
  active: ToolsSnapshot["active"];
  measureMode: ToolsSnapshot["measureMode"];
  readout: string | null;
  /** True while the hidden GeolocateControl is tracking the user location. */
  tracking: boolean;
  onActivate: (tool: "measure" | "draw" | "marker" | "note") => void;
  onClear: () => void;
  onSetMeasureMode: (mode: "line" | "area") => void;
  /** Trigger / toggle the hidden GeolocateControl. */
  onLocate: () => void;
  canUndo?: boolean;
  canFinish?: boolean;
  onUndo?: () => void;
  onFinish?: () => void;
  /** True when Clear all would remove something (keeps the trash honest). */
  hasAnything?: boolean;
  /** Honest failure surface for a denied/failed location fix. */
  locateError?: string | null;
  located?: LocatedPosition | null;
  onFlyToLocation?: () => void;
}) {
  return (
    <div data-testid="map-toolset-tools">
      <div style={{ ...sectionHeaderStyle(), marginBottom: 7 }}>Tools</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
          data-testid="map-toolset-note"
          title="Pin a note"
          aria-label="Pin a note"
          aria-pressed={active === "note"}
          onClick={() => onActivate("note")}
          style={toolButtonStyle(active === "note")}
        >
          <ToolIcon path={ICONS.note} />
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

      {/* Finish / undo / clear-all. Undo exists because the only removal
          operation used to be clear-everything. */}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          type="button"
          data-testid="map-toolset-finish"
          title="Finish this measurement"
          aria-label="Finish this measurement"
          disabled={!canFinish}
          onClick={() => onFinish?.()}
          style={toolButtonStyle(false, !canFinish)}
        >
          <ToolIcon path={ICONS.finish} />
        </button>
        <button
          type="button"
          data-testid="map-toolset-undo"
          title="Undo the last point"
          aria-label="Undo the last point"
          disabled={!canUndo}
          onClick={() => onUndo?.()}
          style={toolButtonStyle(false, !canUndo)}
        >
          <ToolIcon path={ICONS.undo} />
        </button>
        <button
          type="button"
          data-testid="map-toolset-clear-all"
          title="Clear everything on the map"
          aria-label="Clear everything on the map"
          disabled={!hasAnything}
          onClick={onClear}
          style={toolButtonStyle(false, !hasAnything)}
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
          data-testid="map-toolset-readout"
          style={{ marginTop: 7, fontSize: 11, fontWeight: 600, color: TEXT }}
        >
          {readout}
        </div>
      )}

      {/* Location: where the device says it is, and a way back to it. An
          honest failure is named, never a silently inert button. */}
      {locateError && (
        <div
          data-testid="map-toolset-locate-error"
          style={{ marginTop: 7, fontSize: 10.5, lineHeight: 1.35, color: DANGER }}
        >
          {locateError}
        </div>
      )}
      {located && !locateError && (
        <button
          type="button"
          data-testid="map-toolset-fly-to-location"
          onClick={() => onFlyToLocation?.()}
          style={{
            marginTop: 7,
            padding: "3px 7px",
            borderRadius: 5,
            border: "0.5px solid rgba(154,166,178,0.3)",
            background: "rgba(255,255,255,0.04)",
            color: "#c8d0d8",
            fontSize: 10,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {`Centre on me · ${located.latitude.toFixed(5)}, ${located.longitude.toFixed(5)}`}
          {located.accuracyMeters != null
            ? ` ±${Math.round(located.accuracyMeters)} m`
            : ""}
        </button>
      )}
    </div>
  );
}

/** One removable result row (a measurement, a shape). */
function ResultRow({
  testId,
  index,
  primary,
  secondary,
  onRemove,
  onHighlight,
  highlighted,
}: {
  testId: string;
  index: number;
  primary: string;
  secondary: string;
  onRemove: () => void;
  onHighlight: (on: boolean) => void;
  highlighted: boolean;
}) {
  return (
    <div
      data-testid={testId}
      onMouseEnter={() => onHighlight(true)}
      onMouseLeave={() => onHighlight(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "3px 4px",
        borderRadius: 5,
        background: highlighted ? "rgba(125,211,252,0.14)" : "transparent",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 15,
          flexShrink: 0,
          fontSize: 9.5,
          fontWeight: 700,
          color: MUTED,
          textAlign: "right",
        }}
      >
        {index}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: TEXT }}>{primary}</span>
        <span style={{ display: "block", fontSize: 9.5, color: MUTED }}>{secondary}</span>
      </span>
      <button
        type="button"
        data-testid={`${testId}-remove`}
        title="Remove this one"
        aria-label={`Remove ${primary}`}
        onClick={onRemove}
        style={{
          flexShrink: 0,
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
        ×
      </button>
    </div>
  );
}

export function MapToolset({
  mapRef,
  known,
  visible,
  onLayersChange,
  layerStates,
  extraLabels,
  onToolsController,
  /** `embedded` renders panel content only (mobile layers sheet). */
  presentation = "floating",
  isMobile = false,
  /** When true on mobile, the layers/tools panel slides up above the bottom nav. */
  layersSheetOpen = false,
  /** Initial satellite/aerial base state on mount. Default OFF (dark basemap);
   *  PE passes `true` so aerial is the default first impression (2026-08-03). */
  defaultSatellite = false,
  /** W4 note seam: the parcel a new note belongs to (host owns parcel identity). */
  noteScope = null,
  /** W4 location seam: a resolved device position, for the host to resolve the
   *  parcel the user is standing on. Fires on every fix. */
  onLocated,
  /** W4 panel seam: host-owned "put this panel away" (mobile sheet close). */
  onRequestClose,
  anchor = "right",
  splitBubbles = false,
  stackPanels,
  stackExtras,
  initialOpenKinds,
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
  /** Labels for host-side layer keys that are NOT in the shared registry
   *  (e.g. PE's saved-property pin layer). Falls back to the registry label,
   *  then the raw key. Additive — omitting it changes nothing. */
  extraLabels?: Partial<Record<LayerKey, string>>;
  /** WB6 dossier seam: fires with the live MapToolsController once installed
   *  (and null on teardown) so the host can capture/redraw drawings. */
  onToolsController?: (controller: MapToolsController | null) => void;
  presentation?: "floating" | "embedded";
  isMobile?: boolean;
  layersSheetOpen?: boolean;
  defaultSatellite?: boolean;
  noteScope?: NoteScope | null;
  onLocated?: (position: LocatedPosition) => void;
  onRequestClose?: () => void;
  /** Desktop corner. PE uses left so the inspect card / brand stay the left stack. */
  anchor?: "left" | "right";
  /**
   * Panels that belong in the LEFT COLUMN rather than beside a bubble — the
   * host's sources register, for instance. The capsule holds bubbles; this
   * column holds panels. Keeping those two facts separate is what stopped the
   * sources and legend panels floating loose over the map.
   */
  stackPanels?: ReactNode;
  /** Separate draw + layers bubbles instead of one unified bubble. */
  splitBubbles?: boolean;
  /** Extra bubbles stacked above draw/layers (legend, notifications). */
  stackExtras?: ReactNode;
  /** Test seam: start with draw and/or layers already open. */
  initialOpenKinds?: Array<"tools" | "layers">;
}) {
  // The live maplibre map, resolved once the handle is ready.
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const controllerRef = useRef<MapToolsController | null>(null);
  const geolocateRef = useRef<GeolocateControl | null>(null);
  const onLocatedRef = useRef(onLocated);
  onLocatedRef.current = onLocated;

  const [snap, setSnap] = useState<ToolsSnapshot>(EMPTY_TOOLS_SNAPSHOT);
  const [satellite, setSatellite] = useState(defaultSatellite);
  // True while the hidden GeolocateControl is tracking the user's location —
  // drives the pressed state of the in-panel "My location" button.
  const [tracking, setTracking] = useState(false);
  const [located, setLocated] = useState<LocatedPosition | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // Operator revision 2026-07-29: the toolset lives as a small BUBBLE in the
  // lower-right corner; clicking it expands the panel upward. Collapsed by
  // default so the map (and the top-right brief) own the screen.
  const [expanded, setExpanded] = useState(presentation === "embedded");
  const [panelKind, setPanelKind] = useState<"all" | "tools" | "layers">("all");
  const [openKinds, setOpenKinds] = useState<Set<"tools" | "layers">>(
    () => new Set(initialOpenKinds ?? []),
  );
  // W4 panel manager: each section folds on its own, so a long layer list never
  // buries the tools and the results never bury the layers.
  const [toolsOpen, setToolsOpen] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  // Mobile fallback for hosts that have not wired onRequestClose: hide our own
  // sheet until the host re-opens it. Correct-but-degraded beats not working.
  const [selfHidden, setSelfHidden] = useState(false);
  const prevSheetOpen = useRef(layersSheetOpen);

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
    onToolsController?.(controller);

    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
      // Same zoom cap the explicit flyTo below uses, so the control's camera
      // and ours agree on where "you are here" lands.
      fitBoundsOptions: { maxZoom: LOCATE_ZOOM },
    });
    geolocateRef.current = geolocate;
    let geolocateEl: HTMLElement | null = null;
    const onTrackStart = () => setTracking(true);
    const onTrackEnd = () => setTracking(false);
    // W4: a fix must MOVE THE MAP and must tell the host where the user is, so
    // the host can resolve the parcel they are standing on. Both were missing:
    // the button toggled a dot and nothing else consumed the position.
    const onGeolocateFix = (evt: unknown) => {
      const coords = (evt as { coords?: GeolocationCoordinates } | undefined)?.coords;
      if (!coords || !Number.isFinite(coords.longitude) || !Number.isFinite(coords.latitude)) {
        return;
      }
      const position: LocatedPosition = {
        longitude: coords.longitude,
        latitude: coords.latitude,
        accuracyMeters: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
      };
      setLocated(position);
      setLocateError(null);
      try {
        map.flyTo({ center: [position.longitude, position.latitude], zoom: LOCATE_ZOOM });
      } catch {
        /* camera busy / map torn down — the position still reached the host */
      }
      onLocatedRef.current?.(position);
    };
    const onGeolocateError = (evt: unknown) => {
      const message = (evt as { message?: string } | undefined)?.message;
      setLocateError(
        message
          ? `Location unavailable: ${message}`
          : "Location unavailable. Check the browser location permission for this site.",
      );
      setTracking(false);
    };
    try {
      geolocateEl = geolocate.onAdd(map);
      geolocateEl.style.display = "none";
      map.getContainer().appendChild(geolocateEl);
      geolocate.on("trackuserlocationstart", onTrackStart);
      geolocate.on("trackuserlocationend", onTrackEnd);
      geolocate.on("geolocate", onGeolocateFix);
      geolocate.on("error", onGeolocateError);
    } catch {
      /* control setup failed (unlikely) — GPS button simply inert */
    }

    return () => {
      onToolsController?.(null);
      controller.destroy();
      controllerRef.current = null;
      try {
        geolocate.off("trackuserlocationstart", onTrackStart);
        geolocate.off("trackuserlocationend", onTrackEnd);
        geolocate.off("geolocate", onGeolocateFix);
        geolocate.off("error", onGeolocateError);
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

  // Keep the controller's note scope in step with the host's selection, so a
  // note records WHICH parcel the user was judging.
  useEffect(() => {
    controllerRef.current?.setNoteScope(noteScope ?? null);
  }, [noteScope, snap.active]);

  const active = snap.active;
  const controller = () => controllerRef.current;
  const toolsReady = map != null;
  const hasAnything =
    snap.measurements.length > 0 ||
    snap.shapes.length > 0 ||
    snap.notes.length > 0 ||
    snap.markerCount > 0 ||
    snap.draftPoints > 0;

  // W4 mobile rule: activating a tool must get the sheet out of the way — you
  // cannot click the map through the panel you are clicking in. Layer toggles
  // deliberately do NOT dismiss (you would never get two layers on).
  const dismissForToolUse = () => {
    if (!isMobile) return;
    dispatchPanelDismiss("tool-activated");
    onRequestClose?.();
    setSelfHidden(true);
  };

  const activateTool = (tool: "measure" | "draw" | "marker" | "note") => {
    controller()?.activate(tool);
    dismissForToolUse();
  };

  const labelOf = (key: LayerKey): string => extraLabels?.[key] ?? labelFor(key);
  const layerKeys = [...known].sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  const toggleLayer = (key: LayerKey) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onLayersChange(enforceDataLayerMutex(next, key) as Set<LayerKey>);
  };

  const applyPreset = (name: "Flood" | "Entitlement" | "Terrain") => {
    const preset = MAP_LAYER_PRESETS[name];
    const next = new Set<LayerKey>();
    for (const k of preset) {
      if (known.has(k as LayerKey)) next.add(k as LayerKey);
    }
    if (known.has("parcel-polygon" as LayerKey)) {
      next.add("parcel-polygon" as LayerKey);
    }
    onLayersChange(enforceDataLayerMutex(next) as Set<LayerKey>);
  };

  useEffect(() => {
    if (layersSheetOpen && !prevSheetOpen.current) setSelfHidden(false);
    prevSheetOpen.current = layersSheetOpen;
  }, [layersSheetOpen]);

  const pendingNote = snap.pendingNoteId
    ? snap.notes.find((n) => n.id === snap.pendingNoteId) ?? null
    : null;
  const resultCount = snap.measurements.length + snap.shapes.length + snap.notes.length;

  const toolsInner = (
    <>
        {/* --- TOOLS --- */}
        {toolsReady && (
          <div>
            <SectionHeader
              label="Tools"
              open={toolsOpen}
              testId="map-toolset-tools-toggle"
              onToggle={() => setToolsOpen((v) => !v)}
            />
            {toolsOpen && (
              <ToolsetToolsSection
                active={active}
                measureMode={snap.measureMode}
                readout={snap.readout}
                tracking={tracking}
                onActivate={activateTool}
                onClear={() => controller()?.clear()}
                onSetMeasureMode={(mode) => controller()?.setMeasureMode(mode)}
                onLocate={() => geolocateRef.current?.trigger()}
                canUndo={snap.canUndo}
                canFinish={snap.canFinish}
                onUndo={() => controller()?.undo()}
                onFinish={() => controller()?.finish()}
                hasAnything={hasAnything}
                locateError={locateError}
                located={located}
                onFlyToLocation={() => {
                  if (!map || !located) return;
                  try {
                    map.flyTo({
                      center: [located.longitude, located.latitude],
                      zoom: LOCATE_ZOOM,
                    });
                  } catch {
                    /* map torn down */
                  }
                }}
              />
            )}
          </div>
        )}

        {/* --- RESULTS: every committed measurement / shape / note, each
            removable ON ITS OWN. Before W4 the only removal operation was
            clear-everything. --- */}
        {toolsReady && (resultCount > 0 || pendingNote) && (
          <div
            data-testid="map-toolset-results"
            style={{ borderTop: "0.5px solid rgba(154,166,178,0.22)", paddingTop: 9 }}
          >
            <SectionHeader
              label={`Measurements & notes (${resultCount})`}
              open={resultsOpen}
              testId="map-toolset-results-toggle"
              onToggle={() => setResultsOpen((v) => !v)}
            />
            {resultsOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {snap.measurements.map((m) => (
                  <ResultRow
                    key={m.id}
                    testId={`map-toolset-measurement-${m.id}`}
                    index={m.index}
                    primary={m.primary}
                    secondary={`${m.mode === "area" ? "Area" : "Distance"} · ${m.secondary}`}
                    highlighted={snap.highlightId === m.id}
                    onHighlight={(on) => controller()?.setHighlight(on ? m.id : null)}
                    onRemove={() => controller()?.removeMeasurement(m.id)}
                  />
                ))}
                {snap.shapes.map((s) => (
                  <ResultRow
                    key={s.id}
                    testId={`map-toolset-shape-${s.id}`}
                    index={s.index}
                    primary={s.primary}
                    secondary={`Shape · ${s.secondary}`}
                    highlighted={snap.highlightId === s.id}
                    onHighlight={(on) => controller()?.setHighlight(on ? s.id : null)}
                    onRemove={() => controller()?.removeShape(s.id)}
                  />
                ))}
                {snap.notes
                  .filter((n) => n.id !== snap.pendingNoteId)
                  .map((n) => (
                    <div
                      key={n.id}
                      data-testid={`map-toolset-note-${n.id}`}
                      style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "3px 4px" }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 15,
                          flexShrink: 0,
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: n.color ?? "#3B82F6",
                          textAlign: "right",
                        }}
                      >
                        {n.index}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 11, color: TEXT, wordBreak: "break-word" }}>
                          {n.text}
                        </span>
                        {n.scopeLabel && (
                          <span style={{ display: "block", fontSize: 9.5, color: MUTED }}>
                            {n.scopeLabel}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        data-testid={`map-toolset-note-${n.id}-remove`}
                        title="Remove this note"
                        aria-label="Remove this note"
                        onClick={() => controller()?.removeNote(n.id)}
                        style={{
                          flexShrink: 0,
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
                        ×
                      </button>
                    </div>
                  ))}
                {/* The note being written. The user's own judgement, so it is
                    never auto-summarised and never merged with our facts. */}
                {pendingNote && (
                  <div
                    data-testid="map-toolset-note-editor"
                    style={{ display: "flex", flexDirection: "column", gap: 5, padding: "4px 0" }}
                  >
                    {noteScope?.label && (
                      <span style={{ fontSize: 9.5, color: MUTED }}>{noteScope.label}</span>
                    )}
                    <textarea
                      data-testid="map-toolset-note-input"
                      aria-label="Note text"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={3}
                      placeholder="Your note on this spot"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        resize: "vertical",
                        borderRadius: 6,
                        border: "0.5px solid rgba(154,166,178,0.3)",
                        background: "rgba(255,255,255,0.04)",
                        color: TEXT,
                        fontSize: 11.5,
                        fontFamily: "inherit",
                        padding: "5px 7px",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        data-testid="map-toolset-note-save"
                        disabled={noteDraft.trim().length === 0}
                        onClick={() => {
                          controller()?.setNoteText(pendingNote.id, noteDraft.trim());
                          setNoteDraft("");
                        }}
                        style={{
                          padding: "3px 9px",
                          borderRadius: 5,
                          border: "none",
                          cursor: noteDraft.trim().length === 0 ? "default" : "pointer",
                          opacity: noteDraft.trim().length === 0 ? 0.4 : 1,
                          background: ACCENT,
                          color: "#0b0f14",
                          fontSize: 10.5,
                          fontWeight: 700,
                        }}
                      >
                        Save note
                      </button>
                      <button
                        type="button"
                        data-testid="map-toolset-note-discard"
                        onClick={() => {
                          controller()?.removeNote(pendingNote.id);
                          setNoteDraft("");
                        }}
                        style={{
                          padding: "3px 9px",
                          borderRadius: 5,
                          border: "0.5px solid rgba(154,166,178,0.3)",
                          background: "transparent",
                          color: MUTED,
                          fontSize: 10.5,
                          cursor: "pointer",
                        }}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

    </>
  );

  const layersInner = (
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
          <SectionHeader
            label="Layers"
            open={layersOpen}
            testId="map-toolset-layers-toggle"
            onToggle={() => setLayersOpen((v) => !v)}
          />
          {layersOpen && (
            <>
              <div
                data-testid="map-toolset-presets"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 4,
                  marginBottom: 8,
                }}
              >
                {(["Flood", "Entitlement", "Terrain"] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    data-testid={`map-toolset-preset-${name.toLowerCase()}`}
                    onClick={() => applyPreset(name)}
                    style={{
                      fontSize: 10,
                      padding: "3px 7px",
                      borderRadius: 4,
                      border: "0.5px solid rgba(154,166,178,0.35)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#c8d0d8",
                      cursor: "pointer",
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {/* Satellite / aerial BASE toggle — first row of LAYERS (it reads
                  as a basemap layer). Same behavior/handler as before the move:
                  the setSatelliteBase effect operates on the live map in place. */}
              <div style={{ padding: "3px 0" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid="map-toolset-satellite"
                    checked={satellite}
                    onChange={(e) => setSatellite(e.target.checked)}
                    style={{ accentColor: ACCENT, cursor: "pointer" }}
                  />
                  <span style={{ flex: 1 }}>Satellite / aerial</span>
                </label>
              </div>
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
                      <span style={{ flex: 1 }}>{labelOf(key)}</span>
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
            </>
          )}
        </div>
  );

  const panelInner = (
    <>
      {toolsInner}
      {layersInner}
    </>
  );

  if (presentation === "embedded") {
    return (
      <div
        data-testid="map-toolset-embedded"
        style={{
          display: "flex",
          width: "100%",
          flexDirection: "column",
          gap: 9,
          padding: "10px 12px 16px",
          color: TEXT,
          fontSize: 11.5,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {panelInner}
      </div>
    );
  }

  const mobileSheetPanel = isMobile && layersSheetOpen && !selfHidden && (
    <div
      data-testid="mobile-layers-sheet"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 52,
        zIndex: MAP_PANEL_Z.sheet,
        maxHeight: "calc(100vh - 52px - 56px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: "rgba(11,14,19,0.98)",
        borderTop: "1px solid rgba(154,166,178,0.28)",
        boxShadow: "0 -10px 36px rgba(0,0,0,0.45)",
        display: "flex",
        flexDirection: "column",
        gap: 9,
        padding: "10px 12px 16px",
        color: TEXT,
        fontSize: 11.5,
      }}
    >
      {panelInner}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div data-testid="map-toolset" style={{ display: "none" }} aria-hidden />
        {mobileSheetPanel}
      </>
    );
  }

  const tipSide = anchor === "left" ? "right" : "left";
  const toggleKind = (kind: "tools" | "layers") => {
    setOpenKinds((cur) => new Set(nextOpenLeftKinds([...cur], kind)));
    setPanelKind(kind);
    setExpanded(true);
  };

  const [collapsedKinds, setCollapsedKinds] = useState<Set<"tools" | "layers">>(
    () => new Set(),
  );
  // The legend's open state lives HERE, not inside its bubble, so the bubble
  // can sit in the capsule while the panel sits in the column.
  const [legendOpen, setLegendOpen] = useState(false);
  const legendSections = legendSectionsFor([...visible]);
  const splitOpenCount = openKinds.size;
  // COLLAPSE, PER PANEL — the same act the right column calls folding, and
  // the same rule: only the panel you click changes, and nothing collapses
  // because something else opened.
  const isCollapsed = (kind: "tools" | "layers") => collapsedKinds.has(kind);
  const toggleCollapsed = (kind: "tools" | "layers") =>
    setCollapsedKinds((cur) => {
      const next = new Set(cur);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const splitPanelStyle = (kind: "tools" | "layers"): CSSProperties => ({
    display: openKinds.has(kind) ? "flex" : "none",
    width: 216,
    flex: "0 0 auto",
    flexDirection: "column",
    gap: isCollapsed(kind) ? 0 : 9,
    padding: isCollapsed(kind) ? "8px 12px" : "8px 12px 10px",
    borderRadius: 9,
    background: PANEL_BG,
    border: PANEL_BORDER,
    color: TEXT,
    fontSize: 11.5,
    boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
    // Collapsed keeps ONLY its header, exactly like a folded dock. The panel
    // body no longer scrolls itself either: the left COLUMN is the one
    // scroller, so a wheel gesture carries across panels instead of catching
    // inside one.
    maxHeight: isCollapsed(kind) ? 34 : leftUtilityMaxHeight(splitOpenCount),
    overflow: "hidden",
    transition:
      "max-height 220ms cubic-bezier(.2,.6,.35,1), padding 140ms cubic-bezier(.2,.6,.35,1)",
  });

  return (
    <div
      data-testid="map-toolset"
      data-anchor={anchor}
      style={{
        position: "absolute",
        // 72, not 56: at 56 the capsule crowded the brand chip below it
        // (operator, 2026-08-27). Kit 04 draws the left rail at bottom:72.
        bottom: anchor === "left" ? 72 : 16,
        ...(anchor === "left" ? { left: 12 } : { right: 12 }),
        zIndex: MAP_PANEL_Z.toolset,
        display: "flex",
        flexDirection: "column",
        alignItems: anchor === "left" ? "flex-start" : "flex-end",
        gap: 8,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Split left utilities: draw and layers are separate containers.
          Unified (non-split) keeps the original single panel. */}
      {splitBubbles ? (
        <div
          data-testid="map-toolset-left-stack"
          className="pe-scroll ss-fade-top"
          style={{
            display: splitOpenCount > 0 || legendOpen || stackPanels ? "flex" : "none",
            flexDirection: "column",
            // BOTTOM-UP, LIKE THE RIGHT SIDE (operator, 2026-08-28). The
            // column is anchored to the ground by the root and grows upward,
            // and `justify-content: flex-end` keeps the newest panel sitting
            // on the rail rather than floating at the top of the box.
            justifyContent: "flex-end",
            gap: 8,
            width: 216,
            // ONE scroller, same as the right column — and it fades out
            // rather than being cut off. The vanishing point is 3/4 up the
            // viewport, so the stack dissolves into the map instead of
            // ending on a hard edge.
            maxHeight: "75vh",
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {stackPanels}
          {legendOpen && legendSections.length > 0 ? (
            <LegendPanel
              sections={legendSections}
              onClose={() => setLegendOpen(false)}
            />
          ) : null}
          {splitOpenCount > 1 && (
            <button
              type="button"
              data-testid="map-toolset-collapse-all"
              onClick={() => {
                setExpanded(false);
                setOpenKinds(new Set());
                dispatchPanelDismiss("hide-all");
                onRequestClose?.();
              }}
              style={{
                alignSelf: "flex-start",
                padding: "3px 8px",
                borderRadius: 5,
                border: "0.5px solid rgba(154,166,178,0.25)",
                background: PANEL_BG,
                color: MUTED,
                cursor: "pointer",
                fontSize: 10.5,
              }}
            >
              Collapse all
            </button>
          )}
          <div
            data-testid="map-toolset-draw-panel"
            style={splitPanelStyle("tools")}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingBottom: 6,
                borderBottom: "0.5px solid rgba(154,166,178,0.18)",
              }}
            >
              <button
                type="button"
                data-testid="map-toolset-collapse-tools"
                aria-expanded={!isCollapsed("tools")}
                aria-label={
                  isCollapsed("tools") ? "Expand Draw & measure" : "Collapse Draw & measure"
                }
                onClick={() => toggleCollapsed("tools")}
                style={{
                  ...sectionHeaderStyle(),
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={11}
                  height={11}
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    flex: "none",
                    transform: isCollapsed("tools")
                      ? "rotate(-90deg)"
                      : "rotate(0deg)",
                    transition: "transform 180ms cubic-bezier(.2,.6,.35,1)",
                  }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                Draw & measure
              </button>
              <button
                type="button"
                data-testid="map-toolset-hide-all"
                title="Hide all panels"
                aria-label="Hide all panels"
                onClick={() => {
                  setExpanded(false);
                  setOpenKinds(new Set());
                  dispatchPanelDismiss("hide-all");
                  onRequestClose?.();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  border: "0.5px solid rgba(154,166,178,0.25)",
                  background: "transparent",
                  color: MUTED,
                  cursor: "pointer",
                }}
              >
                <ToolIcon path={ICONS.hide} size={12} />
              </button>
            </div>
            {toolsInner}
          </div>
          <div
            data-testid="map-toolset-layers-panel"
            style={splitPanelStyle("layers")}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingBottom: 6,
                borderBottom: "0.5px solid rgba(154,166,178,0.18)",
              }}
            >
              <button
                type="button"
                data-testid="map-toolset-collapse-layers"
                aria-expanded={!isCollapsed("layers")}
                aria-label={
                  isCollapsed("layers") ? "Expand Layers" : "Collapse Layers"
                }
                onClick={() => toggleCollapsed("layers")}
                style={{
                  ...sectionHeaderStyle(),
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={11}
                  height={11}
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    flex: "none",
                    transform: isCollapsed("layers")
                      ? "rotate(-90deg)"
                      : "rotate(0deg)",
                    transition: "transform 180ms cubic-bezier(.2,.6,.35,1)",
                  }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                Layers
              </button>
            </div>
            {layersInner}
          </div>
        </div>
      ) : (
      <div
        style={{
          display: expanded ? "flex" : "none",
          width: 216,
          flexDirection: "column",
          gap: 9,
          padding: "8px 12px 10px",
          borderRadius: 9,
          background: PANEL_BG,
          border: PANEL_BORDER,
          color: TEXT,
          fontSize: 11.5,
          boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
          maxHeight: "32vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingBottom: 6,
            borderBottom: "0.5px solid rgba(154,166,178,0.18)",
          }}
        >
          <span style={{ ...sectionHeaderStyle(), flex: 1 }}>
            {panelKind === "layers"
              ? "Layers"
              : panelKind === "tools"
                ? "Draw & measure"
                : "Map tools"}
          </span>
          <button
            type="button"
            data-testid="map-toolset-hide-all"
            title="Hide all panels"
            aria-label="Hide all panels"
            onClick={() => {
              setExpanded(false);
              setOpenKinds(new Set());
              dispatchPanelDismiss("hide-all");
              onRequestClose?.();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 5,
              border: "0.5px solid rgba(154,166,178,0.25)",
              background: "transparent",
              color: MUTED,
              cursor: "pointer",
            }}
          >
            <ToolIcon path={ICONS.hide} size={12} />
          </button>
          <button
            type="button"
            data-testid="map-toolset-minimise"
            title="Minimise this panel"
            aria-label="Minimise this panel"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded(false);
              setOpenKinds(new Set());
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 5,
              border: "0.5px solid rgba(154,166,178,0.25)",
              background: "transparent",
              color: MUTED,
              cursor: "pointer",
              lineHeight: 1,
              fontSize: 13,
            }}
          >
            −
          </button>
        </div>
        {panelInner}
      </div>
      )}

      {/* The required Esri imagery credit is NOT rendered here as a standing chip
          anymore — it produced a dark "Imagery: Esri…" strip above this bubble on
          load (satellite is on by default), colliding with the ⓘ / layers cluster.
          The credit now lives, collapse-only, inside the app's MapSourceInfo ⓘ
          "Sources" panel (© OSM / © CARTO + SATELLITE_ATTRIBUTION), which is the
          single attribution place. See MapCornerChrome.tsx / ExplorerMap.tsx. */}

      {/* THE CAPSULE. Kit 04: ONE floating glass container holding the
          bubbles, not N separately-bordered buttons — same language as the
          workbench rail on the opposite edge.
          It stacks BOTTOM-UP (operator ruling 2026-08-27) by virtue of the
          root being bottom-anchored: `bottom` is pinned, so every bubble
          added grows the capsule UPWARD and nothing already on screen moves.
          That is the behaviour, and it needs no column-reverse — reversing
          would only flip which tool sits nearest the ground. */}
      <div
        data-testid="map-toolset-capsule"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "8px 6px",
          borderRadius: 24,
          background: "rgba(11,14,19,.92)",
          border: "1px solid rgba(255,255,255,.09)",
          boxShadow: "0 10px 34px rgba(0,0,0,.5)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        {/* FOUR TOOLS, ONE CAPSULE (operator ruling 2026-08-27): legend and
            notifications join draw and layers. Every panel they open is
            absolutely positioned, so a 264px key or source register never
            sits in the flow of a 46px rail. */}
        {legendSections.length > 0 ? (
          <LegendBubble
            open={legendOpen}
            onToggle={() => setLegendOpen((v) => !v)}
            side={tipSide}
          />
        ) : null}
        {stackExtras}
        {splitBubbles ? (
          <>
            <MapFlyTip
              side={tipSide}
              label="Draw"
            >
              <button
                type="button"
                data-testid="map-toolset-draw-bubble"
                aria-label={openKinds.has("tools") ? "Hide drawing tools" : "Drawing tools"}
                aria-expanded={openKinds.has("tools")}
                onClick={() => toggleKind("tools")}
                style={chromeBubbleStyle(openKinds.has("tools"))}
              >
                <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS.draw} />
                </svg>
              </button>
            </MapFlyTip>
            <MapFlyTip
              side={tipSide}
              label="Layers"
            >
              <button
                type="button"
                data-testid="map-toolset-bubble"
                aria-label={openKinds.has("layers") ? "Hide layers" : "Map layers"}
                aria-expanded={openKinds.has("layers")}
                onClick={() => toggleKind("layers")}
                style={chromeBubbleStyle(openKinds.has("layers"))}
              >
                <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 2 7.5 12 13l10-5.5L12 2Zm-10 10L12 17.5 22 12M2 16.5 12 22l10-5.5" />
                </svg>
              </button>
            </MapFlyTip>
          </>
        ) : (
          <MapFlyTip
            side={tipSide}
            label="Map tools"
          >
            <button
              type="button"
              data-testid="map-toolset-bubble"
              aria-label={expanded ? "Collapse map tools & layers" : "Expand map tools & layers"}
              aria-expanded={expanded}
              onClick={() => {
                setPanelKind("all");
                setExpanded((v) => !v);
              }}
              style={chromeBubbleStyle(expanded)}
            >
              <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 2 7.5 12 13l10-5.5L12 2Zm-10 10L12 17.5 22 12M2 16.5 12 22l10-5.5" />
              </svg>
            </button>
          </MapFlyTip>
        )}
      </div>
    </div>
  );
}
