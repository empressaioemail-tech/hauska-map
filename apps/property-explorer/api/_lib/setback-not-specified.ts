// setback-not-specified.ts
//
// Bastrop B3 place-type districts mark side/rear (and sometimes front) as
// not_specified in bastrop-city-tx.json provenance — the code is SILENT on a
// scalar setback (build-to-line governs), which is NOT the same as 0 ft.
// Live setback-rule atoms currently drop that flag before the wire; PE
// re-attaches it from the cited table so display never conflates silence with zero.

export type NotSpecifiedAxes = {
  front?: boolean;
  side?: boolean;
  rear?: boolean;
  sideCorner?: boolean;
};

/**
 * District-token → not_specified axes, transcribed from
 * legacy-design-tools/lib/adapters/.../bastrop-city-tx.json provenance
 * (human-verified; values not re-invented here).
 */
export const BASTROP_B3_NOT_SPECIFIED: Readonly<
  Record<string, NotSpecifiedAxes>
> = {
  "P-1": { front: true, side: true, rear: true, sideCorner: true },
  "P-2": { side: true, rear: true, sideCorner: true },
  "P-3": { side: true, rear: true, sideCorner: true },
  "P-4": { side: true, rear: true, sideCorner: true },
  "P-5": { side: true, rear: true, sideCorner: true },
  "P-EC": { side: true, rear: true, sideCorner: true },
};

/** Leading district token: "P-3 Neighborhood" → "P-3", "P-3" → "P-3". */
export function districtToken(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  const t = raw.trim().split(/\s+/)[0] ?? "";
  return t.toUpperCase();
}

export function lookupNotSpecified(
  districtCode: string | null | undefined,
): NotSpecifiedAxes | null {
  const token = districtToken(districtCode);
  if (!token) return null;
  return BASTROP_B3_NOT_SPECIFIED[token] ?? null;
}

export function anyNotSpecified(ns: NotSpecifiedAxes | null | undefined): boolean {
  if (!ns) return false;
  return !!(ns.front || ns.side || ns.rear || ns.sideCorner);
}

export function allPrimaryNotSpecified(
  ns: NotSpecifiedAxes | null | undefined,
): boolean {
  return !!(ns?.front && ns?.side && ns?.rear);
}

/**
 * One governing-rule reference for a not_specified axis (Elgin setback-table
 * ratification, 2026-08-04 directive 1). Mirrors
 * buildable-envelope.d.ts#GovernedBy — duplicated locally (not imported) so
 * this API-route-adjacent module stays free of a cross-boundary import into
 * src/lib; the shape is a plain structural match, not a shared class.
 */
export interface GovernedByAxis {
  condition?: string | null;
  district?: string | null;
  section_number?: string | null;
  note?: string | null;
  value_ft?: number | null;
  conditions?: Array<{
    condition?: string | null;
    district?: string | null;
    section_number?: string | null;
    note?: string | null;
    value_ft?: number | null;
  }>;
}

export interface SetbackGovernedByAxes {
  front?: GovernedByAxis | null;
  side?: GovernedByAxis | null;
  rear?: GovernedByAxis | null;
  sideCorner?: GovernedByAxis | null;
}

/**
 * Render one governed_by reference as a citable fragment, e.g.
 * "25 ft if adjoining a dwelling district (§4.02.003)" for a mechanical
 * condition with a resolved value, or "C-1 governs (§4.03.010)" for a
 * routing-only reference with no resolved value on this cell. ALWAYS cites
 * section_number per the ratification directive — a governed_by with no
 * section_number is not renderable and falls through to the caller's
 * "not specified" default (never rendered as a citable answer without a
 * cite).
 */
function formatGovernedByFragment(g: GovernedByAxis | null | undefined): string | null {
  if (!g) return null;
  const entries = g.conditions?.length ? g.conditions : [g];
  const rendered = entries
    .map((c) => {
      if (!c.section_number) return null; // no cite -> not a renderable answer
      const value =
        typeof c.value_ft === "number" ? `${c.value_ft} ft` : null;
      const routed = c.district ? `${c.district} governs` : null;
      const head = value ?? routed;
      if (!head) return null;
      const condition = c.condition ? ` ${c.condition}` : "";
      return `${head}${condition} (§${c.section_number})`;
    })
    .filter((s): s is string => Boolean(s));
  return rendered.length ? rendered.join("; ") : null;
}

/**
 * Format setbacks for the inspect card. Never render a not_specified axis as
 * a real "0′" dimension. When `governedBy` is supplied and an axis is
 * not_specified, resolve and cite the governing rule instead of a bare
 * "not specified" — the 2026-08-04 ratification directive ("users get the
 * answers they came for"). An axis with no governed_by, or a governed_by
 * with no section_number, falls back to the pre-existing "not specified"
 * wording unchanged — never a bare dash pretending certainty it doesn't have.
 */
export function formatSetbackDisplay(
  setbacks: {
    front_ft: number;
    side_ft: number;
    rear_ft: number;
    side_interior_ft?: number;
    side_corner_ft?: number;
    not_specified?: NotSpecifiedAxes | null;
  },
  governedBy?: SetbackGovernedByAxes | null,
): string {
  const ns = setbacks.not_specified ?? null;
  const gb = governedBy ?? null;

  if (allPrimaryNotSpecified(ns)) {
    const front = formatGovernedByFragment(gb?.front);
    const side = formatGovernedByFragment(gb?.side);
    const rear = formatGovernedByFragment(gb?.rear);
    if (front || side || rear) {
      const parts = [
        front ? `F ${front}` : null,
        side ? `S ${side}` : null,
        rear ? `R ${rear}` : null,
      ].filter((s): s is string => Boolean(s));
      return parts.join(" · ");
    }
    return "No scalar setback specified — build-to-line governs";
  }
  const fmt = (
    ft: number,
    silent: boolean | undefined,
    label: string,
    axisGoverned: string | null,
  ) =>
    silent
      ? axisGoverned
        ? `${label} ${axisGoverned}`
        : `${label} not specified`
      : `${label} ${ft}′`;
  const sideInterior = setbacks.side_interior_ft ?? setbacks.side_ft;
  const sideCorner = setbacks.side_corner_ft;
  const frontGoverned = formatGovernedByFragment(gb?.front);
  const sideGoverned = formatGovernedByFragment(gb?.side);
  const rearGoverned = formatGovernedByFragment(gb?.rear);
  const sidePart =
    ns?.side
      ? sideGoverned
        ? `S ${sideGoverned}`
        : "S not specified"
      : sideCorner != null &&
          sideInterior !== sideCorner &&
          typeof sideInterior === "number"
        ? `S ${sideInterior}′ · Corner ${sideCorner}′`
        : fmt(setbacks.side_ft, ns?.side, "S", sideGoverned);
  const parts = [
    fmt(setbacks.front_ft, ns?.front, "F", frontGoverned),
    sidePart,
    fmt(setbacks.rear_ft, ns?.rear, "R", rearGoverned),
  ];
  const line = parts.join(" · ");
  // "build-to-line governs" is the honest catch-all for a silent axis with NO
  // resolved governing rule; an axis that DID resolve (frontGoverned etc.)
  // already carries its own citation inline, so only append the catch-all
  // when at least one silent axis has no resolution.
  const hasUnresolvedSilence =
    (ns?.front && !frontGoverned) ||
    (ns?.side && !sideGoverned) ||
    (ns?.rear && !rearGoverned);
  if (hasUnresolvedSilence) {
    return `${line} (build-to-line governs)`;
  }
  return line;
}

export function buildToLineDisclosure(
  ns: NotSpecifiedAxes | null | undefined,
): string {
  if (allPrimaryNotSpecified(ns)) {
    return (
      "No scalar setback specified for this district — build-to-line governs. " +
      "Buildable area is not derived from a fabricated zero setback."
    );
  }
  return (
    "One or more scalar setbacks are not specified in the code (build-to-line governs). " +
    "Do not treat silent axes as 0 ft. Buildable % pending honest geometry."
  );
}
