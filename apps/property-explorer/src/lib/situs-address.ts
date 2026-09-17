/**
 * The ONE definition of what counts as a readable situs address, and of the
 * card's wording for one that is not (P-270/P-272).
 *
 * Before this module the same rule existed in four places and they had already
 * drifted:
 *
 *   - `fact-sheet-resolver.ts`      `isUsableSitusAddress`  (general rule)
 *   - `live-envelope-augment.ts`    `isUsableSitusAddress`  (byte-identical copy)
 *   - `api/_lib/atom-chain-to-facets.ts` `isUsableSitusAddress` (identical copy)
 *   - `buildable-envelope.js`       `isTravisUnusableSitus` (NARROWER — it knew
 *                                   only the `, TX` sentinel and the truncated
 *                                   ZIP tail, and did not know `", ,"` at all)
 *
 * The drift was load-bearing. `envelopeRequestBody` uses the narrow predicate to
 * decide whether to drop an address and send a click point instead, so a parcel
 * whose situs reads `", ,"` posted `{address: ", ,", lat, lng}`: cortex sits-matched
 * on the punctuation, missed, and never used the point it was handed. The map
 * drew nothing even though zoning and setbacks had resolved (XD-9 / P-272).
 *
 * The three TS copies are byte-identical, so `isUsableSitusAddress` is defined
 * here once and every one of them now imports it. `isUnusableEnvelopeAddress` is
 * the WIDER rule the request body needs: it keeps the truncated-ZIP tail (a
 * well-formed street line the geocoder cannot match, which `isUsableSitusAddress`
 * deliberately passes) and adds every case `isUsableSitusAddress` rejects.
 */

/** Travis-style sentinels (`, TX`) are not navigation or geocode anchors. */
export function isUsableSitusAddress(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const street = (trimmed.split(",")[0] ?? "").trim();
  if (!street || !/^\d/.test(street)) return false;
  if (/^,\s*(TX)?\s*$/i.test(trimmed)) return false;
  return true;
}

/**
 * The county roll CARRYING a situs that cannot be read — distinct from carrying
 * none at all. `", ,"` is the observed shape (XD-9); a leading-punctuation or
 * non-street string is the general case.
 */
export function isUnreadableSitusAddress(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  if (!raw.trim()) return false;
  return !isUsableSitusAddress(raw);
}

/**
 * An address that must NOT ride along with a click point on the outbound
 * envelope POST. Two classes, and the difference matters:
 *
 *   - `isUsableSitusAddress` rejects it outright (`", ,"`, `", TX"`, ""), so a
 *     geocoder can only miss and the body is better off as the point alone.
 *   - It is a Travis truncated-ZIP tail (`"… DR, TX 7866"`): readable as a street
 *     line but not matchable as an address. `isUsableSitusAddress` passes it, so
 *     it has to be named separately or the pre-P-272 behaviour regresses.
 *
 * A search with NO click point never reaches this: `envelopeRequestBody` only
 * drops an address when it also holds coordinates, so a free-typed string is
 * still posted and cortex still returns an honest miss.
 */
export function isUnusableEnvelopeAddress(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (!isUsableSitusAddress(trimmed)) return true;
  if (/,\s*TX\s+\d{1,4}\s*$/i.test(trimmed) && trimmed.split(",").length < 3) return true;
  return false;
}

/**
 * P-272: what the card says when the roll holds a situs it cannot read. The
 * card must not print the punctuation and must not claim the roll has no situs
 * (the previous wording, `"no situs address on the county roll for this
 * parcel"`, was false about the data). Wording lives here so the card model and
 * the resolver cannot drift.
 */
export const SITUS_UNREADABLE_STATEMENT = "Address unreadable";

/** The full card reason. Sentence form of the statement above. */
export const SITUS_UNREADABLE_REASON =
  "Address unreadable — the situs on the county roll for this parcel is not a usable street address.";

/** The wording kept for a roll that genuinely carries no situs (unchanged). */
export const SITUS_ABSENT_REASON = "no situs address on the county roll for this parcel";
