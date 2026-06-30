/** E5 — Run monitor (30s poll of warming/QA run state). */

import { fetchRunMonitor } from "../api/spine-api.js";
import { updateFilesRailSection } from "./files-rail.js";

let pollTimer = null;

export async function renderRunMonitor(container, config) {
  const result = await fetchRunMonitor(config);
  paintRunMonitor(container, result);
  updateRunsRail(result);
  return result;
}

export function startRunMonitorPolling(container, config, intervalMs = 30_000) {
  stopRunMonitorPolling();
  pollTimer = setInterval(() => {
    void renderRunMonitor(container, config);
  }, intervalMs);
}

export function stopRunMonitorPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function paintRunMonitor(container, result) {
  const hasLive =
    result.status === "ok" &&
    (result.parcelsWarmed != null ||
      result.computeCostUsd != null ||
      result.adapterFailures != null);

  if (!hasLive) {
    container.innerHTML = `
      <header class="panel-head">E5 Run monitor</header>
      <div class="empty-state empty-state--empty">
        <strong>Warming run not started</strong>
        <p>${escapeHtml(result.message)}</p>
        <ul class="metric-list">
          <li>Parcels warmed: <em>no data</em></li>
          <li>Coverage holes: <em>no data</em></li>
          <li>Adapter failures: <em>no data</em></li>
          <li>Contested ground: <em>no data</em></li>
          <li>Triage counts: <em>no data</em></li>
          <li>Compute cost vs budget: <em>no data</em></li>
        </ul>
        ${
          result.attempts?.length
            ? `<details><summary>Endpoint attempts</summary><pre class="mono">${escapeHtml(JSON.stringify(result.attempts, null, 2))}</pre></details>`
            : ""
        }
      </div>
      <p class="hint muted">Polling every 30s — last check ${new Date().toLocaleTimeString()}</p>
    `;
    return;
  }

  const warmedLabel =
    result.parcelsWarmed != null
      ? `${formatNumber(result.parcelsWarmed)}${result.parcelsWarmedPct != null ? ` (${result.parcelsWarmedPct}%)` : ""}${result.parcelsTracked != null ? ` of ${formatNumber(result.parcelsTracked)}` : ""}`
      : "no data";

  container.innerHTML = `
    <header class="panel-head">E5 Run monitor <span class="badge">${escapeHtml(result.runId || "live")}</span></header>
    <p class="panel-meta mono">${escapeHtml(result.source || "—")}</p>
    <ul class="metric-list metric-list--live">
      <li>Parcels warmed: <strong>${warmedLabel}</strong></li>
      <li>Coverage holes: ${renderMetricBlock(result.coverageHoles)}</li>
      <li>Adapter failures: ${renderFailures(result.adapterFailures)}</li>
      <li>Contested ground: ${renderMetricBlock(result.contestedGround)}</li>
      <li>Triage counts: ${renderMetricBlock(result.triageCounts)}</li>
      <li>Compute cost vs budget: ${renderCost(result.computeCostUsd, result.computeBudgetUsd)}</li>
    </ul>
    ${renderRecentRuns(result.recentRuns)}
    <p class="hint muted">Polling every 30s — last check ${new Date().toLocaleTimeString()}</p>
  `;
}

function updateRunsRail(result) {
  const summary =
    result.status === "ok" && result.parcelsWarmed != null
      ? `<p><strong>${formatNumber(result.parcelsWarmed)}</strong> warmed</p>`
      : `<p class="muted">No active run</p>`;
  const history = (result.recentRuns || [])
    .slice(0, 8)
    .map(
      (r) =>
        `<li><code>${escapeHtml(r.id || r.runId || "run")}</code> ${escapeHtml(r.status || r.outcome || "—")}</li>`,
    )
    .join("");
  updateFilesRailSection(
    "runs",
    `${summary}<ul class="rail-run-log">${history || "<li class='muted'>No recent runs</li>"}</ul>`,
  );
}

function renderMetricBlock(val) {
  if (val == null) return "<em>no data</em>";
  if (typeof val === "number") return `<strong>${formatNumber(val)}</strong>`;
  if (Array.isArray(val)) return `<strong>${val.length}</strong> entries`;
  if (typeof val === "object") {
    const entries = Object.entries(val);
    if (!entries.length) return "<em>no data</em>";
    return `<ul class="metric-sub">${entries.map(([k, v]) => `<li>${escapeHtml(k)}: <strong>${formatNumber(v)}</strong></li>`).join("")}</ul>`;
  }
  return `<strong>${escapeHtml(String(val))}</strong>`;
}

function renderFailures(failures) {
  if (failures == null) return "<em>no data</em>";
  const list = Array.isArray(failures) ? failures : Object.entries(failures || {}).map(([adapter, info]) => ({ adapter, ...info }));
  if (!list.length) return "<strong>0</strong> (none reported)";
  return `<ul class="metric-sub metric-sub--fail">${list
    .map(
      (f) =>
        `<li class="fail-row"><code>${escapeHtml(f.adapter || f.jurisdiction || f.name || "adapter")}</code> — ${escapeHtml(f.error || f.message || f.count || "failed")}</li>`,
    )
    .join("")}</ul>`;
}

function renderCost(cost, budget) {
  if (cost == null && budget == null) return "<em>no data</em>";
  const costStr = cost != null ? formatUsd(cost) : "—";
  const budgetStr = budget != null ? formatUsd(budget) : "—";
  const pct = cost != null && budget != null && budget > 0 ? ` (${Math.round((cost / budget) * 1000) / 10}%)` : "";
  return `<strong>${costStr}</strong> / ${budgetStr}${pct}`;
}

function renderRecentRuns(runs) {
  if (!runs?.length) return "";
  return `
    <details open>
      <summary>Recent runs (${runs.length})</summary>
      <ul class="metric-sub">${runs
        .slice(0, 12)
        .map(
          (r) =>
            `<li><code>${escapeHtml(r.id || r.runId || "—")}</code> ${escapeHtml(r.status || r.startedAt || "")}</li>`,
        )
        .join("")}</ul>
    </details>
  `;
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString("en-US");
}

function formatUsd(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
