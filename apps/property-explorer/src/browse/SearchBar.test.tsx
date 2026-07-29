// SearchBar component tests via react-dom/server static render (node env,
// same pattern as InspectCard.test.tsx — no effects run).
//
// Pins: (1) the faint helper line under the old Find bar is REMOVED, (2) the
// dropdown states render honestly (grouped rows + kind labels + highlight,
// loading shimmer, honest empty, honest geocoder-down, recents + clear,
// "search © OSM" attribution footer).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchBar, SuggestDropdown } from "./SearchBar";
import type { SuggestSnapshot } from "../lib/search-suggest";
import type { Suggestion } from "../lib/search-kinds";

const noop = () => {};

function snap(over: Partial<SuggestSnapshot>): SuggestSnapshot {
  return {
    query: "",
    open: true,
    loading: false,
    unavailable: false,
    items: [],
    highlighted: -1,
    recents: [],
    showingRecents: false,
    empty: false,
    ...over,
  };
}

function sugg(over: Partial<Suggestion>): Suggestion {
  return {
    kind: "address",
    label: "714 Spring Street",
    sublabel: "Bastrop, Texas",
    lat: 30.11,
    lng: -97.31,
    extent: null,
    parcelNodeId: null,
    lookupQuery: null,
    ...over,
  };
}

const HELPER_COPY = "Opens the inspect card for that parcel";

describe("helper copy removal", () => {
  it("the bar renders WITHOUT the old faint helper line", () => {
    const html = renderToStaticMarkup(
      <SearchBar
        onSelect={noop}
        onSubmitRaw={noop}
        getBias={() => null}
      />,
    );
    expect(html).not.toContain(HELPER_COPY);
    expect(html).toContain("parcel-lookup-input");
  });

  it("the helper copy exists NOWHERE in src/browse (removed, not moved)", () => {
    // Static sweep of the browse dir sources — the copy must be gone entirely.
    const dir = join(__dirname);
    const files = ["ExplorerMap.tsx", "SearchBar.tsx"];
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, `${f} still carries the removed helper copy`).not.toContain(
        HELPER_COPY,
      );
    }
  });

  it("error line still renders when a lookup fails", () => {
    const html = renderToStaticMarkup(
      <SearchBar
        error="No parcel found for 48021:1."
        onSelect={noop}
        onSubmitRaw={noop}
        getBias={() => null}
      />,
    );
    expect(html).toContain("No parcel found for 48021:1.");
  });
});

describe("SuggestDropdown states", () => {
  it("grouped rows draw kind labels, sublabels, and the OSM footer", () => {
    const html = renderToStaticMarkup(
      <SuggestDropdown
        snap={snap({
          query: "spring",
          items: [
            sugg({ kind: "address", label: "714 Spring Street" }),
            sugg({ kind: "street", label: "Spring Street", sublabel: "Bastrop, Texas" }),
            sugg({ kind: "place", label: "Springfield", sublabel: "Texas" }),
          ],
          highlighted: 0,
        })}
        onPick={noop}
        onHover={noop}
        onClearRecents={noop}
      />,
    );
    expect(html).toContain("Address");
    expect(html).toContain("Street");
    expect(html).toContain("Place");
    expect(html).toContain("714 ");
    expect(html).toContain("Bastrop, Texas");
    expect(html).toContain("search © OSM");
  });

  it("matched substring is emphasized (bold span around the query token)", () => {
    const html = renderToStaticMarkup(
      <SuggestDropdown
        snap={snap({
          query: "spring",
          items: [sugg({ label: "714 Spring Street" })],
        })}
        onPick={noop}
        onHover={noop}
        onClearRecents={noop}
      />,
    );
    expect(html).toContain("font-weight:700");
    expect(html).toContain(">Spring</span>");
  });

  it("loading -> shimmer; empty -> honest copy; down -> honest unavailable row", () => {
    const loading = renderToStaticMarkup(
      <SuggestDropdown snap={snap({ loading: true })} onPick={noop} onHover={noop} onClearRecents={noop} />,
    );
    expect(loading).toContain("search-loading");

    const empty = renderToStaticMarkup(
      <SuggestDropdown
        snap={snap({ empty: true, query: "zzz" })}
        onPick={noop}
        onHover={noop}
        onClearRecents={noop}
      />,
    );
    expect(empty).toContain("No matches — try a fuller address");

    const down = renderToStaticMarkup(
      <SuggestDropdown
        snap={snap({ unavailable: true, query: "austin" })}
        onPick={noop}
        onHover={noop}
        onClearRecents={noop}
      />,
    );
    expect(down).toContain("Search unavailable");
    expect(down).toContain("Parcel ids");
  });

  it("recents view: Recent header + clear action", () => {
    const html = renderToStaticMarkup(
      <SuggestDropdown
        snap={snap({
          showingRecents: true,
          recents: [sugg({ label: "48021:34177", kind: "parcel" })],
        })}
        onPick={noop}
        onHover={noop}
        onClearRecents={noop}
      />,
    );
    expect(html).toContain("Recent");
    expect(html).toContain("48021:34177");
    expect(html).toContain("Clear recent searches");
  });

  it("closed dropdown renders nothing", () => {
    const html = renderToStaticMarkup(
      <SuggestDropdown snap={snap({ open: false })} onPick={noop} onHover={noop} onClearRecents={noop} />,
    );
    expect(html).toBe("");
  });
});
