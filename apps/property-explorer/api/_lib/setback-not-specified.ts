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
 * Format setbacks for the inspect card. Never render a not_specified axis as
 * a real "0′" dimension.
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
): string {
  const ns = setbacks.not_specified ?? null;
  if (allPrimaryNotSpecified(ns)) {
    return "No scalar setback specified — build-to-line governs";
  }
  const fmt = (ft: number, silent: boolean | undefined, label: string) =>
    silent ? `${label} not specified` : `${label} ${ft}′`;
  const sideInterior = setbacks.side_interior_ft ?? setbacks.side_ft;
  const sideCorner = setbacks.side_corner_ft;
  const sidePart =
    ns?.side
      ? "S not specified"
      : sideCorner != null &&
          sideInterior !== sideCorner &&
          typeof sideInterior === "number"
        ? `S ${sideInterior}′ · Corner ${sideCorner}′`
        : fmt(setbacks.side_ft, ns?.side, "S");
  const parts = [
    fmt(setbacks.front_ft, ns?.front, "F"),
    sidePart,
    fmt(setbacks.rear_ft, ns?.rear, "R"),
  ];
  const line = parts.join(" · ");
  if (ns?.side || ns?.rear || ns?.front) {
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
