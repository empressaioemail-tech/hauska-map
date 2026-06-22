/** E8 — Agent View: third-party agent surface (catalog, discoverability docs, test harness). */

import {
  fetchMcpIntrospection,
  fetchAgentDiscoverabilityDocs,
  callMcpIntrospectionTool,
} from "../api/spine-api.js";
import { mcpAdminBase } from "../config.js";

const PRODUCTS = ["public", "codex", "reporting", "map"];
const TIERS = ["free_anonymous", "free", "pro", "max"];

export async function renderAgentView(container, config) {
  container.innerHTML = `<div class="panel-loading">Loading agent surface…</div>`;

  const [intro, docs] = await Promise.all([
    fetchMcpIntrospection(config),
    fetchAgentDiscoverabilityDocs(config),
  ]);

  const tools = intro.tools || [];
  const productCounts = intro.by_product || {};

  container.innerHTML = `
    <header class="panel-head">E8 Agent View <span class="badge">${tools.length} tools</span></header>
    <p class="panel-meta">Third-party agent surface — what an external operator sees before wiring an agent at us.</p>
    <p class="panel-meta mono">Introspection: ${escapeHtml(intro.source || "—")}</p>

    <section class="agent-section">
      <h4>Tool catalog (product × tier)</h4>
      <div class="agent-filters">
        <label>Product
          <select id="agent-product">
            <option value="">All (${tools.length})</option>
            ${PRODUCTS.map((p) => `<option value="${p}">${p} (${productCounts[p] ?? 0})</option>`).join("")}
          </select>
        </label>
        <label>Tier
          <select id="agent-tier">
            ${TIERS.map((t) => `<option value="${t}"${t === "pro" ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="table-wrap" id="agent-catalog-wrap">
        <table class="data-table" id="agent-catalog">
          <thead><tr><th>Tool</th><th>Product</th><th>Gate</th><th>Anonymous OK</th></tr></thead>
          <tbody id="agent-catalog-body"></tbody>
        </table>
      </div>
    </section>

    <section class="agent-section">
      <h4>Agent discoverability</h4>
      <details open>
        <summary>llms.txt</summary>
        <pre class="mono inspect-pane">${escapeHtml(docs.llms || docs.llmsError || "—")}</pre>
      </details>
      <details>
        <summary>agents.txt (.well-known)</summary>
        <pre class="mono inspect-pane">${escapeHtml(docs.agents || docs.agentsError || "—")}</pre>
      </details>
      <p class="hint">Source: ${escapeHtml(docs.source || "fallback static")}</p>
    </section>

    <section class="agent-section">
      <h4>Human test harness</h4>
      <p class="hint">Pick product + tier, invoke any tool, inspect raw read-contract-shaped response.</p>
      <div class="harness-form">
        <label>Tool
          <select id="harness-tool">
            <option value="">— select tool —</option>
            ${tools.map((t) => `<option value="${escapeAttr(t.name)}">${escapeHtml(t.name)}</option>`).join("")}
          </select>
        </label>
        <label>Arguments (JSON)
          <textarea id="harness-args" class="harness-args mono" rows="4">{}</textarea>
        </label>
        <button type="button" id="harness-call" class="btn-inline">Invoke (call-probe)</button>
      </div>
      <pre class="mono inspect-pane" id="harness-result">—</pre>
    </section>
  `;

  const productSel = container.querySelector("#agent-product");
  const tierSel = container.querySelector("#agent-tier");
  const catalogBody = container.querySelector("#agent-catalog-body");

  function filteredTools() {
    const product = productSel.value;
    const tier = tierSel.value;
    return tools.filter((t) => {
      if (product && t.product !== product) return false;
      if (tier === "free_anonymous" && !t.anonymous_ok) return false;
      return true;
    });
  }

  function renderCatalog() {
    const rows = filteredTools()
      .map(
        (t) =>
          `<tr data-tool="${escapeAttr(t.name)}">` +
          `<td><code>${escapeHtml(t.name)}</code></td>` +
          `<td>${escapeHtml(t.product)}</td>` +
          `<td class="mono">${escapeHtml((t.gate_summary || t.gate || "").slice(0, 80))}</td>` +
          `<td>${t.anonymous_ok ? "yes" : "no"}</td>` +
          `</tr>`,
      )
      .join("");
    catalogBody.innerHTML = rows || `<tr><td colspan="4">No tools match filter</td></tr>`;
    catalogBody.querySelectorAll("tr[data-tool]").forEach((row) => {
      row.addEventListener("click", () => {
        container.querySelector("#harness-tool").value = row.dataset.tool;
      });
    });
  }

  productSel.addEventListener("change", renderCatalog);
  tierSel.addEventListener("change", renderCatalog);
  renderCatalog();

  container.querySelector("#harness-call")?.addEventListener("click", async () => {
    const tool = container.querySelector("#harness-tool").value;
    const resultEl = container.querySelector("#harness-result");
    if (!tool) {
      resultEl.textContent = "Select a tool first";
      return;
    }
    let args = {};
    try {
      args = JSON.parse(container.querySelector("#harness-args").value || "{}");
    } catch (err) {
      resultEl.textContent = `Invalid JSON: ${err.message}`;
      return;
    }
    resultEl.textContent = `Calling ${tool}…`;
    const product = productSel.value || undefined;
    const tier = tierSel.value;
    const outcome = await callMcpIntrospectionTool(config, tool, args, {
      product: product || (tier === "free_anonymous" ? "public" : "reporting"),
      tier,
    });
    resultEl.textContent = JSON.stringify(outcome, null, 2);
  });

  return { intro, docs, adminBase: mcpAdminBase(config) };
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
