/** E3 — Layer registry view */

import { LAYER_REGISTRY } from "../renderer/layer-registry.js";
import { fetchLayerCatalog } from "../api/spine-api.js";

export async function renderLayerRegistryView(container, config) {
  container.innerHTML = `<div class="panel-loading">Loading layer catalog…</div>`;
  const backend = await fetchLayerCatalog(config);

  const rows = LAYER_REGISTRY.map((l) => {
    const live = l.pending ? "pending" : l.wave2 ? "wave-2" : l.fixture ? "fixture" : l.live ? "live" : "no-data";
    return (
      `<tr>` +
      `<td><code>${l.key}</code></td>` +
      `<td>${l.label}</td>` +
      `<td>${l.group}</td>` +
      `<td><span class="status-pill status--${live}">${live}</span></td>` +
      `<td>${l.fuelGated ? "fuel-gated" : "free"}</td>` +
      `</tr>`
    );
  }).join("");

  container.innerHTML = `
    <header class="panel-head">E3 Layer registry</header>
    <p class="panel-meta">Backend catalog: ${backend.status} — ${backend.message || backend.packageTier || ""}</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>key</th><th>label</th><th>group</th><th>status</th><th>tier</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="hint">Per-app allocation (Cortex / Brief / Radar / SmartCity) — Wave 2 V3</p>
  `;
  return { registry: LAYER_REGISTRY, backend };
}
