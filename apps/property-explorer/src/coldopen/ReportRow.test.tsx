// apps/property-explorer/src/coldopen/ReportRow.test.tsx
//
// Component-level proof, not just the pure mapper: a row in the "absent"
// state paints the exact chip text the design brief specifies (lower case
// "reported absent", never a dash, an empty string, or a zero), and a
// present row paints its real value with its citation as a real anchor when
// a URL exists. Node test environment (no jsdom) — static markup, the same
// technique this app's other chrome tests use (see pricing-modal.test.tsx).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportRow } from "./ReportRow";
import type { FactRowView } from "./report-rows";

describe("ReportRow", () => {
  it("an absent field renders the exact honest chip text, never a dash or empty value", () => {
    const row: FactRowView = { label: "Buildable envelope", state: "absent" };
    const html = renderToStaticMarkup(<ReportRow row={row} />);
    expect(html).toContain("reported absent");
    expect(html).toContain("Buildable envelope");
    // Never a placeholder that could be mistaken for a real reading.
    expect(html).not.toMatch(/>\s*[-–—]\s*</);
    expect(html).not.toContain(">0<");
  });

  it("a present field renders its value and a real citation link when a URL exists", () => {
    const row: FactRowView = {
      label: "Flood zone",
      state: "present",
      value: "AE (partial)",
      citation: { text: "44 CFR 64.3", href: "https://example.gov/44-cfr-64-3" },
    };
    const html = renderToStaticMarkup(<ReportRow row={row} />);
    expect(html).toContain("AE (partial)");
    expect(html).toContain('href="https://example.gov/44-cfr-64-3"');
    expect(html).toContain("44 CFR 64.3");
    expect(html).not.toContain("reported absent");
  });

  it("citationsDegraded: a present field with no verifiable URL renders the citation as text, never a dead link", () => {
    const row: FactRowView = {
      label: "Zoning district",
      state: "present",
      value: "SF-3",
      citation: { text: "county zoning map", href: null },
    };
    const html = renderToStaticMarkup(<ReportRow row={row} />);
    expect(html).toContain("county zoning map");
    expect(html).not.toContain("<a ");
  });

  it("a present field's approximate note renders under the row", () => {
    const row: FactRowView = {
      label: "Buildable envelope",
      state: "present",
      value: "4,150 sq ft",
      citation: { text: "25-2-492", href: null },
      note: "approximate, not survey grade.",
    };
    const html = renderToStaticMarkup(<ReportRow row={row} />);
    expect(html).toContain("approximate, not survey grade.");
  });
});
