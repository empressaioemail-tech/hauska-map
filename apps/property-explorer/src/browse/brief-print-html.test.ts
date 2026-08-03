// Tests for the ported Alder print-HTML renderer: document structure, print
// CSS, escaping hygiene, honest provenance, and the citation appendix.

import { describe, expect, it } from "vitest";
import { deriveBriefViewModel } from "./brief-view-model";
import { esc, renderBriefPrintHtml } from "./brief-print-html";
import {
  FIXTURE_NOW_MS,
  UNKNOWN_SECTION_BRIEF,
  UNZONED_BRIEF,
  ZONED_BRIEF,
} from "./__fixtures__/research-brief.fixture";

const EXPORTED_AT = new Date("2026-07-28T12:00:00.000Z");

describe("esc (ported Alder hygiene)", () => {
  it("escapes the full XML entity set plus single quotes", () => {
    expect(esc(`<b>"a" & 'b'</b>`)).toBe(
      "&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;",
    );
  });
  it("renders null/undefined as empty", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("renderBriefPrintHtml — zoned parcel", () => {
  const vm = deriveBriefViewModel(ZONED_BRIEF, FIXTURE_NOW_MS);
  const html = renderBriefPrintHtml(vm, EXPORTED_AT);

  it("is a complete Letter print document with @page margin boxes", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("size: Letter;");
    expect(html).toContain("@top-left");
    expect(html).toContain("@bottom-center");
    expect(html).toContain('counter(page) " of " counter(pages)');
    expect(html).toContain("page-break-after: always;");
  });

  it("cover page carries the provenance block", () => {
    expect(html).toContain('data-page="cover"');
    expect(html).toContain("tx-bastrop-parcel-000123");
    expect(html).toContain("Report family: R1");
    expect(html).toContain("Source: baked-snapshot");
    expect(html).toContain("Baked at: 2026-07-21T09:00:00.000Z");
    expect(html).toContain("Run id: pe-r1-dGVzdA.MjAyNg");
    expect(html).toContain("Exported: 2026-07-28 12:00:00 UTC");
  });

  it("renders all four sections with their facts — never JSON", () => {
    expect(html).toContain('data-section="zoning"');
    expect(html).toContain('data-section="setbacks-envelope"');
    expect(html).toContain('data-section="flood"');
    expect(html).toContain('data-section="land-use"');
    expect(html).toContain("P-2");
    expect(html).toContain("6,100 sq ft (70% of the lot)");
    expect(html).toContain("Zone AE");
    expect(html).toContain("Single family residence (code A1)");
    expect(html).not.toContain("JSON.stringify");
    expect(html).not.toContain("<pre");
  });

  it("citation appendix carries grouped rows with color-coded freshness", () => {
    expect(html).toContain('data-page="appendix"');
    expect(html).toContain('class="freshness-fresh"');
    expect(html).toContain('class="freshness-aging"');
    expect(html).toContain("municode.com");
  });

  it("disclosures render verbatim", () => {
    expect(html).toContain("build-to-line governs");
  });

  it("carries the Smart Site brand header (crosshair + lockup + report name)", () => {
    // Branded header band + crosshair mark + SMART/SITE lockup.
    expect(html).toContain('data-testid="brand-header"');
    expect(html).toContain("brand-lockup");
    expect(html).toContain("<svg"); // inline crosshair mark, print-safe
    expect(html).toContain('class="brand-smart">SMART');
    expect(html).toContain('class="brand-site">SITE');
    // Ratified report name is the header; old descriptor stays as subtitle.
    expect(html).toContain("SMART SITE X-RAY");
    expect(html).toContain("Property Intel Brief");
    // Brand palette, not the old cyan.
    expect(html).not.toContain("#00b4d8");
    expect(html).toContain("#E8963B"); // brand gold accent
    expect(html).toContain("#3B82F6"); // brand-blue links/citations
  });

  it("wires the data-inspection loop in print (cite [n] → appendix anchor)", () => {
    // Fact [n] is an in-document anchor to its appendix row id.
    expect(html).toContain('class="cite-ref" href="#cite-1"');
    expect(html).toContain('id="cite-1"');
    // Appendix source URL is a real link; missing URLs show honest unlinked.
    expect(html).toContain("<a href=");
  });
});

describe("renderBriefPrintHtml — unzoned parcel", () => {
  const vm = deriveBriefViewModel(UNZONED_BRIEF, FIXTURE_NOW_MS);
  const html = renderBriefPrintHtml(vm, EXPORTED_AT);

  it("honest-absent sections render the absent copy", () => {
    expect(html).toContain("not verified here");
    expect(html).toContain("no zoning stamp");
    expect(html).toContain("FEMA NFHL fetch failed");
  });

  it("null bakedAt renders as (not recorded), never fabricated", () => {
    expect(html).toContain("Baked at: (not recorded)");
  });

  it("empty appendix states there are no recorded sources", () => {
    expect(html).toContain("No sources are recorded");
  });
});

describe("renderBriefPrintHtml — unknown sections and escaping", () => {
  it("renders unknown sections generically", () => {
    const vm = deriveBriefViewModel(UNKNOWN_SECTION_BRIEF, FIXTURE_NOW_MS);
    const html = renderBriefPrintHtml(vm, EXPORTED_AT);
    expect(html).toContain('data-section="wildfire-risk"');
    expect(html).toContain("inputs.fuelModel");
    expect(html).toContain("source not recorded");
  });

  it("escapes hostile payload strings (no template breakout)", () => {
    const hostile = {
      ...UNKNOWN_SECTION_BRIEF,
      brief: {
        sections: [
          {
            id: "xss",
            title: `<script>alert("x")</script>`,
            data: { note: `<img src=x onerror="alert(1)">` },
            citations: [],
          },
        ],
        disclosure: [],
      },
    };
    const vm = deriveBriefViewModel(hostile, FIXTURE_NOW_MS);
    const html = renderBriefPrintHtml(vm, EXPORTED_AT);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain("&lt;script&gt;");
  });
});
