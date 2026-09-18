// P-353 — the dropdown shows the coverage reason where the rows would be.
//
// Static render (`react-dom/server`), the same pattern as SearchBar.test.tsx:
// no effects, no DOM. The component is read-only in this file.
//
// Runs in BOTH directions: SearchBar.tsx exists at 163fde32 and renders no
// notice there, so against the reverted tree the first two cases fail on the
// assertion (`search-coverage-notice` absent, the old "No matches" copy still
// served) rather than at import.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SuggestDropdown } from "./SearchBar";
import type { SuggestSnapshot } from "../lib/search-suggest";

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
    highlightExplicit: false,
    ...over,
  };
}

const CAMERON_NOTICE =
  "We don't cover Milam County, TX yet, so that address is outside the area we can search.";
const UNAVAILABLE_NOTICE =
  "We couldn't check coverage just now — this is not a no-results answer. Try again in a moment.";

function render(over: Partial<SuggestSnapshot>) {
  return renderToStaticMarkup(
    <SuggestDropdown snap={snap(over)} onPick={noop} onHover={noop} onClearRecents={noop} />,
  );
}

describe("P-353 — the coverage notice in the Find box dropdown", () => {
  it("shows the class's own sentence, naming the county and state", () => {
    const html = render({ query: "99999 Zzyzx Rd, Cameron", coverageNotice: CAMERON_NOTICE });
    expect(html).toContain("search-coverage-notice");
    expect(html).toContain("Milam County");
    expect(html).toContain("TX");
  });

  it("does NOT also say 'No matches, try a fuller address' — that was the wrong kind of no-result", () => {
    const html = render({ query: "99999 Zzyzx Rd, Cameron", coverageNotice: CAMERON_NOTICE });
    expect(html).not.toContain("No matches");
    expect(html).not.toContain("try a fuller address");
    expect(html).not.toContain("search-empty");
  });

  it("the notice outranks the generic empty state even if both are set", () => {
    const html = render({
      query: "99999 Zzyzx Rd, Cameron",
      coverageNotice: CAMERON_NOTICE,
      empty: true,
    });
    expect(html).toContain("search-coverage-notice");
    expect(html).not.toContain("search-empty");
  });

  it("an unavailable check says so, and never reads as no-results", () => {
    const html = render({ query: "99999 Zzyzx Rd, Cameron", coverageNotice: UNAVAILABLE_NOTICE });
    expect(html).toContain("search-coverage-notice");
    expect(html).toContain("couldn&#x27;t check coverage");
    expect(html).not.toContain("No matches");
  });

  it("no notice: the ordinary honest empty state is unchanged", () => {
    const html = render({ query: "zzz", empty: true });
    expect(html).toContain("search-empty");
    expect(html).toContain("No matches");
    expect(html).not.toContain("search-coverage-notice");
  });

  it("no notice, no empty: nothing is rendered, as before", () => {
    expect(render({ query: "zzz" })).toBe("");
  });

  it("the recents view is untouched: a stale notice cannot hijack it", () => {
    const html = render({
      query: "",
      showingRecents: true,
      recents: [],
      coverageNotice: CAMERON_NOTICE,
    });
    expect(html).not.toContain("search-coverage-notice");
  });
});
