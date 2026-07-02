/** E3 — Layer registry + per-app allocation; legend sync via disabled toggles. */

import {
  LAYER_REGISTRY,
  layerStatusForGates,
  resolveLayerAllocation,
  listAllocationKeys,
  productSurfaceForLayer,
  stylingForLayer,
  setLayerDisabled,
  isLayerDisabled,
} from "@hauska/map-renderer";
import { fetchLayerCatalog } from "../api/spine-api.js";
import { probeInputGates, reasoningLayerAwaitingReason } from "@hauska/map-renderer";
import { refreshLegendRail } from "./legend-rail.js";

export async function renderLayerRegistryView(container, config, inputGates = null, onRegistryChange) {
  container.innerHTML = `<div class="panel-loading">Loading layer catalog…</div>`;
  const backend = await fetchLayerCatalog(config);
  const gates = inputGates || probeInputGates(config);

  const alloc = resolveLayerAllocation({
    appId: config.appId,
    reportType: config.reportType,
    tier: config.packageTier,
  });

  const rows = LAYER_REGISTRY.map((l) => {
    const status = layerStatusForGates(gates, l.key);
    const inAlloc = alloc.visibleLayers.includes(l.key);
    const awaiting = reasoningLayerAwaitingReason(l.key, gates);
    const style = stylingForLayer(l.key);
    const surface = productSurfaceForLayer(l);
    const disabled = isLayerDisabled(l.key);
    return (
      `<tr data-layer-key="${l.key}">` +
      `<td><code>${l.key}</code></td>` +
      `<td>${surface}</td>` +
      `<td><span class="status-pill status--${status.replace(/[^a-z-]/gi, "")}">${status}</span></td>` +
      `<td class="mono">${escapeHtml(style.colorScale)}</td>` +
      `<td class="mono">${escapeHtml(style.encodes.slice(0, 72))}${style.encodes.length > 72 ? "…" : ""}</td>` +
      `<td>${inAlloc ? "yes" : "—"}</td>` +
      `<td>${l.fuelGated ? "fuel-gated" : l.fixture ? "fixture" : l.live ? "live" : "no-data"}</td>` +
      `<td><label><input type="checkbox" class="layer-disable-toggle" data-key="${l.key}"${disabled ? " checked" : ""}/> off</label></td>` +
      `<td class="mono">${awaiting ? escapeHtml(awaiting.slice(0, 48)) + "…" : "—"}</td>` +
      `</tr>`
    );
  }).join("");

  container.innerHTML = `
    <header class="panel-head">E3 Layer registry</header>
    <p class="panel-meta">Allocation: <code>${config.appId}:${config.reportType}</code> → ${alloc.defaultOn.length} default-on layers</p>
    <p class="panel-meta">Backend catalog: ${backend.status} — ${backend.message || backend.packageTier || ""}</p>
    <p class="panel-meta">Right-rail legend lists all ${LAYER_REGISTRY.length} registry layers — toggle off to mark disabled</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>id</th><th>surface</th><th>status</th><th>color scale</th><th>encodes</th><th>alloc</th><th>kind</th><th>disable</th><th>awaiting</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <details class="alloc-details">
      <summary>Allocation keys (${listAllocationKeys().length})</summary>
      <pre class="mono">${listAllocationKeys().join("\n")}</pre>
    </details>
  `;

  container.querySelectorAll(".layer-disable-toggle").forEach((cb) => {
    cb.addEventListener("change", () => {
      setLayerDisabled(cb.dataset.key, cb.checked);
      onRegistryChange?.();
      void renderLayerRegistryView(container, config, gates, onRegistryChange);
    });
  });

  return { registry: LAYER_REGISTRY, backend, allocation: alloc, gates };
}

export function syncLegendFromRegistry(legendContainer, visibleLayers, inputGates) {
  refreshLegendRail(legendContainer, visibleLayers, inputGates);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
