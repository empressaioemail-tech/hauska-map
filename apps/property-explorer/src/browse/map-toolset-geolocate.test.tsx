// Toolset geolocate + parcel-row label tests (map polish, 2026-07-29).
//
// Static render via react-dom/server (same pattern as InspectCard.test.tsx —
// node env, no effects run). Pins:
//   1. The "My location" button lives IN the toolset Tools row (the
//      GeolocateControl is hidden on the map; no floating GPS button), with
//      aria-pressed reflecting track state.
//   2. MapToolset source no longer adds the GeolocateControl as a visible
//      corner control ("bottom-right" floating button removed).
//   3. The layer row label for parcel-polygon is "GIS Parcel Boundary" and the
//      persistent not-survey-grade caption is gone from the parcel row
//      (operator-ratified: disclosure lives on the site-plan export).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import {
  MapToolset,
  ToolsetToolsSection,
  leftUtilityMaxHeight,
  nextOpenLeftKinds,
} from "./MapToolset";
import { nextOpenToolIds } from "../workbench/Workbench";
import { LAYER_REGISTRY } from "../../../../packages/map-renderer/src/layer-registry.js";
import type { FloatingMapHandle, LayerKey } from "@hauska/map-renderer";

const noop = () => {};

function renderTools(tracking: boolean): string {
  return renderToStaticMarkup(
    <ToolsetToolsSection
      active={null}
      measureMode="line"
      readout={null}
      tracking={tracking}
      onActivate={noop}
      onClear={noop}
      onSetMeasureMode={noop}
      onLocate={noop}
    />,
  );
}

describe("toolset Tools row — My location button (geolocate lives in the panel)", () => {
  it("renders the My location button alongside the other tools", () => {
    const html = renderTools(false);
    expect(html).toContain('data-testid="map-toolset-locate"');
    expect(html).toContain('aria-label="My location"');
    // Still a full tools row.
    expect(html).toContain('aria-label="Measure distance or area"');
    expect(html).toContain('aria-label="Drop a marker"');
  });

  it("aria-pressed follows the tracking state", () => {
    expect(renderTools(false)).toMatch(
      /data-testid="map-toolset-locate"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-testid="map-toolset-locate"/,
    );
    expect(renderTools(true)).toMatch(
      /data-testid="map-toolset-locate"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-testid="map-toolset-locate"/,
    );
  });
});

describe("no floating GPS button — GeolocateControl is mounted hidden", () => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../../../packages/map-renderer/src/chrome/MapToolset.tsx",
    ),
    "utf8",
  );

  it("MapToolset never adds the GeolocateControl to a map corner", () => {
    expect(source).not.toMatch(/addControl\(\s*geolocate/);
    expect(source).not.toContain('"bottom-right"');
  });

  it("the hidden control is driven by trigger() from the panel button", () => {
    expect(source).toMatch(/geolocateRef\.current\?\.trigger\(\)/);
    expect(source).toMatch(/display = "none"/);
  });
});

describe("satellite / aerial toggle — lives in LAYERS, not TOOLS", () => {
  it("the Tools section no longer renders the satellite checkbox", () => {
    const html = renderTools(false);
    expect(html).not.toContain("Satellite / aerial");
  });

  it("MapToolset renders Satellite / aerial as the FIRST row of the Layers section", () => {
    const mapRef = createRef<FloatingMapHandle>();
    const known = new Set<LayerKey>(["parcel-polygon" as LayerKey]);
    const html = renderToStaticMarkup(
      <MapToolset
        mapRef={mapRef}
        known={known}
        visible={new Set<LayerKey>(known)}
        onLayersChange={noop}
        layerStates={{}}
      />,
    );
    const layersAt = html.indexOf('data-testid="map-toolset-layers"');
    const satelliteAt = html.indexOf('data-testid="map-toolset-satellite"');
    const parcelRowAt = html.indexOf("GIS Parcel Boundary");
    expect(layersAt).toBeGreaterThan(-1);
    // Satellite row sits INSIDE the layers section, before the layer rows.
    expect(satelliteAt).toBeGreaterThan(layersAt);
    expect(parcelRowAt).toBeGreaterThan(satelliteAt);
    expect(html).toContain("Satellite / aerial");
  });

  it("does NOT render a standing 'Imagery: Esri…' attribution strip even with satellite ON by default", () => {
    // Regression: PE lands with defaultSatellite=true. The Esri credit used to
    // render as an always-visible chip above the bubble, producing a dark strip
    // that collided with the ⓘ / layers cluster. The credit now lives collapse-
    // only inside MapSourceInfo's ⓘ panel — MapToolset must render NONE of it.
    const mapRef = createRef<FloatingMapHandle>();
    const known = new Set<LayerKey>(["parcel-polygon" as LayerKey]);
    const html = renderToStaticMarkup(
      <MapToolset
        mapRef={mapRef}
        known={known}
        visible={new Set<LayerKey>(known)}
        onLayersChange={noop}
        layerStates={{}}
        defaultSatellite
      />,
    );
    expect(html).not.toContain("Imagery: Esri");
    expect(html).not.toContain("Earthstar Geographics");
  });
});

describe("parcel layer row — GIS Parcel Boundary, no persistent disclaimer", () => {
  it('registry labels parcel-polygon as "GIS Parcel Boundary"', () => {
    const entry = (LAYER_REGISTRY as Array<{ key: string; label: string }>).find(
      (l) => l.key === "parcel-polygon",
    );
    expect(entry?.label).toBe("GIS Parcel Boundary");
  });

  it("toolset layer list renders the new label with NO badge/caption when no layerStates entry is passed", () => {
    const mapRef = createRef<FloatingMapHandle>();
    const known = new Set<LayerKey>(["parcel-polygon" as LayerKey]);
    const html = renderToStaticMarkup(
      <MapToolset
        mapRef={mapRef}
        known={known}
        visible={new Set<LayerKey>(known)}
        onLayersChange={noop}
        layerStates={{}}
      />,
    );
    expect(html).toContain("GIS Parcel Boundary");
    expect(html).not.toContain("Parcel boundary<");
    expect(html).not.toContain("not survey grade");
    expect(html).not.toContain('data-testid="layer-state-parcel-polygon"');
  });

  it("ExplorerMap no longer pins the persistent attribution/not-survey-grade badge on the parcel row", () => {
    const explorer = readFileSync(resolve(__dirname, "ExplorerMap.tsx"), "utf8");
    // Live-health badges stay…
    expect(explorer).toMatch(/Parcels failed/);
    expect(explorer).toMatch(/No parcel coverage here/);
    // …but the always-on attribution badge is gone: `attribution` is never
    // written into layerStates for the parcel row.
    expect(explorer).not.toMatch(/layerStates\[[^\]]*parcel-polygon[^\]]*\]\s*=\s*\{[^}]*note:\s*attribution/s);
  });
});

describe("left map-utility stack", () => {
  it("splitBubbles + left anchor renders draw + layers bubbles", () => {
    const mapRef = createRef<FloatingMapHandle>();
    const known = new Set<LayerKey>(["parcel-polygon" as LayerKey]);
    const html = renderToStaticMarkup(
      <MapToolset
        mapRef={mapRef}
        known={known}
        visible={new Set<LayerKey>(known)}
        onLayersChange={noop}
        layerStates={{}}
        anchor="left"
        splitBubbles
      />,
    );
    expect(html).toContain('data-anchor="left"');
    expect(html).toContain('data-testid="map-toolset-draw-bubble"');
    expect(html).toContain('data-testid="map-toolset-bubble"');
  });

  it("left utilities can be multi-open independently", () => {
    expect(nextOpenLeftKinds(["tools"], "layers")).toEqual(["tools", "layers"]);
    expect(nextOpenToolIds(["tools"], "layers")).toEqual(["tools", "layers"]);
    const mapRef = createRef<FloatingMapHandle>();
    const known = new Set<LayerKey>(["parcel-polygon" as LayerKey]);
    const html = renderToStaticMarkup(
      <MapToolset
        mapRef={mapRef}
        known={known}
        visible={new Set<LayerKey>(known)}
        onLayersChange={noop}
        layerStates={{}}
        anchor="left"
        splitBubbles
        initialOpenKinds={["tools", "layers"]}
      />,
    );
    expect(html).toContain('data-testid="map-toolset-draw-panel"');
    expect(html).toContain('data-testid="map-toolset-layers-panel"');
    expect(html).toContain('data-testid="map-toolset-collapse-all"');
    expect(html).toContain('data-testid="map-toolset-layers"');
  });

  it("ExplorerMap no longer stacks workbench docks on the left", () => {
    const explorer = readFileSync(resolve(__dirname, "ExplorerMap.tsx"), "utf8");
    expect(explorer).not.toMatch(/dockSide="left"/);
    expect(explorer).not.toMatch(/openToolIds=\{openWorkbenchTools\}/);
    expect(explorer).toMatch(/openToolId=\{openWorkbenchTool\}/);
  });

  it("one open panel uses the column; two share height", () => {
    expect(leftUtilityMaxHeight(1)).toBe("min(56vh, calc(100vh - 168px))");
    expect(leftUtilityMaxHeight(2)).toBe("min(36vh, calc((100vh - 176px) / 2))");
    expect(leftUtilityMaxHeight(1)).not.toBe(leftUtilityMaxHeight(2));
  });
});
