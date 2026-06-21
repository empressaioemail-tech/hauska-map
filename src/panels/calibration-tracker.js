/** E4 — Calibration tracker (Wave 1 honest empty) */

import { fetchCalibrationState } from "../api/spine-api.js";

export async function renderCalibrationTracker(container, config) {
  const result = await fetchCalibrationState(config);
  container.innerHTML = `
    <header class="panel-head">E4 Calibration tracker</header>
    <div class="empty-state empty-state--empty">
      <strong>Not warmed — Wave 1 shell only</strong>
      <p>${result.message}</p>
      <table class="data-table compact">
        <thead><tr><th>provenance</th><th>count</th></tr></thead>
        <tbody>
          ${Object.entries(result.provenanceCounts)
            .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
            .join("")}
        </tbody>
      </table>
      <p class="hint">Never shows bare confidence — requires F4 read-contract + W warming (Wave 2)</p>
    </div>
  `;
  return result;
}
