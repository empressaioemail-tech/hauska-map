/**
 * Three persona registers off the same facts (WDLL 28).
 */

import type { BakedCardModel } from "./baked-facets";

export type PersonaId = "homeowner" | "investor" | "architect";
export type Persona = PersonaId;

export const PERSONA_LABELS: Record<PersonaId, string> = {
  homeowner: "Homeowner",
  investor: "Investor",
  architect: "Architect",
};

export const PERSONA_OPTIONS: Array<{ id: PersonaId; label: string }> = (
  ["homeowner", "investor", "architect"] as const
).map((id) => ({ id, label: PERSONA_LABELS[id] }));

export type PersonaFactInput = {
  zoning?: string | null;
  setbacks?: string | null;
  buildable?: string | null;
  landUse?: string | null;
};

function facetOrNull(
  facet: { state: string; value: string | null } | undefined,
): string | null | undefined {
  if (!facet) return undefined;
  if (facet.state === "present" || facet.state === "pending") return facet.value;
  if (facet.state === "absent") return facet.value; // may carry honest-absence label
  return undefined;
}

export function extractPersonaFacts(
  baked: BakedCardModel | null,
): PersonaFactInput {
  if (!baked) return {};
  return {
    zoning: facetOrNull(baked.zoning),
    setbacks: facetOrNull(baked.setbacks),
    buildable: facetOrNull(baked.buildablePct),
    landUse: facetOrNull(baked.landUse),
  };
}

/** Single-line persona register — same facts, different framing (QA-3). */
export function personaHeadline(
  persona: PersonaId,
  facts: PersonaFactInput,
): string {
  const zoning = facts.zoning ?? "zoning not verified here";
  const setbacksPresent = facts.setbacks != null && facts.setbacks.length > 0;
  const setbacks = setbacksPresent ? facts.setbacks! : "setbacks not verified here";
  const buildable = facts.buildable ?? null;
  const buildablePending =
    !!buildable && /pending/i.test(buildable) && setbacksPresent;

  switch (persona) {
    case "investor":
      if (buildable && !buildablePending) {
        return `Constraints: ~${buildable} buildable · ${zoning} · ${setbacks}`;
      }
      if (setbacksPresent) {
        return `Constraints: ${setbacks} · ${zoning} · buildable % pending`;
      }
      return `Constraints: envelope not verified · ${zoning}`;
    case "architect":
      if (buildable && !buildablePending) {
        return `${zoning} — ${setbacks}; buildable ${buildable} (Tier-1 approximate, verify with AHJ)`;
      }
      if (setbacksPresent) {
        return `${zoning} — ${setbacks}; buildable % pending (setbacks present)`;
      }
      return `${zoning} — ${setbacks}; envelope not verified`;
    case "homeowner":
    default:
      if (buildable && !buildablePending) {
        return `Likely buildable area ~${buildable} after setbacks (${zoning}).`;
      }
      if (setbacksPresent) {
        return `Setbacks are on file (${setbacks}); buildable % pending (${zoning}).`;
      }
      return `Setbacks and buildable area not verified here yet (${zoning}).`;
  }
}

export type FacetFacts = {
  zoning?: string | null;
  setbacks?: string | null;
  buildablePct?: string | null;
  landUse?: string | null;
  acreage?: string | null;
};

export type PersonaCopy = {
  headline: string;
  buildableLine: string | null;
  researchCta: string;
};

export function personaCopy(
  persona: PersonaId,
  facts: FacetFacts,
): PersonaCopy {
  const line = personaHeadline(persona, {
    zoning: facts.zoning,
    setbacks: facts.setbacks,
    buildable: facts.buildablePct,
    landUse: facts.landUse,
  });
  switch (persona) {
    case "investor":
      return {
        headline: "Constraints read",
        buildableLine: line,
        researchCta: "Run deep constraints report →",
      };
    case "architect":
      return {
        headline: "Site constraints (cited browse)",
        buildableLine: line,
        researchCta: "Open cited site analysis →",
      };
    default:
      return {
        headline: "What you can build here",
        buildableLine: line,
        researchCta: "Research this property →",
      };
  }
}
