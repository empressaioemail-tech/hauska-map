/** E7 — Parcel drill-through and atom trace */

import { fetchAtomsForParcel, traverseAtomCrossRefs } from "../api/spine-api.js";

export function renderParcelTrace(container) {
  container.innerHTML = `
    <header class="panel-head">E7 Parcel drill-through</header>
    <div class="empty-state empty-state--empty">
      <p>Click a parcel on the map to open its info and trace atoms to source.</p>
    </div>
    <div id="parcel-trace-body" hidden></div>
  `;
}

export async function openParcelTrace(container, config, selection) {
  const body = container.querySelector("#parcel-trace-body");
  const empty = container.querySelector(".empty-state");
  if (!selection) {
    body.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  body.hidden = false;
  body.innerHTML = `<div class="panel-loading">Resolving atoms for ${selection.label || selection.address}…</div>`;

  const atomsResult = await fetchAtomsForParcel(config, {
    address: selection.address || selection.label,
    coords: selection.coords,
  });

  const props = selection.properties || selection.feature?.properties || {};
  let traceHtml = "";

  if (atomsResult.atoms?.length) {
    traceHtml += `<section class="trace-section"><header>Composed atoms (${atomsResult.atoms.length})</header><ul class="trace-list">`;
    for (const atom of atomsResult.atoms) {
      const id = atom.atomId || atom.id;
      traceHtml += `<li><button type="button" class="trace-link" data-atom-id="${escapeAttr(id)}">${escapeHtml(id)}</button> — ${escapeHtml(atom.title || atom.summary || atom.family || "")}</li>`;
    }
    traceHtml += `</ul></section>`;
  } else {
    traceHtml += `<div class="empty-state empty-state--empty"><p>${escapeHtml(atomsResult.message || "No atoms returned")}</p></div>`;
  }

  body.innerHTML = `
    <section class="parcel-card">
      <h3>${escapeHtml(selection.label || selection.address || "Parcel")}</h3>
      <p>${escapeHtml(selection.detail || "")}</p>
      <dl class="prop-list">
        ${Object.entries(props)
          .slice(0, 12)
          .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`)
          .join("")}
      </dl>
      <p class="mono">Citation: ${escapeHtml(selection.citation || "—")}</p>
      ${
        selection.confidence
          ? `<p class="mono">Confidence (scalar — F4 read-contract pending): ${escapeHtml(JSON.stringify(selection.confidence))}</p>`
          : `<p class="mono">No read-contract object on this slot yet (F4 gap)</p>`
      }
    </section>
    ${traceHtml}
    <section class="trace-section" id="xref-trace-pane">
      <header>Cross-reference trace</header>
      <p class="hint">Click an atom id to traverse cross-references (no display limit)</p>
      <pre class="trace-tree mono" id="xref-tree">—</pre>
    </section>
  `;

  body.querySelectorAll(".trace-link").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const atomId = btn.dataset.atomId;
      const tree = body.querySelector("#xref-tree");
      tree.textContent = `Traversing ${atomId}…`;
      const nodes = await traverseAtomCrossRefs(config, atomId);
      tree.textContent = formatTraceTree(nodes);
    });
  });

  return { selection, atomsResult };
}

function formatTraceTree(nodes) {
  if (!nodes?.length) return "No cross-references resolved";
  return nodes
    .map((n) => {
      const indent = "  ".repeat(n.depth || 0);
      const label = n.atom?.title || n.atomId || "?";
      const err = n.error || n.message || "";
      return `${indent}${n.atomId} ${label}${err ? ` [${err}]` : ""}`;
    })
    .join("\n");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
