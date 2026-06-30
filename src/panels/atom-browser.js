/** E2 — Atom browser with family / jurisdiction / accessPolicy filters. */

import {
  fetchAtomBrowse,
  formatAtomReadContract,
  ATOM_FAMILIES,
} from "../api/spine-api.js";
import { formatWidthedConfidence } from "../read-contract/index.js";
import { renderAtomInspector } from "./atom-inspector.js";
import { updateFilesRailSection } from "./files-rail.js";

let activeFilters = { family: "", jurisdiction: "", accessPolicy: "" };

export async function renderAtomBrowser(container, config, parcelCtx = null, inspectorHost = null) {
  container.innerHTML = `<div class="panel-loading">Loading atoms…</div>`;

  const filters = { ...activeFilters, ...readFilters(container) };
  activeFilters = filters;
  const result = await fetchAtomBrowse(config, filters, parcelCtx);

  updateFilesRailSection(
    "atoms",
    `<ul class="rail-facet-list">${ATOM_FAMILIES.map(
      (f) => `<li><button type="button" class="rail-facet" data-family="${f}">${f} <strong>${result.byFamily?.[f] ?? 0}</strong></button></li>`,
    ).join("")}</ul>`,
  );

  document.querySelectorAll(".rail-facet").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilters = { ...activeFilters, family: btn.dataset.family };
      void renderAtomBrowser(container, config, parcelCtx, inspectorHost);
    });
  });

  if (!result.atoms?.length) {
    container.innerHTML = `
      <header class="panel-head">E2 Atom browser</header>
      ${renderFilterBar(filters)}
      <div class="empty-state empty-state--${result.status}">
        <strong>${result.status === "ok" ? "Zero atoms" : "No atom coverage"}</strong>
        <p>${result.message || "Set Hauska API key + start MCP, or click a parcel on the map"}</p>
        ${
          result.attempts?.length
            ? `<pre class="mono">${JSON.stringify(result.attempts, null, 2)}</pre>`
            : ""
        }
      </div>
    `;
    bindFilterHandlers(container, config, parcelCtx, inspectorHost);
    return result;
  }

  const rows = result.atoms
    .map((a, i) => {
      const id = a.atomDid || a.atomId || a.id || `atom-${i}`;
      const rcBlock = formatConfidenceBlock(a);
      const ctx = a.contextSummary?.headline || a.title || a.summary || "—";
      const prov = a.provenance?.source || a.provenanceTier || a.provenance?.tier || "—";
      return (
        `<tr data-atom-id="${escapeHtml(id)}" class="atom-row" tabindex="0">` +
        `<td><code>${escapeHtml(id)}</code></td>` +
        `<td>${escapeHtml(a._family || a.family || "—")}</td>` +
        `<td>${escapeHtml(String(a._jurisdiction || "—"))}</td>` +
        `<td>${escapeHtml(String(a._accessPolicy || "—"))}</td>` +
        `<td>${escapeHtml(String(ctx).slice(0, 60))}</td>` +
        `<td class="mono">${escapeHtml(rcBlock)}</td>` +
        `<td class="mono">${escapeHtml(String(prov).slice(0, 40))}</td>` +
        `</tr>`
      );
    })
    .join("");

  container.innerHTML = `
    <header class="panel-head">E2 Atom browser <span class="badge">${result.atoms.length}</span></header>
    ${renderFilterBar(filters)}
    <p class="panel-meta">Source: ${result.source} · read-contract always shows n + width + provenance</p>
    <div class="table-wrap">
      <table class="data-table atom-table">
        <thead><tr><th>atomDid</th><th>family</th><th>jurisdiction</th><th>accessPolicy</th><th>context</th><th>confidence</th><th>provenance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="hint">Click a row to open the atom inspector (downloadable-atom shape).</p>
    <div id="e2-atom-inspector" class="atom-inspector-host" hidden></div>
  `;

  bindFilterHandlers(container, config, parcelCtx, inspectorHost);

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

function formatConfidenceBlock(atom) {
  const rc = formatAtomReadContract(atom);
  if (rc.includes("n=") && rc.includes("width=") && rc.includes("provenance=")) return rc;
  const cal = atom.readContract?.axes?.calibratedConfidence || atom.confidence;
  if (cal?.intervalWidth != null && cal?.estimate != null) {
    return formatWidthedConfidence({
      estimate: cal.estimate,
      n: cal.n ?? 0,
      intervalWidth: cal.intervalWidth,
      provenance: cal.provenance || "asserted",
    });
  }
  return rc;
}

function renderFilterBar(filters) {
  return `
    <div class="e2-filters">
      <label>Family
        <select id="e2-family-filter">
          <option value="">All</option>
          ${ATOM_FAMILIES.map((f) => `<option value="${f}"${filters.family === f ? " selected" : ""}>${f}</option>`).join("")}
        </select>
      </label>
      <label>Jurisdiction
        <input type="text" id="e2-jurisdiction-filter" value="${escapeAttr(filters.jurisdiction || "")}" placeholder="bastrop-tx" />
      </label>
      <label>accessPolicy
        <select id="e2-policy-filter">
          <option value="">All</option>
          <option value="public-free"${filters.accessPolicy === "public-free" ? " selected" : ""}>public-free</option>
          <option value="platform-internal"${filters.accessPolicy === "platform-internal" ? " selected" : ""}>platform-internal</option>
          <option value="identified-caller"${filters.accessPolicy === "identified-caller" ? " selected" : ""}>identified-caller</option>
        </select>
      </label>
      <button type="button" id="e2-apply-filters" class="btn-inline">Apply</button>
    </div>
  `;
}

function readFilters(container) {
  return {
    family: container.querySelector("#e2-family-filter")?.value || "",
    jurisdiction: container.querySelector("#e2-jurisdiction-filter")?.value?.trim() || "",
    accessPolicy: container.querySelector("#e2-policy-filter")?.value || "",
  };
}

function bindFilterHandlers(container, config, parcelCtx, inspectorHost) {
  container.querySelector("#e2-apply-filters")?.addEventListener("click", () => {
    activeFilters = readFilters(container);
    void renderAtomBrowser(container, config, parcelCtx, inspectorHost);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
