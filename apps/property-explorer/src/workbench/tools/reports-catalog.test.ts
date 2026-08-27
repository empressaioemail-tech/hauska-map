import { describe, expect, it } from "vitest";
import {
  isReportDocId,
  readyCount,
  reportCatalogGroups,
  reportDocIsGeneratable,
  reportDocStatus,
  REPORTS_CATALOG,
} from "./reports-catalog";

describe("reports catalog — Option D picker source", () => {
  it("has 12 documents in Packages / Studies / Exports", () => {
    // Frame caption said "4 ready of 12"; the catalog() list is 12 rows.
    expect(REPORTS_CATALOG).toHaveLength(12);
    const groups = reportCatalogGroups();
    expect(groups.map((g) => g.group)).toEqual([
      "Packages",
      "Studies",
      "Exports",
    ]);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(12);
  });

  it("coming-soon rows are in the catalog and never count as ready", () => {
    const coming = REPORTS_CATALOG.filter((d) => d.catalogStatus === "coming");
    expect(coming.map((d) => d.name).sort()).toEqual([
      "Comparison report",
      "Feasibility Study",
    ]);
    for (const doc of coming) {
      expect(reportDocIsGeneratable(doc, true)).toBe(false);
      expect(reportDocStatus(doc, { studioGranted: true }).text).toBe(
        "Coming soon",
      );
    }
  });

  it("ready count: paid/unlock can generate 7; Studio adds terrain rows", () => {
    expect(readyCount(false)).toEqual({ ready: 7, total: 12 });
    expect(readyCount(true)).toEqual({ ready: 10, total: 12 });
  });

  it("Records request is ready in the Packages group (property-entitlement gate)", () => {
    const rec = REPORTS_CATALOG.find((d) => d.id === "REC");
    expect(rec?.name).toBe("Records request");
    expect(rec?.group).toBe("Packages");
    expect(rec?.engine).toBe("records");
    expect(rec?.studioGated).toBeFalsy();
    expect(reportDocStatus(rec!, { studioGranted: false }).text).toBe("Ready");
    expect(reportDocIsGeneratable(rec!, false)).toBe(true);
    expect(reportDocIsGeneratable(rec!, true)).toBe(true);
  });

  it("the live package is X-ray, not Property dossier", () => {
    const doss = REPORTS_CATALOG.find((d) => d.id === "DOSS");
    expect(doss?.name).toBe("X-ray");
    expect(REPORTS_CATALOG.some((d) => /dossier/i.test(d.name))).toBe(false);
  });

  it("isReportDocId rejects garbage and accepts every catalog id", () => {
    expect(isReportDocId("SPPDF")).toBe(true);
    expect(isReportDocId("FLOOD")).toBe(true);
    expect(isReportDocId("reports.sitePlan")).toBe(false);
    expect(isReportDocId(null)).toBe(false);
    expect(isReportDocId("")).toBe(false);
  });

  it("Studio status is warning-colored, never a gold CTA token", () => {
    const terrain = REPORTS_CATALOG.find((d) => d.id === "TERGLB");
    expect(terrain).toBeTruthy();
    const locked = reportDocStatus(terrain!, { studioGranted: false });
    expect(locked.text).toBe("Studio");
    expect(locked.color).toContain("--semantic-warning");
    expect(locked.color.toLowerCase()).not.toContain("f5b95c");
    expect(locked.color.toLowerCase()).not.toContain("e8963b");
  });
});
