// apps/property-explorer/src/browse/brief-verdict.ts
//
// W2 VERDICT LINE — the plain-English one-line "Carfax glance" that LEADS the
// property brief before the cited detail. Composed DETERMINISTICALLY from the
// R1 brief payload the tool already holds — NO LLM, NO fabrication:
//   - absent facts appear as ABSENCES ("flood not verified here"), never as
//     invented values and never silently dropped;
//   - provisional stays provisional ("buildable (provisional)");
//   - a degenerate / no-envelope parcel says so plainly;
//   - a red flag (inside the SFHA / a floodway) LEADS the line;
//   - the "no red flags" tail appears ONLY when every core fact is present and
//     clean — an unverified fact can never earn a clean bill.
//
// Inputs (mirrors deriveBriefViewModel's section readers, kept payload-level so
// the composer is a pure function over the wire shape):
//   zoning district presence · envelope/buildable status (incl. provisional and
//   honest-absent) · flood determination + SFHA/floodway · land-use
//   classification.

import type {
  ResearchBriefPayload,
  ResearchBriefSection,
} from "./brief-view-model";

export type BriefVerdictTone = "clear" | "caution" | "flag";

export interface BriefVerdict {
  /** One sentence, sentence case, segments joined with " · ". */
  line: string;
  /** "flag" = red flag leads; "caution" = absence or soft flag; "clear" = clean. */
  tone: BriefVerdictTone;
}

// ---- tiny payload readers (defensive, mirror brief-view-model's) ----------

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function sectionData(
  payload: ResearchBriefPayload,
  id: string,
): Record<string, unknown> | null {
  const section: ResearchBriefSection | undefined =
    payload.brief?.sections?.find((s) => s.id === id);
  return section ? asRecord(section.data) : null;
}

// ---- per-facet segment derivation (each returns copy + flags) --------------

interface Segment {
  text: string;
  /** Honest absence — blocks the "no red flags" tail. */
  absent: boolean;
  /** Soft flag (provisional, no-buildable-area, mapped flood zone). */
  caution: boolean;
}

function envelopeSegment(payload: ResearchBriefPayload): Segment {
  const env = sectionData(payload, "setbacks-envelope");
  const status = env ? str(env.status) : null;
  if (!env || !status || status === "declined") {
    return {
      text: "buildable envelope not derived here",
      absent: true,
      caution: false,
    };
  }
  if (status === "no-buildable-area") {
    // The degenerate parcel says so PLAINLY — never softened.
    return {
      text: "no buildable area after setbacks",
      absent: false,
      caution: true,
    };
  }
  if (env.provisional === true) {
    return { text: "buildable (provisional)", absent: false, caution: true };
  }
  return { text: "buildable", absent: false, caution: false };
}

interface FloodSegment extends Segment {
  /** True → inside the SFHA (incl. floodway): the RED FLAG that leads. */
  redFlag: boolean;
}

function floodSegment(payload: ResearchBriefPayload): FloodSegment {
  const flood = sectionData(payload, "flood");
  const status = flood ? str(flood.status) : null;
  if (!flood || !status || status === "unavailable") {
    return {
      text: "flood not verified here",
      absent: true,
      caution: false,
      redFlag: false,
    };
  }
  const zone = str(flood.floodZone);
  const zoneSuffix = zone ? ` (Zone ${zone})` : "";
  if (status === "in-sfha") {
    const subtype = str(flood.zoneSubtype);
    const floodway = !!subtype && subtype.toUpperCase().includes("FLOODWAY");
    return {
      text: floodway
        ? `inside a FEMA floodway${zoneSuffix}`
        : `inside the FEMA flood hazard area${zoneSuffix}`,
      absent: false,
      caution: false,
      redFlag: true,
    };
  }
  if (status === "flood-zone") {
    return {
      text: `in a mapped FEMA flood zone${zoneSuffix}, outside the SFHA`,
      absent: false,
      caution: true,
      redFlag: false,
    };
  }
  if (status === "outside-sfha") {
    return {
      text: "outside mapped flood hazard",
      absent: false,
      caution: false,
      redFlag: false,
    };
  }
  // Unknown enum value → honest absence, never a guess.
  return {
    text: "flood not verified here",
    absent: true,
    caution: false,
    redFlag: false,
  };
}

function zoningSegment(payload: ResearchBriefPayload): Segment {
  const zoning = sectionData(payload, "zoning");
  const district = zoning ? str(zoning.district) : null;
  if (!district) {
    return { text: "zoning not verified here", absent: true, caution: false };
  }
  return { text: `zoned ${district}`, absent: false, caution: false };
}

function landUseSegment(payload: ResearchBriefPayload): Segment {
  const landUse = sectionData(payload, "land-use");
  const code = landUse ? str(landUse.code) : null;
  if (!landUse || !code) {
    return {
      text: "no land-use classification on record",
      absent: true,
      caution: false,
    };
  }
  const description = str(landUse.description);
  return {
    text: description
      ? `${description.toLowerCase()} per county record`
      : `land use code ${code} per county record`,
    absent: false,
    caution: false,
  };
}

// ---- composition -----------------------------------------------------------

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Compose the one-line verdict. Deterministic over the payload; segment order
 * is envelope · flood · zoning · land use, EXCEPT a flood red flag (in-SFHA /
 * floodway) which moves to the FRONT and stamps tone "flag".
 */
export function composeBriefVerdict(payload: ResearchBriefPayload): BriefVerdict {
  const env = envelopeSegment(payload);
  const flood = floodSegment(payload);
  const zoning = zoningSegment(payload);
  const landUse = landUseSegment(payload);

  if (flood.redFlag) {
    const line =
      [sentenceCase(flood.text), env.text, zoning.text, landUse.text].join(
        " · ",
      ) + ".";
    return { line, tone: "flag" };
  }

  const segments = [env, flood, zoning, landUse];
  const anyAbsence = segments.some((s) => s.absent);
  const anyCaution = segments.some((s) => s.caution);
  const clean = !anyAbsence && !anyCaution;
  const body = [sentenceCase(env.text), flood.text, zoning.text, landUse.text].join(
    " · ",
  );
  // "No red flags" is EARNED: only when all four facts are present and clean.
  const line = clean ? `${body} — no red flags.` : `${body}.`;
  return { line, tone: clean ? "clear" : "caution" };
}
