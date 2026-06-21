/** Right rail — styling legend synced to layer registry (E layout) */

import { legendEntriesForRegistry } from "../renderer/layer-registry.js";

export function renderLegendRail(container, visibleLayers) {
  const entries = legendEntriesForRegistry(visibleLayers);
  container.innerHTML = `
    <header class="rail-head">Styling legend</header>
    <p class="rail-note">Read-contract visual key — Wave 1 fixture labels; V4/V5 add width-as-uncertainty</p>
    <ul class="legend-list" role="list">
      ${entries
        .map(
          (e) =>
            `<li class="legend-row">` +
            `<span class="legend-key">${e.label}</span>` +
            `<span class="legend-status status--${e.status.replace(/[^a-z]/gi, "")}">${e.status}</span>` +
            `<span class="legend-encodes">${e.encodes}</span>` +
            `</li>`,
        )
        .join("")}
    </ul>
    <section class="rail-section">
      <header class="rail-subhead">Wave 2 (not live)</header>
      <ul class="legend-list legend-list--muted">
        <li>Calibrated-accuracy — fuel-gated (M1)</li>
        <li>Contested-ground overlay — F5</li>
        <li>Triage state — F2 + F4</li>
        <li>Vintage decay — F8</li>
      </ul>
    </section>
  `;
}

export function refreshLegendRail(container, visibleLayers) {
  renderLegendRail(container, visibleLayers);
}
