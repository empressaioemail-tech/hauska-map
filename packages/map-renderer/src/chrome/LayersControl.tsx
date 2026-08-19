// packages/map-renderer/src/chrome/LayersControl.tsx
//
// Shared PE + CC layers toggle (CC-A WDLL 7). The VISIBILITY SET is owned by
// the substrate — this control is seeded from the renderer's own toggle set
// (getVisibleLayers) and drives the map via the `visibleLayers` prop. No local
// shadow paint state. Labels come from LAYER_REGISTRY.
//
// Phase 0A T-H03: named presets (Flood / Entitlement / Terrain) sit above the
// checkboxes — each turns on 2–3 coherent layers via the taxonomy presets.

import { useState } from "react";
import { LAYER_REGISTRY } from "../layer-registry.js";
import {
  INTERACTION_CYAN,
  MAP_LAYER_PRESETS,
  enforceDataLayerMutex,
} from "../map/layer-role-taxonomy.js";
import type { LayerKey, LayerDef } from "../postMessage";
import { MAP_PANEL_Z } from "./panelLayering";

/** Registry entry lookup for a human label; fall back to the raw key. */
function labelFor(key: LayerKey): string {
  const entry = (LAYER_REGISTRY as LayerDef[]).find((l) => l.key === key);
  return entry?.label ?? key;
}

const PRESET_ORDER = ["Flood", "Entitlement", "Terrain"] as const;

export function LayersControl({
  known,
  visible,
  onChange,
}: {
  // The full set of layers this surface knows about (the seed handed by the
  // substrate at mount). Rows are drawn per known layer so a toggled-off layer
  // stays in the list and can be re-enabled.
  known: Set<LayerKey>;
  // The substrate's current visible-layer set (a copy). Never a shadow copy —
  // it mirrors what the renderer is actually showing.
  visible: Set<LayerKey>;
  // Hand a NEW visible set up; ExplorerMap threads it to the `visibleLayers`
  // prop so the renderer applies it. Toggling drives the map, not local paint.
  onChange: (next: Set<LayerKey>) => void;
}) {
  // W4 panel manager: this is a floating panel over the map, so it folds.
  // Three uncollapsible panels stacked over each other is what produced
  // "How do i make the tools disappear so I can read this".
  const [open, setOpen] = useState(true);

  // One row per KNOWN layer, sorted by label for a stable list.
  const keys = [...known].sort((a, b) => labelFor(a).localeCompare(labelFor(b)));

  const toggle = (key: LayerKey) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // DATA mutex: turning a Data layer on drops any other Data layer.
    onChange(enforceDataLayerMutex(next, key) as Set<LayerKey>);
  };

  const applyPreset = (name: (typeof PRESET_ORDER)[number]) => {
    const preset = MAP_LAYER_PRESETS[name];
    // Keep known-only keys; dim = off everything else in the known set.
    const next = new Set<LayerKey>();
    for (const k of preset) {
      if (known.has(k as LayerKey)) next.add(k as LayerKey);
    }
    // Always keep parcel-polygon when the surface knows it (cold-open spine).
    if (known.has("parcel-polygon" as LayerKey)) {
      next.add("parcel-polygon" as LayerKey);
    }
    onChange(enforceDataLayerMutex(next) as Set<LayerKey>);
  };

  return (
    <div
      data-testid="layers-control"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: MAP_PANEL_Z.toolset,
        width: 176,
        padding: "9px 11px",
        borderRadius: 9,
        background: "rgba(13,17,23,0.9)",
        border: "0.5px solid rgba(154,166,178,0.28)",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 11.5,
        boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 7,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "#8b97a5",
          }}
        >
          Layers
        </span>
        <button
          type="button"
          data-testid="layers-control-collapse"
          aria-label={open ? "Collapse layers panel" : "Expand layers panel"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            border: "0.5px solid rgba(154,166,178,0.25)",
            background: "transparent",
            color: "#8b97a5",
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
      <div
        data-testid="layers-presets"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: 8,
        }}
      >
        {PRESET_ORDER.map((name) => (
          <button
            key={name}
            type="button"
            data-testid={`layers-preset-${name.toLowerCase()}`}
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
      {keys.map((key) => (
        <label
          key={key}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 0",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={visible.has(key)}
            onChange={() => toggle(key)}
            style={{ accentColor: INTERACTION_CYAN, cursor: "pointer" }}
          />
          <span>{labelFor(key)}</span>
        </label>
      ))}
      </>
      )}
    </div>
  );
}
