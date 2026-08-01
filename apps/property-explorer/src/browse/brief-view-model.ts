// apps/property-explorer/src/browse/brief-view-model.ts
//
// Pure view-model derivation for the R1 "Property Intel brief" — the rendered
// replacement for the raw-JSON dump. Ports the DESIGN LANGUAGE of the Alder
// stakeholder-briefing renderer (legacy-design-tools briefingHtml.ts): every
// rendered fact carries its citation, the citation appendix groups sources and
// stamps a coarse freshness verdict, and absence is rendered as an explicit
// honest statement — never a blank, never a fabricated value.
//
// The server contract (cortex api-server routes/propertyExplorer.ts
// buildR1Brief): POST api/property-explorer/v1/research/brief →
//   { runId, reportFamily:"R1", mode:"baked-facet-intel-v1", parcelNodeId,
//     brief: { sections: [{id,title,data,citations[]}], disclosure: string[] },
//     citations: string[], bakedAt, source:"baked-snapshot" }
// Section data shapes are the baked facet payloads PE already types in
// src/lib/baked-facets.ts (zoning, envelope, Tier-2 flood facet, landUse).
//
// HONESTY (commitment #1): facts without provenance render with an explicit
// "source not recorded" — no fabricated sources, no invented confidence.
// Unknown/extra section ids render generically (title + key-value fact list)
// so a server-side section addition never crashes this surface and never
// falls back to JSON.stringify.

import { formatSetbackDisplay } from "../../api/_lib/setback-not-specified";
import { humanizeGisZoningSourceLabel } from "../lib/citation-labels";

// ---------------------------------------------------------------------------
// Wire types (mirrors the R1 response; all fields defensive-optional).
// ---------------------------------------------------------------------------

export interface ResearchBriefSection {
  id: string;
  title: string;
  data: unknown;
  citations?: string[];
}

export interface ResearchBriefPayload {
  runId: string;
  reportFamily?: string;
  mode?: string;
  parcelNodeId?: string;
  brief: {
    sections: ResearchBriefSection[];
    disclosure?: string[];
  };
  citations?: string[];
  bakedAt?: string | null;
  source?: string;
}

// ---------------------------------------------------------------------------
// View-model types.
// ---------------------------------------------------------------------------

/** Provenance attached to a single rendered fact. */
export interface BriefFactProvenance {
  /** Human source label (e.g. "FEMA NFHL", a zoning layer name). */
  source: string | null;
  /** ISO-ish vintage / stamp date the payload carried for this fact. */
  vintage: string | null;
  /** Citation URL when the payload carried one. */
  url: string | null;
}

export interface BriefFact {
  label: string;
  value: string;
  /**
   * null → the payload carried no provenance for this fact; the renderer MUST
   * say "source not recorded" (never fabricate a source).
   */
  provenance: BriefFactProvenance | null;
  /** 1-based appendix reference, when this fact's source has an appendix row. */
  citationIndex: number | null;
}

export interface BriefSectionVM {
  id: string;
  title: string;
  /** "facts" renders the fact list; "absent" renders the honest-absent copy. */
  kind: "facts" | "absent";
  /** Honest-absent copy (kind === "absent"). Mirrors "not verified here". */
  absentMessage: string | null;
  facts: BriefFact[];
  /**
   * Static concept copy explaining what the section's subject IS (what a
   * setback is, what zoning districts are). Explains concepts only — never
   * asserts a parcel fact.
   */
  explanation: string | null;
  /** Payload-verbatim notes (disclosure, districtNote, emptyReason, …). */
  notes: string[];
}

export type FreshnessVerdict = "fresh" | "aging" | "stale" | "unknown";

export interface CitationEntry {
  /** 1-based index — facts reference appendix rows by this number. */
  index: number;
  label: string;
  url: string | null;
  vintage: string | null;
  freshness: FreshnessVerdict;
  /** The section the citation belongs to (appendix grouping, Alder-style). */
  sectionTitle: string;
}

export interface BriefViewModel {
  header: {
    title: string;
    parcelNodeId: string | null;
    runId: string | null;
    reportFamily: string | null;
    mode: string | null;
    source: string | null;
    bakedAt: string | null;
  };
  sections: BriefSectionVM[];
  citations: CitationEntry[];
  disclosures: string[];
}

// ---------------------------------------------------------------------------
// Freshness verdict — ported from Alder briefingHtml.ts (coarse, human-readable
// thresholds: fresh < 90 days, aging < 365, stale ≥ 365, unknown on bad dates).
// ---------------------------------------------------------------------------

export function freshnessVerdict(
  dateish: string | null | undefined,
  nowMs: number,
): FreshnessVerdict {
  if (!dateish) return "unknown";
  const ts = new Date(dateish).getTime();
  if (Number.isNaN(ts)) return "unknown";
  const ageDays = (nowMs - ts) / (1000 * 60 * 60 * 24);
  if (ageDays < 90) return "fresh";
  if (ageDays < 365) return "aging";
  return "stale";
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

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

function fmtSqFt(v: number): string {
  return `${Math.round(v).toLocaleString("en-US")} sq ft`;
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Standard honest-absent copy — mirrors the inspect card's idiom. */
const NOT_VERIFIED = "not verified here";

// ---------------------------------------------------------------------------
// Citation collector — builds the appendix while sections register sources.
// ---------------------------------------------------------------------------

class CitationCollector {
  private entries: CitationEntry[] = [];
  private keyed = new Map<string, CitationEntry>();

  constructor(
    private readonly nowMs: number,
    private readonly bakedAt: string | null,
  ) {}

  /**
   * Register a source for a fact; returns its 1-based appendix index.
   * Freshness uses the fact's own vintage when present, else the brief's
   * bakedAt (the snapshot date is the honest fallback recency signal).
   */
  add(
    sectionTitle: string,
    label: string | null,
    url: string | null,
    vintage: string | null,
  ): number | null {
    if (!label && !url) return null;
    const key = `${sectionTitle}|${label ?? ""}|${url ?? ""}`;
    const existing = this.keyed.get(key);
    if (existing) {
      // Keep the first vintage seen; a later fact with a vintage upgrades an
      // entry that had none.
      if (!existing.vintage && vintage) {
        existing.vintage = vintage;
        existing.freshness = freshnessVerdict(vintage ?? this.bakedAt, this.nowMs);
      }
      return existing.index;
    }
    const entry: CitationEntry = {
      index: this.entries.length + 1,
      label: label ?? (url ? urlHost(url) : "(unlabeled source)"),
      url,
      vintage,
      freshness: freshnessVerdict(vintage ?? this.bakedAt, this.nowMs),
      sectionTitle,
    };
    this.entries.push(entry);
    this.keyed.set(key, entry);
    return entry.index;
  }

  all(): CitationEntry[] {
    return this.entries;
  }
}

// ---------------------------------------------------------------------------
// Per-section derivers, keyed by server section id.
// ---------------------------------------------------------------------------

const ZONING_EXPLANATION =
  "Zoning districts are assigned by the local jurisdiction and set which uses and building standards apply on a parcel. The district code below is the jurisdiction's own designation, read verbatim from the cited source.";

const SETBACKS_EXPLANATION =
  "A setback is the minimum distance a structure must be kept from a property line. Subtracting the setbacks from the lot boundary leaves the buildable envelope — the area of the lot where a structure may be placed.";

const FLOOD_EXPLANATION =
  "FEMA maps flood risk into zones. A Special Flood Hazard Area (SFHA) is the 1% annual-chance floodplain, where flood insurance is typically required for federally backed mortgages.";

const LAND_USE_EXPLANATION =
  "Land-use codes describe how the county appraisal record classifies the parcel's current use. They are descriptive, not an entitlement.";

function deriveZoning(
  section: ResearchBriefSection,
  cite: CitationCollector,
): BriefSectionVM {
  const data = asRecord(section.data);
  if (!data || !str(data.district)) {
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: `Zoning ${NOT_VERIFIED} — this parcel's baked snapshot carries no zoning stamp.`,
      facts: [],
      explanation: ZONING_EXPLANATION,
      notes: [],
    };
  }
  const district = str(data.district)!;
  const prov = asRecord(data.provenance);
  const layerName = prov ? str(prov.layerName) : null;
  const cityKey = prov ? str(prov.cityKey) : null;
  const sourceUrl = prov ? str(prov.sourceUrl) : null;
  const stampedAt = prov ? str(prov.stampedAt) : null;
  const sourceLabel = layerName
    ? humanizeGisZoningSourceLabel(layerName, cityKey)
    : sourceUrl
      ? urlHost(sourceUrl)
      : null;
  const idx = cite.add(section.title, sourceLabel, sourceUrl, stampedAt);
  const facts: BriefFact[] = [
    {
      label: "District",
      value: district,
      provenance: sourceLabel || sourceUrl
        ? { source: sourceLabel, vintage: stampedAt, url: sourceUrl }
        : null,
      citationIndex: idx,
    },
  ];
  const jurisdictionKey = str(data.jurisdictionKey);
  if (jurisdictionKey) {
    facts.push({
      label: "Jurisdiction",
      value: jurisdictionKey,
      provenance: sourceLabel || sourceUrl
        ? { source: sourceLabel, vintage: stampedAt, url: sourceUrl }
        : null,
      citationIndex: idx,
    });
  }
  const notes: string[] = [];
  const districtNote = str(data.districtNote);
  if (districtNote) notes.push(districtNote);
  registerSectionUrlCitations(section, cite, sourceUrl ? [sourceUrl] : []);
  return {
    id: section.id,
    title: section.title,
    kind: "facts",
    absentMessage: null,
    facts,
    explanation: ZONING_EXPLANATION,
    notes,
  };
}

function deriveSetbacksEnvelope(
  section: ResearchBriefSection,
  cite: CitationCollector,
): BriefSectionVM {
  const env = asRecord(section.data);
  const notes: string[] = [];
  if (!env) {
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: `Setbacks and buildable envelope ${NOT_VERIFIED} — no envelope was derived for this parcel's snapshot.`,
      facts: [],
      explanation: SETBACKS_EXPLANATION,
      notes,
    };
  }
  const status = str(env.status);
  const declineReason = str(env.declineReason);
  const disclosure = str(env.disclosure);
  const emptyReason = str(env.emptyReason);
  const districtNote = str(env.districtNote);
  const edgeNote = str(env.edgeNote);
  if (status === "declined" || !status) {
    if (disclosure) notes.push(disclosure);
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: declineReason
        ? `Setbacks and buildable envelope ${NOT_VERIFIED} — ${declineReason.replace(/[-_]/g, " ")}.`
        : `Setbacks and buildable envelope ${NOT_VERIFIED}.`,
      facts: [],
      explanation: SETBACKS_EXPLANATION,
      notes,
    };
  }

  const citationUrl = str(env.citationUrl);
  const sourceLabel = citationUrl ? `Municipal code (${urlHost(citationUrl)})` : null;
  const idx = cite.add(section.title, sourceLabel, citationUrl, null);
  const prov: BriefFactProvenance | null =
    sourceLabel || citationUrl
      ? { source: sourceLabel, vintage: null, url: citationUrl }
      : null;
  const fact = (label: string, value: string): BriefFact => ({
    label,
    value,
    provenance: prov,
    citationIndex: idx,
  });

  const facts: BriefFact[] = [];
  const district = str(env.district);
  if (district) facts.push(fact("Setback district", district));

  const setbacks = asRecord(env.setbacks);
  const front = setbacks ? num(setbacks.front_ft) : null;
  const side = setbacks ? num(setbacks.side_ft) : null;
  const rear = setbacks ? num(setbacks.rear_ft) : null;
  if (setbacks && front !== null && side !== null && rear !== null) {
    const ns = asRecord(setbacks.not_specified);
    facts.push(
      fact(
        "Setbacks",
        formatSetbackDisplay({
          front_ft: front,
          side_ft: side,
          rear_ft: rear,
          not_specified: ns
            ? {
                front: ns.front === true,
                side: ns.side === true,
                rear: ns.rear === true,
                sideCorner: ns.sideCorner === true || ns.side_corner === true,
              }
            : null,
        }),
      ),
    );
  }

  const parcelAreaSqFt = num(env.parcelAreaSqFt);
  if (parcelAreaSqFt !== null) facts.push(fact("Parcel area", fmtSqFt(parcelAreaSqFt)));
  const buildableAreaSqFt = num(env.buildableAreaSqFt);
  const buildableAreaPct = num(env.buildableAreaPct);
  if (status === "no-buildable-area") {
    facts.push(
      fact(
        "Buildable area",
        "None — the setbacks consume the entire lot",
      ),
    );
    notes.push(
      emptyReason ??
        disclosure ??
        "Setbacks consume the lot — no buildable area remains.",
    );
  } else {
    if (buildableAreaSqFt !== null && buildableAreaPct !== null) {
      facts.push(
        fact(
          "Buildable envelope",
          `${fmtSqFt(buildableAreaSqFt)} (${buildableAreaPct}% of the lot)`,
        ),
      );
    } else if (buildableAreaSqFt !== null) {
      facts.push(fact("Buildable envelope", fmtSqFt(buildableAreaSqFt)));
    } else if (buildableAreaPct !== null) {
      facts.push(fact("Buildable envelope", `${buildableAreaPct}% of the lot`));
    }
  }
  const maxLotCoveragePct = num(env.maxLotCoveragePct);
  if (maxLotCoveragePct !== null)
    facts.push(fact("Max lot coverage", `${maxLotCoveragePct}%`));
  const maxHeightFt = num(env.maxHeightFt);
  if (maxHeightFt !== null) facts.push(fact("Max height", `${maxHeightFt} ft`));
  const maxFootprintSqFt = num(env.maxFootprintSqFt);
  if (maxFootprintSqFt !== null)
    facts.push(fact("Max footprint", fmtSqFt(maxFootprintSqFt)));

  if (env.approximate === true) {
    notes.push("Approximate — not survey grade.");
  }
  if (env.provisional === true) {
    notes.push("Provisional — pending verification against the cited code.");
  }
  if (status !== "no-buildable-area" && disclosure) notes.push(disclosure);
  if (districtNote) notes.push(districtNote);
  if (edgeNote) notes.push(edgeNote);

  registerSectionUrlCitations(section, cite, citationUrl ? [citationUrl] : []);
  return {
    id: section.id,
    title: section.title,
    kind: "facts",
    absentMessage: null,
    facts,
    explanation: SETBACKS_EXPLANATION,
    notes,
  };
}

/** Plain-English meaning of the FEMA flood determination, from the payload's
 *  own status enum (never guessed beyond what the facet asserts). */
function floodMeaning(
  status: string,
  floodZone: string | null,
): string | null {
  switch (status) {
    case "in-sfha":
      return floodZone
        ? `Zone ${floodZone} — inside a FEMA Special Flood Hazard Area (the 1% annual-chance floodplain).`
        : "Inside a FEMA Special Flood Hazard Area (the 1% annual-chance floodplain).";
    case "flood-zone":
      return floodZone
        ? `Zone ${floodZone} — in a mapped FEMA flood zone outside the Special Flood Hazard Area.`
        : "In a mapped FEMA flood zone outside the Special Flood Hazard Area.";
    case "outside-sfha":
      return "Outside any mapped FEMA flood zone (effectively Zone X).";
    default:
      return null;
  }
}

function deriveFlood(
  section: ResearchBriefSection,
  cite: CitationCollector,
): BriefSectionVM {
  const data = asRecord(section.data);
  if (!data) {
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: `Flood determination ${NOT_VERIFIED} — no flood facet exists in this parcel's snapshot.`,
      facts: [],
      explanation: FLOOD_EXPLANATION,
      notes: [],
    };
  }
  const status = str(data.status) ?? "";
  const prov = asRecord(data.provenance);
  const vintage = prov ? str(prov.vintage) : null;
  const sourceLabel = prov && str(prov.source) === "fema-nfhl"
    ? "FEMA NFHL"
    : prov
      ? str(prov.source)
      : null;
  if (status === "unavailable" || !status) {
    const reason = prov ? str(prov.unavailableReason) : null;
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: reason
        ? `Flood determination ${NOT_VERIFIED} — ${reason}.`
        : `Flood determination ${NOT_VERIFIED}.`,
      facts: [],
      explanation: FLOOD_EXPLANATION,
      notes: [],
    };
  }
  const floodZone = str(data.floodZone);
  const idx = cite.add(section.title, sourceLabel, null, vintage);
  const provVm: BriefFactProvenance | null = sourceLabel
    ? { source: sourceLabel, vintage, url: null }
    : null;
  const fact = (label: string, value: string): BriefFact => ({
    label,
    value,
    provenance: provVm,
    citationIndex: idx,
  });
  const facts: BriefFact[] = [];
  const meaning = floodMeaning(status, floodZone);
  if (meaning) facts.push(fact("Determination", meaning));
  const zoneSubtype = str(data.zoneSubtype);
  if (zoneSubtype) facts.push(fact("Zone subtype", zoneSubtype));
  const bfe = num(data.baseFloodElevation);
  if (bfe !== null) facts.push(fact("Base flood elevation", `${bfe} ft`));
  registerSectionUrlCitations(section, cite, []);
  return {
    id: section.id,
    title: section.title,
    kind: "facts",
    absentMessage: null,
    facts,
    explanation: FLOOD_EXPLANATION,
    notes: [],
  };
}

function deriveLandUse(
  section: ResearchBriefSection,
  cite: CitationCollector,
): BriefSectionVM {
  const data = asRecord(section.data);
  const code = data ? str(data.code) : null;
  if (!data || !code) {
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: `Land use ${NOT_VERIFIED} — the county record for this parcel carries no land-use classification.`,
      facts: [],
      explanation: LAND_USE_EXPLANATION,
      notes: [],
    };
  }
  const description = str(data.description);
  const source = str(data.source);
  const vintage = str(data.vintage);
  const idx = cite.add(section.title, source, null, vintage);
  const provVm: BriefFactProvenance | null = source
    ? { source, vintage, url: null }
    : null;
  const facts: BriefFact[] = [
    {
      label: "Classification",
      value: description ? `${description} (code ${code})` : `Code ${code}`,
      provenance: provVm,
      citationIndex: idx,
    },
  ];
  if (vintage) {
    facts.push({
      label: "Vintage",
      value: vintage,
      provenance: provVm,
      citationIndex: idx,
    });
  }
  registerSectionUrlCitations(section, cite, []);
  return {
    id: section.id,
    title: section.title,
    kind: "facts",
    absentMessage: null,
    facts,
    explanation: LAND_USE_EXPLANATION,
    notes: [],
  };
}

/**
 * Generic renderer for section ids this client does not know — the server may
 * add sections later. Renders the title plus a flat key→value fact list of the
 * payload's primitive leaves (dotted paths, bounded). Never crashes, never
 * JSON.stringify.
 */
const GENERIC_FACT_CAP = 40;

function flattenLeaves(
  value: unknown,
  path: string,
  out: Array<{ path: string; value: string }>,
): void {
  if (out.length >= GENERIC_FACT_CAP) return;
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push({ path, value: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    const primitives = value.filter(
      (v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
    );
    if (primitives.length === value.length) {
      out.push({ path, value: primitives.map(String).join(", ") });
      return;
    }
    value.forEach((v, i) => flattenLeaves(v, `${path}[${i}]`, out));
    return;
  }
  const record = asRecord(value);
  if (record) {
    for (const [k, v] of Object.entries(record)) {
      flattenLeaves(v, path ? `${path}.${k}` : k, out);
      if (out.length >= GENERIC_FACT_CAP) return;
    }
  }
}

function deriveGeneric(
  section: ResearchBriefSection,
  cite: CitationCollector,
): BriefSectionVM {
  if (section.data === null || section.data === undefined) {
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: `${section.title} ${NOT_VERIFIED} — no data in this parcel's snapshot.`,
      facts: [],
      explanation: null,
      notes: [],
    };
  }
  const leaves: Array<{ path: string; value: string }> = [];
  flattenLeaves(section.data, "", leaves);
  if (leaves.length === 0) {
    return {
      id: section.id,
      title: section.title,
      kind: "absent",
      absentMessage: `${section.title} ${NOT_VERIFIED} — no renderable values in this parcel's snapshot.`,
      facts: [],
      explanation: null,
      notes: [],
    };
  }
  const facts: BriefFact[] = leaves.map((leaf) => ({
    label: leaf.path || "Value",
    value: leaf.value,
    provenance: null, // unknown section shape — never fabricate a source.
    citationIndex: null,
  }));
  registerSectionUrlCitations(section, cite, []);
  return {
    id: section.id,
    title: section.title,
    kind: "facts",
    absentMessage: null,
    facts,
    explanation: null,
    notes: [],
  };
}

/**
 * Fold the section's server-provided citation URLs into the appendix, skipping
 * URLs a fact-level registration already covered.
 */
function registerSectionUrlCitations(
  section: ResearchBriefSection,
  cite: CitationCollector,
  alreadyCovered: string[],
): void {
  const covered = new Set(alreadyCovered);
  for (const url of section.citations ?? []) {
    if (typeof url !== "string" || !url.trim() || covered.has(url)) continue;
    cite.add(section.title, null, url, null);
  }
}

// ---------------------------------------------------------------------------
// Top-level derivation.
// ---------------------------------------------------------------------------

export function deriveBriefViewModel(
  payload: ResearchBriefPayload,
  nowMs: number = Date.now(),
): BriefViewModel {
  const bakedAt = str(payload.bakedAt) ?? null;
  const cite = new CitationCollector(nowMs, bakedAt);
  const sections = (payload.brief?.sections ?? []).map((section) => {
    switch (section.id) {
      case "zoning":
        return deriveZoning(section, cite);
      case "setbacks-envelope":
        return deriveSetbacksEnvelope(section, cite);
      case "flood":
        return deriveFlood(section, cite);
      case "land-use":
        return deriveLandUse(section, cite);
      default:
        return deriveGeneric(section, cite);
    }
  });
  return {
    header: {
      title: "Property Intel Brief",
      parcelNodeId: str(payload.parcelNodeId),
      runId: str(payload.runId),
      reportFamily: str(payload.reportFamily),
      mode: str(payload.mode),
      source: str(payload.source),
      bakedAt,
    },
    sections,
    citations: cite.all(),
    disclosures: (payload.brief?.disclosure ?? []).filter(
      (d): d is string => typeof d === "string" && d.trim().length > 0,
    ),
  };
}
