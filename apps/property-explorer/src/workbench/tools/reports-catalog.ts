// Purchase-surface catalog (W7). Reports are X-ray + Flood + Feasibility
// Study (P32 wave 2). Site plan and terrain are exports. Coming-soon rows
// stay in the file so live verbs are not deleted, but they never appear on
// the picker.

import type { SitePlanExportFormat } from "../../lib/sitePlanExportClient";
import type { TerrainExportFormat } from "../../lib/terrainExportClient";
import { PE_PRICING } from "../../lib/pricing";
import { PE as PE_CHROME } from "../../styles/pe-chrome";

export type ReportDocId =
  | "FEAS"
  | "REC"
  | "DOSS"
  | "COMP"
  | "FLOOD"
  | "BRIEF"
  | "SITEPLAN"
  | "TERRAIN"
  | "SPPDF"
  | "SPDXF"
  | "SPIFC"
  | "TERGLB"
  | "TERIFC"
  | "TERDXF";

export type ReportDocGroup = "Reports" | "Exports" | "Tools";
export type ReportDocKind = "Report" | "Export" | "Tool";
export type ReportEngine =
  | "none"
  | "site-plan"
  | "terrain"
  | "flood"
  | "dossier"
  | "feasibility"
  | "brief"
  | "records";

export interface ReportDocDef {
  id: ReportDocId;
  group: ReportDocGroup;
  name: string;
  kind: ReportDocKind;
  catalogStatus: "coming" | "ready" | "studio" | "open";
  /** False = not on the purchase picker (coming-soon or format alias). */
  purchaseSurface: boolean;
  promise: string;
  formatLabel: string;
  engine: ReportEngine;
  sitePlanFormat?: SitePlanExportFormat;
  terrainFormat?: TerrainExportFormat;
  studioGated?: boolean;
  /**
   * P-119 (2026-09-05, the operator's authoritative Smart Site package
   * table): on a `studioGated` row, an active Property Unlock is a SECOND
   * door that opens it, alongside Studio/Team — true for site plan, terrain,
   * and Feasibility Study (and their format aliases), because the Property
   * Unlock row explicitly includes them. Records request is ALSO
   * `studioGated` but is NOT in the Property Unlock row (out of scope for
   * this ruling) and must NOT set this flag — leaving it `undefined` there
   * keeps Records studio-only, unchanged.
   */
  propertyUnlockGrants?: boolean;
  covers?: string;
}

export const REPORT_DOC_IDS: readonly ReportDocId[] = [
  "FEAS",
  "REC",
  "DOSS",
  "COMP",
  "FLOOD",
  "BRIEF",
  "SITEPLAN",
  "TERRAIN",
  "SPPDF",
  "SPDXF",
  "SPIFC",
  "TERGLB",
  "TERIFC",
  "TERDXF",
] as const;

const FORMAT_ALIASES: Record<string, ReportDocId> = {
  SPPDF: "SITEPLAN",
  SPDXF: "SITEPLAN",
  SPIFC: "SITEPLAN",
  TERGLB: "TERRAIN",
  TERIFC: "TERRAIN",
  TERDXF: "TERRAIN",
};

export const REPORTS_CATALOG: readonly ReportDocDef[] = [
  {
    id: "DOSS",
    group: "Reports",
    name: "X-ray",
    kind: "Report",
    catalogStatus: "ready",
    purchaseSurface: true,
    promise:
      "Verdict, cited brief facts, notes, and the site-plan sheets appended.",
    formatLabel: "PDF",
    engine: "dossier",
  },
  {
    id: "FLOOD",
    group: "Reports",
    name: "Flood and Drainage",
    kind: "Report",
    catalogStatus: "ready",
    purchaseSurface: true,
    promise: "Where water goes on this lot, as a 2-sheet PDF.",
    formatLabel: "PDF",
    engine: "flood",
    covers: "Drawn on the map while this study is open",
  },
  {
    id: "SITEPLAN",
    group: "Exports",
    name: "Site plan",
    kind: "Export",
    catalogStatus: "ready",
    purchaseSurface: true,
    promise: "The drawn sheet and the layers a drafter can open.",
    formatLabel: "PDF, DXF, IFC",
    engine: "site-plan",
    // P-104: site-plan CAD is a Studio deliverable and always was on the
    // pricing table; this flag was missing, so the row rendered unlocked.
    // The flag is the SURFACE half only. The enforcing half is the server
    // gate in api/_lib/pe-site-plan-export-core.ts, which now requires the
    // server-computed studioGranted. Landing this line alone would have been
    // the defect P-104 exists to remove: a lock a direct call walks past.
    studioGated: true,
    // P-119: also included in the Property Unlock row — see propertyUnlockGrants doc above.
    propertyUnlockGrants: true,
  },
  {
    id: "TERRAIN",
    group: "Exports",
    name: "Terrain",
    kind: "Export",
    catalogStatus: "studio",
    purchaseSurface: true,
    promise: "Ground surface for modeling tools.",
    formatLabel: "DXF, IFC, GLB",
    engine: "terrain",
    studioGated: true,
    propertyUnlockGrants: true,
  },
  {
    id: "REC",
    group: "Tools",
    name: "Records request",
    kind: "Tool",
    catalogStatus: "ready",
    purchaseSurface: true,
    promise:
      "The recorded documents the county clerk's index ties to this parcel.",
    formatLabel: "Request",
    engine: "records",
    studioGated: true,
  },
  {
    id: "BRIEF",
    group: "Tools",
    name: "Property brief",
    kind: "Tool",
    catalogStatus: "open",
    purchaseSurface: true,
    promise: "Cited research writeup. Chrome, not a report packet.",
    formatLabel: "In-app",
    engine: "brief",
  },
  {
    id: "FEAS",
    group: "Reports",
    name: "Feasibility Study",
    kind: "Report",
    catalogStatus: "ready",
    purchaseSurface: true,
    promise:
      "Zoning envelope, flood, terrain, utilities, wells, and every open item — one composed PDF, site plan appended.",
    formatLabel: "PDF",
    engine: "feasibility",
    // P32 wave 2 / tier ruling (_decisions/2026-09-03_p32_feasibility_tier_ruling.md):
    // Studio + Team, same rule as site-plan and terrain. The flag is the
    // SURFACE half only. The enforcing half is the server gate in
    // api/_lib/pe-feasibility-export-core.ts, which requires the
    // server-computed studioGranted — never a new, independent check.
    studioGated: true,
    // P-119: also included in the Property Unlock row — see propertyUnlockGrants doc above.
    propertyUnlockGrants: true,
  },
  {
    id: "COMP",
    group: "Reports",
    name: "Comparison report",
    kind: "Report",
    catalogStatus: "coming",
    purchaseSurface: false,
    promise: "Compare stays the compare tool. Not a report SKU.",
    formatLabel: "PDF",
    engine: "none",
  },
  {
    id: "SPPDF",
    group: "Exports",
    name: "Site plan",
    kind: "Export",
    catalogStatus: "ready",
    purchaseSurface: false,
    promise: "Alias for Site plan.",
    formatLabel: "PDF",
    engine: "site-plan",
    sitePlanFormat: "pdf-site-plan",
    studioGated: true,
    propertyUnlockGrants: true,
  },
  {
    id: "SPDXF",
    group: "Exports",
    name: "Site plan",
    kind: "Export",
    catalogStatus: "ready",
    purchaseSurface: false,
    promise: "Alias for Site plan.",
    formatLabel: "DXF",
    engine: "site-plan",
    sitePlanFormat: "dxf-site-plan",
    studioGated: true,
    propertyUnlockGrants: true,
  },
  {
    id: "SPIFC",
    group: "Exports",
    name: "Site plan",
    kind: "Export",
    catalogStatus: "ready",
    purchaseSurface: false,
    promise: "Alias for Site plan.",
    formatLabel: "IFC",
    engine: "site-plan",
    sitePlanFormat: "ifc-site-plan",
    studioGated: true,
    propertyUnlockGrants: true,
  },
  {
    id: "TERGLB",
    group: "Exports",
    name: "Terrain",
    kind: "Export",
    catalogStatus: "studio",
    purchaseSurface: false,
    promise: "Alias for Terrain.",
    formatLabel: "GLB",
    engine: "terrain",
    terrainFormat: "glb",
    studioGated: true,
    propertyUnlockGrants: true,
  },
  {
    id: "TERIFC",
    group: "Exports",
    name: "Terrain",
    kind: "Export",
    catalogStatus: "studio",
    purchaseSurface: false,
    promise: "Alias for Terrain.",
    formatLabel: "IFC",
    engine: "terrain",
    terrainFormat: "ifc",
    studioGated: true,
    propertyUnlockGrants: true,
  },
  {
    id: "TERDXF",
    group: "Exports",
    name: "Terrain",
    kind: "Export",
    catalogStatus: "studio",
    purchaseSurface: false,
    promise: "Alias for Terrain.",
    formatLabel: "DXF",
    engine: "terrain",
    terrainFormat: "dxf-contour",
    studioGated: true,
    propertyUnlockGrants: true,
  },
];

const ID_SET = new Set<string>(REPORT_DOC_IDS);

export function isReportDocId(value: unknown): value is ReportDocId {
  return typeof value === "string" && ID_SET.has(value);
}

export function normalizeReportDocId(id: ReportDocId): ReportDocId {
  return FORMAT_ALIASES[id] ?? id;
}

export function findReportDoc(id: ReportDocId): ReportDocDef {
  const canonical = normalizeReportDocId(id);
  const found = REPORTS_CATALOG.find((row) => row.id === canonical);
  if (!found) {
    throw new Error(`reports-catalog: unknown id ${id}`);
  }
  return found;
}

export function purchaseSurfaceCatalog(): readonly ReportDocDef[] {
  return REPORTS_CATALOG.filter((row) => row.purchaseSurface);
}

export function reportCatalogGroups(): Array<{
  group: ReportDocGroup;
  rows: readonly ReportDocDef[];
}> {
  const order: ReportDocGroup[] = ["Reports", "Exports", "Tools"];
  return order.map((group) => ({
    group,
    rows: purchaseSurfaceCatalog().filter((row) => row.group === group),
  }));
}

/**
 * P-119: a `studioGated` row opens on Studio/Team OR (when the row carries
 * `propertyUnlockGrants`) an active Property Unlock. `propertyUnlocked`
 * defaults to false so every existing positional call keeps its prior
 * answer unchanged; Records request (`studioGated` with no
 * `propertyUnlockGrants`) is unaffected regardless of this argument.
 */
export function reportDocIsGeneratable(
  doc: ReportDocDef,
  studioGranted: boolean,
  propertyUnlocked = false,
): boolean {
  if (doc.catalogStatus === "coming") return false;
  const propertyUnlockOpensThis = doc.propertyUnlockGrants === true && propertyUnlocked;
  if (doc.studioGated && !studioGranted && !propertyUnlockOpensThis) return false;
  return true;
}

const SUCCESS = PE_CHROME.success;
const MUTED = PE_CHROME.absence;
const WARN = PE_CHROME.warning;
const SLATE = PE_CHROME.muted;

export function reportDocLockChip(
  doc: ReportDocDef,
  opts: { studioGranted: boolean; propertyUnlocked?: boolean },
): { text: string; color: string } | null {
  if (doc.catalogStatus === "coming") return null;
  const propertyUnlockOpensThis =
    doc.propertyUnlockGrants === true && opts.propertyUnlocked === true;
  if (doc.studioGated && !opts.studioGranted && !propertyUnlockOpensThis) {
    return {
      text: `${PE_PRICING.studio.title}, ${PE_PRICING.studio.priceLabel}`,
      color: WARN,
    };
  }
  return null;
}

export function reportDocStatus(
  doc: ReportDocDef,
  opts: {
    studioGranted: boolean;
    propertyUnlocked?: boolean;
    generatedLabel?: string | null;
  },
): { text: string; color: string } {
  const lock = reportDocLockChip(doc, opts);
  if (lock) return lock;
  if (doc.catalogStatus === "coming") {
    return { text: "Coming soon", color: MUTED };
  }
  if (doc.catalogStatus === "open") {
    return { text: "Open", color: SLATE };
  }
  if (opts.generatedLabel) {
    return { text: `Download · ${opts.generatedLabel}`, color: SUCCESS };
  }
  return { text: verbFor(doc), color: SUCCESS };
}

function verbFor(doc: ReportDocDef): string {
  if (doc.engine === "brief" || doc.engine === "records") return "Open";
  if (doc.engine === "site-plan" || doc.engine === "terrain") return "Export";
  return "Download";
}

export function reportDocMeta(
  doc: ReportDocDef,
  generatedLabel?: string | null,
): Array<{ k: string; v: string }> {
  const rows: Array<{ k: string; v: string }> = [
    { k: "Format", v: doc.formatLabel },
  ];
  if (generatedLabel) {
    rows.push({ k: "Generated", v: generatedLabel });
  }
  if (doc.covers) {
    rows.push({ k: "Includes", v: doc.covers });
  }
  return rows;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function formatVerifiedDay(at: Date): string {
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/** "905 Pecan St, verified 27 August 2026" */
export function reportsFreshnessLine(
  address: string | null,
  verifiedAt: Date,
): string {
  const day = formatVerifiedDay(verifiedAt);
  return address ? `${address}, verified ${day}` : `verified ${day}`;
}

/** @deprecated Meter is retired. Kept so a stray import fails closed in tests. */
export function readyCount(_studioGranted: boolean): {
  ready: number;
  total: number;
} {
  throw new Error("readyCount is retired — the 10/12 meter is not a purchase surface");
}
