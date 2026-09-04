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
      ["BRIEF", "DOSS", "FEAS", "FLOOD", "REC", "SITEPLAN", "TERRAIN"].sort(),
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

  // ---------------------------------------------------------------------------
  // P-104. The four site-plan rows carried NO studioGated flag while the
  // pricing table sold site-plan CAD as Studio, so the picker rendered them
  // unlocked for a $49 Solo subscriber. The flag is the SURFACE half; the
  // enforcing half is the server gate in pe-site-plan-export-core.ts. Landing
  // this flag alone would have been the defect, not the fix.
  // ---------------------------------------------------------------------------

  it("P-104: every site-plan row is Studio-gated (SITEPLAN, SPPDF, SPDXF, SPIFC)", () => {
    const sitePlanRows = REPORTS_CATALOG.filter((d) => d.engine === "site-plan");
    expect(sitePlanRows.map((d) => d.id).sort()).toEqual(
      ["SITEPLAN", "SPDXF", "SPIFC", "SPPDF"].sort(),
    );
    for (const row of sitePlanRows) {
      expect(row.studioGated).toBe(true);
      expect(reportDocIsGeneratable(row, false)).toBe(false);
      expect(reportDocIsGeneratable(row, true)).toBe(true);
    }
  });

  it("P-104 VIOLATION: a Solo subscriber sees the Studio lock chip on site plan", () => {
    const sitePlan = findReportDoc("SITEPLAN");
    const locked = reportDocLockChip(sitePlan, { studioGranted: false });
    expect(locked?.text).toBe("Studio, $129/mo");
    expect(reportDocLockChip(sitePlan, { studioGranted: true })).toBeNull();
  });

  it("P-104: site-plan and terrain rows are gated identically", () => {
    // One product rule, two engines. Any future row added to either engine
    // inherits the assertion rather than needing a second careful edit.
    const sitePlan = REPORTS_CATALOG.filter((d) => d.engine === "site-plan");
    const terrain = REPORTS_CATALOG.filter((d) => d.engine === "terrain");
    expect(sitePlan.length).toBeGreaterThan(0);
    expect(terrain.length).toBeGreaterThan(0);
    for (const row of [...sitePlan, ...terrain]) {
      expect(row.studioGated).toBe(true);
    }
  });

  it("P-104: the X-ray is NOT Studio-gated, and that is deliberate", () => {
    // DOSS is the X-ray report, a SOLO capability (pricing.ts: Solo is
    // "X-ray, flood & drainage study, unlimited AI, unlimited properties").
    // The MCP puts "dossier" in STUDIO_EXPORT_KINDS; the web deliberately
    // does not, because gating it here would take a sold capability away.
    const xray = findReportDoc("DOSS");
    expect(xray.name).toBe("X-ray");
    expect(xray.engine).toBe("dossier");
    expect(xray.studioGated).toBeUndefined();
    expect(reportDocIsGeneratable(xray, false)).toBe(true);
    expect(reportDocLockChip(xray, { studioGranted: false })).toBeNull();
  });

  it("P-104: flood and brief stay open to Solo", () => {
    for (const id of ["FLOOD", "BRIEF"] as const) {
      const doc = findReportDoc(id);
      expect(doc.studioGated).toBeUndefined();
      expect(reportDocIsGeneratable(doc, false)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // P32 wave 2. Feasibility Study flips from a coming-soon placeholder
  // (engine "none", purchaseSurface false) to a real Studio+Team report.
  // ---------------------------------------------------------------------------

  it("P32: Feasibility Study is a real, Studio-gated report row", () => {
    const feas = findReportDoc("FEAS");
    expect(feas.catalogStatus).toBe("ready");
    expect(feas.purchaseSurface).toBe(true);
    expect(feas.engine).toBe("feasibility");
    expect(feas.group).toBe("Reports");
    expect(feas.studioGated).toBe(true);
    expect(reportDocIsGeneratable(feas, false)).toBe(false);
    expect(reportDocIsGeneratable(feas, true)).toBe(true);
    const locked = reportDocLockChip(feas, { studioGranted: false });
    expect(locked?.text).toBe("Studio, $129/mo");
    expect(reportDocLockChip(feas, { studioGranted: true })).toBeNull();
  });

  it("P32: Feasibility Study is gated identically to site-plan and terrain (same product rule)", () => {
    const feas = findReportDoc("FEAS");
    const sitePlan = findReportDoc("SITEPLAN");
    for (const studioGranted of [true, false]) {
      expect(reportDocIsGeneratable(feas, studioGranted)).toBe(
        reportDocIsGeneratable(sitePlan, studioGranted),
      );
    }
  });
});
