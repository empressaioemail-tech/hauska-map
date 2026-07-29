// apps/property-explorer/src/lib/pricing.ts
//
// R1 PAYWALL — the ONE pricing config module. Every price string, purchase-unit
// blurb, and the free-message allowance the unlock UX shows comes from HERE —
// no scattered literals. Pricing is CONFIG, not code (per the 2026-07-29 PE
// paywall model + pricing decision): changing a price is an edit to this file
// only.
//
// The two purchase units:
//   1. PER-PROPERTY — $15, persists forever. All reports + unlimited AI chat
//      on that property. Does NOT include terrain (terrain is Pro-only).
//   2. PRO — advertised $149/mo, launch sale $99/mo. Unlimited everything,
//      all properties.

export const PE_PRICING = {
  /** Per-property unlock — the low-commitment on-ramp. */
  property: {
    priceLabel: "$15",
    title: "Unlock this property",
    blurb: "All reports + AI on this property, forever",
  },
  /** Pro subscription — anchor high ($149), convert at the sale price ($99). */
  pro: {
    salePriceLabel: "$99/mo",
    regularPriceLabel: "$149/mo",
    title: "Go Pro",
    blurb: "Unlimited everything, all properties",
  },
  /** The many-buys→Pro nudge shown under the two choices. */
  proNudge:
    "Unlocking more than a few properties? One Pro month covers what many single-property unlocks would — on every property you touch.",
  /** Free AI chat allowance per free account per property (server-counted;
   *  the server value wins when the entitlement response carries one). */
  freeMessages: {
    limit: 3,
  },
} as const;

/** "Unlock this property — $15" */
export function propertyChoiceLabel(): string {
  return `${PE_PRICING.property.title} — ${PE_PRICING.property.priceLabel}`;
}

/** "Go Pro — $99/mo (reg. $149/mo)" */
export function proChoiceLabel(): string {
  return `${PE_PRICING.pro.title} — ${PE_PRICING.pro.salePriceLabel} (reg. ${PE_PRICING.pro.regularPriceLabel})`;
}
