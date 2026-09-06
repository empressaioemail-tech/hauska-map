/**
 * Shared customer-facing buildable / setback vocabulary (Track B3 / WDLL 5).
 *
 * Map card, inspect, and site-plan PDF must speak ONE truth for the same
 * envelope inputs. Surfaces MUST call `mapBuildableDisplay` rather than
 * re-deriving "pending" / "consumes lot" / provisional copy independently.
 *
 * Axes (cannot disagree across surfaces for identical inputs):
 *   pending | provisional | buildable-with-area | declined-consume | not_specified
 *   (+ absent / loading for non-envelope shells)
 *
 * Historical disagreement class (FIX1 symptom): envelope area present on the
 * warm facet while PDF said "setback-consumes-lot" and the card said bare
 * "buildable % pending". Guard: area present → never those two strings.
 */

export type BuildableDisplayKind =
  | "absent"
  | "loading"
  | "pending"
  | "provisional"
  | "buildable-with-area"
  | "declined-consume"
  | "not_specified"
  /** Unincorporated land — no zoning ordinance to derive a setback from. */
  | "not-applicable";

export type EnvelopeStatusInput = "ok" | "no-buildable-area" | "declined" | null | undefined;

export type WarmEnvelopeKind =
  | "buildable"
  | "no-buildable-area"
  | "provisional-front-edge"
  | "not-applicable"
  | null
  | undefined;

export interface BuildableDisplayInput {
  /** Baked / atom-chain envelope.status */
  envelopeStatus?: EnvelopeStatusInput;
  declineReason?: string | null;
  /** True when F/S/R includes a silent (build-to-line) axis. */
  notSpecifiedAxes?: boolean;
  buildableAreaPct?: number | null;
  buildableAreaSqFt?: number | null;
  /** GeoJSON / drawable envelope present on the warm facet. */
  hasGeometry?: boolean;
  /** Envelope flagged provisional (or warm provisional-front-edge). */
  provisional?: boolean;
  /**
   * Warm buildable-envelope atom outcome — preferred over per-surface
   * re-derive when present (PDF offset vs depth-warm).
   */
  warmEnvelopeKind?: WarmEnvelopeKind;
  warmEnvelopeAreaSqFt?: number | null;
  /** PDF-only: local offset collapsed. Ignored when warm/area says otherwise. */
  offsetDegenerate?: boolean;
  offsetDegenerateReason?: string | null;
}

export interface BuildableDisplayVocab {
  kind: BuildableDisplayKind;
  /** Inspect / map-card FacetState for the Buildable row. */
  cardState: "present" | "absent" | "pending";
  /** Customer string for map card + inspect Buildable row. */
  cardLabel: string | null;
  /** Customer string for site-plan PDF SUMMARY "Buildable Area". */
  pdfLabel: string;
  /**
   * Stable probe token — planner pastes this across map / inspect / PDF.
   * Same inputs → same token on every surface.
   */
  agreementToken: string;
}

function positiveNumber(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function nonNegativeNumber(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/** Resolve the best area signal — prefer warm envelope when it has area. */
export function resolveBuildableAreaSqFt(input: BuildableDisplayInput): number | null {
  if (
    input.warmEnvelopeKind === "buildable" &&
    positiveNumber(input.warmEnvelopeAreaSqFt)
  ) {
    return input.warmEnvelopeAreaSqFt;
  }
  if (positiveNumber(input.buildableAreaSqFt)) return input.buildableAreaSqFt;
  return null;
}

function areaPresent(input: BuildableDisplayInput): boolean {
  if (positiveNumber(input.buildableAreaPct)) return true;
  if (resolveBuildableAreaSqFt(input) != null) return true;
  if (
    input.warmEnvelopeKind === "buildable" &&
    positiveNumber(input.warmEnvelopeAreaSqFt)
  ) {
    return true;
  }
  return false;
}

/** Numeric area OR drawable warm geojson — never leave as bare pending. */
function drawableOrAreaPresent(input: BuildableDisplayInput): boolean {
  return areaPresent(input) || input.hasGeometry === true;
}

function formatPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

function formatSqFt(sqFt: number): string {
  return `${Math.round(sqFt).toLocaleString("en-US")} sq ft`;
}

/**
 * Pure mapper: envelope / warm / offset inputs → one customer vocabulary.
 * Do not invent a % when no area signal exists (honest shared pending OK).
 */
export function mapBuildableDisplay(input: BuildableDisplayInput): BuildableDisplayVocab {
  const decline = input.declineReason ?? null;
  const silent = input.notSpecifiedAxes === true;
  const areaSqFt = resolveBuildableAreaSqFt(input);
  const hasDrawable = drawableOrAreaPresent(input);
  const provisional =
    input.provisional === true ||
    input.warmEnvelopeKind === "provisional-front-edge";

  // Loading shell (Gate C) — never "not verified" / consume.
  if (decline === "atom_path_pending") {
    return {
      kind: "loading",
      cardState: "pending",
      cardLabel: "Loading buildable area…",
      pdfLabel: "pending — atom path loading",
      agreementToken: "loading",
    };
  }

  // Declined envelope (honest absence of setbacks/zoning path).
  if (input.envelopeStatus === "declined") {
    return {
      kind: "absent",
      cardState: "absent",
      cardLabel: null,
      pdfLabel: `unavailable — ${decline ?? "envelope declined"}`,
      agreementToken: `absent:${decline ?? "declined"}`,
    };
  }

  // Unincorporated land — no zoning ordinance to derive a setback from.
  // Checked before the drawable/consume-lot branches: there is no area
  // signal to have an opinion on here, and "setbacks consume lot" would be
  // a false claim (no setback assessment happened at all).
  if (input.warmEnvelopeKind === "not-applicable") {
    return {
      kind: "not-applicable",
      cardState: "absent",
      cardLabel: "Not zoned — no setback requirements",
      pdfLabel: "not applicable — unincorporated, no zoning ordinance",
      agreementToken: "not-applicable",
    };
  }

  // Silent axes (build-to-line) with NO drawable/area — never consume-lot.
  if (silent && !hasDrawable) {
    return {
      kind: "not_specified",
      cardState: "pending",
      cardLabel: "build-to-line · buildable % pending",
      pdfLabel: "pending — build-to-line governs (scalar setback silent)",
      agreementToken: "not_specified",
    };
  }

  // Area or warm geojson wins over any local "consumes lot" / bare pending (B3).
  if (hasDrawable) {
    const pct = positiveNumber(input.buildableAreaPct)
      ? input.buildableAreaPct
      : null;
    const cardCore = pct != null
      ? formatPct(pct)
      : areaSqFt != null
        ? `~${formatSqFt(areaSqFt)}`
        : silent
          ? "buildable envelope on file (build-to-line)"
          : "buildable envelope on file";
    const pdfCore = areaSqFt != null
      ? formatSqFt(areaSqFt)
      : pct != null
        ? `${formatPct(pct)} of lot`
        : silent
          ? "buildable envelope on file (build-to-line)"
          : "buildable envelope on file";

    if (provisional) {
      return {
        kind: "provisional",
        cardState: "present",
        cardLabel: `${cardCore} (provisional)`,
        pdfLabel: `${pdfCore} (PROVISIONAL)`,
        agreementToken: `provisional:${pct ?? (areaSqFt != null ? Math.round(areaSqFt) : "envelope")}`,
      };
    }
    return {
      kind: "buildable-with-area",
      cardState: "present",
      cardLabel: cardCore,
      pdfLabel: pdfCore,
      agreementToken: `buildable:${pct ?? (areaSqFt != null ? Math.round(areaSqFt) : "envelope")}`,
    };
  }

  // Honest consume-lot — only when no area signal and status / warm / offset agree.
  const warmConsumes = input.warmEnvelopeKind === "no-buildable-area";
  const statusConsumes = input.envelopeStatus === "no-buildable-area";
  const offsetConsumes =
    input.offsetDegenerate === true &&
    input.warmEnvelopeKind !== "buildable" &&
    input.warmEnvelopeKind !== "provisional-front-edge";

  if ((statusConsumes || warmConsumes || offsetConsumes) && !silent) {
    const reason =
      input.offsetDegenerateReason ??
      (warmConsumes ? "warm envelope: no-buildable-area" : null) ??
      "setbacks consume lot";
    return {
      kind: "declined-consume",
      cardState: "present",
      cardLabel: "0% — setbacks consume lot",
      pdfLabel: `unavailable — ${reason}`,
      agreementToken: "declined-consume",
    };
  }

  // Explicit zero pct with consume status.
  if (
    nonNegativeNumber(input.buildableAreaPct) &&
    input.buildableAreaPct === 0 &&
    statusConsumes
  ) {
    return {
      kind: "declined-consume",
      cardState: "present",
      cardLabel: "0% — setbacks consume lot",
      pdfLabel: "unavailable — setbacks consume lot",
      agreementToken: "declined-consume",
    };
  }

  // Setbacks / ok envelope present but no area yet — honest shared pending.
  if (
    input.envelopeStatus === "ok" ||
    input.hasGeometry === true ||
    input.warmEnvelopeKind === "provisional-front-edge"
  ) {
    if (provisional) {
      return {
        kind: "provisional",
        cardState: "pending",
        cardLabel: "provisional · buildable % pending",
        pdfLabel: "provisional — buildable area pending front-edge resolution",
        agreementToken: "provisional:pending",
      };
    }
    return {
      kind: "pending",
      cardState: "pending",
      cardLabel: "setbacks present · buildable % pending",
      pdfLabel: "pending — setbacks on file; buildable area not yet derived",
      agreementToken: "pending",
    };
  }

  // No envelope signal at all.
  return {
    kind: "absent",
    cardState: "absent",
    cardLabel: null,
    pdfLabel: "unavailable — no buildable envelope on file",
    agreementToken: "absent",
  };
}

/** True when copy would revive the historical map/PDF disagreement. */
export function violatesHistoricalDisagreementGuard(
  vocab: BuildableDisplayVocab,
  input: BuildableDisplayInput,
): boolean {
  if (!drawableOrAreaPresent(input)) return false;
  const blob = `${vocab.cardLabel ?? ""} ${vocab.pdfLabel}`.toLowerCase();
  if (/consumes?\s+lot/.test(blob)) return true;
  if (vocab.kind === "declined-consume") return true;
  // Bare pending % while drawable/area exists is the other half of the disagreement.
  if (vocab.kind === "pending" || vocab.kind === "not_specified") return true;
  if (/buildable % pending/.test(blob) && !/provisional/.test(blob)) return true;
  return false;
}
