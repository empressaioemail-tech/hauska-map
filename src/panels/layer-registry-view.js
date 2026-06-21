/** E3 — Layer registry + per-app allocation (V3). */

import {
  LAYER_REGISTRY,
  layerStatusForGates,
  resolveLayerAllocation,
  listAllocationKeys,
} from "../renderer/layer-registry.js";
import { fetchLayerCatalog } from "../api/spine-api.js";
import { probeInputGates, reasoningLayerAwaitingReason } from "../lib/input-gates.js";

export async function renderLayerRegistryView(container, config, inputGates = null) {
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
    return (
      `<tr>` +
      `<td><code>${l.key}</code></td>` +
      `<td>${l.label}</td>` +
      `<td><span class="status-pill status--${status.replace(/[^a-z-]/gi, "")}">${status}</span></td>` +
      `<td>${inAlloc ? "yes" : "—"}</td>` +
      `<td>${l.fuelGated ? "fuel" : "free"}</td>` +
      `<td class="mono">${awaiting ? escapeHtml(awaiting.slice(0, 60)) + "…" : "—"}</td>` +
      `</tr>`
    );
  }).join("");

  container.innerHTML = `
    <header class="panel-head">E3 Layer registry</header>
    <p class="panel-meta">Allocation: <code>${config.appId}:${config.reportType}</code> → ${alloc.defaultOn.length} default-on layers</p>
    <p class="panel-meta">Backend catalog: ${backend.status} — ${backend.message || backend.packageTier || ""}</p>
    <p class="panel-meta">Input gates: F2=${gates.F2_consequence ? "live" : "awaiting"} · F5=${gates.F5_conflictLog ? "live" : "awaiting"}</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>key</th><th>label</th><th>status</th><th>alloc</th><th>tier</th><th>awaiting</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <details class="alloc-details">
      <summary>Allocation keys (${listAllocationKeys().length})</summary>
      <pre class="mono">${listAllocationKeys().join("\n")}</pre>
    </details>
  `;
  return { registry: LAYER_REGISTRY, backend, allocation: alloc, gates };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
