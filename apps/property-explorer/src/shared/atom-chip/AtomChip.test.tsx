// Minimal render tests for the shared atom-chip primitives (same
// renderToStaticMarkup pattern as chat-tool.test.tsx's ChatCitationChips
// tests). The fetch-cache semantics (fetchAtomByDid) are exercised
// end-to-end via workbench/tools/chat-atom-card.test.ts, which now runs
// against this module through the re-export — these tests cover the
// NEW presentational pieces only.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AtomChip } from "./AtomChip";
import { ATOM_ACCENT } from "./atom-accent";

describe("AtomChip", () => {
  it("closed: renders the label in the reserved atom accent", () => {
    const html = renderToStaticMarkup(
      <AtomChip label="zoning" isOpen={false} onClick={() => {}} />,
    );
    expect(html).toContain("zoning");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(ATOM_ACCENT);
  });

  it("open: aria-expanded true, filled background", () => {
    const html = renderToStaticMarkup(
      <AtomChip label="4.2" isOpen onClick={() => {}} />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("4.2");
  });

  it("custom testId is honored (InspectCard uses inspect-provenance-chip)", () => {
    const html = renderToStaticMarkup(
      <AtomChip
        label="setback"
        isOpen={false}
        onClick={() => {}}
        testId="inspect-provenance-chip"
      />,
    );
    expect(html).toContain('data-testid="inspect-provenance-chip"');
  });
});
