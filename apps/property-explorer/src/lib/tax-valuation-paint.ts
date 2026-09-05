/**
 * CAD tax-assessed valuation paint gate (OPS-16 A-103 item 5 / A-104).
 *
 * County tax-assessed value (market/land/improvement/assessed, from the CAD
 * roll) co-gates with owner info at the operator's own ruling: Studio and
 * Team only, matching `ownerPaintAllowed`'s exact predicate. Mirrors
 * `owner-paint.ts` structurally — same "second, explicit gate on top of
 * whatever the server already sent" shape, because the server's own
 * `studio-gated` refusal reaches the card as a generic `unresolved`/pending
 * Fact (see `taxValuationFromCadRoll` in fact-sheet-resolver.ts), and this
 * gate is what turns that into the correct "upgrade to see this" copy
 * instead of a stuck loading state.
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

import {
  subscriptionTierGrantsStudio,
  type PeSubscriptionTier,
} from "./entitlementClient";

export const TAX_VALUATION_STUDIO_UPGRADE_CUE =
  "County tax-assessed value is on Studio — upgrade to see the CAD roll figures for this parcel.";

export const TAX_VALUATION_STUDIO_GATED_REASON = "cad-roll-valuation studio-gated";

export function taxValuationPaintAllowed(
  subscriptionTier: PeSubscriptionTier | null,
): boolean {
  return subscriptionTierGrantsStudio(subscriptionTier);
}

export type TaxValuationFactPresentation = {
  state: string;
  value?: string | null;
  reason?: string;
  label?: string;
};

/**
 * Inspect-row second gate, same shape as `gateOwnerPresentation`. Free /
 * Solo / Property-Unlock never receive a real county tax-assessed figure,
 * even when `fact` is present — Property Unlock is a deliberate exclusion
 * here too (A-104: it is NOT Studio, despite carrying X-ray/Flood/
 * Feasibility/CAD-exports per P-119).
 */
export function gateTaxValuationPresentation<
  T extends TaxValuationFactPresentation | null,
>(
  fact: T,
  subscriptionTier: PeSubscriptionTier | null,
): T | { state: "absent-covered"; reason: string; provenance: null } {
  if (!taxValuationPaintAllowed(subscriptionTier)) {
    return {
      state: "absent-covered",
      reason: TAX_VALUATION_STUDIO_UPGRADE_CUE,
      provenance: null,
    };
  }
  return fact;
}
