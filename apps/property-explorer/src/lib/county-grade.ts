/**
 * P-291 (operator ruling A-184) — a county the program has not graded must say
 * so, on the surface, in one wording read from one place.
 *
 * Nineteen Texas counties hold Tier-1 bake rows (5.14M). Six are the counties
 * OPS-24 grades; the other thirteen are served but ungraded, and Bell (48027) is
 * one of them — it serves real facts on the live surface today. A-184 keeps
 * serving them, each carrying a visible "not yet verified" statement. This lane
 * does NOT move Bell off the bake and does NOT change what is served; it changes
 * only what the card SAYS about the county it is standing on.
 *
 * WHY THE SET LIVES HERE. The graded six are the counties whose rails LDT's
 * code-owned `PARCEL_RECORD_SLATE` (`artifacts/api-server/src/lib/
 * parcelRecordAllowlist.ts`) authorizes for a parcel_record cutover — 48021,
 * 48055, 48209, 48309, 48453, 48491. That slate is per (county, rail), in
 * another repo, and nothing on the wire tells this app the county's grade, so
 * this module is the one place in `hauska-map` that holds it. The clean fix is
 * for the PE facet payload to carry the grade and for this file to stop naming
 * counties at all; that is a wire-field change outside this lane and is recorded
 * as an OPEN in the close. Until then this is a POINTER AT AN AUTHORITY, not a
 * second opinion: do not edit it without editing the slate, and never derive a
 * grade from anything else here.
 */

/**
 * The graded six, by county FIPS. Authority: OPS-16 plan of record (the six
 * counties of the OPS-24 program) and LDT `PARCEL_RECORD_SLATE`.
 */
export const GRADED_COUNTY_FIPS: ReadonlySet<string> = new Set<string>([
  "48021", // Bastrop
  "48055", // Caldwell
  "48209", // Hays
  "48309", // McLennan
  "48453", // Travis
  "48491", // Williamson
]);

/**
 * The ONE wording (P-291: "worded once and read from one place"). Sentence form,
 * because it is appended to the county row the customer already reads.
 *
 * It says what is true — the county's parcels come from an earlier bake and the
 * program has not graded them — and promises nothing about when it will.
 */
export const COUNTY_NOT_VERIFIED_STATEMENT =
  "Not yet verified — this county is served from an earlier data bake, not from the graded program.";

/** True when the program grades this county. Unknown FIPS is NOT graded. */
export function isGradedCounty(countyFips: string | null | undefined): boolean {
  const fips = typeof countyFips === "string" ? countyFips.trim() : "";
  if (!fips) return false;
  return GRADED_COUNTY_FIPS.has(fips);
}

/**
 * The statement to append to the county row, or null for a graded county (a
 * graded county carries nothing new — byte-identical to what shipped before).
 */
export function countyNotVerifiedStatement(
  countyFips: string | null | undefined,
): string | null {
  return isGradedCounty(countyFips) ? null : COUNTY_NOT_VERIFIED_STATEMENT;
}

/** Compose the county row: the county as it always read, plus the statement. */
export function countyRowText(
  countyName: string | null | undefined,
  countyFips: string | null | undefined,
): string | null {
  const name = typeof countyName === "string" ? countyName.trim() : "";
  const fips = typeof countyFips === "string" ? countyFips.trim() : "";
  const base = name ? (fips ? `${name} County (${fips})` : `${name} County`) : fips || null;
  if (!base) return null;
  const statement = countyNotVerifiedStatement(fips || null);
  return statement ? `${base}. ${statement}` : base;
}
