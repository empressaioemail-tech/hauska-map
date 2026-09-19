/**
 * P-257 — a planned-development code is not a district.
 *
 * `PUD`/`PDD`/`PD`/`PC` codes are not Euclidean districts: A-164 routes them to
 * the "your setbacks come from your PUD ordinance" message, and a planned
 * unit development's dimensional standards live in the development's own
 * ordinance and development plan, not in a district schedule. Emitting a
 * table row for one is emitting a value computed without its required input.
 *
 * THE PATTERN IS COPIED, NOT PARAPHRASED. It is legacy-design-tools'
 * `PLANNED_DEVELOPMENT_PATTERN` / `PLANNED_DEVELOPMENT_FLAGS`
 * (`lib/cad-ingest/src/txgio/zoning-layers.ts`), which are themselves "copied
 * not paraphrased" from P-255's census so the stamp and the census cannot mean
 * different things by the words. This repo vendors its resolvers rather than
 * importing engine/adapters packages, so the pair travels as a pinned literal
 * and `setback-decline-wording.test.ts` asserts it byte-for-byte against the
 * legacy-design-tools value — a change on either side fails the other side's
 * suite. Do NOT re-type this pattern from memory; change both sides or neither.
 *
 * ORDER IS THE RULE, and it is the ORDER that matters as much as the pattern.
 * `zoning-base-code.ts` records the one deliberate divergence from the census:
 * "this parser checks the base vocabulary FIRST, so a city whose table really
 * rows a PD/PC/PUD district resolves it as a district (the census classifies
 * on the raw code alone and would call it planned development)." That ordering
 * is not optional here, and it was measured, not assumed: a sweep of all 44
 * shipped setback tables under legacy-design-tools/lib/adapters/src/local/setbacks/
 * found 2 tables rowing a code this pattern matches — `grand-county-ut`
 * ("PUD Planned Unit Development") and `smithville-tx`
 * ("PD-Z Zero Lot Line Garden Home District", Sec. 2.2.17) — and BOTH are real
 * districts with real ordinance rows. A gate that fires on the code alone would
 * falsely refuse both, and one of them (Smithville) is in the county where the
 * measured defect lives.
 */

import { hasExactCorpusDistrictRow } from "./setback-corpus-table.js";

/**
 * Pinned copy of legacy-design-tools' `PLANNED_DEVELOPMENT_PATTERN`
 * (`lib/cad-ingest/src/txgio/zoning-layers.ts`). Asserted equal by test.
 */
export const PLANNED_DEVELOPMENT_PATTERN = "^(PUD|PDD|PD|PC|P-?U-?D)([\\s-].*)?$";

/** Pinned copy of legacy-design-tools' `PLANNED_DEVELOPMENT_FLAGS`. Asserted equal by test. */
export const PLANNED_DEVELOPMENT_FLAGS = "i";

const PLANNED_DEVELOPMENT_RE = new RegExp(
  PLANNED_DEVELOPMENT_PATTERN,
  PLANNED_DEVELOPMENT_FLAGS,
);

/**
 * Does this published zoning value carry a planned-development code? Pattern
 * test ONLY — this answers "what kind of code is this", never "may I serve a
 * table for it". Callers must consult the exact-row test first (see
 * `plannedDevelopmentSetbackRefusal` in `setback-decline-wording.ts`), or they
 * will refuse Smithville's real PD-Z row.
 */
export function isPlannedDevelopmentCode(
  raw: string | null | undefined,
): boolean {
  const code = (raw ?? "").trim();
  if (!code) return false;
  // The shared pattern carries no `g` flag; `lastIndex` is reset anyway so a
  // future flags change cannot make this stateful.
  PLANNED_DEVELOPMENT_RE.lastIndex = 0;
  return PLANNED_DEVELOPMENT_RE.test(code);
}

/**
 * The refusal every surface serves for a planned-development district, in one
 * string. Copied verbatim from P-256's `PUD_REFUSAL_REASON`
 * (`parcels-setback-cells.mjs`) so the ledger writer and the card cannot mean
 * different things by the refusal. Asserted byte-for-byte by test.
 */
export const PUD_SETBACK_REFUSAL_REASON =
  "setbacks for this parcel are set by its planned-development ordinance, " +
  "not a district schedule";

/**
 * The customer-facing disclosure for a planned-development refusal: names the
 * class, names the parcel's own district, says why no table exists, and says
 * what the reader should do instead. Composed here, once, so no second
 * composition path can drift from it.
 */
/**
 * The customer-facing disclosure for a planned-development refusal: names the
 * class, names the parcel's own district, says why no table exists, and says
 * what the reader should do instead. Composed here, once, so no second
 * composition path can drift from it.
 */
export function plannedDevelopmentDisclosure(input: {
  districtCode: string;
  jurisdictionKey?: string | null;
}): string {
  const where = (input.jurisdictionKey ?? "").trim();
  return (
    `${input.districtCode} is a planned-development code, not a Euclidean ` +
    "district: its dimensional standards are set by the development's own " +
    "ordinance and development plan, not by a district schedule, so no " +
    "setback table is served" +
    (where ? ` for ${where}` : "") +
    ". " +
    PUD_SETBACK_REFUSAL_REASON.charAt(0).toUpperCase() +
    PUD_SETBACK_REFUSAL_REASON.slice(1) +
    ". Verify the development plan's own standards with the city."
  );
}

/**
 * THE GATE. Returns the refusal when this parcel's district must not be served
 * a Euclidean setback table, and null when it may.
 *
 * Order is the rule (see this file's header): a district the table really rows
 * resolves as a district, and only a code with no exact row of its own is
 * read as a planned-development code. Both halves are load-bearing and both
 * are measured:
 *
 *  - `hasExactCorpusDistrictRow` keeps Smithville's real `PD-Z` and Grand
 *    County's real `PUD` rows resolving (2 of the 44 shipped tables row a code
 *    the pattern matches). P-340: this now reads the ONE published corpus
 *    rather than the card's own four vendored tables, so the card's gate sees
 *    the same table set the drawing route's gate does — before the change the
 *    card refused Smithville's `PD-Z` as a planned development (it had no
 *    Smithville table) while the route served its real row.
 *  - the pattern test is what makes `PD` — Smithville's measured defect
 *    (`48021:70907`, which resolved 20/100/100/100) — refuse instead of
 *    crossing into `PD-Z` by prefix.
 *
 * A code that is neither an exact row nor a planned-development code is NOT
 * touched here: it keeps today's behaviour (no table, decline). This gate adds
 * a refusal; it never adds a value.
 */
export function plannedDevelopmentSetbackRefusal(input: {
  districtCode?: string | null;
  jurisdictionKey?: string | null;
  /**
   * Test seam for the ordering half of the rule. Defaults to this repo's own
   * vendored-table lookup. A caller must not pass this from production code —
   * it exists so the "a real district row wins" branch can be exercised
   * against a district this repo does not vendor (Smithville's `PD-Z` and
   * Grand County's `PUD` are the two measured instances, and both live in
   * legacy-design-tools' corpus, which pins them in ITS test).
   */
  hasExactRow?: (districtCode: string, jurisdictionKey: string | null) => boolean;
}): {
  declineReason: "pud-ordinance";
  district: string;
  reason: string;
  refusalReason: string;
} | null {
  const district = (input.districtCode ?? "").trim();
  if (!district) return null;
  if (!isPlannedDevelopmentCode(district)) return null;
  const jurisdictionKey = (input.jurisdictionKey ?? "").trim() || null;
  const hasExactRow =
    input.hasExactRow ??
    ((code: string, key: string | null) =>
      hasExactCorpusDistrictRow(key, code));
  if (hasExactRow(district, jurisdictionKey)) return null;
  return {
    declineReason: "pud-ordinance",
    district,
    reason: plannedDevelopmentDisclosure({
      districtCode: district,
      jurisdictionKey,
    }),
    refusalReason: PUD_SETBACK_REFUSAL_REASON,
  };
}
