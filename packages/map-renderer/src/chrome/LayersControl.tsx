// packages/map-renderer/src/chrome/LayersControl.tsx
//
// Shared PE + CC layers toggle (CC-A WDLL 7). The VISIBILITY SET is owned by
// the substrate — this control is seeded from the renderer's own toggle set
// (getVisibleLayers) and drives the map via the `visibleLayers` prop. No local
// shadow paint state. Labels come from LAYER_REGISTRY.

import { LAYER_REGISTRY } from "../layer-registry.js";
import type { LayerKey, LayerDef } from "../postMessage";

/** Registry entry lookup for a human label; fall back to the raw key. */
function labelFor(key: LayerKey): string {
  const entry = (LAYER_REGISTRY as LayerDef[]).find((l) => l.key === key);
  return entry?.label ?? key;
}

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
  // One row per KNOWN layer, sorted by label for a stable list.
  const keys = [...known].sort((a, b) => labelFor(a).localeCompare(labelFor(b)));

  const toggle = (key: LayerKey) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div
      data-testid="layers-control"
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 9,
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
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "#8b97a5",
          marginBottom: 7,
        }}
      >
        Layers
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
            style={{ accentColor: "#7dd3fc", cursor: "pointer" }}
          />
          <span>{labelFor(key)}</span>
        </label>
      ))}
    </div>
  );
}
