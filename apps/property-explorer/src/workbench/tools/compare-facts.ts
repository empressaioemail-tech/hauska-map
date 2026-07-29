// apps/property-explorer/src/workbench/tools/compare-facts.ts
//
// WB7 COMPARE — pure fact-column derivation for the side-by-side compare of
// two SAVED properties, inside the ONE shared dock (a dock tool, never a
// second surface).
//
// REUSE, DON'T FORK (the standing rule):
//   - VERDICT: `composeBriefVerdict` (src/browse/brief-verdict.ts) is called
//     over an R1-SHAPED payload assembled here from the property's baked
//     facets + tier2 flood — the section mapping mirrors the share view's
//     `buildShareBriefPayload` (api/_lib/pe-share-brief.ts, itself a mirror of
//     cortex buildR1Brief). Only the ADAPTER lives here; the verdict wording,
//     red-flag ordering, and the earned "no red flags" tail stay in the one
//     composer.
//   - PER-FACT HONESTY: zoning / setbacks / buildable / land use / acreage
//     come from `deriveBakedCardModel` (src/lib/baked-facets.ts) — the same
//     present / absent / pending idioms the inspect card renders ("not
//     verified here", provisional qualifiers, build-to-line wording). Nothing
//     is re-derived, nothing fabricated.
//
// Flood is NOT in the typed BakedFacetPayload — it rides the facets wire
// response as the `tier2.flood` sibling (see pe-property-atoms.ts, which
// passes tier2 through with envelope stripped). This module reads it
// defensively; an absent flood facet renders the honest absence.

import {
  deriveBakedCardModel,
  fetchBakedNodeFacets,
  type BakedFacetPayload,
  type BakedFacetsFetchResult,
  type CardFacet,
} from "../../lib/baked-facets";
import { PE_FACETS_PROXY_BASE } from "../../lib/config";
import {
  composeBriefVerdict,
  type BriefVerdict,
} from "../../browse/brief-verdict";
import type { ResearchBriefPayload } from "../../browse/brief-view-model";

// ---------------------------------------------------------------------------
// Stored state (JSON-serializable — persisted through the chassis store).
// ---------------------------------------------------------------------------

/** One property's fetched compare payload (facets + the tier2 flood sibling). */
export interface CompareSlotData {
  parcelNodeId: string;
  facets: BakedFacetPayload;
  /** The wire response's `tier2` sibling (flood rides here); null when absent. */
  tier2: unknown;
  snapshotAt: string | null;
  fetchedAt: string;
}

/** The compare tool's persisted state: two slot selections + their payloads. */
export interface CompareStoredState {
  a: string | null;
  b: string | null;
  /** Fetched payloads keyed by parcelNodeId (kept for the selected slots). */
  payloads: Record<string, CompareSlotData>;
}

// ---------------------------------------------------------------------------
// Facets → R1-shaped payload (the verdict-composer adapter).
// ---------------------------------------------------------------------------

/**
 * Assemble the R1-shaped payload `composeBriefVerdict` expects from the baked
 * facets + tier2. Section ids/data mirror buildShareBriefPayload exactly
 * (zoning / setbacks-envelope / flood / land-use); runId is a local synthetic
 * (the composer never reads it) so this stays browser-safe (no Buffer).
 */
export function briefPayloadFromFacets(data: CompareSlotData): ResearchBriefPayload {
  const facets = data.facets ?? {};
  const tier2 =
    data.tier2 !== null && typeof data.tier2 === "object" && !Array.isArray(data.tier2)
      ? (data.tier2 as Record<string, unknown>)
      : null;
  return {
    runId: `pe-compare-${data.parcelNodeId}`,
    reportFamily: "R1",
    mode: "baked-facet-intel-v1",
    parcelNodeId: data.parcelNodeId,
    brief: {
      sections: [
        { id: "zoning", title: "Zoning", data: facets.zoning ?? null },
        {
          id: "setbacks-envelope",
          title: "Setbacks and buildable envelope",
          data: facets.envelope ?? null,
        },
        { id: "flood", title: "Flood", data: tier2?.flood ?? null },
        {
          id: "land-use",
          title: "Land use",
          data: facets.baseFacts?.landUse ?? null,
        },
      ],
      disclosure: [],
    },
    bakedAt: facets.bakedAt ?? data.snapshotAt ?? null,
    source: "baked-snapshot",
  };
}

// ---------------------------------------------------------------------------
// Fact rows.
// ---------------------------------------------------------------------------

export type CompareRowId =
  | "zoning"
  | "setbacks"
  | "buildable"
  | "flood"
  | "landUse"
  | "acreage"
  | "status";

export const COMPARE_ROWS: ReadonlyArray<{ id: CompareRowId; label: string }> = [
  { id: "zoning", label: "Zoning district" },
  { id: "setbacks", label: "Setbacks F/S/R" },
  { id: "buildable", label: "Buildable" },
  { id: "flood", label: "Flood" },
  { id: "landUse", label: "Land use" },
  { id: "acreage", label: "Acreage" },
  { id: "status", label: "Snapshot" },
];

export interface CompareCell {
  state: "present" | "absent" | "pending";
  /** Display copy. Absent cells carry the honest-absence copy, never a blank. */
  value: string;
  /** Per-fact source caption when the payload carries one; null = none recorded. */
  source: string | null;
}

export interface CompareColumn {
  parcelNodeId: string;
  /** Situs address from the facets when present (column header fallback). */
  address: string | null;
  verdict: BriefVerdict;
  cells: Record<CompareRowId, CompareCell>;
}

/** The card's honest-absence default, shared verbatim with the inspect card. */
export const NOT_VERIFIED_HERE = "not verified here";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** ISO-ish date → date part; null in, null out (never invent a date). */
function datePart(v: string | null): string | null {
  return v ? v.slice(0, 10) : null;
}

function cellFromFacet(facet: CardFacet<string>, source: string | null): CompareCell {
  if (facet.state === "present") {
    return { state: "present", value: facet.value ?? "", source };
  }
  if (facet.state === "pending") {
    return { state: "pending", value: facet.value ?? "pending", source };
  }
  // absent (or the pre-read "unknown", which never reaches here from a fetched
  // payload): honest absence — specific label when the model carried one.
  return { state: "absent", value: facet.value ?? NOT_VERIFIED_HERE, source: null };
}

/**
 * Zoning source caption from the wire zoning record's provenance (the typed
 * payload only carries `district`, but the wire carries layerName/stampedAt —
 * see the R1 fixtures). Honest null when nothing is recorded.
 */
export function zoningSourceCaption(facets: BakedFacetPayload): string | null {
  const zoning = rec(facets.zoning);
  const prov = zoning ? rec(zoning.provenance) : null;
  if (!prov) return null;
  const label = str(prov.layerName) ?? str(prov.sourceUrl);
  const stamped = datePart(str(prov.stampedAt));
  if (!label && !stamped) return null;
  return [label, stamped].filter((p): p is string => p !== null).join(" · ");
}

/** Envelope citation caption: the cited code URL's hostname (compact). */
export function envelopeSourceCaption(facets: BakedFacetPayload): string | null {
  const url = str(facets.envelope?.citationUrl);
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Flood facet cell from tier2.flood — vocabulary aligned with brief-verdict. */
export function floodCell(tier2: unknown): CompareCell {
  const flood = rec(rec(tier2)?.flood);
  const status = flood ? str(flood.status) : null;
  const prov = flood ? rec(flood.provenance) : null;
  const source =
    prov !== null
      ? [str(prov.source), datePart(str(prov.vintage))]
          .filter((p): p is string => p !== null)
          .join(" · ") || null
      : null;
  if (!flood || !status || status === "unavailable") {
    return { state: "absent", value: `flood ${NOT_VERIFIED_HERE}`, source: null };
  }
  const zone = str(flood.floodZone);
  const zoneSuffix = zone ? ` (Zone ${zone})` : "";
  if (status === "in-sfha") {
    const subtype = str(flood.zoneSubtype);
    const floodway = !!subtype && subtype.toUpperCase().includes("FLOODWAY");
    return {
      state: "present",
      value: floodway
        ? `Inside a FEMA floodway${zoneSuffix}`
        : `Inside the FEMA flood hazard area${zoneSuffix}`,
      source,
    };
  }
  if (status === "flood-zone") {
    return {
      state: "present",
      value: `Mapped FEMA flood zone${zoneSuffix}, outside the SFHA`,
      source,
    };
  }
  if (status === "outside-sfha") {
    return { state: "present", value: "Outside mapped flood hazard", source };
  }
  // Unknown enum value → honest absence, never a guess (verdict composer rule).
  return { state: "absent", value: `flood ${NOT_VERIFIED_HERE}`, source: null };
}

/**
 * Derive one property's compare column. Verdict via the REUSED composer; the
 * facet cells via the REUSED card model (same honesty idioms as the card).
 */
export function deriveCompareColumn(data: CompareSlotData): CompareColumn {
  const card = deriveBakedCardModel(data.facets ?? {});
  const verdict = composeBriefVerdict(briefPayloadFromFacets(data));
  const envCaption = envelopeSourceCaption(data.facets ?? {});

  // Buildable: the card facet already carries the honest vocabulary
  // (provisional qualifier, build-to-line pending, honest 0%, absence).
  const buildable = cellFromFacet(card.buildablePct, envCaption);

  const bakedDate = datePart(card.bakedAt ?? data.snapshotAt);
  const status: CompareCell = bakedDate
    ? { state: "present", value: `baked snapshot · ${bakedDate}`, source: null }
    : {
        state: "absent",
        value: "snapshot date not recorded",
        source: null,
      };

  return {
    parcelNodeId: data.parcelNodeId,
    address: str(data.facets?.baseFacts?.situsAddress),
    verdict,
    cells: {
      zoning: cellFromFacet(card.zoning, zoningSourceCaption(data.facets ?? {})),
      setbacks: cellFromFacet(card.setbacks, envCaption),
      buildable,
      flood: floodCell(data.tier2),
      // Land use / acreage render provenance INLINE (formatLandUseDisplay /
      // formatAcreageDisplay put "(source · vintage)" in the value) — no
      // separate caption, no double-print.
      landUse: cellFromFacet(card.landUse, null),
      acreage: cellFromFacet(card.acreage, null),
      status,
    },
  };
}

/**
 * Subtle difference emphasis: a row differs when the two properties GENUINELY
 * assert different things — value differs, or one asserts while the other is
 * honestly absent. Two absences never "differ" (nothing is asserted by either).
 */
export function cellsDiffer(
  a: CompareCell | undefined,
  b: CompareCell | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.state === "absent" && b.state === "absent") return false;
  if (a.state !== b.state) return true;
  return a.value.trim() !== b.value.trim();
}

// ---------------------------------------------------------------------------
// Payload fetch — the chat tool's facets source (fetchBakedNodeFacets through
// the same-origin BFF), keeping the tier2 sibling the chat path drops.
// ---------------------------------------------------------------------------

export type ComparePayloadOutcome =
  | { kind: "ok"; data: CompareSlotData }
  | { kind: "no-snapshot" }
  | { kind: "unavailable"; message: string };

export async function fetchComparePayload(
  parcelNodeId: string,
  fetcher: (
    parcelNodeId: string,
    base: string,
  ) => Promise<BakedFacetsFetchResult> = fetchBakedNodeFacets,
): Promise<ComparePayloadOutcome> {
  const result = await fetcher(parcelNodeId, PE_FACETS_PROXY_BASE);
  if (result.kind === "ok") {
    // tier2 rides the wire response beside `facets` (not in the typed shape).
    const root = rec(result.data as unknown) ?? {};
    return {
      kind: "ok",
      data: {
        parcelNodeId,
        facets: result.data.facets ?? {},
        tier2: root.tier2 ?? null,
        snapshotAt: result.data.snapshotAt ?? null,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
  if (result.kind === "not_found") return { kind: "no-snapshot" };
  return { kind: "unavailable", message: result.message };
}

// ---------------------------------------------------------------------------
// Slot reconciliation (pure — the container runs this against the saved list).
// ---------------------------------------------------------------------------

/**
 * Reconcile stored slot selections against the CURRENT saved list:
 *   - a selection that is no longer saved clears (honest: compare reads the
 *     saved list, it never compares a property the user un-saved);
 *   - slot A pre-fills with the ACTIVE property when empty, saved, and not
 *     already slot B (spec: the active property pre-fills slot A when saved);
 *   - payloads are pruned to the surviving selections.
 * Returns null when nothing changed (so the container can skip the write).
 */
export function reconcileCompareState(
  stored: CompareStoredState | null,
  savedIds: ReadonlySet<string>,
  activeParcelNodeId: string | null,
): CompareStoredState | null {
  const prev: CompareStoredState = stored ?? { a: null, b: null, payloads: {} };
  let a = prev.a !== null && savedIds.has(prev.a) ? prev.a : null;
  const b = prev.b !== null && savedIds.has(prev.b) ? prev.b : null;
  if (
    a === null &&
    activeParcelNodeId !== null &&
    savedIds.has(activeParcelNodeId) &&
    b !== activeParcelNodeId
  ) {
    a = activeParcelNodeId;
  }
  const keep = new Set([a, b].filter((id): id is string => id !== null));
  const payloads: Record<string, CompareSlotData> = {};
  for (const id of keep) {
    if (prev.payloads[id]) payloads[id] = prev.payloads[id];
  }
  const unchanged =
    a === prev.a &&
    b === prev.b &&
    Object.keys(payloads).length === Object.keys(prev.payloads).length &&
    Object.keys(payloads).every((id) => prev.payloads[id] === payloads[id]);
  return unchanged ? null : { a, b, payloads };
}
