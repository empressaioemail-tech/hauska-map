/**
 * What a served CAD-roll dollar actually IS, and the words the panel uses to
 * say so (OPS-16 P-124 / CTX-B4, downstream of operator ruling A1).
 *
 * CTX-B1 (legacy-design-tools PR #650) stopped asserting a constant and began
 * deriving `valueBasis` per row from whether the county's own `assessed_value`
 * is present at the declared vintage. A row the StratMap adapter produced can
 * never carry one -- `lib/cad-ingest/src/txgio/landuse.ts` hard-codes
 * `assessedValue: null` on every row it emits, and its dollars come from the
 * free public TxGIO/StratMap land-parcels DBF fields `LAND_VALUE`, `IMP_VALUE`
 * and `MKT_VALUE`. A genuine county appraisal-district export does carry one.
 *
 * That distinction reached the wire and stopped there. Every parcel still
 * rendered under the heading "Tax-assessed value" over the source label
 * "<County> County appraisal roll", which for a StratMap-sourced dollar is two
 * false statements on the card face. This module is the vocabulary that ends
 * that, and it is the ONLY place the words live, so a heading and a source
 * label cannot drift apart.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DOES NOT DO
 * ---------------------------------------------------------------------------
 *
 * It never renders the value as missing. Ruling A1 explicitly rejected turning
 * a labelled dollar into an absence: the figure is present, usable, and served
 * at full weight in all five states below. Only its NAME and its stated source
 * change.
 *
 * It never produces a confidence number. The house rule is a provenance
 * statement, never a bare score.
 *
 * It never guesses. Five states, and the three beyond the wire's own two are
 * there because "the record did not say", "the record said something this
 * build cannot read", and "the record said two different things" are three
 * genuinely different situations, and collapsing any of them into
 * `county-assessed` would write a claim that nothing checked.
 */

/** The two members legacy-design-tools puts on the wire (CTX-B1). */
export const COUNTY_ASSESSED_BASIS = "county-assessed" as const;
export const STRATMAP_REDISTRIBUTED_BASIS = "stratmap-redistributed" as const;

/** Every wire token this build knows how to name. Order is not meaningful. */
export const KNOWN_VALUE_BASIS_TOKENS: readonly string[] = [
  COUNTY_ASSESSED_BASIS,
  STRATMAP_REDISTRIBUTED_BASIS,
];

/**
 * The RESOLVED basis for one parcel's dollar rail, which is a property of the
 * READ and not only of the wire.
 *
 *  - `county-assessed`         the county appraisal district's own export.
 *  - `stratmap-redistributed`  the Texas statewide StratMap parcel file.
 *  - `unstated`                no dollar field on this record carried a
 *                              `valueBasis` at all. Never defaulted into
 *                              either member above: writing `county-assessed`
 *                              here would be a claim that something looked,
 *                              on a record where nothing did.
 *  - `unrecognised`            a `valueBasis` IS present and is not a token
 *                              this build knows. Distinct from `unstated` on
 *                              purpose -- the record stated a source and the
 *                              reader failed, which is a contract drift this
 *                              surface must show rather than absorb. The raw
 *                              token travels with it so the drift is
 *                              diagnosable from a screenshot.
 *  - `mixed`                   the rails disagree. legacy-design-tools
 *                              resolves ONE basis per parcel and stamps all
 *                              four rails with it, but that is an invariant of
 *                              new bakes, not a property of every payload
 *                              already in the store. Two numbers that should
 *                              agree and do not is a finding; taking the first
 *                              rail silently would hide it.
 */
export type ValuationBasis =
  | typeof COUNTY_ASSESSED_BASIS
  | typeof STRATMAP_REDISTRIBUTED_BASIS
  | "unstated"
  | "unrecognised"
  | "mixed";

/**
 * A resolved basis plus, for `unrecognised`, the token that was not
 * recognised. The token is carried rather than discarded because an
 * unrecognised value with no name is indistinguishable from an absent one at
 * the point it matters.
 */
export interface ResolvedValuationBasis {
  basis: ValuationBasis;
  /** Set only when `basis` is `unrecognised`. Null otherwise. */
  unrecognisedToken: string | null;
}

/** The four rails a cad-roll record carries, in the order the row renders. */
export const CAD_ROLL_DOLLAR_FIELDS = [
  "marketValue",
  "landValue",
  "improvementValue",
  "assessedValue",
] as const;

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * The `valueBasis` token on ONE dollar field, or null when the field carries
 * none. Reads every shape the field arrives in (the offline-baked shape with
 * no `state` key, the live-overlay wire's `present`/`zero`, and the wire's own
 * `absent` / `refused`, neither of which ever carries a basis) -- the same
 * defensive posture `cadRollFieldState` already takes on the value itself.
 *
 * An empty or whitespace-only string is NOT a token. It is the absence of one,
 * and treating it as a token would let a sentinel satisfy the read.
 */
export function valueBasisTokenOf(rawField: unknown): string | null {
  const f = rec(rawField);
  if (!f) return null;
  const raw = f.valueBasis;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve one basis across a whole cad-roll record.
 *
 * The resolution is deliberately NOT "first rail wins". It collects the
 * distinct tokens across all four rails and refuses to pick when they
 * disagree, because a disagreement is the exact class of finding that gets
 * rounded off by a first-wins read.
 */
export function resolveValuationBasis(
  cadRoll: Record<string, unknown> | null | undefined,
): ResolvedValuationBasis {
  if (!cadRoll) return { basis: "unstated", unrecognisedToken: null };

  const tokens: string[] = [];
  for (const field of CAD_ROLL_DOLLAR_FIELDS) {
    const token = valueBasisTokenOf(cadRoll[field]);
    if (token && !tokens.includes(token)) tokens.push(token);
  }

  if (tokens.length === 0) return { basis: "unstated", unrecognisedToken: null };
  if (tokens.length > 1) return { basis: "mixed", unrecognisedToken: null };

  const token = tokens[0] as string;
  if (token === COUNTY_ASSESSED_BASIS) {
    return { basis: COUNTY_ASSESSED_BASIS, unrecognisedToken: null };
  }
  if (token === STRATMAP_REDISTRIBUTED_BASIS) {
    return { basis: STRATMAP_REDISTRIBUTED_BASIS, unrecognisedToken: null };
  }
  return { basis: "unrecognised", unrecognisedToken: token };
}

/**
 * Narrow a basis that has already crossed the sheet boundary (contract
 * AMENDMENT 5) back into the resolved shape.
 *
 * The sheet carries a plain string on purpose, so this is where an unknown one
 * is caught. The four determinate members pass through; anything else that is
 * a non-empty string is `unrecognised` and keeps its token; an absent or blank
 * field is `unstated`.
 *
 * `unstated` is NOT a fallback that makes the code stop raising. It is the
 * correct answer for a sheet that does not state a source, and it renders as
 * its own sentence. Silently promoting it to `county-assessed` would be the
 * defect this whole lane exists to remove.
 */
export function readValuationBasis(
  rawBasis: unknown,
  rawToken: unknown = null,
): ResolvedValuationBasis {
  const token = typeof rawToken === "string" && rawToken.trim() ? rawToken.trim() : null;
  const basis = typeof rawBasis === "string" ? rawBasis.trim() : "";
  if (!basis) return { basis: "unstated", unrecognisedToken: null };
  if (basis === COUNTY_ASSESSED_BASIS) {
    return { basis: COUNTY_ASSESSED_BASIS, unrecognisedToken: null };
  }
  if (basis === STRATMAP_REDISTRIBUTED_BASIS) {
    return { basis: STRATMAP_REDISTRIBUTED_BASIS, unrecognisedToken: null };
  }
  if (basis === "unstated") return { basis: "unstated", unrecognisedToken: null };
  if (basis === "mixed") return { basis: "mixed", unrecognisedToken: null };
  if (basis === "unrecognised") {
    return { basis: "unrecognised", unrecognisedToken: token };
  }
  // A basis string in neither vocabulary. It stated something; say so, and
  // keep the word it said.
  return { basis: "unrecognised", unrecognisedToken: basis };
}

/**
 * The row's HEADING.
 *
 * `Tax-assessed value` is kept EXACTLY as operator ruling A-103 item 5 set it
 * -- but only where it is true. That ruling was made when every served dollar
 * was believed to be the county's own assessment; applying its wording to a
 * dollar that is not is the defect, not the fix.
 *
 * Every other basis renders the neutral `Recorded value`. The heading's whole
 * job here is to stop making a claim the row cannot support; the explanation
 * belongs on the basis line, which sits on the card face and needs no tap. The
 * anti-opinion half of A-103 is carried into the alternate heading too: no
 * "valuation", "worth", "estimate" or "approximate" anywhere near a dollar the
 * county did or did not record.
 *
 * The row's `key` and `data-testid` do NOT vary with the basis. Machine
 * identity stays fixed so a compare surface, an export and a test still see
 * one row; only the human name moves, which is precisely what should move when
 * the thing being named changes.
 */
export function taxValuationRowHeading(basis: ValuationBasis): string {
  // VIOLATION-RUN STUB (commit 1 of 2). Reproduces the pre-CTX-B4 card
  // exactly: one heading for every basis. The stratmap violation test must
  // FAIL here and the county-assessed control must PASS. Removed in commit 2.
  void basis;
  return "Tax-assessed value";
}

function countyPhrase(countyName: string | null | undefined): string {
  const trimmed = typeof countyName === "string" ? countyName.trim() : "";
  return trimmed ? `${trimmed} County` : "the county";
}

/**
 * The BASIS LINE: one short sentence rendered on the card face, directly under
 * the dollars, at the same weight the honest-absence basis line already uses.
 * No hover, no tap, no tooltip.
 *
 * It is rendered in ALL FIVE states, `county-assessed` included. That is the
 * load-bearing part. If the line appeared only for the non-county bases, then
 * a record whose line was dropped by a rendering bug, a stale bake, or a
 * future refactor would be indistinguishable from a genuine county-assessed
 * row -- silence would read as the strongest claim. Always occupying the slot
 * makes the county case a positive statement instead of a default.
 */
export function taxValuationBasisLine(
  resolved: ResolvedValuationBasis,
  countyName: string | null | undefined,
): string {
  const county = countyPhrase(countyName);
  // VIOLATION-RUN STUB (commit 1 of 2). Reproduces the pre-CTX-B4 claim
  // exactly: the county appraisal roll, asserted on every basis. Removed in
  // commit 2.
  void resolved;
  return `From ${county}'s own appraisal-roll export.`;
  switch (resolved.basis) {
    case COUNTY_ASSESSED_BASIS:
      return `From ${county}'s own appraisal-roll export.`;
    case STRATMAP_REDISTRIBUTED_BASIS:
      return `From the Texas StratMap statewide parcel file, not ${county}'s own appraisal-roll export.`;
    case "unstated":
      return "This record does not state which source the figure came from.";
    case "unrecognised":
      return `This build does not recognise the source stated on this record (${resolved.unrecognisedToken ?? "unnamed"}).`;
    case "mixed":
      return "The amounts on this record do not agree on their source.";
  }
}

/**
 * The provenance `sourceLabel` for the VALUATION fact only.
 *
 * Deliberately not applied to the shared cad-roll provenance that APN, situs
 * and land use also read. `valueBasis` is evidence about the DOLLAR fields --
 * it is derived from `assessed_value` presence and from nothing else -- so
 * relabelling a parcel's identity rows off it would be a control broader than
 * its claim. Those rows keep the label they had.
 *
 * `source`, the machine key, is left to the caller: this build has no
 * authority to mint a lineage key the producer did not send, and inventing one
 * would put an unresolved identifier into a provenance record.
 */
export function taxValuationSourceLabel(
  resolved: ResolvedValuationBasis,
  countyName: string | null | undefined,
): string {
  const county = countyPhrase(countyName);
  // VIOLATION-RUN STUB (commit 1 of 2). Removed in commit 2.
  void resolved;
  return `${county} appraisal roll`;
  switch (resolved.basis) {
    case COUNTY_ASSESSED_BASIS:
      return `${county} appraisal roll`;
    case STRATMAP_REDISTRIBUTED_BASIS:
      return "Texas StratMap statewide parcel file";
    case "unstated":
      return `${county} parcel record, source not stated`;
    case "unrecognised":
      return `${county} parcel record, source not recognised (${resolved.unrecognisedToken ?? "unnamed"})`;
    case "mixed":
      return `${county} parcel record, amounts disagree on their source`;
  }
}

/**
 * Everything the row needs to render itself, composed once.
 *
 * Composed at the sheet-to-card boundary rather than in the card, because that
 * is the last place the county's own name is available as a field. The card
 * would otherwise have to parse it back out of the rendered county string
 * ("Bastrop County (48021)"), and a renderer that re-derives a fact from
 * another rendered string is how a display bug becomes a provenance bug.
 */
export interface ValuationBasisPresentation {
  basis: ValuationBasis;
  /** Set only when `basis` is `unrecognised`. Null otherwise. */
  unrecognisedToken: string | null;
  /** The row's heading. */
  heading: string;
  /** The sentence rendered on the card face, directly under the amounts. */
  line: string;
}

export function presentValuationBasis(
  resolved: ResolvedValuationBasis,
  countyName: string | null | undefined,
): ValuationBasisPresentation {
  return {
    basis: resolved.basis,
    unrecognisedToken: resolved.unrecognisedToken,
    heading: taxValuationRowHeading(resolved.basis),
    line: taxValuationBasisLine(resolved, countyName),
  };
}
