// Share-view VERDICT line — a compact, honest headline over the full brief.
//
// Pure derivation from the R1 payload's own sections; each fragment appears
// ONLY when the payload asserts it (never fabricated, honest absences are
// skipped, and a payload asserting nothing yields the honest fallback line).

import type { ResearchBriefPayload } from "../browse/brief-view-model";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const VERDICT_FALLBACK =
  "No verified facts to headline — see the brief below for what is and is not verified for this parcel.";

/** Compact verdict fragments, in display order. Empty → use VERDICT_FALLBACK. */
export function deriveShareVerdict(payload: ResearchBriefPayload): string[] {
  const fragments: string[] = [];
  const sections = payload.brief?.sections ?? [];
  const byId = new Map(sections.map((s) => [s.id, s.data] as const));

  const zoning = asRecord(byId.get("zoning"));
  const district = zoning ? str(zoning.district) : null;
  if (district) fragments.push(`Zoned ${district}`);

  const env = asRecord(byId.get("setbacks-envelope"));
  if (env) {
    const status = str(env.status);
    const pct = num(env.buildableAreaPct);
    if (status === "no-buildable-area") {
      fragments.push("No buildable area after setbacks");
    } else if (pct !== null) {
      fragments.push(`Buildable ${Math.round(pct)}% of the lot`);
    }
  }

  const flood = asRecord(byId.get("flood"));
  if (flood) {
    const status = str(flood.status);
    const zone = str(flood.floodZone);
    if (status === "in-sfha") {
      fragments.push(
        zone ? `In FEMA flood zone ${zone} (SFHA)` : "In a FEMA Special Flood Hazard Area",
      );
    } else if (status === "flood-zone") {
      fragments.push(zone ? `FEMA flood zone ${zone}` : "In a mapped FEMA flood zone");
    } else if (status === "outside-sfha") {
      fragments.push("Outside mapped FEMA flood zones");
    }
  }

  return fragments;
}
