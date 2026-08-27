// Per-grant share package (W3.1 / W3.4). Lives on the sharer's dossier so
// compose can honor include/exclude without a second URL scheme or a grant
// schema change. Never projected to the share viewer.

import type { SharePersona } from "./share-personas";
import { sanitizeSharePersona } from "./share-personas";

export const SHARE_PACKAGES_MAX = 20;

export interface ShareReportSelection {
  xray: boolean;
  flood: boolean;
}

export interface DossierSharePackage {
  grantId: string;
  includeNotes: boolean;
  includeXray?: boolean;
  includeFlood?: boolean;
  persona: SharePersona;
  message: string;
  savedAt: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function sanitizeShareReportSelection(
  value: unknown,
): ShareReportSelection | null {
  const rec = asRecord(value);
  if (!rec) return null;
  if (typeof rec.xray !== "boolean" || typeof rec.flood !== "boolean") {
    return null;
  }
  return { xray: rec.xray, flood: rec.flood };
}

export function sanitizeSharePackage(value: unknown): DossierSharePackage | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const grantId = str(rec.grantId);
  const persona = sanitizeSharePersona(rec.persona);
  const message = str(rec.message);
  const savedAt = str(rec.savedAt);
  if (!grantId || !persona || !message || !savedAt || typeof rec.includeNotes !== "boolean") {
    return null;
  }
  return {
    grantId: grantId.slice(0, 200),
    includeNotes: rec.includeNotes,
    ...(typeof rec.includeXray === "boolean" ? { includeXray: rec.includeXray } : {}),
    ...(typeof rec.includeFlood === "boolean" ? { includeFlood: rec.includeFlood } : {}),
    persona,
    message: message.slice(0, 2_000),
    savedAt,
  };
}

export function sanitizeSharePackages(value: unknown): DossierSharePackage[] | null {
  if (!Array.isArray(value)) return null;
  const packages = value
    .map(sanitizeSharePackage)
    .filter((p): p is DossierSharePackage => p !== null);
  if (packages.length === 0) return null;
  const byId = new Map<string, DossierSharePackage>();
  for (const p of packages) byId.set(p.grantId, p);
  return [...byId.values()]
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    .slice(0, SHARE_PACKAGES_MAX);
}

export function upsertSharePackage(
  current: DossierSharePackage[] | undefined,
  entry: DossierSharePackage,
): DossierSharePackage[] {
  const kept = (current ?? []).filter((p) => p.grantId !== entry.grantId);
  return [entry, ...kept].slice(0, SHARE_PACKAGES_MAX);
}

/** Resolve the package for one grant from a raw snapshot. Absent = no package. */
export function sharePackageForGrant(
  snapshot: unknown,
  grantId: string,
): DossierSharePackage | null {
  const rec = asRecord(snapshot);
  if (!rec || !grantId.trim()) return null;
  const packages = sanitizeSharePackages(rec.sharePackages);
  if (!packages) return null;
  return packages.find((p) => p.grantId === grantId) ?? null;
}

/**
 * Exclude-notes cannot bind without a grant id (compose keys the package
 * on it). Refuse rather than hand out a link that would leak notes.
 */
export function notesExcludeNeedsGrantId(
  includeNotes: boolean,
  grantId: string | null | undefined,
): boolean {
  return includeNotes === false && !grantId;
}
