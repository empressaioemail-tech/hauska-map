/**
 * CAD tax-assessed valuation paint gate (OPS-16 A-103 item 5 / A-104;
 * widened 2026-09-05).
 *
 * County tax-assessed value (market/land/improvement/assessed, from the CAD
 * roll) co-gates with owner info at the operator's own ruling: Studio,
 * Team, OR an active Property Unlock on this specific parcel — matching
 * `ownerPaintAllowed`'s exact (now-widened) predicate. Mirrors
 * `owner-paint.ts` structurally — same "second, explicit gate on top of
 * whatever the server already sent" shape, because the server's own
 * `studio-gated` refusal reaches the card as a generic `unresolved`/pending
 * Fact (see `taxValuationFromCadRoll` in fact-sheet-resolver.ts), and this
 * gate is what turns that into the correct "upgrade to see this" copy
 * instead of a stuck loading state.
 *
 * WIDENED (operator, 2026-09-05): "owner needs to be a part of unlock too.
 * i just kept it out of solo as a way to graduate user through the tiers."
 * Solo's exclusion is the deliberate tier-graduation lever and is
 * UNCHANGED; Property Unlock's exclusion from owner info (and therefore
 * from this co-gate) was not deliberate in the same way and is corrected
 * here, on the SAME predicate this module has always deferred to — never a
 * second Property-Unlock check.
 *
 * A REAL, SOURCED FIGURE FROM THE COUNTY APPRAISAL DISTRICT, NOT AN OPINION
 * OF WORTH. Masters 06's "not a valuation tool" stance refuses anything
 * that reads as an estimate or opinion of what a property is worth; this
 * field is the county's own recorded number and is a different, cleared
 * class of data (operator ruling, A-103 item 5). The upgrade-cue and every
 * label this module produces says "tax-assessed value" — never "valuation"
 * or "worth" on its own — so nobody downstream (support, an affiliate, a
 * customer misreading it) confuses a sourced fact for a market opinion.
 */

import { ownerPaintAllowed } from "./owner-paint";
import type { PeSubscriptionTier } from "./entitlementClient";

export const TAX_VALUATION_STUDIO_UPGRADE_CUE =
  "County tax-assessed value is on Studio — upgrade to see the CAD roll figures for this parcel.";

export const TAX_VALUATION_STUDIO_GATED_REASON = "cad-roll-valuation studio-gated";

/**
 * Deliberately delegates to `ownerPaintAllowed` rather than re-deriving the
 * predicate — this co-gate is defined as "whatever owner info's gate is,"
 * not as an independently-maintained copy of it. `propertyUnlocked` is THIS
 * parcel's own unlock flag.
 */
export function taxValuationPaintAllowed(
  subscriptionTier: PeSubscriptionTier | null,
  propertyUnlocked = false,
): boolean {
  return ownerPaintAllowed(subscriptionTier, propertyUnlocked);
}

export type TaxValuationFactPresentation = {
  state: string;
  value?: string | null;
  reason?: string;
  label?: string;
};

/**
 * Inspect-row second gate, same shape as `gateOwnerPresentation`. Free and
 * Solo never receive a real county tax-assessed figure, even when `fact`
 * is present; Studio, Team, and an active Property Unlock on this parcel
 * all do.
 */
export function gateTaxValuationPresentation<
  T extends TaxValuationFactPresentation | null,
>(
  fact: T,
  subscriptionTier: PeSubscriptionTier | null,
  propertyUnlocked = false,
): T | { state: "absent-covered"; reason: string; provenance: null } {
  if (!taxValuationPaintAllowed(subscriptionTier, propertyUnlocked)) {
    return {
      state: "absent-covered",
      reason: TAX_VALUATION_STUDIO_UPGRADE_CUE,
      provenance: null,
    };
  }
  return fact;
}
