/** E2 — Atom browser */

import { fetchAtomsForParcel, formatAtomReadContract } from "../api/spine-api.js";
import { renderAtomInspector } from "./atom-inspector.js";

export async function renderAtomBrowser(container, config, parcelCtx = null, inspectorHost = null) {
  container.innerHTML = `<div class="panel-loading">Loading atoms…</div>`;
  const result = await fetchAtomsForParcel(config, parcelCtx);

  if (!result.atoms?.length) {
    container.innerHTML = `
      <header class="panel-head">E2 Atom browser</header>
      <div class="empty-state empty-state--${result.status}">
        <strong>${result.status === "ok" ? "Zero atoms" : "No atom coverage"}</strong>
        <p>${result.message || "Click a parcel on the map or set Hauska API key + fixture=0"}</p>
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
      const id = a.atomDid || a.atomId || a.id || `atom-${i}`;
      const rc = formatAtomReadContract(a);
      const parts = rc.match(/width=([\d.]+)/);
      const width = parts ? parts[1] : "—";
      const prov = rc.match(/provenance=(\w+)/);
      return (
        `<tr data-atom-id="${escapeHtml(id)}" class="atom-row" tabindex="0">` +
        `<td><code>${escapeHtml(id)}</code></td>` +
        `<td>${escapeHtml(a.family || a.entityType || a.type || "—")}</td>` +
        `<td class="mono">${escapeHtml(rc.slice(0, 48))}</td>` +
        `<td>${width}</td>` +
        `<td>${prov ? prov[1] : "—"}</td>` +
        `</tr>`
      );
    })
    .join("");

  container.innerHTML = `
    <header class="panel-head">E2 Atom browser <span class="badge">${result.atoms.length}</span></header>
    <p class="panel-meta">Source: ${result.source} · placeKey: ${result.placeKey || "—"}</p>
    <p class="panel-meta">Never bare scalar — widthed read-contract only</p>
    <div class="table-wrap">
      <table class="data-table atom-table">
        <thead><tr><th>atomDid</th><th>family</th><th>read-contract</th><th>width</th><th>provenance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="hint">Click a row to open the atom inspector (downloadable-atom shape).</p>
    <div id="e2-atom-inspector" class="atom-inspector-host" hidden></div>
  `;

  const inspectorEl = container.querySelector("#e2-atom-inspector");
  container.querySelectorAll(".atom-row").forEach((row) => {
    const open = async () => {
      const id = row.dataset.atomId;
      const atom = result.atoms.find((a, i) => (a.atomDid || a.atomId || a.id || `atom-${i}`) === id);
      if (!atom) return;
      row.classList.add("atom-row--selected");
      container.querySelectorAll(".atom-row").forEach((r) => {
        if (r !== row) r.classList.remove("atom-row--selected");
      });
      await renderAtomInspector(inspectorHost || inspectorEl, { atom, config });
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void open();
      }
    });
  });

  return result;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
