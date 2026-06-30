/** E7 — Parcel drill-through and atom trace (C uncapped → E trace graph). */

import {
  fetchAtomsForParcel,
  fetchAtomTrace,
  traverseAtomGraph,
  formatAtomReadContract,
  resolvePlaceKey,
} from "../api/spine-api.js";
import { formatReadContractSummary, formatWidthedConfidence } from "../read-contract/index.js";
import { renderAtomInspector } from "./atom-inspector.js";

const MAX_TRACE_HOPS = 100;

export function renderParcelTrace(container) {
  container.innerHTML = `
    <header class="panel-head">E7 Parcel drill-through</header>
    <div class="empty-state empty-state--empty">
      <p>Click a parcel on the map to open its info and trace every atom behind it (uncapped).</p>
    </div>
    <nav class="trace-breadcrumb mono" id="trace-breadcrumb" hidden aria-label="Atom trace path"></nav>
    <div id="parcel-trace-body" hidden></div>
  `;
}

export async function openParcelTrace(container, config, selection) {
  const body = container.querySelector("#parcel-trace-body");
  const empty = container.querySelector(".empty-state");
  const breadcrumbEl = container.querySelector("#trace-breadcrumb");
  if (!selection) {
    body.hidden = true;
    if (breadcrumbEl) breadcrumbEl.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  body.hidden = false;
  body.innerHTML = `<div class="panel-loading">Resolving place + atoms for ${escapeHtml(selection.label || selection.address)}…</div>`;
  if (breadcrumbEl) {
    breadcrumbEl.hidden = true;
    breadcrumbEl.innerHTML = "";
  }

  const address = selection.address || selection.label || config.defaultAddress;
  const coords = selection.coords || config.defaultCenter;
  const placeResolved = await resolvePlaceKey(config, coords, address);
  const atomsResult = await fetchAtomsForParcel(config, { address, coords, placeKey: placeResolved.placeKey });

  const props = selection.properties || selection.feature?.properties || {};
  const grouped = groupAtomsByFamily(atomsResult.atoms || []);
  let traceHtml = "";

  if (atomsResult.atoms?.length) {
    traceHtml += `<section class="trace-section"><header>Composed atoms (${atomsResult.atoms.length}) — uncapped</header>`;
    traceHtml += `<p class="mono">placeKey: ${escapeHtml(atomsResult.placeKey || placeResolved.placeKey || "—")}</p>`;
    for (const [family, atoms] of Object.entries(grouped)) {
      traceHtml += `<h4 class="trace-family">${escapeHtml(family)} (${atoms.length})</h4><ul class="trace-list">`;
      for (const atom of atoms) {
        const id = atom.atomDid || atom.atomId || atom.id || atom.did;
        const rc = formatConfidenceDisplay(atom);
        traceHtml += `<li><button type="button" class="trace-link" data-atom-id="${escapeAttr(id)}">${escapeHtml(id)}</button>`;
        traceHtml += ` — ${escapeHtml(atom.title || atom.family || atom.entityType || "")}`;
        traceHtml += `<br/><span class="mono">${escapeHtml(rc)}</span></li>`;
      }
      traceHtml += `</ul>`;
    }
    traceHtml += `</section>`;
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
      <p class="hint">Click an atom id or cross-reference — BFS capped at ${MAX_TRACE_HOPS} hops; cycle-safe visited set</p>
      <pre class="trace-tree mono" id="xref-tree">—</pre>
      <div id="xref-links" class="xref-links"></div>
    </section>
    <section id="e7-atom-inspector" class="atom-inspector-host" hidden></section>
  `;

  const traceState = {
    path: [],
    atomsResult,
    config,
    body,
    breadcrumbEl,
  };

  body.querySelectorAll(".trace-link").forEach((btn) => {
    btn.addEventListener("click", () => void followAtomTrace(traceState, btn.dataset.atomId, { append: true }));
  });

  return { selection, atomsResult, placeResolved, inputGates: atomsResult.inputGates };
}

async function followAtomTrace(state, atomId, { append = true } = {}) {
  const { body, config, atomsResult, breadcrumbEl } = state;
  const tree = body.querySelector("#xref-tree");
  const linksEl = body.querySelector("#xref-links");
  const inspectorEl = body.querySelector("#e7-atom-inspector");

  if (append) {
    if (state.path[state.path.length - 1] !== atomId) state.path.push(atomId);
  } else {
    const idx = state.path.indexOf(atomId);
    state.path = idx >= 0 ? state.path.slice(0, idx + 1) : [atomId];
  }

  renderBreadcrumb(state);

  tree.textContent = `Tracing ${atomId}…`;
  linksEl.innerHTML = "";

  const atom = atomsResult.atoms?.find((a) => (a.atomDid || a.atomId || a.id || a.did) === atomId);
  const graph = await traverseAtomGraph(config, atomId, MAX_TRACE_HOPS);
  let traceResult = null;

  if (graph.nodes.length === 1 && graph.nodes[0].status === "error" && !config.useFixture) {
    traceResult = await fetchAtomTrace(config, atomId);
    tree.textContent = formatSingleTrace(traceResult);
    renderXrefLinks(linksEl, traceResult.trace, (nextId) => void followAtomTrace(state, nextId, { append: true }));
  } else {
    tree.textContent = formatGraphTrace(graph);
    traceResult = graph.nodes.find((n) => n.atomDid === atomId);
    const leaf = graph.nodes[graph.nodes.length - 1];
    if (leaf?.trace) renderXrefLinks(linksEl, leaf.trace, (nextId) => void followAtomTrace(state, nextId, { append: true }));
  }

  if (atom || traceResult) {
    await renderAtomInspector(inspectorEl, {
      atom: atom || { atomDid: atomId, entityId: atomId },
      trace: traceResult?.trace || traceResult,
      config,
    });
  }
}

function renderBreadcrumb(state) {
  const { breadcrumbEl, path } = state;
  if (!breadcrumbEl) return;
  if (!path.length) {
    breadcrumbEl.hidden = true;
    return;
  }
  breadcrumbEl.hidden = false;
  breadcrumbEl.innerHTML = path
    .map(
      (id, i) =>
        `<button type="button" class="crumb-link" data-crumb-idx="${i}">${escapeHtml(id.slice(0, 24))}${id.length > 24 ? "…" : ""}</button>`,
    )
    .join(" → ");

  breadcrumbEl.querySelectorAll(".crumb-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.crumbIdx);
      const target = path[idx];
      state.path = path.slice(0, idx + 1);
      void followAtomTrace(state, target, { append: false });
    });
  });
}

function renderXrefLinks(container, trace, onFollow) {
  if (!trace || !container) return;
  const edges = [
    ...(trace.outbound || []).map((e) => ({ ...e, dir: "out" })),
    ...(trace.inbound || []).map((e) => ({ ...e, dir: "in" })),
    ...(trace.citations || []).map((e) => ({ ...e, dir: "cite" })),
  ];
  if (!edges.length) {
    container.innerHTML = `<p class="muted">No cross-references on this atom</p>`;
    return;
  }
  container.innerHTML = `<ul class="xref-link-list">${edges
    .map((e) => {
      const next =
        e.atomDid ||
        e.targetAtomDid ||
        e.crossReferenceDid ||
        e.atom?.atomDid ||
        e.atom?.did;
      if (!next) return "";
      return `<li><button type="button" class="xref-follow" data-next="${escapeAttr(next)}">${escapeHtml(e.dir)} → ${escapeHtml(next)}</button></li>`;
    })
    .join("")}</ul>`;
  container.querySelectorAll(".xref-follow").forEach((btn) => {
    btn.addEventListener("click", () => onFollow(btn.dataset.next));
  });
}

function groupAtomsByFamily(atoms) {
  const groups = {};
  for (const atom of atoms) {
    const family = atom.family || atom.entityType || atom.type || "unknown";
    if (!groups[family]) groups[family] = [];
    groups[family].push(atom);
  }
  return groups;
}

function formatConfidenceDisplay(atom) {
  const rc = formatAtomReadContract(atom);
  if (rc.includes("n=") && rc.includes("width=")) return rc;
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

function formatSingleTrace(result) {
  if (result.status !== "ok") {
    return `Trace error: ${result.message}\nSet retrieval API URL (?retrieval=http://127.0.0.1:8080)`;
  }
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
  if (graph.truncated) {
    lines.push(`\n… truncated at ${MAX_TRACE_HOPS} nodes (cycle guard + hop cap)`);
  }
  lines.push(`\nvisited: ${graph.visitedCount} unique atoms`);
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
