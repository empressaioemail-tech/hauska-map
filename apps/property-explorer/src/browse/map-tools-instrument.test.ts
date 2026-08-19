/**
 * W4 — measure is an INSTRUMENT, not a demo.
 *
 * Every case here is written against a defect the operator reported at source,
 * and every one of them FAILS on the pre-W4 controller (which had no committed
 * measurements, no finish, no undo and no per-item removal). That is the point:
 * a test that cannot fail for the right reason is not a test.
 *
 * Verbatim, the QA pass this file encodes: "There is no stop or go back. Once
 * you measure in one direction there is a continuation of measuring and it
 * keeps going. If you hit trash it deletes all measurements that you made.
 * There needs to be an undo section. You can not measure length and width
 * together its a single measurement... Even when you double click it does not
 * allow you to place a new line."
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

/** A double-click as MapLibre delivers it: click, click, then dblclick. */
function doubleClick(fire: ReturnType<typeof fakeMap>["fire"], lng: number, lat: number) {
  fire("click", lng, lat);
  fire("click", lng, lat);
  fire("dblclick", lng, lat);
}

describe("length AND width — more than one measurement can exist", () => {
  it("two finished measurements coexist with their own values", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");

    // Length: one degree-hundredth of latitude.
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    // Width: half that, in latitude again so the two are directly comparable.
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.005);

    const snap = c.snapshot();
    expect(snap.measurements).toHaveLength(2);
    // Pre-registered band: 0.01 deg of latitude on a 6371008.8 m sphere is
    // 1112.0 m. A result outside 1111-1113 is a finding either way.
    expect(snap.measurements[0].lengthMeters).toBeGreaterThan(1111);
    expect(snap.measurements[0].lengthMeters).toBeLessThan(1113);
    expect(snap.measurements[1].lengthMeters).toBeGreaterThan(555);
    expect(snap.measurements[1].lengthMeters).toBeLessThan(557);
    expect(snap.measurements.map((m) => m.index)).toEqual([1, 2]);
    expect(snap.measurements[0].id).not.toBe(snap.measurements[1].id);
  });

  it("double-click FINISHES: the draft is cleared and the next click starts a new one", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);

    // The bug: the old controller popped a vertex and kept the draft alive, so
    // the line "kept going" and a new one could never be started.
    expect(c.snapshot().draftPoints).toBe(0);
    expect(c.snapshot().measurements).toHaveLength(1);

    fire("click", -97.1, 30.1);
    expect(c.snapshot().draftPoints).toBe(1);
    expect(c.snapshot().measurements).toHaveLength(1);
  });

  it("the readout no longer promises a finish the tool does not perform", () => {
    const { map } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    const readout = c.snapshot().readout ?? "";
    expect(readout).toContain("Double-click");
    expect(readout).toContain("finish");
  });
});

describe("finish / undo — a way to stop and a way back", () => {
  it("finish() commits an in-progress line and canFinish gates it", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    expect(c.snapshot().canFinish).toBe(false);
    fire("click", -97.0, 30.0);
    expect(c.snapshot().canFinish).toBe(false); // one point is not a line
    fire("click", -97.0, 30.01);
    expect(c.snapshot().canFinish).toBe(true);
    c.finish();
    expect(c.snapshot().measurements).toHaveLength(1);
    expect(c.snapshot().draftPoints).toBe(0);
  });

  it("area mode needs three points before it can be finished", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    c.setMeasureMode("area");
    fire("click", -97.0, 30.0);
    fire("click", -97.01, 30.0);
    expect(c.snapshot().canFinish).toBe(false);
    fire("click", -97.01, 30.01);
    expect(c.snapshot().canFinish).toBe(true);
  });

  it("undo drops the last point of the draft", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    fire("click", -97.0, 30.01);
    fire("click", -97.0, 30.02);
    expect(c.snapshot().draftPoints).toBe(3);
    c.undo();
    expect(c.snapshot().draftPoints).toBe(2);
  });

  it("undo after a finish UN-FINISHES rather than deleting the measurement", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    fire("click", -97.0, 30.01);
    c.finish();
    expect(c.snapshot().measurements).toHaveLength(1);
    c.undo();
    expect(c.snapshot().measurements).toHaveLength(0);
    expect(c.snapshot().draftPoints).toBe(2); // the geometry came BACK
    c.undo();
    expect(c.snapshot().draftPoints).toBe(1); // now a point goes
  });

  it("canUndo is false with nothing to undo, and true once there is", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    expect(c.snapshot().canUndo).toBe(false);
    fire("click", -97.0, 30.0);
    expect(c.snapshot().canUndo).toBe(true);
  });

  it("undo pops the last marker while the marker tool is active", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("marker");
    fire("click", -97.0, 30.0);
    fire("click", -97.1, 30.1);
    expect(c.snapshot().markerCount).toBe(2);
    c.undo();
    expect(c.snapshot().markerCount).toBe(1);
  });
});

describe("removal is per item — trash is no longer the only verb", () => {
  it("removeMeasurement takes ONE and leaves the rest", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.005);
    const [first, second] = c.snapshot().measurements;

    c.removeMeasurement(first.id);
    const left = c.snapshot().measurements;
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(second.id);
    // Renumbered so the panel row and the map agree.
    expect(left[0].index).toBe(1);
  });

  it("removing an unknown id changes nothing", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    c.removeMeasurement("no-such-id");
    expect(c.snapshot().measurements).toHaveLength(1);
  });

  it("clear() is still the blunt instrument, and clearMeasurements is the narrow one", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("marker");
    fire("click", -97.2, 30.2);
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    expect(c.snapshot().measurements).toHaveLength(1);
    expect(c.snapshot().markerCount).toBe(1);

    c.clearMeasurements();
    expect(c.snapshot().measurements).toHaveLength(0);
    expect(c.snapshot().markerCount).toBe(1); // the narrow verb spared the marker

    c.clear();
    expect(c.snapshot().markerCount).toBe(0);
  });
});

describe("per-segment and running totals", () => {
  it("draftSegments carries one formatted leg per segment", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    expect(c.snapshot().draftSegments).toHaveLength(0);
    fire("click", -97.0, 30.01);
    expect(c.snapshot().draftSegments).toHaveLength(1);
    fire("click", -97.0, 30.02);
    expect(c.snapshot().draftSegments).toHaveLength(2);
    expect(c.snapshot().draftSegments[0]).toMatch(/ft|mi/);
  });

  it("the running readout names the total AND the last leg", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    fire("click", -97.0, 30.01);
    const readout = c.snapshot().readout ?? "";
    expect(readout).toContain("Distance");
    expect(readout).toContain("last leg");
    expect(readout).toContain("2 pts");
  });
});

describe("area and square footage", () => {
  it("a finished area measurement reports square meters and a formatted area", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    c.setMeasureMode("area");
    fire("click", -97.0, 30.0);
    fire("click", -97.01, 30.0);
    fire("click", -97.01, 30.01);
    doubleClick(fire, -97.0, 30.01);

    const [m] = c.snapshot().measurements;
    expect(m.mode).toBe("area");
    expect(m.areaSqMeters).not.toBeNull();
    // Pre-registered band: a 0.01 x 0.01 degree box at latitude 30 is roughly
    // 1112 m by 963 m, so about 1.07e6 m². Anything outside 0.9e6-1.2e6 is a
    // finding rather than a pass.
    expect(m.areaSqMeters as number).toBeGreaterThan(0.9e6);
    expect(m.areaSqMeters as number).toBeLessThan(1.2e6);
    expect(m.primary).toMatch(/acres|sqft/);
    expect(m.secondary).toContain("perimeter");
  });

  it("a DRAW shape reports its area — the maths that used to sit unused", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("draw");
    fire("click", -97.0, 30.0);
    fire("click", -97.001, 30.0);
    fire("click", -97.001, 30.001);
    doubleClick(fire, -97.0, 30.001);

    const [s] = c.snapshot().shapes;
    expect(s.kind).toBe("polygon");
    expect(s.areaSqMeters).not.toBeNull();
    expect(s.areaSqMeters as number).toBeGreaterThan(0);
    expect(s.primary).toMatch(/acres|sqft/);
    expect(s.secondary).toContain("perimeter");
  });

  it("a two-point draw shape reports a length, not an area", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("draw");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    const [s] = c.snapshot().shapes;
    expect(s.kind).toBe("line");
    expect(s.areaSqMeters).toBeNull();
    expect(s.primary).toMatch(/ft|mi/);
  });

  it("a line measurement never claims an area", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    expect(c.snapshot().measurements[0].areaSqMeters).toBeNull();
  });
});

describe("notes — the user's own judgement gets its own slot", () => {
  it("a click drops a pending note that the panel can then fill in", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.setNoteScope({ id: "48021:34137", label: "1102 Chestnut St" });
    c.activate("note");
    fire("click", -97.31, 30.11);

    const pendingId = c.snapshot().pendingNoteId;
    expect(pendingId).not.toBeNull();
    expect(c.snapshot().notes).toHaveLength(1);
    expect(c.snapshot().notes[0].text).toBe("");
    expect(c.snapshot().notes[0].scopeId).toBe("48021:34137");
    expect(c.snapshot().notes[0].scopeLabel).toBe("1102 Chestnut St");

    c.setNoteText(pendingId as string, "there was 130 sf of space needed for my project");
    expect(c.snapshot().pendingNoteId).toBeNull();
    expect(c.snapshot().notes[0].text).toBe(
      "there was 130 sf of space needed for my project",
    );
  });

  it("notes are removable one at a time", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("note");
    fire("click", -97.31, 30.11);
    const first = c.snapshot().notes[0].id;
    c.setNoteText(first, "good boundaries possible option");
    fire("click", -97.32, 30.12);
    expect(c.snapshot().notes).toHaveLength(2);
    c.removeNote(first);
    expect(c.snapshot().notes).toHaveLength(1);
    expect(c.snapshot().notes[0].id).not.toBe(first);
  });

  it("the note tool is its own slot, not Location's and not the marker's", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("note");
    fire("click", -97.31, 30.11);
    expect(c.snapshot().active).toBe("note");
    expect(c.snapshot().markerCount).toBe(0);
  });
});

describe("the dossier seam still holds, and now carries everything", () => {
  it("getDrawings captures BOTH committed measurements, not just one", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    fire("click", -97.1, 30.1);
    doubleClick(fire, -97.1, 30.11);

    const measures = c
      .getDrawings()
      .features.filter((f) => (f as { properties: { tool?: string } }).properties.tool === "measure");
    expect(measures).toHaveLength(2);
  });

  it("getDrawings carries note text and its parcel scope", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.setNoteScope({ id: "48021:34137", label: "1102 Chestnut St" });
    c.activate("note");
    fire("click", -97.31, 30.11);
    c.setNoteText(c.snapshot().pendingNoteId as string, "good boundaries possible option");

    const notes = c
      .getDrawings()
      .features.filter((f) => (f as { properties: { tool?: string } }).properties.tool === "note");
    expect(notes).toHaveLength(1);
    const props = (notes[0] as { properties: Record<string, unknown> }).properties;
    expect(props.text).toBe("good boundaries possible option");
    expect(props.scopeId).toBe("48021:34137");
  });

  it("getDrawings is still a pure snapshot", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    const before = c.getDrawings().features.length;
    expect(c.getDrawings().features).toHaveLength(before);
    expect(c.snapshot().measurements).toHaveLength(1);
  });
});

describe("highlight — a panel row maps to a geometry on the map", () => {
  it("setHighlight marks exactly one committed feature, and only via a plain property", () => {
    const { map, fire, sources } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    fire("click", -97.1, 30.1);
    doubleClick(fire, -97.1, 30.11);
    const [, second] = c.snapshot().measurements;

    c.setHighlight(second.id);
    expect(c.snapshot().highlightId).toBe(second.id);
    const fc = sources.get("explorer-tools-measure")!.data as {
      features: { properties: Record<string, unknown> }[];
    };
    const highlighted = fc.features.filter((f) => f.properties.hl === true);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].properties.id).toBe(second.id);

    c.setHighlight(null);
    const cleared = sources.get("explorer-tools-measure")!.data as {
      features: { properties: Record<string, unknown> }[];
    };
    expect(cleared.features.filter((f) => f.properties.hl === true)).toHaveLength(0);
  });

  it("removing the highlighted measurement clears the highlight", () => {
    const { map, fire } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    const [only] = c.snapshot().measurements;
    c.setHighlight(only.id);
    c.removeMeasurement(only.id);
    expect(c.snapshot().highlightId).toBeNull();
  });
});

describe("paint discipline — the blank-map crash rule survives the rebuild", () => {
  it("no feature-state is used anywhere in the controller", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../../packages/map-renderer/src/chrome/mapToolsController.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/setFeatureState|removeFeatureState|\["feature-state"/);
  });

  it("committing does not lose the map geometry", () => {
    const { map, fire, sources } = fakeMap();
    const c = installMapTools(map, () => {});
    c.activate("measure");
    fire("click", -97.0, 30.0);
    doubleClick(fire, -97.0, 30.01);
    const fc = sources.get("explorer-tools-measure")!.data as { features: unknown[] };
    // The committed line plus its two vertex dots.
    expect(fc.features.length).toBeGreaterThanOrEqual(3);
  });
});
