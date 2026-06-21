/** E7 — Parcel drill-through and atom trace (C uncapped → E trace graph). */

import {
  fetchAtomsForParcel,
  fetchAtomTrace,
  traverseAtomGraph,
  formatAtomReadContract,
  resolvePlaceKey,
} from "../api/spine-api.js";
import { formatReadContractSummary } from "../read-contract/index.js";

export function renderParcelTrace(container) {
  container.innerHTML = `
    <header class="panel-head">E7 Parcel drill-through</header>
    <div class="empty-state empty-state--empty">
      <p>Click a parcel on the map to open its info and trace every atom behind it (uncapped).</p>
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
  body.innerHTML = `<div class="panel-loading">Resolving place + atoms for ${escapeHtml(selection.label || selection.address)}…</div>`;

  const address = selection.address || selection.label || config.defaultAddress;
  const coords = selection.coords || config.defaultCenter;
  const placeResolved = await resolvePlaceKey(config, coords, address);
  const atomsResult = await fetchAtomsForParcel(config, { address, coords, placeKey: placeResolved.placeKey });

  const props = selection.properties || selection.feature?.properties || {};
  let traceHtml = "";

  if (atomsResult.atoms?.length) {
    traceHtml += `<section class="trace-section"><header>Composed atoms (${atomsResult.atoms.length}) — uncapped</header>`;
    traceHtml += `<p class="mono">placeKey: ${escapeHtml(atomsResult.placeKey || placeResolved.placeKey || "—")}</p>`;
    traceHtml += `<ul class="trace-list">`;
    for (const atom of atomsResult.atoms) {
      const id = atom.atomDid || atom.atomId || atom.id || atom.did;
      const rc = formatAtomReadContract(atom);
      traceHtml += `<li><button type="button" class="trace-link" data-atom-id="${escapeAttr(id)}">${escapeHtml(id)}</button>`;
      traceHtml += ` — ${escapeHtml(atom.title || atom.family || atom.entityType || "")}`;
      traceHtml += `<br/><span class="mono">${escapeHtml(rc)}</span></li>`;
    }
    traceHtml += `</ul></section>`;
  } else {
    traceHtml += `<div class="empty-state empty-state--empty"><p>${escapeHtml(atomsResult.message || "No atoms returned")}</p></div>`;
  }

  const readBlock = selection.readContract
    ? `<p class="mono read-contract">${escapeHtml(formatReadContractSummary(selection.readContract))}</p>`
    : selection.readContractSummary
      ? `<p class="mono read-contract">${escapeHtml(selection.readContractSummary)}</p>`
      : `<p class="mono">No read-contract on parcel slot — scalar fills do not render (V4)</p>`;

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
      ${readBlock}
    </section>
    ${traceHtml}
    <section class="trace-section" id="xref-trace-pane">
      <header>Atom trace graph (E retrieval-api)</header>
      <p class="hint">Click an atom id — GET /atoms/trace/:did then walk inbound/outbound/citations (no display limit)</p>
      <pre class="trace-tree mono" id="xref-tree">—</pre>
    </section>
  `;

  body.querySelectorAll(".trace-link").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const atomId = btn.dataset.atomId;
      const tree = body.querySelector("#xref-tree");
      tree.textContent = `Tracing ${atomId}…`;
      const graph = await traverseAtomGraph(config, atomId);
      if (graph.nodes.length === 1 && graph.nodes[0].status === "error" && !config.useFixture) {
        const single = await fetchAtomTrace(config, atomId);
        tree.textContent = formatSingleTrace(single);
        return;
      }
      tree.textContent = formatGraphTrace(graph);
    });
  });

  return { selection, atomsResult, placeResolved, inputGates: atomsResult.inputGates };
}

function formatSingleTrace(result) {
  if (result.status !== "ok") return `Trace error: ${result.message}\nSet retrieval API URL (?retrieval=http://127.0.0.1:8080)`;
  const t = result.trace;
  return [
    `atom: ${t.atomDid}`,
    `context: ${JSON.stringify(t.contextSummary?.headline || t.contextSummary || {}, null, 2)}`,
    `provenance: ${JSON.stringify(t.provenance || {}, null, 2)}`,
    `outbound: ${(t.outbound || []).length}`,
    `inbound: ${(t.inbound || []).length}`,
    `citations: ${(t.citations || []).length}`,
  ].join("\n");
}

function formatGraphTrace(graph) {
  if (!graph.nodes?.length) return "No trace nodes resolved";
  const lines = graph.nodes.map((n) => {
    const indent = "  ".repeat(Math.min(n.depth || 0, 8));
    const headline = n.trace?.contextSummary?.headline || n.trace?.atom?.title || "";
    const err = n.error ? ` [${n.error}]` : "";
    const edges = n.trace
      ? ` out=${n.trace.outbound?.length ?? 0} in=${n.trace.inbound?.length ?? 0} cite=${n.trace.citations?.length ?? 0}`
      : "";
    return `${indent}${n.atomDid} ${headline}${edges}${err}`;
  });
  if (graph.truncated) lines.push(`\n… truncated at ${graph.nodes.length} nodes (uncapped operator surface — raise limit in code if needed)`);
  return lines.join("\n");
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
