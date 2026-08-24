// apps/property-explorer/src/lib/pricing.ts
//
// R1 PAYWALL — the ONE pricing config module. Every price string, purchase-unit
// blurb, and the free-message allowance the unlock UX shows comes from HERE —
// no scattered literals. Pricing is CONFIG, not code (per the 2026-08-10 locked
// Smart Site ladder): changing a price is an edit to this file only.
//
// Locked ladder (operator 2026-08-10; supersedes the retired Pro $99/$149 frame):
//
//   FREE — $0
//     Map + layer toggles, inspect card (zoning, setbacks, envelope, flood,
//     land use, acreage), save properties, 3 AI chat messages per property, share.
//
//   PER-PROPERTY UNLOCK — $15 for 30 days (not forever)
//     All reports + unlimited AI on that property for 30 days. On-ramp; breakeven
//     vs Solo at ~3.3 properties.
//
//   SOLO — $49/mo
//     X-ray, flood & drainage study, unlimited AI, unlimited properties — the
//     full answer on one parcel at a time.
//
//   STUDIO — $129/mo
//     Solo plus professional deliverables: site-plan CAD (DXF, IFC), terrain
//     export, owner data.
//
//   TEAM — $299/mo for up to 10 seats, then $25 per additional seat
//     Everything in Studio for a firm — shared saved properties, one bill.

export const PE_PRICING = {
  /** The one pricing popup's header (2026-08-24 operator ruling: ALL pricing
   *  info lives in ONE popup; the dock shows value lines only). */
  header: {
    title: "Pricing",
    framing:
      "One ladder, no hidden tiers — start free, unlock one property, or subscribe.",
  },
  /** The free row — what every account gets at $0. */
  free: {
    title: "Free",
    priceLabel: "$0",
    blurb:
      "Browse the map, inspect card, saved properties, and share links — free for every account.",
  },
  /** Per-property unlock — the low-commitment on-ramp (30-day freshness window). */
  property: {
    priceLabel: "$15",
    durationDays: 30,
    title: "Unlock this property",
    blurb: "All reports + unlimited AI on this property for 30 days",
    /** Honest disabled copy when no parcel is active. */
    needsPropertyNote: "Inspect a property first to unlock it.",
    /** Shown on the unlock card when the triggering feature is Studio-only. */
    studioOnlyNote:
      "This feature is not part of the single-property unlock — it needs Studio or Team.",
  },
  /** Solo subscription — primary self-serve upsell in the two-choice unlock flow. */
  solo: {
    priceLabel: "$49/mo",
    title: "Solo",
    blurb: "X-ray, flood study, unlimited AI — the full answer on one parcel at a time",
    features: "X-ray, flood & drainage study, unlimited AI, unlimited properties",
  },
  /** Studio subscription — professional deliverables tier (terrain, CAD, owner data). */
  studio: {
    priceLabel: "$129/mo",
    title: "Studio",
    blurb: "Solo plus site-plan CAD, terrain export, and owner data",
    features: "Everything in Solo + site-plan CAD (DXF, IFC), terrain export, owner data",
  },
  /** Team subscription — firm tier (self-serve; seat expansion priced per seat). */
  team: {
    priceLabel: "$299/mo",
    seatNote: "up to 10 seats, then $25 per seat",
    title: "Team",
    blurb: "Everything in Studio — shared saved properties, seats, one bill",
    features: "Everything in Studio for the whole firm — shared saved properties, one bill",
  },
  /** The many-unlocks→Solo nudge shown under the two choices. */
  soloNudge:
    "Unlocking more than a few properties? Solo covers unlimited properties — one subscription instead of many 30-day unlocks.",
  /** Free AI chat allowance per free account per property (server-counted;
   *  the server value wins when the entitlement response carries one). */
  freeMessages: {
    limit: 3,
  },
} as const;

/** @deprecated Retired Pro framing — maps to Solo for any stale imports. */
export const pro = PE_PRICING.solo;

/** @deprecated Retired Pro nudge — maps to Solo nudge. */
export const proNudge = PE_PRICING.soloNudge;

/** "Unlock this property — $15" */
export function propertyChoiceLabel(): string {
  return `${PE_PRICING.property.title} — ${PE_PRICING.property.priceLabel}`;
}

/** "Solo — $49/mo" */
export function soloChoiceLabel(): string {
  return `${PE_PRICING.solo.title} — ${PE_PRICING.solo.priceLabel}`;
}

/** "Studio — $129/mo" */
export function studioChoiceLabel(): string {
  return `${PE_PRICING.studio.title} — ${PE_PRICING.studio.priceLabel}`;
}

/** "Team — $299/mo" */
export function teamChoiceLabel(): string {
  return `${PE_PRICING.team.title} — ${PE_PRICING.team.priceLabel}`;
}

/** @deprecated Use soloChoiceLabel — retired Pro $99/$149 framing. */
export function proChoiceLabel(): string {
  return soloChoiceLabel();
}
