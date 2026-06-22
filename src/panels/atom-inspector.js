/** Atom inspector — renders cc-agent-AC downloadable-atom shape from E2/E7 selections. */

import { assembleDownloadableAtom } from "../lib/assemble-downloadable-atom.js";
import { formatReadContractSummary } from "../read-contract/index.js";
import { fetchAtomExport } from "../api/spine-api.js";

let lastExport = null;

export function getLastDownloadableAtom() {
  return lastExport;
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object} opts.atom — E2 atom row
 * @param {object} [opts.trace] — E7 trace payload
 * @param {object} [opts.config]
 */
export async function renderAtomInspector(container, { atom, trace = null, config = null }) {
  container.hidden = false;
  container.innerHTML = `<div class="panel-loading">Assembling downloadable atom…</div>`;

  let assembled = await assembleDownloadableAtom(atom, trace?.trace || trace);
  let source = assembled.source;

  if (config && assembled.source === "assembled") {
    const gateExport = await fetchAtomExport(config, atom);
    if (gateExport.ok && gateExport.export) {
      assembled = { ok: true, export: gateExport.export, source: "gate" };
      source = "gate";
    }
  }

  if (!assembled.ok || !assembled.export) {
    container.innerHTML = `
      <header class="panel-head">Atom inspector</header>
      <div class="empty-state empty-state--error">
        <strong>Export assembly failed</strong>
        <pre class="mono">${escapeHtml(JSON.stringify(assembled.errors || [], null, 2))}</pre>
      </div>
    `;
    return assembled;
  }

  lastExport = assembled.export;
  const exp = assembled.export;
  const vc = exp.verifyChain || {};
  const vcClass = vc.ok ? "verify--ok" : "verify--fail";

  const identityRows = Object.entries(exp.identity || {})
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd><code>${escapeHtml(String(v ?? "—"))}</code></dd>`)
    .join("");

  const compRows = (exp.compositionReferences || [])
    .map(
      (r) =>
        `<li><code>${escapeHtml(r.entityType)}</code> / <code>${escapeHtml(r.entityId)}</code>${r.displayLabel ? ` — ${escapeHtml(r.displayLabel)}` : ""}</li>`,
    )
    .join("") || "<li class='muted'>—</li>";

  const citeRows = (exp.citations || [])
    .map(
      (c) =>
        `<li><code>${escapeHtml(c.citationDid)}</code>${c.label ? ` — ${escapeHtml(c.label)}` : ""}${c.sourceCitation ? `<br/><span class="mono">${escapeHtml(c.sourceCitation)}</span>` : ""}</li>`,
    )
    .join("") || "<li class='muted'>—</li>";

  const historyCount = exp.signedEventChain?.length ?? 0;
  const historyPreview =
    historyCount > 0
      ? `<pre class="mono inspect-pane">${escapeHtml(JSON.stringify(exp.signedEventChain.slice(0, 3), null, 2))}${historyCount > 3 ? `\n… +${historyCount - 3} more events` : ""}</pre>`
      : `<p class="hint">App-level atom — signed history omitted</p>`;

  container.innerHTML = `
    <header class="panel-head">
      Atom inspector
      <span class="badge">${escapeHtml(source)}</span>
      <button type="button" class="btn-inline" id="atom-download-json">Download JSON</button>
    </header>
    <p class="panel-meta mono">exportVersion=${exp.exportVersion} · exportedAt=${exp.exportedAt} · accessPolicy=${exp.accessPolicy}</p>

    <section class="inspector-section">
      <h4>Identity</h4>
      <dl class="prop-list">${identityRows}</dl>
    </section>

    <section class="inspector-section">
      <h4>Context summary</h4>
      <p><strong>${escapeHtml(exp.contextSummary?.headline || "—")}</strong></p>
      ${exp.contextSummary?.prose ? `<p>${escapeHtml(exp.contextSummary.prose)}</p>` : ""}
      <pre class="mono inspect-pane">${escapeHtml(JSON.stringify(exp.contextSummary?.typedFields || {}, null, 2))}</pre>
    </section>

    <section class="inspector-section">
      <h4>Read-contract (three-axis)</h4>
      <p class="mono read-contract">${escapeHtml(formatReadContractSummary(exp.readContract))}</p>
      <details>
        <summary>Raw read-contract JSON</summary>
        <pre class="mono inspect-pane">${escapeHtml(JSON.stringify(exp.readContract, null, 2))}</pre>
      </details>
    </section>

    <section class="inspector-section">
      <h4>Composition references (${exp.compositionReferences?.length ?? 0})</h4>
      <ul class="trace-list">${compRows}</ul>
    </section>

    <section class="inspector-section">
      <h4>Citations (${exp.citations?.length ?? 0})</h4>
      <ul class="trace-list">${citeRows}</ul>
    </section>

    <section class="inspector-section">
      <h4>Signed history (${historyCount} events)</h4>
      ${historyPreview}
    </section>

    <section class="inspector-section">
      <h4>Verify-chain</h4>
      <p class="verify-result ${vcClass}">
        ${vc.ok ? "✓ Chain verified" : "✗ Chain verification failed"}
        ${vc.errors?.[0]?.message ? ` — ${escapeHtml(vc.errors[0].message)}` : vc.error ? ` — ${escapeHtml(vc.error)}` : ""}
        ${vc.checkedEvents != null ? ` (${vc.checkedEvents} events checked)` : vc.eventCount != null ? ` (${vc.eventCount} events)` : ""}
      </p>
      <pre class="mono inspect-pane">${escapeHtml(JSON.stringify(vc, null, 2))}</pre>
    </section>
  `;

  container.querySelector("#atom-download-json")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exp, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atom-export-${exp.identity.entityId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  return { ...assembled, source };
}

export function clearAtomInspector(container) {
  if (container) {
    container.hidden = true;
    container.innerHTML = "";
  }
  lastExport = null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
