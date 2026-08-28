import { describe, expect, it } from "vitest";
import {
  ensureLegendStyles,
  legendPanelHtml,
  legendSectionsFor,
} from "../../../../packages/map-renderer/src/map/map-legend.js";

// THE REGRESSION THIS EXISTS TO STOP.
//
// The legend markup moved into Property Explorer's left column, reusing
// `legendPanelHtml`. Its STYLESHEET did not come with it: `ensureStyles` is
// installed by `createMapLegend`, and PE runs the renderer with
// `legendChrome: "none"`, so it never ran. The markup's classes had nothing
// styling them and the legend collapsed into one run of text — swatches, row
// gaps and badges all gone.
//
// The markup and the stylesheet are two halves of one thing. Whoever renders
// one must install the other, and these pin that they still agree.

function fakeDoc() {
  const head: Array<{ id: string; textContent: string }> = [];
  return {
    head: {
      appendChild(el: { id: string; textContent: string }) {
        head.push(el);
      },
    },
    getElementById(id: string) {
      return head.find((e) => e.id === id) ?? null;
    },
    createElement() {
      return { id: "", textContent: "" };
    },
    _installed: head,
  };
}

describe("ensureLegendStyles — the markup's other half", () => {
  it("installs a stylesheet carrying the rules that MAKE it a legend", () => {
    const doc = fakeDoc();
    ensureLegendStyles(doc);
    expect(doc._installed).toHaveLength(1);
    const css = doc._installed[0].textContent;
    // The four rules whose absence flattened the legend into prose.
    expect(css).toContain("__rows{list-style:none");
    expect(css).toContain("__row{display:flex");
    expect(css).toContain("__swatch{flex:0 0 auto");
    expect(css).toContain("__badge{margin-left:auto");
  });

  it("is idempotent — two panels do not install it twice", () => {
    const doc = fakeDoc();
    ensureLegendStyles(doc);
    ensureLegendStyles(doc);
    expect(doc._installed).toHaveLength(1);
  });

  it("is a no-op without a DOM, so SSR and node tests do not throw", () => {
    expect(() => ensureLegendStyles(null)).not.toThrow();
    expect(() => ensureLegendStyles(undefined)).not.toThrow();
    expect(() => ensureLegendStyles({} as never)).not.toThrow();
  });
});

describe("the markup and the stylesheet agree", () => {
  it("every class the markup emits has a rule in the stylesheet", () => {
    const sections = legendSectionsFor(["flood-zone", "zoning"]);
    // Guard: if the model returns nothing this test proves nothing.
    expect(sections.length).toBeGreaterThan(0);

    const html = legendPanelHtml(sections);
    const doc = fakeDoc();
    ensureLegendStyles(doc);
    const css = doc._installed[0].textContent;

    const classes = [...html.matchAll(/class="([^"]+)"/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .filter(Boolean);
    expect(classes.length).toBeGreaterThan(0);

    for (const cls of new Set(classes)) {
      expect(
        css.includes(`.${cls}{`) || css.includes(`.${cls} `),
        `markup emits .${cls} but the stylesheet has no rule for it`,
      ).toBe(true);
    }
  });
});
