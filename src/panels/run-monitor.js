/** E5 — Run monitor (Wave 1 honest empty) */

import { fetchRunMonitor } from "../api/spine-api.js";

export async function renderRunMonitor(container, config) {
  const result = await fetchRunMonitor(config);
  container.innerHTML = `
    <header class="panel-head">E5 Run monitor</header>
    <div class="empty-state empty-state--empty">
      <strong>Warming run not started</strong>
      <p>${result.message}</p>
      <ul class="metric-list">
        <li>Parcels warmed: <strong>${result.parcelsWarmed}</strong></li>
        <li>Coverage holes: <em>no data</em></li>
        <li>Adapter failures: <em>no data</em></li>
        <li>Contested ground: <em>no data</em></li>
        <li>Triage counts: <em>no data</em></li>
      </ul>
    </div>
  `;
  return result;
}
