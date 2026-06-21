/** E2 — Atom browser */

import { fetchAtomsForParcel } from "../api/spine-api.js";

export async function renderAtomBrowser(container, config, parcelCtx = null) {
  container.innerHTML = `<div class="panel-loading">Loading atoms…</div>`;
  const result = await fetchAtomsForParcel(config, parcelCtx);

  if (!result.atoms?.length) {
    container.innerHTML = `
      <header class="panel-head">E2 Atom browser</header>
      <div class="empty-state empty-state--${result.status}">
        <strong>${result.status === "ok" ? "Zero atoms" : "No atom coverage"}</strong>
        <p>${result.message || "Click a parcel on the map or configure MCP / cortex-api key"}</p>
        ${
          result.attempts?.length
            ? `<pre class="mono">${JSON.stringify(result.attempts, null, 2)}</pre>`
            : ""
        }
      </div>
    `;
    return result;
  }

  const rows = result.atoms
    .map((a, i) => {
      const id = a.atomId || a.id || `atom-${i}`;
      const conf = a.confidence || a.readContract || {};
      return (
        `<tr data-atom-id="${escapeHtml(id)}">` +
        `<td><code>${escapeHtml(id)}</code></td>` +
        `<td>${escapeHtml(a.family || a.type || "—")}</td>` +
        `<td>${escapeHtml(String(conf.value ?? conf.kind ?? "scalar-only"))}</td>` +
        `<td>${conf.width != null ? conf.width : "no width"}</td>` +
        `<td>${escapeHtml(conf.provenance || "—")}</td>` +
        `</tr>`
      );
    })
    .join("");

  container.innerHTML = `
    <header class="panel-head">E2 Atom browser <span class="badge">${result.atoms.length}</span></header>
    <p class="panel-meta">Source: ${result.source}</p>
    <div class="table-wrap">
      <table class="data-table atom-table">
        <thead><tr><th>atomId</th><th>family</th><th>confidence</th><th>width</th><th>provenance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  return result;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
