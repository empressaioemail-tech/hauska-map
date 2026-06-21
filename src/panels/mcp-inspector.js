/** E1 — MCP inspector */

import { fetchMcpTools } from "../api/spine-api.js";

export async function renderMcpInspector(container, config) {
  container.innerHTML = `<div class="panel-loading">Loading MCP tools…</div>`;
  const result = await fetchMcpTools(config);

  if (result.status === "empty" || result.status === "error") {
    container.innerHTML = `
      <header class="panel-head">E1 MCP inspector</header>
      <div class="empty-state empty-state--${result.status}">
        <strong>${result.status === "error" ? "MCP unreachable" : "No MCP server"}</strong>
        <p>${result.message}</p>
        <p class="mono">Source: ${result.source || config.mcpUrl}</p>
        <p class="hint">Start local MCP: <code>npx @hauska/mcp-server</code> or set ?mcp= URL param</p>
      </div>
    `;
    return result;
  }

  const rows = result.tools
    .map(
      (t) =>
        `<tr>` +
        `<td><code>${escapeHtml(t.name)}</code></td>` +
        `<td>${escapeHtml(t.description?.slice(0, 120) || "")}</td>` +
        `<td>${t.inputSchema ? "schema" : "—"}</td>` +
        `</tr>`,
    )
    .join("");

  container.innerHTML = `
    <header class="panel-head">E1 MCP inspector <span class="badge">${result.count} tools</span></header>
    <p class="panel-meta mono">${result.source}</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Tool</th><th>Description</th><th>Input</th></tr></thead>
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
    .replace(/>/g, "&gt;");
}
