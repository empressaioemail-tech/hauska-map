import { describe, expect, it } from "vitest";
import {
  findReportDoc,
  isReportDocId,
  normalizeReportDocId,
  purchaseSurfaceCatalog,
  readyCount,
  reportCatalogGroups,
  reportDocIsGeneratable,
  reportDocLockChip,
  reportDocStatus,
  reportsFreshnessLine,
  REPORTS_CATALOG,
} from "./reports-catalog";

describe("reports catalog — W7 purchase surface", () => {
  it("Coming soon rows are off the purchase surface (violate: a Coming soon row must fail)", () => {
    const purchase = purchaseSurfaceCatalog();
    expect(purchase.some((d) => d.catalogStatus === "coming")).toBe(false);
    expect(purchase.some((d) => /coming soon/i.test(d.name))).toBe(false);
    expect(purchase.map((d) => d.id).sort()).toEqual(
      ["BRIEF", "DOSS", "FLOOD", "REC", "SITEPLAN", "TERRAIN"].sort(),
    );
    const groups = reportCatalogGroups();
    const htmlish = groups
      .flatMap((g) => g.rows.map((r) => `${g.group}:${r.name}:${r.catalogStatus}`))
      .join("|");
    expect(htmlish.toLowerCase()).not.toContain("coming soon");
  });

  it("the 10-of-12 meter is retired (violate: readyCount must fail)", () => {
    expect(() => readyCount(true)).toThrow(/10\/12|retired/i);
  });

  it("groups are Reports / Exports / Tools — not Packages", () => {
    expect(reportCatalogGroups().map((g) => g.group)).toEqual([
      "Reports",
      "Exports",
      "Tools",
    ]);
  });

  it("exports collapse to Site plan (PDF, DXF, IFC) and Terrain (DXF, IFC, GLB)", () => {
    const exports = reportCatalogGroups().find((g) => g.group === "Exports");
    expect(exports?.rows.map((r) => r.name)).toEqual(["Site plan", "Terrain"]);
    expect(exports?.rows[0]?.formatLabel).toBe("PDF, DXF, IFC");
    expect(exports?.rows[1]?.formatLabel).toBe("DXF, IFC, GLB");
  });

  it("locked extras stay as live verbs, not new report SKUs", () => {
    expect(findReportDoc("REC").kind).toBe("Tool");
    expect(findReportDoc("BRIEF").kind).toBe("Tool");
    expect(findReportDoc("FEAS").purchaseSurface).toBe(false);
    expect(findReportDoc("COMP").purchaseSurface).toBe(false);
  });

  it("Studio lock chip carries tier and price", () => {
    const terrain = findReportDoc("TERRAIN");
    const locked = reportDocLockChip(terrain, { studioGranted: false });
    expect(locked?.text).toBe("Studio, $129/mo");
    expect(reportDocIsGeneratable(terrain, false)).toBe(false);
    expect(reportDocIsGeneratable(terrain, true)).toBe(true);
  });

  it("format aliases normalize to the collapsed export rows", () => {
    expect(normalizeReportDocId("SPPDF")).toBe("SITEPLAN");
    expect(normalizeReportDocId("TERGLB")).toBe("TERRAIN");
    expect(isReportDocId("SPPDF")).toBe(true);
    expect(isReportDocId("SITEPLAN")).toBe(true);
  });

  it("freshness line is address + verified day, never a 10/12 meter", () => {
    expect(
      reportsFreshnessLine("905 Pecan St", new Date("2026-08-27T12:00:00.000Z")),
    ).toBe("905 Pecan St, verified 27 August 2026");
  });

  it("coming-soon catalog rows never count as generatable", () => {
    const coming = REPORTS_CATALOG.filter((d) => d.catalogStatus === "coming");
    for (const doc of coming) {
      expect(reportDocIsGeneratable(doc, true)).toBe(false);
      expect(reportDocStatus(doc, { studioGranted: true }).text).toBe(
        "Coming soon",
      );
    }
  });

  it("Records request is Studio-gated in Tools group", () => {
    const rec = findReportDoc("REC");
    expect(rec.studioGated).toBe(true);
    expect(rec.group).toBe("Tools");
    expect(reportDocIsGeneratable(rec, false)).toBe(false);
    expect(reportDocIsGeneratable(rec, true)).toBe(true);
    const locked = reportDocLockChip(rec, { studioGranted: false });
    expect(locked?.text).toContain("Studio");
  });
});
