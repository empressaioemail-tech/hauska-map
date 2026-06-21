/**
 * End-state E — Spine console shell (Wave 1)
 * All-white, function-only localhost dashboard.
 */

import { loadConfig } from "./config.js";
import { createMapRenderer, RENDERER_CONTRACT } from "./renderer/map-renderer.js";
import { DEFAULT_VISIBLE_LAYERS } from "./renderer/layer-registry.js";
import { createFloatingWindow } from "./window-manager/floating-window.js";
import { renderFilesRail } from "./panels/files-rail.js";
import { renderLegendRail } from "./panels/legend-rail.js";
import { renderMcpInspector } from "./panels/mcp-inspector.js";
import { renderAtomBrowser } from "./panels/atom-browser.js";
import { renderLayerRegistryView } from "./panels/layer-registry-view.js";
import { renderCalibrationTracker } from "./panels/calibration-tracker.js";
import { renderRunMonitor } from "./panels/run-monitor.js";
import { renderParcelTrace, openParcelTrace } from "./panels/parcel-trace.js";
import { resolveParcel } from "./api/spine-api.js";

const config = loadConfig();
let visibleLayers = new Set(DEFAULT_VISIBLE_LAYERS);
let parcelCtx = null;

const app = document.getElementById("app");
app.innerHTML = `
  <div class="spine-console">
    <header class="spine-topbar">
      <h1>Hauska Spine Console</h1>
      <span class="spine-tag">Wave 1 · function-only · fixture=${config.useFixture ? "1" : "0"}</span>
      <nav class="spine-tabs" role="tablist">
        <button type="button" class="tab active" data-panel="e7">E7 Parcel</button>
        <button type="button" class="tab" data-panel="e1">E1 MCP</button>
        <button type="button" class="tab" data-panel="e2">E2 Atoms</button>
        <button type="button" class="tab" data-panel="e3">E3 Layers</button>
        <button type="button" class="tab" data-panel="e4">E4 Calibration</button>
        <button type="button" class="tab" data-panel="e5">E5 Runs</button>
      </nav>
    </header>
    <aside class="spine-rail spine-rail--left" id="rail-left"></aside>
    <main class="spine-center">
      <section class="spine-panel" id="panel-e7"></section>
      <section class="spine-panel hidden" id="panel-e1"></section>
      <section class="spine-panel hidden" id="panel-e2"></section>
      <section class="spine-panel hidden" id="panel-e3"></section>
      <section class="spine-panel hidden" id="panel-e4"></section>
      <section class="spine-panel hidden" id="panel-e5"></section>
    </main>
    <aside class="spine-rail spine-rail--right" id="rail-right"></aside>
    <div class="spine-map-host" id="map-window">
      <div class="fw-titlebar" id="map-titlebar">
        <span class="fw-title">E6 Floating map</span>
        <div class="fw-controls">
          <button type="button" data-fw="float" title="Float">□</button>
          <button type="button" data-fw="snap" title="Snap">▐</button>
          <button type="button" data-fw="min" title="Minimize">_</button>
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

renderFilesRail(document.getElementById("rail-left"));
renderLegendRail(document.getElementById("rail-right"), visibleLayers);

const renderer = createMapRenderer();
const mapSlot = document.getElementById("map-slot");
const mapContent = document.getElementById("map-content");
renderer.mount(mapSlot);
renderer.bindContext({
  center: config.defaultCenter,
  address: config.defaultAddress,
  useFixture: config.useFixture,
  onParcelSelect: (sel) => {
    parcelCtx = {
      ...sel,
      coords: config.defaultCenter,
    };
    void openParcelTrace(document.getElementById("panel-e7"), config, parcelCtx);
    void renderAtomBrowser(document.getElementById("panel-e2"), config, parcelCtx);
    showPanel("e7");
  },
});

const mapWindow = createFloatingWindow({
  host: document.getElementById("map-window"),
  titleBar: document.getElementById("map-titlebar"),
  content: mapContent,
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
void renderLayerRegistryView(document.getElementById("panel-e3"), config);
void renderCalibrationTracker(document.getElementById("panel-e4"), config);
void renderRunMonitor(document.getElementById("panel-e5"), config);

void resolveParcel(config, config.defaultCenter, config.defaultAddress).then((r) => {
  console.info("[spine-console] parcel resolve:", r);
});

window.__HAUSKA_SPINE_CONSOLE__ = {
  config,
  renderer,
  mapWindow,
  RENDERER_CONTRACT,
  visibleLayers,
};

console.info("[spine-console] V1 contract:", RENDERER_CONTRACT);
