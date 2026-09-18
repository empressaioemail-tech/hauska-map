/**
 * P-339 (OPS-24, ruling 15) — the panel envelope sentence for the
 * warm-verify-decline + codified-table branch, and the only place it is
 * composed.
 *
 * WHY IT EXISTS. Measured live 2026-09-18, `atom-chain-to-facets.ts` composed
 *
 *   "Codified setback table (unknown); depth-warm geometry withheld — …"
 *
 * on parcels whose own payload serves a ruled 4/4-axis table AND whose
 * `place/buildable-envelope` route returns a polygon for the same parcel in the
 * same pass (48453:367134 7 vertices, 48453:239852 38, 48453:445501 5,
 * 48021:51735 6). That one sentence produced BOTH of the probe's contradiction
 * classes on four parcels, because it denied two things the same response was
 * serving.
 *
 * THE RULE (ruling 15). The drawing route owns the envelope's reason; this
 * payload mirrors it. So the sentence
 *   (a) names the source that ACTUALLY supplied the served axes —
 *       "Codified setback table (unknown)" was false as well as forbidden when
 *       no jurisdiction stamp was on the payload and the axes came from the
 *       chain's own rule;
 *   (b) never claims the geometry is withheld, because the route draws it — it
 *       says the outline is drawn for reference, which is the form
 *       `saysOutlineDrawn` sanctions in `scripts/surface-probe.mjs` and the
 *       same form the P-249 control parcels (48309:103015, 48209:97658)
 *       already use; and
 *   (c) never says the rules are unruled, because the same payload rules three
 *       or four axes.
 *
 * THIS IS THE ONLY COMPOSITION SITE for this branch, the same shape
 * `setback-decline-wording.ts` already uses for the pending-setback declines:
 * the sentence is a function of the parcel's own fields, never a template
 * default. Its test pins the rendered strings against the probe's own phrase
 * lists, so a second hand-typed sentence cannot appear without failing a suite.
 */

/**
 * `jurisdictionKey` is the parcel's OWN, straight off the payload.
 * `servedFromAtomChainRule` says which rail actually supplied the served axes —
 * the atom chain's own rule, or the vendored codified table. Never inferred
 * from whether a jurisdiction key exists.
 * `warmVerifyDeclineReason` is the atom's own decline code/message; carried
 * verbatim, never re-worded.
 */
export function codifiedTableEnvelopeDisclosure(input: {
  jurisdictionKey: string | null;
  servedFromAtomChainRule: boolean;
  warmVerifyDeclineReason: string | null;
}): string {
  const servedSource = input.servedFromAtomChainRule
    ? "the property atom chain's own setback rule"
    : `the codified setback table (${
        input.jurisdictionKey ?? "no jurisdiction stamp on this payload"
      })`;
  return (
    `Setbacks read from ${servedSource}; the outline is drawn for reference by the ` +
    `drawing route, which owns this envelope's reason` +
    (input.warmVerifyDeclineReason ? ` — ${input.warmVerifyDeclineReason}` : ".")
  );
}
