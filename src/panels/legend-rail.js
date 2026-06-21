/** Right rail — styling legend synced to layer registry (E layout). */

import { legendEntriesForRegistry } from "../renderer/layer-registry.js";
import { POSITIONING_MAP_NOTE } from "../copy/positioning.js";

export function renderLegendRail(container, visibleLayers, inputGates = null) {
  const entries = legendEntriesForRegistry(visibleLayers, inputGates);
  container.innerHTML = `
    <header class="rail-head">Styling legend</header>
    <p class="rail-note">${POSITIONING_MAP_NOTE}</p>
    <ul class="legend-list" role="list">
      ${entries
        .map(
          (e) =>
            `<li class="legend-row">` +
            `<span class="legend-key">${e.label}</span>` +
            `<span class="legend-status status--${String(e.status).replace(/[^a-z-]/gi, "")}">${e.status}</span>` +
            `<span class="legend-encodes">${e.encodes}</span>` +
            `${e.awaiting ? `<span class="legend-awaiting">${e.awaiting}</span>` : ""}` +
            `</li>`,
        )
        .join("")}
    </ul>
    <section class="rail-section">
      <header class="rail-subhead">Not Wave 2</header>
      <ul class="legend-list legend-list--muted">
        <li>Calibrated-accuracy — fuel-gated (M1, V6)</li>
        <li>Development pulse — fuel-gated (X3, V7)</li>
        <li>Vintage decay — F8 (deferred)</li>
      </ul>
    </section>
  `;
}

export function refreshLegendRail(container, visibleLayers, inputGates) {
  renderLegendRail(container, visibleLayers, inputGates);
}
