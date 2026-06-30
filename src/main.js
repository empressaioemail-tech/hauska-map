/**
 * End-state E — Spine console (Wave 2)
 * V3 registry · V4 read-contract · V5 reasoning layers · live MCP + atom trace.
 */

import { loadConfig } from "./config.js";
import { createMapRenderer, RENDERER_CONTRACT } from "./renderer/map-renderer.js";
import { visibleLayersForAllocation } from "./renderer/layer-registry.js";
import { createFloatingWindow } from "./window-manager/floating-window.js";
import { renderFilesRail } from "./panels/files-rail.js";
import { renderLegendRail, refreshLegendRail } from "./panels/legend-rail.js";
import { renderMcpInspector } from "./panels/mcp-inspector.js";
import { renderAtomBrowser } from "./panels/atom-browser.js";
import { renderLayerRegistryView } from "./panels/layer-registry-view.js";
import { renderCalibrationTracker } from "./panels/calibration-tracker.js";
import { renderRunMonitor, startRunMonitorPolling } from "./panels/run-monitor.js";
import { renderParcelTrace, openParcelTrace } from "./panels/parcel-trace.js";
import { renderAuthBar } from "./panels/auth-bar.js";
import { renderAgentView } from "./panels/agent-view.js";
import { resolveParcel } from "./api/spine-api.js";
import { probeInputGates, reasoningLayerLive } from "./lib/input-gates.js";
import { POSITIONING_FOOTER, POSITIONING_TAGLINE } from "./copy/positioning.js";
import {
  resolveReportLayerManifest,
  visibleLayersFromManifest,
} from "./renderer/report-layer-manifest.js";

let config = loadConfig();
let visibleLayers = resolveVisibleLayers(config);
let inputGates = probeInputGates(config);
let parcelCtx = null;

function resolveVisibleLayers(cfg) {
  const manifest = resolveReportLayerManifest({
    appId: cfg.appId,
    reportType: cfg.reportType,
  });
  if (manifest) {
    return visibleLayersFromManifest(manifest);
  }
  return visibleLayersForAllocation(cfg.appId, cfg.reportType, cfg.packageTier);
}

const app = document.getElementById("app");
app.innerHTML = `
  <div class="spine-console">
    <header class="spine-topbar">
      <h1>Hauska Spine Console</h1>
      <span class="spine-tag">Wave 2 · ${POSITIONING_TAGLINE.slice(0, 48)}… · fixture=${config.useFixture ? "1" : "0"}</span>
      <div id="auth-bar-host"></div>
      <nav class="spine-tabs" role="tablist">
        <button type="button" class="tab active" data-panel="e7">E7 Parcel</button>
        <button type="button" class="tab" data-panel="e1">E1 MCP</button>
        <button type="button" class="tab" data-panel="e2">E2 Atoms</button>
        <button type="button" class="tab" data-panel="e3">E3 Layers</button>
        <button type="button" class="tab" data-panel="e4">E4 Calibration</button>
        <button type="button" class="tab" data-panel="e5">E5 Runs</button>
        <button type="button" class="tab" data-panel="e8">E8 Agent</button>
      </nav>
      <div id="map-dock-host" class="map-dock-host"></div>
    </header>
    <aside class="spine-rail spine-rail--left" id="rail-left"></aside>
    <main class="spine-center">
      <section class="spine-panel" id="panel-e7"></section>
      <section class="spine-panel hidden" id="panel-e1"></section>
      <section class="spine-panel hidden" id="panel-e2"></section>
      <section class="spine-panel hidden" id="panel-e3"></section>
      <section class="spine-panel hidden" id="panel-e4"></section>
      <section class="spine-panel hidden" id="panel-e5"></section>
      <section class="spine-panel hidden" id="panel-e8"></section>
    </main>
    <aside class="spine-rail spine-rail--right" id="rail-right"></aside>
    <footer class="spine-footer" id="spine-footer">${POSITIONING_FOOTER}</footer>
    <div class="spine-map-host" id="map-window">
      <div class="fw-titlebar" id="map-titlebar">
        <span class="fw-title">E6 Floating map</span>
        <div class="fw-controls">
          <button type="button" data-fw="float" title="Float">□</button>
          <button type="button" data-fw="snap" title="Snap">▐</button>
          <button type="button" data-fw="min" title="Minimize">_</button>
          <button type="button" data-fw="dock" title="Dock to header">⊟</button>
          <button type="button" data-fw="restore" title="Restore map" hidden>↩</button>
          <button type="button" data-fw="max" title="Maximize">⛶</button>
          <button type="button" data-fw="close" title="Close">×</button>
        </div>
      </div>
      <div class="fw-content" id="map-content">
        <div class="spine-map-canvas-host" id="map-slot"></div>
      </div>
    </div>
  </div>
`;

function applyReasoningVisibility() {
  for (const key of ["consequence-choropleth", "contested-ground", "triage-state"]) {
    if (reasoningLayerLive(key, inputGates)) {
      visibleLayers.add(key);
    } else {
      visibleLayers.delete(key);
    }
  }
}
applyReasoningVisibility();

function onRegistryChange() {
  refreshLegendRail(document.getElementById("rail-right"), visibleLayers, inputGates);
}

function refreshAllPanels() {
  config = loadConfig();
  visibleLayers = resolveVisibleLayers(config);
  applyReasoningVisibility();
  refreshLegendRail(document.getElementById("rail-right"), visibleLayers, inputGates);
  renderer.setLayerVisibility(visibleLayers);
  void renderMcpInspector(document.getElementById("panel-e1"), config);
  void renderAtomBrowser(document.getElementById("panel-e2"), config, parcelCtx);
  void renderLayerRegistryView(document.getElementById("panel-e3"), config, inputGates, onRegistryChange);
  void renderAgentView(document.getElementById("panel-e8"), config);
  if (parcelCtx) void openParcelTrace(document.getElementById("panel-e7"), config, parcelCtx);
}

renderAuthBar(document.getElementById("auth-bar-host"), config, {
  onSave: () => {
    location.reload();
  },
});

renderFilesRail(document.getElementById("rail-left"));
renderLegendRail(document.getElementById("rail-right"), visibleLayers, inputGates);

const renderer = createMapRenderer();
const mapSlot = document.getElementById("map-slot");
const mapContent = document.getElementById("map-content");
renderer.mount(mapSlot);
renderer.setLayerVisibility(visibleLayers);
renderer.bindContext({
  center: config.defaultCenter,
  address: config.defaultAddress,
  useFixture: config.useFixture,
  onParcelSelect: (sel) => {
    parcelCtx = {
      ...sel,
      coords: config.defaultCenter,
      address: sel.address || config.defaultAddress,
    };
    void openParcelTrace(document.getElementById("panel-e7"), config, parcelCtx).then((r) => {
      if (r?.inputGates) {
        inputGates = r.inputGates;
        applyReasoningVisibility();
        renderer.setLayerVisibility(visibleLayers);
        refreshLegendRail(document.getElementById("rail-right"), visibleLayers, inputGates);
      }
    });
    void renderAtomBrowser(document.getElementById("panel-e2"), config, parcelCtx);
    showPanel("e7");
  },
});

const mapWindow = createFloatingWindow({
  host: document.getElementById("map-window"),
  titleBar: document.getElementById("map-titlebar"),
  content: mapContent,
  headerDockHost: document.getElementById("map-dock-host"),
  captureViewState: () => renderer.getViewState(),
  restoreViewState: (vs) => renderer.setViewState(vs),
  onResize: () => renderer.resize(),
});

document.getElementById("map-titlebar").querySelectorAll("[data-fw]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.fw;
    if (action === "float") mapWindow.float();
    else if (action === "snap") mapWindow.snap("right");
    else if (action === "min") mapWindow.minimize();
    else if (action === "dock") mapWindow.dockToHeader();
    else if (action === "restore") mapWindow.restoreFromHeader();
    else if (action === "max") mapWindow.maximize();
    else if (action === "close") mapWindow.close();
    renderer.resize();
  });
});

function showPanel(id) {
  document.querySelectorAll(".spine-panel").forEach((p) => p.classList.add("hidden"));
  document.getElementById(`panel-${id}`)?.classList.remove("hidden");
  document.querySelectorAll(".spine-tabs .tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.panel === id);
  });
}

document.querySelectorAll(".spine-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => showPanel(tab.dataset.panel));
});

renderParcelTrace(document.getElementById("panel-e7"));
void renderMcpInspector(document.getElementById("panel-e1"), config);
void renderAtomBrowser(document.getElementById("panel-e2"), config, null);
void renderLayerRegistryView(document.getElementById("panel-e3"), config, inputGates, onRegistryChange);
void renderCalibrationTracker(document.getElementById("panel-e4"), config);
void renderRunMonitor(document.getElementById("panel-e5"), config);
startRunMonitorPolling(document.getElementById("panel-e5"), config);
void renderAgentView(document.getElementById("panel-e8"), config);

void resolveParcel(config, config.defaultCenter, config.defaultAddress).then((r) => {
  if (r.inputGates) {
    inputGates = r.inputGates;
    applyReasoningVisibility();
    renderer.setLayerVisibility(visibleLayers);
    refreshLegendRail(document.getElementById("rail-right"), visibleLayers, inputGates);
  }
  console.info("[spine-console] parcel resolve:", r);
});

window.__HAUSKA_SPINE_CONSOLE__ = {
  config,
  renderer,
  mapWindow,
  RENDERER_CONTRACT,
  visibleLayers,
  inputGates,
  refreshAllPanels,
  resolveReportLayerManifest,
  resolveVisibleLayers,
};

console.info("[spine-console] V1 contract:", RENDERER_CONTRACT);
console.info("[spine-console] positioning:", POSITIONING_FOOTER);
