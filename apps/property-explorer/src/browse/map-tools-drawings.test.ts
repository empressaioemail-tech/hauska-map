/**
 * WB6 — the drawings seam on the map-tools controller: getDrawings() captures
 * committed draw shapes + markers + the measure geometry as tagged GeoJSON,
 * and setDossierOverlay() renders/clears the read-only dossier overlay on its
 * OWN source (never the live draw state).
 */

import { describe, expect, it } from "vitest";
import { installMapTools } from "./mapToolsController";
import type { Map as MaplibreMap, MapMouseEvent } from "maplibre-gl";

type Handler = (e: MapMouseEvent) => void;

/** Minimal fake maplibre map: records sources/layers/handlers. */
function fakeMap() {
  const sources = new Map<string, { setData: (d: unknown) => void; data: unknown }>();
  const layers = new Set<string>();
  const handlers = new Map<string, Handler[]>();
  const map = {
    addSource: (id: string) => {
      const src = {
        data: null as unknown,
        setData(d: unknown) {
          src.data = d;
        },
      };
      sources.set(id, src);
    },
    getSource: (id: string) => sources.get(id),
    addLayer: (def: { id: string }) => {
      layers.add(def.id);
    },
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    on: (ev: string, fn: Handler) => {
      handlers.set(ev, [...(handlers.get(ev) ?? []), fn]);
    },
    off: () => {},
    getCanvas: () => ({ style: { cursor: "" } }),
    getContainer: () => ({ appendChild: () => {} }),
    doubleClickZoom: { enable: () => {}, disable: () => {} },
  };
  const fire = (ev: string, lng: number, lat: number) => {
    for (const fn of handlers.get(ev) ?? []) {
      fn({ lngLat: { lng, lat }, preventDefault: () => {} } as unknown as MapMouseEvent);
    }
  };
  return { map: map as unknown as MaplibreMap, sources, layers, fire };
}

describe("getDrawings — capture current geometries as tagged GeoJSON", () => {
  it("captures markers, committed draw shapes, and the measure line", () => {
    const { map, fire } = fakeMap();
    const controller = installMapTools(map, () => {});

    // Drop two markers.
    controller.activate("marker");
    fire("click", -97.1, 30.1);
    fire("click", -97.2, 30.2);
    // Draw a triangle and commit it (activate elsewhere commits).
    controller.activate("draw");
    fire("click", -97.0, 30.0);
    fire("click", -97.05, 30.0);
    fire("click", -97.05, 30.05);
    // Measure a line.
    controller.activate("measure");
    fire("click", -97.3, 30.3);
    fire("click", -97.4, 30.4);

    const fc = controller.getDrawings();
    expect(fc.type).toBe("FeatureCollection");
    const byTool = (tool: string) =>
      fc.features.filter(
        (f) => (f as { properties: { tool?: string } }).properties.tool === tool,
      );
    expect(byTool("marker")).toHaveLength(2);
    expect(byTool("draw")).toHaveLength(1);
    expect(
      (byTool("draw")[0] as { geometry: { type: string } }).geometry.type,
    ).toBe("Polygon");
    expect(byTool("measure")).toHaveLength(1);
    expect(
      (byTool("measure")[0] as { geometry: { type: string } }).geometry.type,
    ).toBe("LineString");
    // Pure snapshot: capturing does not clear the live state.
    expect(controller.getDrawings().features).toHaveLength(fc.features.length);
  });

  it("returns an empty collection when nothing is drawn", () => {
    const { map } = fakeMap();
    const controller = installMapTools(map, () => {});
    expect(controller.getDrawings()).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });
});

describe("setDossierOverlay — read-only redraw on its own source", () => {
  const fc = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-97.1, 30.1] },
        properties: { tool: "marker" },
      },
    ],
  };

  it("adds the dossier source/layers and sets the data; null clears it", () => {
    const { map, sources, layers } = fakeMap();
    const controller = installMapTools(map, () => {});

    controller.setDossierOverlay(fc);
    expect(sources.has("explorer-tools-dossier")).toBe(true);
    expect(layers.has("explorer-tools-dossier-line")).toBe(true);
    expect(sources.get("explorer-tools-dossier")!.data).toEqual(fc);

    controller.setDossierOverlay(null);
    expect(sources.get("explorer-tools-dossier")!.data).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("never touches the live draw/measure/marker sources", () => {
    const { map, sources } = fakeMap();
    const controller = installMapTools(map, () => {});
    controller.activate("marker"); // installs live layers
    const before = sources.get("explorer-tools-marker")!.data;
    controller.setDossierOverlay(fc);
    expect(sources.get("explorer-tools-marker")!.data).toBe(before);
  });

  it("destroy removes the dossier source and layers too", () => {
    const { map, sources, layers } = fakeMap();
    const controller = installMapTools(map, () => {});
    controller.setDossierOverlay(fc);
    controller.destroy();
    expect(sources.has("explorer-tools-dossier")).toBe(false);
    expect(layers.has("explorer-tools-dossier-fill")).toBe(false);
    expect(layers.has("explorer-tools-dossier-pts")).toBe(false);
  });
});
