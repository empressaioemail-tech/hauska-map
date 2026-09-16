import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_PARCELS, DEFAULT_SAMPLE_PARCEL_KEY, sampleParcel } from "./sample-parcels";

const SOURCE = readFileSync(resolve(__dirname, "SampleReportPanel.tsx"), "utf8");

describe("sample-parcels — real, live-checked parcel ids (see report-rows.test.ts fixtures for their shape)", () => {
  it("names exactly the three parcels the design brief asks for: an Austin infill lot, a Bastrop tract, a Hays corridor lot", () => {
    expect(SAMPLE_PARCELS.map((p) => p.key)).toEqual(["austin", "bastrop", "hays"]);
    expect(SAMPLE_PARCELS.map((p) => p.linkLabel)).toEqual([
      "An Austin infill lot",
      "A Bastrop tract",
      "A Hays corridor lot",
    ]);
  });

  it("every parcel id is shaped <countyFips>:<propId> in this app's real county coverage, and each county differs", () => {
    const fipsOf = (id: string) => id.split(":")[0];
    const fipsList = SAMPLE_PARCELS.map((p) => fipsOf(p.parcelNodeId));
    expect(new Set(fipsList).size).toBe(3);
    expect(fipsOf(sampleParcel("austin").parcelNodeId)).toBe("48453"); // Travis
    expect(fipsOf(sampleParcel("bastrop").parcelNodeId)).toBe("48021"); // Bastrop
    expect(fipsOf(sampleParcel("hays").parcelNodeId)).toBe("48209"); // Hays
  });

  it("the CTA's default parcel is the Austin lot, not an arbitrary first entry (source-read pin)", () => {
    expect(DEFAULT_SAMPLE_PARCEL_KEY).toBe("austin");
  });

  it("no hardcoded address, APN, or coordinate rides alongside the parcel id — every displayed value must come from the live resolve", () => {
    for (const p of SAMPLE_PARCELS) {
      expect(Object.keys(p).sort()).toEqual(["key", "linkLabel", "parcelNodeId"]);
    }
  });
});

describe("SampleReportPanel — wired to the real read path, real imagery, never a fixture (source-read)", () => {
  it("resolves the parcel through factSheetResolver.resolve, the app's one read path", () => {
    expect(SOURCE).toMatch(/from ["'].*\/lib\/fact-sheet-resolver["']/);
    expect(SOURCE.replace(/\s+/g, " ")).toContain("factSheetResolver .resolve(parcel.parcelNodeId)");
  });

  it("never resolves by a hand-typed address or free-text query — only the sealed parcelNodeId", () => {
    expect(SOURCE).not.toMatch(/resolve\(\s*(address|query|situsAddress)\s*\)/);
  });

  it("the left panel is the real basemap in live-imagery mode (useFixture false), not the demo fixture corpus", () => {
    expect(SOURCE).toContain("useFixture={false}");
  });

  it("carries a race guard so a slower earlier fetch cannot overwrite a newer parcel switch", () => {
    expect(SOURCE).toContain("generationRef");
    expect(SOURCE).toMatch(/generationRef\.current !== generation/);
  });

  it("a resolve failure renders an honest message, never a silently frozen loading state or a fabricated value", () => {
    expect(SOURCE).toMatch(/\.catch\(\(?\s*err/);
    expect(SOURCE).toContain('status: "error"');
  });

  it("every tab's rows come from the pure report-rows mappers, not inline field access", () => {
    expect(SOURCE).toMatch(/from ["']\.\/report-rows["']/);
    expect(SOURCE).toContain("xrayRows");
    expect(SOURCE).toContain("floodRows");
    expect(SOURCE).toContain("terrainRows");
  });
});
