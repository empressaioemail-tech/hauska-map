/**
 * P-340 — the card resolves setbacks the same way the drawing route does:
 * gather every eligible candidate, hand them to the ONE shared resolver
 * (`@empressaio/setback-corpus/resolve`), serve what it returns.
 *
 * THE RULING. MOST-CURRENT SOURCE WINS (operator 2026-09-11,
 * `_decisions/2026-09-11_setback_source_most_current_wins.md`): the source
 * with the most recent effective date supplies the value; authority tier
 * breaks a tie ONLY when dates are equal or unreadable; dates are read AT
 * SOURCE, never assumed from source kind; and an unreadable date that
 * disagrees with another candidate produces a CONFLICT ROW carrying both
 * values, never a silent pick. The mechanism was fixed by
 * `_decisions/2026-09-13_share_the_most_current_setback_resolver.md`: one
 * resolver, in that package, consumed by every producer.
 *
 * WHAT WAS WRONG ON THIS SIDE (measured, P-340). The card built a codified
 * candidate ONLY when the atom chain carried no setback rule
 * (`tableSetbacks` was gated on `!setbacks` in `atom-chain-to-facets.ts`), so
 * for a parcel that HAS an atom rule the card could neither compare the two
 * sources nor notice they disagree. The route, by contrast, has built both
 * candidates and resolved them through this same function since LDT P-154.
 * The measured `PANEL-DRAW-TABLE-DISAGREE` class is the delta.
 *
 * This module is the card's mirror of the route's
 * `authoritativeSetbackSource.ts`: same candidate gathering, same resolver,
 * same "conflict is disclosed, tier-highest is still served" interim stance —
 * so the two surfaces can be pinned against each other by a divergence test
 * rather than by reading two implementations and hoping.
 */

import {
  dateFromAtomSourceVintage,
  dateFromTableEffectiveDate,
  resolveMostCurrentSetback,
  SETBACK_SOURCE_TIER_RANK,
  type SetbackCandidate,
  type SetbackDateBasis,
  type SetbackSourceTier,
} from "@empressaio/setback-corpus/resolve";
import {
  codifiedScalarsFromRow,
  corpusDistrictRow,
  corpusSetbackTable,
  jurisdictionRequiresPerParcelSetbackRecord,
} from "./setback-corpus-table.js";

export type CardSetbackScalars = {
  front_ft: number;
  side_ft: number;
  rear_ft: number;
  side_corner_ft?: number;
};

/**
 * The atom-chain setback rule, as the card receives it. Field names are the
 * WIRE's own spellings — `sideCornerFt`, not `sideCorner`: the atom chain
 * serves camelCase-with-Ft (live-confirmed 2026-09-18 on
 * `retrieval/property-nodes/:id/atom-chain` for all seven P-340 subjects),
 * and reading a spelling the wire does not carry is how a corner axis
 * silently disappears (LDT's `AtomChainSetbackWire` had the same defect and
 * is fixed beside this lane).
 */
export type AtomSetbackRuleWire = {
  front?: number;
  side?: number;
  rear?: number;
  sideCornerFt?: number;
  districtCode?: string | null;
  sourceAdapter?: string | null;
  sourceCitation?: string | null;
  /** EMIT time. Never a date source — see `dateFromAtomSourceVintage`. */
  extractedAt?: string | null;
  /** The rule's own vintage, read at source. The ONLY atom date field used. */
  sourceVintage?: string | null;
};

export type CardSetbackCandidate = {
  sourceKind: SetbackSourceTier;
  sourceLabel: string;
  scalars: CardSetbackScalars;
  sourceDate: string | null;
  dateBasis: SetbackDateBasis;
};

export type CardSetbackResolution = {
  /** The served four-tuple. On a conflict this is the tier-highest candidate, disclosed — never a silent pick. */
  scalars: CardSetbackScalars;
  sourceKind: SetbackSourceTier;
  sourceLabel: string;
  citationUrl: string | null;
  /** The winner's own date, read at source; `null` when it could not be read. */
  winnerSourceDate: string | null;
  dateBasis: SetbackDateBasis;
  /** Present ONLY when the resolver returned `conflict`. */
  conflict?: {
    reason: string;
    candidates: CardSetbackCandidate[];
  };
};

/**
 * Authority tier — the RESOLVER'S OWN ranking, imported rather than copied
 * (P-340: a second copy of the ranking is a second place to disagree about
 * which value a disclosed conflict still serves), used ONLY to pick that
 * still-served value on a disclosed conflict — never to rank a clean
 * resolution, which is `resolveMostCurrentSetback`'s job alone.
 */
const TIER_RANK: Readonly<Record<SetbackSourceTier, number>> = SETBACK_SOURCE_TIER_RANK;

function atomSourceKind(rule: AtomSetbackRuleWire): SetbackSourceTier {
  const adapter = (rule.sourceAdapter ?? rule.sourceCitation ?? "").toLowerCase();
  if (
    adapter.includes("layer-23") ||
    adapter.includes("per-parcel") ||
    adapter.includes("onclick")
  ) {
    return "gis-per-parcel";
  }
  return "atom-chain";
}

/**
 * The atom-chain / per-parcel candidate, or null when the rule carries no
 * usable scalars. `sideCornerFt` is carried whenever it is a number — the
 * corner axis is a real distinct axis and dropping it when it happens to
 * equal the side yard is the measurement defect this lane closes.
 */
export function atomCandidateFromRule(
  rule: AtomSetbackRuleWire | null | undefined,
): CardSetbackCandidate | null {
  if (!rule) return null;
  if (
    typeof rule.front !== "number" ||
    typeof rule.side !== "number" ||
    typeof rule.rear !== "number"
  ) {
    return null;
  }
  return {
    sourceKind: atomSourceKind(rule),
    sourceLabel:
      rule.sourceCitation ?? rule.sourceAdapter ?? "property atom-chain setback-rule",
    scalars: {
      front_ft: rule.front,
      side_ft: rule.side,
      rear_ft: rule.rear,
      ...(typeof rule.sideCornerFt === "number"
        ? { side_corner_ft: rule.sideCornerFt }
        : {}),
    },
    ...dateFromAtomSourceVintage(rule.sourceVintage),
  };
}

/** The codified-ordinance candidate, off the published corpus row + the table's own `effectiveDate`. */
export function codifiedCandidateFor(
  jurisdictionKey: string | null | undefined,
  districtCode: string | null | undefined,
  perParcelRecord?: CardSetbackScalars | null,
): { candidate: CardSetbackCandidate; citationUrl: string | null } | null {
  if (jurisdictionRequiresPerParcelSetbackRecord(jurisdictionKey)) {
    if (!perParcelRecord) return null;
    return {
      candidate: {
        sourceKind: "gis-per-parcel",
        sourceLabel: "live per-parcel setback record",
        scalars: perParcelRecord,
        // The per-parcel record's own date is read by its caller (the Bastrop
        // record composer) and is not on this wire; unreadable is the honest
        // value here, exactly as the route's atom candidate does.
        sourceDate: null,
        dateBasis: "unreadable",
      },
      citationUrl: null,
    };
  }
  const table = corpusSetbackTable(jurisdictionKey);
  const row = corpusDistrictRow(table, districtCode);
  if (!table || !row) return null;
  return {
    candidate: {
      sourceKind: "codified-ordinance",
      sourceLabel: table.jurisdictionDisplayName,
      scalars: codifiedScalarsFromRow(row),
      ...dateFromTableEffectiveDate(
        (table as { effectiveDate?: string }).effectiveDate,
      ),
    },
    citationUrl: row.citation_url?.trim() ? row.citation_url.trim() : null,
  };
}

/**
 * Resolve one parcel's setbacks from every eligible candidate under R-1.
 *
 * Returns null when NO candidate exists (no corpus row for this district and
 * no usable atom rule) — absence is the caller's decline logic, not this
 * function's, exactly as the shared resolver's own contract states.
 */
export function resolveCardSetbacks(args: {
  jurisdictionKey: string | null | undefined;
  districtCode: string | null | undefined;
  atomRule: AtomSetbackRuleWire | null | undefined;
  /** Live layer-23 scalars for a per-parcel-only jurisdiction (Bastrop city), pre-fetched by the caller. */
  perParcelSetback?: CardSetbackScalars | null;
}): CardSetbackResolution | null {
  const codified = codifiedCandidateFor(
    args.jurisdictionKey,
    args.districtCode,
    args.perParcelSetback ?? null,
  );
  const atom = atomCandidateFromRule(args.atomRule);

  const candidates: CardSetbackCandidate[] = [];
  if (codified) candidates.push(codified.candidate);
  if (atom) candidates.push(atom);
  if (candidates.length === 0) return null;

  const resolution = resolveMostCurrentSetback(candidates);
  const winner =
    resolution.status === "resolved"
      ? resolution.winner
      : [...resolution.candidates].sort(
          (a, b) => TIER_RANK[b.sourceKind] - TIER_RANK[a.sourceKind],
        )[0]!;

  return {
    scalars: winner.scalars,
    sourceKind: winner.sourceKind,
    sourceLabel: winner.sourceLabel,
    citationUrl:
      winner.sourceKind === "codified-ordinance" ? (codified?.citationUrl ?? null) : null,
    winnerSourceDate: winner.sourceDate,
    dateBasis: winner.dateBasis,
    ...(resolution.status === "conflict"
      ? {
          conflict: {
            reason: resolution.reason,
            candidates: resolution.candidates.map((c) => ({
              sourceKind: c.sourceKind,
              sourceLabel: c.sourceLabel,
              scalars: c.scalars,
              sourceDate: c.sourceDate,
              dateBasis: c.dateBasis,
            })),
          },
        }
      : {}),
  };
}

/** The four-tuple a divergence instrument compares, in one canonical order. */
export function setbackTuple(s: CardSetbackScalars): [number, number, number, number | null] {
  return [s.front_ft, s.side_ft, s.rear_ft, s.side_corner_ft ?? null];
}

/** Do two servers agree on the served four-tuple? */
export function setbackTuplesAgree(
  a: CardSetbackScalars,
  b: CardSetbackScalars,
): boolean {
  return setbackTuple(a).join("/") === setbackTuple(b).join("/");
}

/** Exported so a caller can build the same candidate list an instrument compares. */
export function candidatesFor(
  args: Parameters<typeof resolveCardSetbacks>[0],
): SetbackCandidate[] {
  const out: SetbackCandidate[] = [];
  const codified = codifiedCandidateFor(
    args.jurisdictionKey,
    args.districtCode,
    args.perParcelSetback ?? null,
  );
  if (codified) {
    out.push({
      id: "codified-ordinance",
      sourceKind: "codified-ordinance",
      sourceLabel: codified.candidate.sourceLabel,
      scalars: codified.candidate.scalars,
      sourceDate: codified.candidate.sourceDate,
      dateBasis: codified.candidate.dateBasis,
      citationUrl: codified.citationUrl,
    });
  }
  const atom = atomCandidateFromRule(args.atomRule);
  if (atom) {
    out.push({
      id: "atom-chain",
      sourceKind: atom.sourceKind,
      sourceLabel: atom.sourceLabel,
      scalars: atom.scalars,
      sourceDate: atom.sourceDate,
      dateBasis: atom.dateBasis,
      citationUrl: null,
    });
  }
  return out;
}
