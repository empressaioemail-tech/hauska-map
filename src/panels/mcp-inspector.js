/** E1 — MCP inspector: product-gated tool catalog + live call probe. */

import {
  fetchMcpIntrospection,
  fetchMcpToolDetail,
  callMcpIntrospectionTool,
} from "../api/spine-api.js";
import { mcpAdminBase } from "../config.js";
import { updateFilesRailSection } from "./files-rail.js";

const PRODUCTS = ["public", "codex", "reporting", "map"];

export async function renderMcpInspector(container, config) {
  container.innerHTML = `<div class="panel-loading">Loading MCP introspection…</div>`;
  const result = await fetchMcpIntrospection(config);
  const adminUrl = `${mcpAdminBase(config)}/admin/introspection/tools`;

  if (result.status === "empty" || result.status === "error") {
    container.innerHTML = `
      <header class="panel-head">E1 MCP inspector</header>
      <div class="empty-state empty-state--${result.status}">
        <strong>${result.status === "error" ? "Introspection unreachable" : "No tools"}</strong>
        <p>${escapeHtml(result.message)}</p>
        <p class="mono">GET ${escapeHtml(adminUrl)}</p>
        <p class="hint">Start MCP server; set Hauska key if admin routes require bootstrap auth.</p>
        ${result.fallback ? `<p class="hint">Fallback attempted: ${escapeHtml(result.fallback)}</p>` : ""}
      </div>
    `;
    updateFilesRailSection("tools", `<p class="muted">Introspection unavailable</p>`);
    return result;
  }

  const tools = result.tools || [];
  const byProduct = result.by_product || {};
  for (const p of PRODUCTS) {
    if (byProduct[p] == null) byProduct[p] = tools.filter((t) => t.product === p).length;
  }
  const total = result.count ?? tools.length;
  const expectedTotal = 62;
  const countNote =
    total !== expectedTotal
      ? `<p class="panel-meta warn">Expected ${expectedTotal} tools — live count is ${total}</p>`
      : "";

  updateFilesRailSection(
    "tools",
    `<ul class="rail-tool-list">${PRODUCTS.map(
      (p) => `<li><code>${p}</code> <strong>${byProduct[p] ?? 0}</strong></li>`,
    ).join("")}<li class="muted">total ${total}</li></ul>`,
  );

  container.innerHTML = `
    <header class="panel-head">E1 MCP inspector <span class="badge">${total} tools</span></header>
    <p class="panel-meta mono">Live count from M introspection — not pinned</p>
    <p class="panel-meta mono">${escapeHtml(result.source)}</p>
    ${countNote}
    <div class="product-gate-summary">
      ${PRODUCTS.map(
        (p) =>
          `<span class="gate-chip"><code>${p}</code> ${byProduct[p] ?? 0}</span>`,
      ).join("")}
    </div>
    <div class="e1-layout">
      <div class="e1-tool-list-wrap">
        ${PRODUCTS.map((p) => renderProductSection(p, tools.filter((t) => t.product === p))).join("")}
      </div>
      <aside class="e1-call-panel">
        <h4>Live call test</h4>
        <p class="hint">JSON args pass directly to POST /admin/introspection/tools/:name/call (MCP server only — no arbitrary URLs).</p>
        <label>Tool
          <select id="e1-tool-select">
            <option value="">— select —</option>
            ${tools.map((t) => `<option value="${escapeAttr(t.name)}">${escapeHtml(t.name)}</option>`).join("")}
          </select>
        </label>
        <label>Product gate
          <select id="e1-product-select">
            ${PRODUCTS.map((p) => `<option value="${p}">${p}</option>`).join("")}
          </select>
        </label>
        <details id="e1-schema-details" open>
          <summary>Input schema</summary>
          <pre class="mono inspect-pane" id="e1-schema">Select a tool</pre>
        </details>
        <label>Arguments (JSON)
          <textarea id="e1-args" class="harness-args mono" rows="5">{}</textarea>
        </label>
        <button type="button" id="e1-call" class="btn-inline">Call tool</button>
        <pre class="mono inspect-pane" id="e1-result">—</pre>
      </aside>
    </div>
  `;

  const toolSel = container.querySelector("#e1-tool-select");
  const schemaEl = container.querySelector("#e1-schema");
  const resultEl = container.querySelector("#e1-result");

  async function loadSchema(name) {
    if (!name) {
      schemaEl.textContent = "Select a tool";
      return;
    }
    schemaEl.textContent = "Loading schema…";
    const detail = await fetchMcpToolDetail(config, name);
    if (detail.status === "ok" && detail.tool) {
      schemaEl.textContent = JSON.stringify(
        {
          input_schema: detail.tool.input_schema,
          required: detail.tool.required,
          gate: detail.tool.gate,
          product: detail.tool.product,
          anonymous_ok: detail.tool.anonymous_ok,
        },
        null,
        2,
      );
    } else {
      const t = tools.find((x) => x.name === name);
      schemaEl.textContent = t
        ? JSON.stringify({ product: t.product, gate: t.gate_summary || t.gate }, null, 2)
        : detail.message || "Schema unavailable";
    }
  }

  toolSel.addEventListener("change", () => void loadSchema(toolSel.value));

  container.querySelectorAll("[data-e1-tool]").forEach((row) => {
    row.addEventListener("click", () => {
      toolSel.value = row.dataset.e1Tool;
      void loadSchema(toolSel.value);
    });
  });

  container.querySelector("#e1-call")?.addEventListener("click", async () => {
    const tool = toolSel.value;
    if (!tool) {
      resultEl.textContent = "Select a tool first";
      return;
    }
    let args = {};
    try {
      args = JSON.parse(container.querySelector("#e1-args").value || "{}");
    } catch (err) {
      resultEl.textContent = `Invalid JSON: ${err.message}`;
      return;
    }
    resultEl.textContent = `Calling ${tool}…`;
    const product = container.querySelector("#e1-product-select").value;
    const outcome = await callMcpIntrospectionTool(config, tool, args, { product, tier: "pro" });
    resultEl.textContent = JSON.stringify(outcome, null, 2);
  });

  return { ...result, by_product: byProduct, total };
}

function renderProductSection(product, tools) {
  if (!tools.length) {
    return `<section class="e1-product-section"><h4>${product} <span class="badge">0</span></h4><p class="muted">No tools</p></section>`;
  }
  const rows = tools
    .map((t) => {
      const live = t.live_status ?? t.status ?? "registered";
      const gate = t.gate_summary || t.gate || "—";
      return (
        `<tr data-e1-tool="${escapeAttr(t.name)}" class="e1-tool-row" tabindex="0">` +
        `<td><code>${escapeHtml(t.name)}</code></td>` +
        `<td>${escapeHtml((t.description || "").slice(0, 80))}</td>` +
        `<td>${escapeHtml(String(gate))}</td>` +
        `<td>${escapeHtml(String(live))}</td>` +
        `</tr>`
      );
    })
    .join("");
  return `
    <section class="e1-product-section">
      <h4>${product} <span class="badge">${tools.length}</span></h4>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Tool</th><th>Description</th><th>Gate</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
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
