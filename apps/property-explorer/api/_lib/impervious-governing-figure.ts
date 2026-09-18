/**
 * P-341 (OPS-24, ruling 16) — "Both impervious figures, the stricter
 * governing."
 *
 * THE DEFECT, measured live 2026-09-18 on 48453:367134: the panel payload
 * serves `facets.envelope.maxImperviousPct` 45 from the zoning rule's own
 * sub-field AND a top-level `maxImperviousCoverPctFact.percent` 30 for
 * watershed WATER SUPPLY SUBURBAN. Both can be correct law, and a customer
 * reads both numbers as "impervious cover" — so the card shows two different
 * answers to one question.
 *
 * THE RULE. Where two impervious-cover figures apply, the STRICTER one
 * governs, and BOTH are cited, each with its source, on every surface. Neither
 * figure is deleted: deleting the zoning figure would hide applicable law, and
 * averaging or picking the higher one would permit development neither
 * authority permits.
 *
 * THIS MODULE IS THE ONLY COMPOSITION SITE for that sentence. The served
 * `maxImperviousPct` becomes the governing figure so that a reader — human or
 * instrument — sees one number where one number is the answer, and
 * `maxImperviousPctSources` carries both, each labelled with the source it came
 * from. The accompanying sentence names both figures, both sources, and which
 * one governs.
 *
 * BYTE-IDENTITY CONTROL. A payload carrying only ONE of the two figures gains
 * no sentence and no sources row: `reconcileImperviousFigures` returns
 * `disclosure: null` and a single-element `sources` there, and the caller
 * writes neither. Where two figures DO apply both are cited, per the ruling,
 * and only the disagreeing pair carries the sentence — an equal pair is two
 * sources agreeing on one number and needs no explanation. The lane's own test
 * pins both directions.
 */

export type ImperviousFigureSource =
  | "zoning-setback-rule"
  | "max-impervious-cover-fact";

export type ImperviousFigureCitation = {
  /** Which authority supplied this figure. Never inferred from the value. */
  source: ImperviousFigureSource;
  percent: number;
  /** The document/source the figure came from, when the payload carries one. */
  citationUrl?: string;
  /** The source's own effective date or vintage, when readable. */
  sourceDate?: string;
  /** Watershed name, for the fact rail only. */
  watershedType?: string;
};

export type ImperviousFigureReconciliation = {
  /** The figure a surface must serve. The lower of the two where both apply. */
  governing: number | null;
  /** Every applicable figure with its own source. Both, where two apply. */
  sources: ImperviousFigureCitation[];
  /** The one sentence a reader sees. Null when nothing needed reconciling. */
  disclosure: string | null;
};

const HUMAN_SOURCE: Record<ImperviousFigureSource, string> = {
  "zoning-setback-rule": "the zoning setback rule",
  "max-impervious-cover-fact": "the watershed fact",
};

function positive(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Reconcile the two impervious-cover figures a payload can carry.
 *
 * `zoningMaxImperviousPct` is the setback rule's own sub-field;
 * `watershedPercent` is `maxImperviousCoverPctFact.percent`. They are distinct
 * rails on purpose — this function never reads one as the other.
 */
export function reconcileImperviousFigures(args: {
  zoningMaxImperviousPct?: number | null;
  zoningCitationUrl?: string | null;
  zoningSourceDate?: string | null;
  watershedPercent?: number | null;
  watershedType?: string | null;
  watershedCitationUrl?: string | null;
  watershedSourceVintage?: string | null;
}): ImperviousFigureReconciliation {
  const zoning = positive(args.zoningMaxImperviousPct);
  const watershed = positive(args.watershedPercent);

  if (zoning === null && watershed === null) {
    return { governing: null, sources: [], disclosure: null };
  }

  if (zoning === null || watershed === null) {
    // One figure applies. It governs, it is cited, and there is nothing to
    // reconcile — so no sentence is added and the payload stays unchanged.
    const only = zoning !== null ? "zoning-setback-rule" : "max-impervious-cover-fact";
    const percent = (zoning ?? watershed) as number;
    return {
      governing: percent,
      sources: [
        {
          source: only,
          percent,
          ...(only === "zoning-setback-rule"
            ? {
                ...(args.zoningCitationUrl ? { citationUrl: args.zoningCitationUrl } : {}),
                ...(args.zoningSourceDate ? { sourceDate: args.zoningSourceDate } : {}),
              }
            : {
                ...(args.watershedCitationUrl ? { citationUrl: args.watershedCitationUrl } : {}),
                ...(args.watershedSourceVintage ? { sourceDate: args.watershedSourceVintage } : {}),
                ...(args.watershedType ? { watershedType: args.watershedType } : {}),
              }),
        },
      ],
      disclosure: null,
    };
  }

  const zoningCite: ImperviousFigureCitation = {
    source: "zoning-setback-rule",
    percent: zoning,
    ...(args.zoningCitationUrl ? { citationUrl: args.zoningCitationUrl } : {}),
    ...(args.zoningSourceDate ? { sourceDate: args.zoningSourceDate } : {}),
  };
  const factCite: ImperviousFigureCitation = {
    source: "max-impervious-cover-fact",
    percent: watershed,
    ...(args.watershedCitationUrl ? { citationUrl: args.watershedCitationUrl } : {}),
    ...(args.watershedSourceVintage ? { sourceDate: args.watershedSourceVintage } : {}),
    ...(args.watershedType ? { watershedType: args.watershedType } : {}),
  };

  if (zoning === watershed) {
    // Two applicable figures that agree: both are cited, nothing to explain,
    // and no sentence is composed. The agreeing case is the control.
    return {
      governing: zoning,
      sources: [zoningCite, factCite],
      disclosure: null,
    };
  }

  const governing = Math.min(zoning, watershed);
  const governs = governing === zoning ? zoningCite : factCite;
  const yields = governing === zoning ? factCite : zoningCite;
  const watershedLabel = args.watershedType
    ? `${args.watershedType}`
    : "its watershed";

  return {
    governing,
    sources: [zoningCite, factCite],
    disclosure:
      `Impervious cover: two limits apply to this parcel and the stricter one governs. ` +
      `${governs.percent}% from ${HUMAN_SOURCE[governs.source]}` +
      (governs.source === "max-impervious-cover-fact" ? ` (${watershedLabel})` : "") +
      ` governs over ${yields.percent}% from ${HUMAN_SOURCE[yields.source]}` +
      (yields.source === "max-impervious-cover-fact" ? ` (${watershedLabel})` : "") +
      `. Both are cited; the lower of two applicable limits is the one a plan must satisfy.`,
  };
}

/** Append the reconciliation sentence to an existing disclosure, if there is one to add. */
export function disclosureWithImperviousGoverning(
  disclosure: string | null | undefined,
  reconciliation: ImperviousFigureReconciliation,
): string | null | undefined {
  if (!reconciliation.disclosure) return disclosure;
  return disclosure ? `${disclosure} ${reconciliation.disclosure}` : reconciliation.disclosure;
}
