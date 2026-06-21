/** E1 — MCP inspector via M /admin/introspection (live tool count). */

import { fetchMcpIntrospection } from "../api/spine-api.js";
import { mcpAdminBase } from "../config.js";

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
    return result;
  }

  const rows = result.tools
    .map((t) => {
      const gate = t.gate_summary || t.gate || t.product || "—";
      const product = t.product || "—";
      return (
        `<tr>` +
        `<td><code>${escapeHtml(t.name)}</code></td>` +
        `<td>${escapeHtml(t.description?.slice(0, 100) || "")}</td>` +
        `<td>${escapeHtml(String(product))}</td>` +
        `<td>${escapeHtml(String(gate))}</td>` +
        `</tr>`
      );
    })
    .join("");

  container.innerHTML = `
    <header class="panel-head">E1 MCP inspector <span class="badge">${result.count} tools</span></header>
    <p class="panel-meta mono">Live count from M introspection — not pinned</p>
    <p class="panel-meta mono">${escapeHtml(result.source)}</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Tool</th><th>Description</th><th>Product</th><th>Gating</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  return result;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
