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

/**
 * P-270 ADDRESS HALF (2026-09-18): THE ONE composer for an address line the
 * customer reads or a geocoder is asked about.
 *
 * Before this, the same "street + city + state" join existed in four places
 * (`fact-sheet-resolver.ts`, `live-envelope-augment.ts`, the MCP's own
 * `situsCompose.ts` in legacy-design-tools, and the probe's model of this one),
 * and NONE of them carried the ZIP — so a parcel whose roll gives a bare street
 * line ("21404 GRAND NATIONAL AVE") showed no city and no ZIP even when the
 * ledger held both (Travis `48453:445501`: `situsZip` `78660`, `cityLimits`
 * `Pflugerville`).
 *
 * The rule, exactly: the city is appended when it is not already a substring of
 * the line, and the state + ZIP are appended as ONE trailing component ("TX
 * 78660") when the line does not already carry them — with the ZIP alone as a
 * space suffix ("…, TX 78660") when the state is already there but the ZIP is
 * not. A roll that already spells out "…, BASTROP, TX 78602" is returned
 * BYTE-IDENTICAL.
 *
 * `situsCityBasis` does NOT change the composed line: the city reads the same
 * either way. It is what tells a renderer whether the city may be called the
 * roll's city at all, and `situsCityLimitsNote` below is the sentence for the
 * case where it may not.
 */
/**
 * WHICH CITY THE LINE'S CITY IS — the vocabulary the P-270 city half stamps and
 * every reader keys off (`"cad-roll"` = the roll's own city; `"city-limits"` =
 * the containing city, licensed only from a declared-absent roll city; `null` =
 * no basis stated, which is never read as the roll's).
 *
 * NAMED rather than inlined for one reason: the licence has a copy in
 * legacy-design-tools (`artifacts/api-server/src/lib/situsCompose.ts`,
 * `SitusCityBasis` there) and a third in the probe, and P-331
 * (`scripts/check-cross-repo-literal-drift.mjs`, merged on BOTH mains
 * 2026-09-19, sha256 b2755e6e) pins shared literals by declaration NAME — an
 * inline union in a property position has no name for a row to read.
 */
export type SitusCityBasis = "cad-roll" | "city-limits" | null;

export interface SitusLineParts {
  situsAddress?: string | null;
  situsCity?: string | null;
  situsState?: string | null;
  situsZip?: string | null;
  situsCityBasis?: SitusCityBasis;
}

/**
 * The city-limits label. A city the ROLL does not state may be named on the
 * line, but never as the roll's mailing city — this is the sentence that says
 * what it is instead. Kept beside the composer so a renderer cannot invent its
 * own wording (dispatch item 2: "say how you labelled it").
 */
export const SITUS_CITY_LIMITS_NOTE =
  "city whose limits contain this parcel (the county roll states no situs city)";

/**
 * THE TWO WORDS THE LICENCE READS — the verdict that makes the roll's silence
 * licensable, and the city-limits answer that may then be named. Bytes on a
 * wire the bake writes and legacy-design-tools re-reads, so they are declared
 * constants (see `SitusCityBasis` above for why the pin needs a NAME) rather
 * than literals sprinkled through the two conditions.
 */
export const DECLARED_ABSENCE_VERDICT = "absent-verified";
export const CITY_LIMITS_INCORPORATED_STATUS = "incorporated";

function partString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Compose the address line from whatever parts the payload carries. Returns
 * null only when there is no street line at all; a line already carrying its
 * own city/state/ZIP comes back untouched.
 *
 * This does NOT decide whether the situs is READABLE — `isUsableSitusAddress` /
 * `isUnusableEnvelopeAddress` above own that, and the callers that must refuse
 * a malformed situs still do so themselves. Composing first and refusing after
 * keeps every existing refusal decision byte-identical (P-272/XD-9).
 */
export function composeSitusLine(parts: SitusLineParts): string | null {
  const address = partString(parts.situsAddress);
  if (!address) return null;
  const upper = address.toUpperCase();
  const segments = upper.split(",").map((s) => s.trim()).filter(Boolean);
  /** A city is a substring match: most rolls spell it inside the street line. */
  const hasCity = (v: string) => upper.includes(v.toUpperCase());
  /** State/ZIP are SEGMENT matches, so "1 TX AVE" is not read as a state "TX". */
  const hasState = (v: string) => segments.some((s) => s === v.toUpperCase() || s.startsWith(`${v.toUpperCase()} `));
  const hasZip = (v: string) => upper.includes(v.toUpperCase());

  const out = [address];
  const city = partString(parts.situsCity);
  if (city && !hasCity(city)) out.push(city);

  const state = partString(parts.situsState);
  const zip = partString(parts.situsZip);

  if (zip && !hasZip(zip)) {
    // The ZIP is joined to its state as ONE component. When the line already
    // carries the state, the ZIP is a SPACE suffix on the line ("…, TX 78660")
    // rather than a new comma part — a bare ", 78660" part reads as a second
    // address line and floats the ZIP free of its state.
    if (state && hasState(state)) return `${out.join(", ")} ${zip}`;
    out.push([state, zip].filter((v): v is string => !!v).join(" "));
  } else if (state && !hasState(state)) {
    out.push(state);
  }

  return out.join(", ");
}

/**
 * The provenance sentence for a city the roll does not state, or null when the
 * payload does not say the city came from city limits (including when it says
 * `"cad-roll"`, and including when it says nothing at all — an unstated basis
 * is never assumed to be the roll's).
 */
export function situsCityLimitsNote(parts: SitusLineParts): string | null {
  return parts.situsCityBasis === "city-limits" && partString(parts.situsCity)
    ? SITUS_CITY_LIMITS_NOTE
    : null;
}
