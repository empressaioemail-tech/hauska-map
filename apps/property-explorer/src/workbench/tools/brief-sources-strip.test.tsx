import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BriefSourcesStrip } from "./BriefSourcesStrip";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// THE MERGE, PINNED.
//
// The brief dock used to stack the inspect card and a full second report that
// restated the card and contradicted it where the baked snapshot had less
// coverage ("BUILDABLE 43%" above, "not verified here" below). These pin what
// survived the merge and what must not come back.

const brief = {
  runId: "pe-r1-TESTRUN",
  reportFamily: "R1",
  mode: "baked-facet-intel-v1",
  parcelNodeId: "48021:27943",
  source: "baked-snapshot",
  bakedAt: "2026-08-28T15:08:06.633Z",
  brief: {
    sections: [
      {
        id: "zoning",
        title: "Zoning",
        data: { district: "SF-1", jurisdictionKey: "bastrop_city_tx" },
        citations: ["City of Bastrop zoning map (Bastrop, TX)"],
      },
    ],
    disclosure: [],
  },
  citations: ["City of Bastrop zoning map (Bastrop, TX)"],
} as never;

describe("BriefSourcesStrip — what the card above cannot say", () => {
  it("keeps the citations, which are the load-bearing half", () => {
    const html = renderToStaticMarkup(<BriefSourcesStrip brief={brief} />);
    expect(html).toContain('data-testid="brief-source-row"');
    expect(html).toContain("City of Bastrop zoning map");
  });

  it("keeps run provenance, so a cached answer is distinguishable from a fresh one", () => {
    const html = renderToStaticMarkup(<BriefSourcesStrip brief={brief} />);
    expect(html).toContain('data-testid="brief-provenance"');
    expect(html).toContain("pe-r1-TESTRUN");
    expect(html).toContain("baked-snapshot");
  });

  it("does NOT render the Export X-ray PDF hero — export lives in Reports", () => {
    const html = renderToStaticMarkup(<BriefSourcesStrip brief={brief} />);
    expect(html).not.toContain("Export X-ray PDF");
  });

  it("does NOT restate the card's own verdict line", () => {
    // The headline ("Buildable (approximate), 43% of the lot · …") duplicated
    // the inspect card's top row verbatim.
    const html = renderToStaticMarkup(<BriefSourcesStrip brief={brief} />);
    expect(html).not.toContain("Property Intel Brief");
    expect(html).not.toMatch(/Buildable \(approximate\)/);
  });

  it("does NOT render per-section 'not verified here' coverage notes", () => {
    // These describe the SNAPSHOT's coverage, not the parcel, and next to a
    // populated card they read as the product contradicting itself.
    const html = renderToStaticMarkup(<BriefSourcesStrip brief={brief} />);
    expect(html).not.toContain("not verified here");
  });
});

describe("the dock no longer stacks a second report", () => {
  it("BriefTool renders the strip, not PropertyBriefPanel", () => {
    const src = readFileSync(resolve(__dirname, "BriefTool.tsx"), "utf8");
    expect(src).toContain("<BriefSourcesStrip");
    // Scope the check to what is CLAIMED: no import, no render. A blanket
    // string ban also matched the comments explaining the merge, which is a
    // control broader than its claim.
    expect(src).not.toMatch(/^import .*PropertyBriefPanel/m);
    expect(src).not.toContain("<PropertyBriefPanel");
  });

  it("KEEPS the paywall — the brief is a paid bubble", () => {
    // The gate is the reason this file may not simply stop fetching.
    const src = readFileSync(resolve(__dirname, "BriefTool.tsx"), "utf8");
    expect(src).toContain("openPaywall");
    expect(src).toContain("usePropertyEntitlement");
  });

  it("leaves PropertyBriefPanel intact for ShareView", () => {
    const share = readFileSync(
      resolve(__dirname, "../../share/ShareView.tsx"),
      "utf8",
    );
    expect(share).toContain("PropertyBriefPanel");
  });
});
