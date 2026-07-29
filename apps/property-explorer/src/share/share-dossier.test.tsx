// Share-view dossier — sketch projection + render states.
// The dossier section renders ONLY when the share carries one (v2 token +
// saved content); a missing dossier keeps the pre-dossier page. The chat
// summary is ALWAYS labeled AI with a disclaimer; the drawings sketch is
// schematic and says so.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ShareDossierSection, type ShareDossierData } from "./ShareView";
import { drawingsSummaryLine, drawingsToSketch } from "./share-dossier-sketch";

const DRAWINGS: NonNullable<ShareDossierData["drawings"]> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-97.3, 30.1],
            [-97.29, 30.1],
            [-97.29, 30.11],
            [-97.3, 30.11],
            [-97.3, 30.1],
          ],
        ],
      },
      properties: { tool: "draw" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-97.295, 30.105] },
      properties: { tool: "marker" },
    },
  ],
};

const FULL: ShareDossierData = {
  address: "1127 N Pine St",
  savedAt: "2026-07-28T00:00:00.000Z",
  drawings: DRAWINGS,
  chatSummary: {
    summary: "AI summary of the research chat.",
    savedAt: "2026-07-28T12:00:00.000Z",
    disclaimer: "AI-generated — verify before relying on it.",
  },
  notes: "Walk the lot before offering.",
};

describe("drawingsToSketch", () => {
  it("projects drawings into a bounded 0..100 viewBox with paths + points", () => {
    const sketch = drawingsToSketch(DRAWINGS);
    expect(sketch).not.toBeNull();
    expect(sketch!.viewBox).toBe("0 0 100 100");
    expect(sketch!.paths.length).toBe(1);
    expect(sketch!.paths[0].closed).toBe(true);
    expect(sketch!.paths[0].d.endsWith("Z")).toBe(true);
    expect(sketch!.points.length).toBe(1);
    // Every projected coordinate stays inside the viewBox.
    const nums = sketch!.paths[0].d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });

  it("returns null for empty or undrawable collections (honest absence)", () => {
    expect(drawingsToSketch(null)).toBeNull();
    expect(drawingsToSketch({ features: [] })).toBeNull();
    expect(
      drawingsToSketch({
        features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: "bad" } }],
      }),
    ).toBeNull();
  });

  it("summarizes shapes and markers honestly", () => {
    expect(drawingsSummaryLine(DRAWINGS)).toBe("1 shape · 1 marker");
    expect(drawingsSummaryLine({ features: [] })).toBeNull();
  });
});

describe("ShareDossierSection render states", () => {
  it("renders sketch + AI-labeled summary with disclaimer + notes", () => {
    const html = renderToStaticMarkup(<ShareDossierSection dossier={FULL} />);
    expect(html).toContain('data-testid="share-dossier"');
    expect(html).toContain('data-testid="share-dossier-sketch"');
    expect(html).toContain("not to");
    expect(html).toContain("AI research summary");
    expect(html).toContain("AI summary of the research chat.");
    expect(html).toContain("AI-generated — verify before relying on it.");
    expect(html).toContain("Notes from the sharer");
    expect(html).toContain("Walk the lot before offering.");
  });

  it("renders only the pieces that exist (notes-only dossier)", () => {
    const html = renderToStaticMarkup(
      <ShareDossierSection
        dossier={{
          address: null,
          savedAt: null,
          drawings: null,
          chatSummary: null,
          notes: "Just a note.",
        }}
      />,
    );
    expect(html).toContain("Just a note.");
    expect(html).not.toContain("share-dossier-sketch");
    expect(html).not.toContain("AI research summary");
  });

  it("labels a summary WITHOUT a stored disclaimer with the standing one", () => {
    const html = renderToStaticMarkup(
      <ShareDossierSection
        dossier={{
          address: null,
          savedAt: null,
          drawings: null,
          chatSummary: {
            summary: "Summary.",
            savedAt: "2026-07-28T12:00:00.000Z",
            disclaimer: null,
          },
          notes: null,
        }}
      />,
    );
    expect(html).toContain("AI-generated summary of a research chat");
  });
});
