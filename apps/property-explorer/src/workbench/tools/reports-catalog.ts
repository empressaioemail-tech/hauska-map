// Option D catalog — the picker list. Coming-soon rows are findable here.
// Status labels are presentation. Entitlement gates stay in ReportsTool:
// site-plan DXF/IFC remain paid/unlock; terrain formats stay Studio-gated.

import type { SitePlanExportFormat } from "../../lib/sitePlanExportClient";
import type { TerrainExportFormat } from "../../lib/terrainExportClient";
import { PE } from "../../styles/pe-chrome";

export type ReportDocId =
  | "FEAS"
  | "REC"
  | "DOSS"
  | "COMP"
  | "FLOOD"
  | "BRIEF"
  | "SPPDF"
  | "SPDXF"
  | "SPIFC"
  | "TERGLB"
  | "TERIFC"
  | "TERDXF";

export type ReportDocGroup = "Packages" | "Studies" | "Exports";
export type ReportDocKind = "Package" | "Study" | "Export";
export type ReportEngine =
  | "none"
  | "site-plan"
  | "terrain"
  | "flood"
  | "dossier"
  | "brief"
  | "records";

export interface ReportDocDef {
  id: ReportDocId;
  group: ReportDocGroup;
  name: string;
  kind: ReportDocKind;
  /** Frame status. `studio` means Studio-gated, not a gold CTA. */
  catalogStatus: "coming" | "ready" | "studio" | "open";
  promise: string;
  formatLabel: string;
  engine: ReportEngine;
  sitePlanFormat?: SitePlanExportFormat;
  terrainFormat?: TerrainExportFormat;
  studioGated?: boolean;
  covers?: string;
}

export const REPORT_DOC_IDS: readonly ReportDocId[] = [
  "FEAS",
  "REC",
  "DOSS",
  "COMP",
  "FLOOD",
  "BRIEF",
  "SPPDF",
  "SPDXF",
  "SPIFC",
  "TERGLB",
  "TERIFC",
  "TERDXF",
] as const;

export const REPORTS_CATALOG: readonly ReportDocDef[] = [
  {
    id: "FEAS",
    group: "Packages",
    name: "Feasibility Study",
    kind: "Package",
    catalogStatus: "coming",
    promise: "The cited package you hand to someone else.",
    formatLabel: "PDF, 16 sections + appended sheets",
    engine: "none",
    covers: "Site plan and flood sheets",
  },
  {
    id: "REC",
    group: "Packages",
    name: "Records request",
    kind: "Package",
    catalogStatus: "ready",
    promise:
      "The recorded documents the county clerk's index ties to this parcel, read and cited.",
    formatLabel: "In-app instruments + cited clauses",
    engine: "records",
  },
  {
    id: "DOSS",
    group: "Packages",
    name: "X-ray",
    kind: "Package",
    catalogStatus: "ready",
    promise:
      "Verdict, cited brief facts, notes, and the site-plan sheets appended.",
    formatLabel: "PDF",
    engine: "dossier",
  },
  {
    id: "COMP",
    group: "Packages",
    name: "Comparison report",
    kind: "Package",
    catalogStatus: "coming",
    promise: "Two or more parcels side by side.",
    formatLabel: "PDF",
    engine: "none",
  },
  {
    id: "FLOOD",
    group: "Studies",
    name: "Flood & drainage study",
    kind: "Study",
    catalogStatus: "ready",
    promise: "Where water goes on this lot, as a 2-sheet PDF.",
    formatLabel: "PDF, 2 sheets",
    engine: "flood",
    covers: "Drawn on the map while this study is open",
  },
  {
    id: "BRIEF",
    group: "Studies",
    name: "Property brief",
    kind: "Study",
    catalogStatus: "open",
    promise: "Cited research writeup, not a deliverable packet.",
    formatLabel: "In-app, cited",
    engine: "brief",
  },
  {
    id: "SPPDF",
    group: "Exports",
    name: "Site plan sheet",
    kind: "Export",
    catalogStatus: "ready",
    promise: "The drawn sheet, for print and email.",
    formatLabel: "PDF",
    engine: "site-plan",
    sitePlanFormat: "pdf-site-plan",
  },
  {
    id: "SPDXF",
    group: "Exports",
    name: "Site plan CAD",
    kind: "Export",
    catalogStatus: "ready",
    promise: "Layers your drafter can open.",
    formatLabel: "DXF, layered",
    engine: "site-plan",
    sitePlanFormat: "dxf-site-plan",
  },
  {
    id: "SPIFC",
    group: "Exports",
    name: "Site plan model",
    kind: "Export",
    catalogStatus: "ready",
    promise: "Model exchange for BIM tools.",
    formatLabel: "IFC, layered",
    engine: "site-plan",
    sitePlanFormat: "ifc-site-plan",
  },
  {
    id: "TERGLB",
    group: "Exports",
    name: "Terrain mesh",
    kind: "Export",
    catalogStatus: "studio",
    promise: "Ground surface as a mesh.",
    formatLabel: "GLB",
    engine: "terrain",
    terrainFormat: "glb",
    studioGated: true,
  },
  {
    id: "TERIFC",
    group: "Exports",
    name: "Terrain",
    kind: "Export",
    catalogStatus: "studio",
    promise: "Terrain for model exchange.",
    formatLabel: "IFC4",
    engine: "terrain",
    terrainFormat: "ifc",
    studioGated: true,
  },
  {
    id: "TERDXF",
    group: "Exports",
    name: "Terrain surface",
    kind: "Export",
    catalogStatus: "studio",
    promise: "Contours for site drawings.",
    formatLabel: "DXF, contours",
    engine: "terrain",
    terrainFormat: "dxf-contour",
    studioGated: true,
  },
];

const ID_SET = new Set<string>(REPORT_DOC_IDS);

export function isReportDocId(value: unknown): value is ReportDocId {
  return typeof value === "string" && ID_SET.has(value);
}

export function findReportDoc(id: ReportDocId): ReportDocDef {
  const found = REPORTS_CATALOG.find((row) => row.id === id);
  if (!found) {
    throw new Error(`reports-catalog: unknown id ${id}`);
  }
  return found;
}

export function reportCatalogGroups(): Array<{
  group: ReportDocGroup;
  rows: readonly ReportDocDef[];
}> {
  const order: ReportDocGroup[] = ["Packages", "Studies", "Exports"];
  return order.map((group) => ({
    group,
    rows: REPORTS_CATALOG.filter((row) => row.group === group),
  }));
}

export function reportDocIsGeneratable(
  doc: ReportDocDef,
  studioGranted: boolean,
): boolean {
  if (doc.catalogStatus === "coming") return false;
  if (doc.studioGated && !studioGranted) return false;
  return true;
}

export function readyCount(studioGranted: boolean): {
  ready: number;
  total: number;
} {
  return {
    ready: REPORTS_CATALOG.filter((doc) =>
      reportDocIsGeneratable(doc, studioGranted),
    ).length,
    total: REPORTS_CATALOG.length,
  };
}

const SUCCESS = PE.success;
const MUTED = PE.absence;
const WARN = PE.warning;
const SLATE = PE.muted;

export function reportDocStatus(
  doc: ReportDocDef,
  opts: { studioGranted: boolean; generatedLabel?: string | null },
): { text: string; color: string } {
  if (doc.catalogStatus === "coming") {
    return { text: "Coming soon", color: MUTED };
  }
  if (doc.studioGated && !opts.studioGranted) {
    return { text: "Studio", color: WARN };
  }
  if (doc.catalogStatus === "open") {
    return { text: "Available", color: SLATE };
  }
  if (opts.generatedLabel) {
    return { text: `Ready · ${opts.generatedLabel}`, color: SUCCESS };
  }
  return { text: "Ready", color: SUCCESS };
}

export function reportDocMeta(
  doc: ReportDocDef,
  generatedLabel?: string | null,
): Array<{ k: string; v: string }> {
  const rows: Array<{ k: string; v: string }> = [
    { k: "Format", v: doc.formatLabel },
  ];
  if (doc.catalogStatus === "coming") {
    rows.push({ k: "Status", v: "Coming soon" });
  } else if (generatedLabel) {
    rows.push({ k: "Generated", v: generatedLabel });
  }
  if (doc.covers) {
    rows.push({ k: "Includes", v: doc.covers });
  }
  return rows;
}
