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

export function extractPersonaFacts(
  baked: BakedCardModel | null,
): PersonaFactInput {
  if (!baked) return {};
  return {
    zoning:
      baked.zoning.state === "present"
        ? baked.zoning.value
        : baked.zoning.state === "absent"
          ? null
          : undefined,
    setbacks:
      baked.setbacks.state === "present"
        ? baked.setbacks.value
        : baked.setbacks.state === "absent"
          ? null
          : undefined,
    buildable:
      baked.buildablePct.state === "present"
        ? baked.buildablePct.value
        : baked.buildablePct.state === "absent"
          ? null
          : undefined,
    landUse:
      baked.landUse.state === "present"
        ? baked.landUse.value
        : baked.landUse.state === "absent"
          ? null
          : undefined,
  };
}

/** Single-line persona register — same facts, different framing. */
export function personaHeadline(
  persona: PersonaId,
  facts: PersonaFactInput,
): string {
  const zoning = facts.zoning ?? "zoning not verified here";
  const setbacks = facts.setbacks ?? "setbacks not verified here";
  const buildable = facts.buildable ?? null;

  switch (persona) {
    case "investor":
      return buildable
        ? `Constraints: ~${buildable} buildable · ${zoning} · ${setbacks}`
        : `Constraints: envelope not verified · ${zoning}`;
    case "architect":
      return buildable
        ? `${zoning} — ${setbacks}; buildable ${buildable} (Tier-1 approximate, verify with AHJ)`
        : `${zoning} — ${setbacks}; envelope not verified`;
    case "homeowner":
    default:
      return buildable
        ? `Likely buildable area ~${buildable} after setbacks (${zoning}).`
        : `Setbacks and buildable area not verified here yet (${zoning}).`;
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
