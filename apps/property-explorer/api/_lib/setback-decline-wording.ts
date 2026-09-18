/**
 * P-257 — a decline says what is true of THIS parcel.
 *
 * THE DEFECT. One sentence —
 *
 *   "Setbacks pending re-warm from city per-parcel record — verify with city.
 *    Repealed or pre-layer-23 sources are not served."
 *
 * — was composed at two sites in `atom-chain-to-facets.ts` and served on every
 * pending-setback decline, in every jurisdiction. "Layer 23" is Bastrop city's
 * Parcels_One_Click FeatureSet/23. On a Hays, Caldwell, McLennan, Travis or
 * Williamson parcel that sentence is not degraded, it is FALSE: it tells a
 * reader we are waiting on a re-warm from a source that has nothing to do with
 * their parcel, and it names a pre-layer-23 vintage the parcel was never
 * measured against.
 *
 * THE RULE. The sentence is composed from the parcel's own jurisdiction and
 * the parcel's own district. It names a per-parcel city record ONLY where such
 * a record is genuinely the parcel's own source.
 *
 * THE BRANCH IS NOT A CITY LIST. It reuses the fact this repo already keeps
 * for exactly this question — `PER_PARCEL_RECORD_ONLY_SETBACK_KEYS` in
 * `codified-setback-from-zoning.ts`, exported as
 * `jurisdictionRequiresPerParcelSetbackRecord()` — which is the same set the
 * per-parcel fetch itself is gated on. A jurisdiction whose standards come
 * from a city per-parcel record gets that sentence; every other jurisdiction
 * gets a sentence naming its own city and its own district with no per-parcel
 * claim at all. Adding a city needs no edit here.
 *
 * `layer 23` travels with the Bastrop keys only, because that is the only
 * mapping under which the name is true.
 *
 * THIS IS THE ONLY COMPOSITION SITE. Both `setback-rule-pending` declines in
 * `atom-chain-to-facets.ts` call {@link setbackPendingDisclosure}, and the
 * module's test pins the rendered strings so a second, hand-typed sentence
 * cannot appear without failing a suite.
 */

import { jurisdictionRequiresPerParcelSetbackRecord } from "./codified-setback-from-zoning.js";

/**
 * The per-parcel record's own name where the jurisdiction has one. Keyed by the
 * same jurisdiction keys `jurisdictionRequiresPerParcelSetbackRecord` answers
 * true for; a key absent here renders without a record name rather than
 * inventing one, and the test asserts every true key is either named or
 * deliberately unnamed.
 */
const PER_PARCEL_RECORD_NAMES: Readonly<Record<string, string>> = {
  "bastrop-city-tx": "layer 23",
  "bastrop-tx": "layer 23",
  "bastrop-development-code": "layer 23",
  "bastrop-per-parcel-record": "layer 23",
};

/** "woodcreek-tx" -> "Woodcreek". Display only; never used to key a lookup. */
function placeName(jurisdictionKey: string | null | undefined): string | null {
  const key = (jurisdictionKey ?? "").trim().toLowerCase();
  if (!key) return null;
  const stem = key.replace(/-tx$/, "");
  const words = stem.split(/[-_\s]+/).filter(Boolean);
  if (!words.length) return null;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The one sentence a pending-setback decline is allowed to say.
 *
 * `jurisdictionKey` and `district` are the parcel's OWN, straight off the
 * payload — never a caller's guess, never a template default.
 */
export function setbackPendingDisclosure(input: {
  jurisdictionKey?: string | null;
  district?: string | null;
}): string {
  const key = (input.jurisdictionKey ?? "").trim().toLowerCase() || null;
  const district = (input.district ?? "").trim() || null;
  const place = placeName(key);

  if (key && jurisdictionRequiresPerParcelSetbackRecord(key)) {
    const recordName = PER_PARCEL_RECORD_NAMES[key];
    const who = place ?? "the city";
    return (
      `Setbacks pending re-warm from ${who}'s own per-parcel record` +
      (recordName ? ` (${recordName})` : "") +
      " — verify with the city. " +
      "Repealed or superseded sources are not served."
    );
  }

  // No per-parcel record to wait on: say what is actually true, which is that
  // nothing on record covers this district. This is the same claim
  // legacy-design-tools' draw route makes for the same case ("No authoritative
  // setback source covers this district"), so the two surfaces agree by
  // construction rather than by coincidence.
  return (
    "Setbacks pending — no setback source on record covers " +
    (district ? `district ${district}` : "this parcel's district") +
    (place ? ` in ${place}` : "") +
    " — verify with the city. Nothing has been inferred."
  );
}
