/**
 * P-340 — the card's codified setback table comes from the ONE published
 * corpus, never a vendored copy.
 *
 * Before this lane `codified-setback-from-zoning.ts` carried four vendored
 * JSON tables (`setback-tables/austin-tx.json` and three siblings) and
 * resolved by exact leading-token match. That was a SECOND home for setback
 * law beside `@empressaio/setback-corpus` — the package the drawing route
 * already reads — and the copies had drifted: the vendored austin-tx table
 * was a nine-row subset of the corpus's 37 rows and still carried the
 * pre-correction MF-2/MF-3 front yard (15 ft; the corpus's own note records
 * the current table states 25 ft). Two homes means two answers, which is the
 * defect this lane exists to close.
 *
 * The module is DELIBERATELY thin: it is table lookup and district-row
 * matching, nothing else. The decision (which candidate wins) lives in
 * `setback-resolution.ts`, which calls the corpus's own
 * `resolveMostCurrentSetback`; the serving shape lives in
 * `atom-chain-to-facets.ts`. City-specific serving policy that the corpus
 * package deliberately does NOT carry (which jurisdiction serves its scalars
 * from a live per-parcel record instead of the ordinance chart) stays here,
 * in the consumer, exactly as the corpus package's own README asks.
 */

import {
  getSetbackTable,
  type SetbackDistrict,
  type SetbackTable,
} from "@empressaio/setback-corpus";

/**
 * Jurisdictions whose scalars come from a live per-parcel record only, never
 * from the ordinance chart (Bastrop city — layer 23). Moved here verbatim
 * from the retired `codified-setback-from-zoning.ts`; the list is policy, not
 * data, and does not belong in the corpus package.
 */
export const PER_PARCEL_RECORD_ONLY_SETBACK_KEYS: ReadonlySet<string> = new Set([
  "bastrop-city-tx",
  "bastrop-tx",
  "bastrop-development-code",
  "bastrop-per-parcel-record",
]);

/** Canonical jurisdiction key: lowercase, hyphens (the corpus's own spelling). */
export function normalizeJurisdictionKey(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  return t.length > 0 ? t : null;
}

/**
 * Exported so callers (the PE facets BFF) can decide whether to fetch a live
 * per-parcel record before resolving.
 */
export function jurisdictionRequiresPerParcelSetbackRecord(
  jurisdictionKey: string | null | undefined,
): boolean {
  const key = normalizeJurisdictionKey(jurisdictionKey);
  return key != null && PER_PARCEL_RECORD_ONLY_SETBACK_KEYS.has(key);
}

/** The jurisdiction's own published table, or null when the corpus has none. */
export function corpusSetbackTable(
  jurisdictionKey: string | null | undefined,
): SetbackTable | null {
  const key = normalizeJurisdictionKey(jurisdictionKey);
  if (!key) return null;
  return getSetbackTable(key);
}

/**
 * A district code normalized for comparison: uppercase, everything that is
 * not a letter or a digit stripped (`R-2` -> `R2`, `R-1-A` -> `R1A`).
 *
 * BYTE-FOR-BYTE THE ROUTE'S RULE — legacy-design-tools
 * `artifacts/api-server/src/lib/buildableEnvelope/districtMapping.ts`
 * `normalizeCode`. The two are MIRROR IMPLEMENTATIONS, each covered by its own
 * repo's tests, NOT a cross-repo byte pin: the P-331 drift check
 * (`scripts/check-cross-repo-literal-drift.mjs`) compares declared LITERALS and
 * a function body is not one of its rows, so a one-sided edit to this
 * normalizer would pass both CIs. That is a named bypass of that check rather
 * than a covered case; the paired divergence suites are what actually fail when
 * the two matchers stop agreeing about a real parcel. The card
 * and the route must pick the same ROW before they can possibly agree about
 * the value: `R2` (the record rail's own spelling for Buda's R-2 district)
 * only reaches the corpus's `R-2 Suburban Residential` row through this
 * normalization, and a matcher that compared the raw spellings would drop the
 * codified candidate for one of the 7 measured subjects.
 */
export function normalizeDistrictCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The code a table ROW declares: the leading token of its `district_name`
 * (`"R-MD Residential ..."` -> `RMD`). Same read as the route's
 * `districtCode(district)`.
 */
function rowDistrictCode(row: SetbackDistrict): string {
  return normalizeDistrictCode(row.district_name.trim().split(/\s+/)[0] ?? "");
}

/**
 * Is a prefix crossing between these two normalized codes safe evidence of
 * the same district? Mirrors the route's `isSafePrefixMatch` exactly: a
 * one-character token is never enough (it would collapse `P-5` into the
 * unrelated `P Public/Institutional` row), and a strict prefix is only
 * accepted when it does not name MORE THAN ONE row — the P-257/P-340
 * ambiguity guard. Austin's `SF` is a prefix of six rows (`SF-1`..`SF-6`,
 * `SF-4A`), so it names no district at all; the pre-P-340 route crossed it
 * into whichever match was longest (`SF-4A`) and served 15/3.5/5/10 for two
 * parcels whose own city layer says `SF-3`/`SF-2` (25/5/10/15).
 */
function isSafePrefixMatch(code: string, rowCode: string): boolean {
  const shorter = Math.min(code.length, rowCode.length);
  return shorter >= 2 && (code.startsWith(rowCode) || rowCode.startsWith(code));
}

/** The row whose own code is EXACTLY this code (normalized); no prefix, no fallback. */
function exactCorpusDistrictRow(
  table: SetbackTable | null | undefined,
  districtCode: string | null | undefined,
): SetbackDistrict | null {
  if (!table || !table.districts.length) return null;
  const wanted =
    typeof districtCode === "string" && districtCode.trim()
      ? normalizeDistrictCode(districtCode)
      : null;
  if (!wanted) return null;
  return table.districts.find((d) => rowDistrictCode(d) === wanted) ?? null;
}

/**
 * The row this DISTRICT CODE names — the card's mirror of the route's
 * `mapDistrict` row selection, in the route's own order:
 *
 *   1. exact normalized token equality (`R2` -> `R-2`);
 *   2. else a GUARDED, UNAMBIGUOUS prefix crossing (suffix variants such as
 *      `R-1A` against a table's `R-1` row) — refused when the code prefixes
 *      more than one row, because a code that names several rows names none;
 *   3. else null — the caller's decline, never an invented district.
 *
 * A code with no row resolves nothing here. That is the whole point: the
 * codified candidate must exist on the SAME terms on both surfaces, or the
 * divergence test this lane adds would be comparing two different questions.
 */
export function corpusDistrictRow(
  table: SetbackTable | null | undefined,
  districtCode: string | null | undefined,
): SetbackDistrict | null {
  const exact = exactCorpusDistrictRow(table, districtCode);
  if (exact) return exact;
  if (!table || !table.districts.length) return null;
  const wanted =
    typeof districtCode === "string" && districtCode.trim()
      ? normalizeDistrictCode(districtCode)
      : null;
  if (!wanted) return null;

  const prefixMatches = table.districts.filter((d) => {
    const dc = rowDistrictCode(d);
    return dc.length > 0 && isSafePrefixMatch(wanted, dc);
  });
  return prefixMatches.length === 1 ? prefixMatches[0]! : null;
}

/**
 * Does this jurisdiction's own published table row this exact district code?
 *
 * EXACT ONLY — deliberately NOT {@link corpusDistrictRow}. This is the
 * ordering half of the planned-development gate, and it mirrors the route's
 * own `districtCodeHasExactRow` (also exact-only). Using the row SELECTOR here
 * would let `PD` "resolve" Smithville's real `PD-Z` row by prefix and the gate
 * would stop refusing the measured defect (`48021:70907`, served
 * 20/100/100/100) — the regression this repo's suite caught when this module
 * was first written. A real district row wins the gate; a prefix crossing
 * never does.
 */
export function hasExactCorpusDistrictRow(
  jurisdictionKey: string | null | undefined,
  districtCode: string | null | undefined,
): boolean {
  return exactCorpusDistrictRow(corpusSetbackTable(jurisdictionKey), districtCode) !== null;
}

/**
 * The four served scalars off a corpus row. `side_corner_ft` is carried
 * whenever the table states a number (the corpus's own schema makes the field
 * required, with a sentinel + `provenance.not_specified` for a genuinely
 * silent axis) — the same read the drawing route's `scalarsFromDistrict`
 * makes, so the two surfaces cannot disagree about what the row says.
 */
export function codifiedScalarsFromRow(row: SetbackDistrict): {
  front_ft: number;
  side_ft: number;
  rear_ft: number;
  side_corner_ft?: number;
} {
  return {
    front_ft: row.front_ft,
    side_ft: row.side_ft,
    rear_ft: row.rear_ft,
    ...(typeof row.side_corner_ft === "number"
      ? { side_corner_ft: row.side_corner_ft }
      : {}),
  };
}
