import {
  PE_PRICING,
  tierHeadline,
  type PeCheckoutInterval,
  type PePricedTier,
} from "../lib/pricing";
import { readCheckoutOrigin } from "../lib/checkoutOrigin";

export function includedLinesForTier(tier: PePricedTier): string[] {
  const lines: string[] = [];
  for (const group of Object.values(PE_PRICING.groups)) {
    for (const row of group.rows) {
      if (row[tier] === "included") lines.push(row.label);
    }
  }
  return lines;
}

export function subscriptionSubmitLabel(hasReportOrigin: boolean): string {
  return hasReportOrigin ? "Subscribe and run my report" : "Subscribe";
}

export function checkoutHasReportOrigin(): boolean {
  return readCheckoutOrigin() != null;
}

export function tierCheckoutHeadline(
  tier: PePricedTier,
  interval: PeCheckoutInterval,
): { amount: string; suffix: string; compare: string; periodWord: string } {
  const ui = interval === "year" ? "annual" : "monthly";
  const headline = tierHeadline(tier, ui);
  return {
    ...headline,
    periodWord: interval === "year" ? "/year" : "/mo",
  };
}

export const UNLOCK_PRICE = "$15.00";
export const UNLOCK_SUBMIT = "Pay $15.00";
