/**
 * P-270 (OPS-24 scope X11) — was this setback citation's effective date
 * readable AT SOURCE, and what does the surface say when it was not.
 *
 * THE RULING THIS IMPLEMENTS. MOST-CURRENT SOURCE WINS (operator 2026-09-11,
 * `_decisions/2026-09-11_setback_source_most_current_wins.md`): for setbacks
 * and every dimensional rule the source with the most recent effective date
 * supplies the value; dates are read AT SOURCE, never assumed from source
 * kind; and "an unreadable date produces a conflict row, never a silent
 * pick." The first two clauses were built (P-154 wave 3/4/6). This module is
 * the third: before it, a citation whose date could not be read was served as
 * a PLAIN citation, and a reader could not tell a rule from this year from one
 * from 2011. That is a silent pick in the only place it still existed.
 *
 * WHY ONE MODULE. The same decision had FOUR copies before this lane, and
 * they had drifted: `companionSetbackRulesMeta` in pe-record-to-facets.ts
 * (the `setbackRules` companion rail), the `dm` displayMeta block in
 * atom-chain-to-facets.ts (the property atom chain), the card's own
 * `setbackSourceClause` in src/browse/InspectCard.tsx (which returns a bare
 * citation when there is no date), and the vendored-table lookup in
 * codified-setback-from-zoning.ts. The last of the four is surveyed and
 * EXCLUDED rather than fixed: it reads scalars out of
 * `setback-tables/*.json` and serves no citation at all (its own
 * `AdapterSetbackTable` type does not even declare `citation_url`), so there
 * is no citation for it to qualify — it is named here so a later reader does
 * not have to re-derive that it was looked at. The other three all produce a
 * customer-visible citation and all three are now this module's callers. This
 * is the ONE place that decides; the callers hand it a source value and a
 * rail name and then render what it returns.
 *
 * THE THREE STATES (dispatch item 3). "Absent at source", "present but
 * unparseable" and "never looked for" are three different situations and none
 * of them is the others, so they are three members of one union and never one
 * boolean. A FOURTH value is deliberately NOT here: see `stateFromWireBasis`
 * for the one wire on which the first two cannot be told apart, which is
 * bounded and named rather than papered over with a new member.
 *
 * THE TWO AUDIENCES. The customer gets ONE sentence, identical in both repos
 * (see `SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE`), because three causes
 * phrased three ways is three chances for hauska-map and legacy-design-tools
 * to drift. The machine gets the distinct `state`, which is the member an
 * instrument or a future writer switches on. The row carries both, so neither
 * audience is guessed at.
 *
 * NEVER DEFAULT THE DATE (dispatch item 4). There is no `1970-01-01`, no
 * "today", no `Date.now()` and no reuse of the cell's write vintage anywhere
 * on this path. A defaulted date would enter a most-current-wins comparison
 * and silently win or lose it, which is the worst available outcome, so the
 * refusal IS the behaviour. Same stance as `@empressaio/setback-corpus/
 * resolve`'s own `dateFromTableEffectiveDate`, which this module deliberately
 * mirrors rather than re-implements: a date is read from a source's own
 * date-bearing field, and a table's "accessed ..." note is when someone
 * LOOKED, never when the law took effect.
 */

/**
 * How a setback citation's effective date was established, read AT SOURCE.
 *
 * `read` is the only member that means a date is on the wire. The other three
 * are the unreadable causes, kept apart on purpose:
 *
 * - `unreadable-absent-at-source` — the source was consulted and its own
 *   date-bearing field carries no date: the key is missing, or it is present
 *   and explicitly null. The source states no date.
 * - `unreadable-unparseable` — the source's date-bearing field EXISTS and is
 *   populated with something this module will not accept as a date. A
 *   different defect with a different fix (a bad value in a good field), and
 *   NOT the same as the source having no date.
 * - `unreadable-never-looked` — no date-bearing field was consulted at all.
 *   This is a statement about the RESOLVER, not about the source, and it is
 *   the state the vendored-table path was in until this lane: it read scalars
 *   and citation URLs and never had a date read in it.
 */
export type SetbackDateReadState =
  | "read"
  | "unreadable-absent-at-source"
  | "unreadable-unparseable"
  | "unreadable-never-looked";

/** The wire token the conflict row below is published under (VOCABULARY). */
export const SETBACK_CITATION_VINTAGE_TOKEN =
  "setback-citation-vintage-unreadable" as const;

/**
 * THE exact customer sentence. Byte-identical to legacy-design-tools'
 * `artifacts/api-server/src/lib/buildableEnvelope/setbackCitationVintage.ts`
 * copy; a test in EACH repo pins the literal so a drift is a failing test
 * rather than a silent difference. Promotion into `@empressaio/atom-contract/
 * display` (the canon's one vocabulary module) is this lane's leave_behind
 * item 1 — this lane cannot publish that package.
 *
 * It is ONE sentence for all three unreadable causes and names the
 * consequence rather than the cause: "undated" and "not as current" are true
 * of every one of them, and the machine-readable `state` on the same row is
 * where the cause lives. Verify-with-the-city is the same instruction the
 * envelope's own geometry disclosure already gives ("verify with survey +
 * city"), so the card does not teach two different next steps.
 */
export const SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE =
  "Setback rule vintage unknown — the rule is served undated, not as current. Verify with the city.";

/** A read of one source's own date-bearing field. `sourceDate` is only ever a value literally on the source. */
export type SetbackDateRead = {
  sourceDate: string | null;
  state: SetbackDateReadState;
};

/**
 * The conflict row. Published on the envelope next to the citation it is
 * about, so a reader (human or instrument) that holds the citation can always
 * ask what its vintage is, and never has to parse the disclosure prose to
 * find out.
 */
export type SetbackCitationVintageRow = {
  kind: typeof SETBACK_CITATION_VINTAGE_TOKEN;
  /** Which of the three unreadable causes. Never `"read"` — a readable date is not a conflict. */
  state: Exclude<SetbackDateReadState, "read">;
  /** The source whose date could not be read, as the resolver knows it (rail + writer). */
  sourceLabel: string | null;
  /** The citation that is being served undated — the row is never published without one. */
  citationUrl: string;
  /** The exact sentence every surface prints. Byte-identical across repos. */
  note: string;
};

/**
 * Strict `yyyy-mm-dd`, and nothing else. Deliberately NOT `Date.parse`: that
 * accepts "2026-4-1", "April 2026", "2026" and (worse) rolls "2026-02-31"
 * forward to March, so a bad value in a good field would read as a real date
 * and enter a most-current-wins comparison. The round-trip check rejects the
 * roll-forward case: a string that does not survive ISO normalization was not
 * a date.
 */
export function isStrictIsoDate(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const ms = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === trimmed;
}

/** No resolver on this path ever consulted a date-bearing field. */
export const NEVER_LOOKED_DATE_READ: SetbackDateRead = {
  sourceDate: null,
  state: "unreadable-never-looked",
};

/**
 * Read one field AT SOURCE. `present` is `true` only when the source's own
 * object HAS the key — the caller must not pre-collapse a missing key with an
 * empty or null value, because those are two of the three states this module
 * exists to keep apart.
 *
 * A key that is present and explicitly `null` reads as `absent-at-source`: the
 * source is stating it carries no date, which is a statement, not a malformed
 * value.
 */
export function readSetbackDateAtSource(field: {
  present: boolean;
  value: unknown;
}): SetbackDateRead {
  if (!field.present) {
    return { sourceDate: null, state: "unreadable-absent-at-source" };
  }
  if (field.value === null || field.value === undefined) {
    return { sourceDate: null, state: "unreadable-absent-at-source" };
  }
  if (isStrictIsoDate(field.value)) {
    return { sourceDate: field.value.trim(), state: "read" };
  }
  return { sourceDate: null, state: "unreadable-unparseable" };
}

/**
 * Read the first PRESENT key out of a companion row, at source. The keys are
 * the source's own spellings (`effectiveDate` and the snake_case
 * `effective_date` the `parcel_record` writer uses); the first key that is
 * present wins, so a row carrying both fields with different values yields
 * the first one's state rather than a merged guess.
 *
 * A `null` row is NOT this function's business: whether "no row" means
 * `never-looked` or something else depends on whether the rail was consulted,
 * which only the caller knows, so the caller passes `NEVER_LOOKED_DATE_READ`
 * explicitly. Keeping that decision at the call site is what stops this
 * module from inventing a state it cannot see.
 */
export function readSetbackDateFromRowAtSource(
  row: Record<string, unknown>,
  keys: readonly string[],
): SetbackDateRead {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return readSetbackDateAtSource({ present: true, value: row[key] });
    }
  }
  return { sourceDate: null, state: "unreadable-absent-at-source" };
}

/**
 * The property atom chain's own basis (`@empressaio/setback-corpus/resolve`'s
 * `SetbackDateBasis` vocabulary), when the wire carries a basis but no date.
 *
 * BOUNDED, AND NAMED RATHER THAN HIDDEN: an atom's `displayMeta` carries
 * `sourceDate` and `dateBasis` but NOT the raw `sourceVintage` it was read
 * from, so on this one wire "the field was absent" and "the field held a value
 * that is not a date" cannot be told apart — the published resolver returns
 * the single string `"unreadable"` for both. This module does not invent a
 * fourth member to represent its own ignorance of the wire, and it does not
 * silently pick one of the two: the source's own basis said unreadable, so the
 * honest state is that the source states no readable date
 * (`unreadable-absent-at-source`), and the row's `sourceLabel` carries the
 * basis verbatim so nothing the wire DID say is lost.
 *
 * `basis` absent entirely is the `never-looked` case: the atom was minted
 * before the date read existed (P-154 wave 6) and no resolver on this path
 * consulted a date at all.
 */
export function stateFromWireBasis(basis: string | null | undefined): SetbackDateRead {
  if (!basis) return NEVER_LOOKED_DATE_READ;
  if (basis === "unreadable") {
    return { sourceDate: null, state: "unreadable-absent-at-source" };
  }
  return NEVER_LOOKED_DATE_READ;
}

/**
 * The conflict row, or `null` when there is nothing to declare.
 *
 * `null` in exactly two cases, both of them correct rather than convenient:
 * no citation is being served (there is no citation to qualify), and the date
 * was readable (a readable date is not a conflict — this is the dispatch's
 * agreeing control, asserted in this module's own test so a change that
 * refuses the readable case fails rather than ships).
 */
export function setbackCitationVintageRow(input: {
  date: SetbackDateRead;
  citationUrl: string | null | undefined;
  sourceLabel: string | null | undefined;
}): SetbackCitationVintageRow | null {
  const url = typeof input.citationUrl === "string" ? input.citationUrl.trim() : "";
  if (!url) return null;
  if (input.date.state === "read") return null;
  const label =
    typeof input.sourceLabel === "string" && input.sourceLabel.trim()
      ? input.sourceLabel.trim()
      : null;
  return {
    kind: SETBACK_CITATION_VINTAGE_TOKEN,
    state: input.date.state,
    sourceLabel: label,
    citationUrl: url,
    note: SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE,
  };
}

/**
 * Append the sentence to whatever disclosure the envelope already carries.
 * Returns the disclosure unchanged when there is no row, so a caller can call
 * this unconditionally and a payload that declares nothing is byte-identical
 * to what it was before this lane.
 */
export function disclosureWithCitationVintage(
  disclosure: string | null | undefined,
  row: SetbackCitationVintageRow | null,
): string | undefined {
  const existing = typeof disclosure === "string" ? disclosure.trim() : "";
  if (!row) return existing ? existing : undefined;
  return existing ? `${existing} ${row.note}` : row.note;
}
