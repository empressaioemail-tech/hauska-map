/** Right rail — styling legend synced to live layer registry (E3 state). */

import { legendEntriesForRegistry } from "@hauska/map-renderer";
import { POSITIONING_MAP_NOTE } from "@hauska/map-renderer";

export function renderLegendRail(container, _visibleLayers, inputGates = null) {
  const entries = legendEntriesForRegistry(null, inputGates);
  container.innerHTML = `
    <header class="rail-head">Styling legend</header>
    <p class="rail-note">${POSITIONING_MAP_NOTE}</p>
    <p class="rail-note muted">${entries.length} layers — synced from registry</p>
    <ul class="legend-list" role="list">
      ${entries
        .map(
          (e) =>
            `<li class="legend-row" data-layer-key="${e.key}">` +
            `<code class="legend-id">${e.key}</code>` +
            `<span class="legend-key">${e.label}</span>` +
            `<span class="legend-status status--${String(e.status).replace(/[^a-z-]/gi, "")}">${e.status}</span>` +
            `<span class="legend-scale">${e.colorScale}</span>` +
            `<span class="legend-encodes">${e.encodes}</span>` +
            `${e.awaiting ? `<span class="legend-awaiting">${e.awaiting}</span>` : ""}` +
            `</li>`,
        )
        .join("")}
    </ul>
  `;
}

export function refreshLegendRail(container, visibleLayers, inputGates) {
  renderLegendRail(container, visibleLayers, inputGates);
}
