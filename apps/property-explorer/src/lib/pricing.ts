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
//   SOLO — $49/mo · $490/yr
//     X-ray, flood & drainage study, unlimited AI, unlimited properties — the
//     full answer on one parcel at a time.
//
//   STUDIO — $129/mo · $1,290/yr
//     Solo plus professional deliverables: site-plan CAD (DXF, IFC), terrain
//     export, owner data.
//
//   TEAM — $299/mo · $2,990/yr for up to 10 seats, then $25 per additional
//     seat (extra seats monthly-only; annual Team is capped at 10).
//     Everything in Studio for a firm — shared saved properties, one bill.

export type PricingInterval = "annual" | "monthly";

export type PePricedTier = "solo" | "studio" | "team";

export type MatrixCellKind =
  | "included"
  | "notIncluded"
  | "oneSeat"
  | "teamSeats"
  | "comingSoon";

export const PE_PRICING = {
  /** The one pricing popup's header (2026-08-24 operator ruling: ALL pricing
   *  info lives in ONE popup; the dock shows value lines only). */
  header: {
    title: "Pricing",
    eyebrow: "Smart Site",
    /** Retired 3a copy cut — kept so stale imports do not invent a new line. */
    framing: "",
    stayFree: "",
  },
  /** Annual is the default presentation (locked GTM); monthly is one click. */
  interval: {
    default: "annual" as const,
    annualLabel: "Annual",
    monthlyLabel: "Monthly",
    savingsNote: "2 months free",
  },
  /** The free row — what every account gets at $0. Caption strip, not a column. */
  free: {
    title: "Free",
    priceLabel: "$0",
    blurb: "Free covers the map, layers and inspect card.",
  },
  /** Per-property unlock — the low-commitment on-ramp (30-day freshness window). */
  property: {
    priceLabel: "$15",
    durationDays: 30,
    title: "Unlock this property",
    blurb: "every report on this parcel.",
    footerLead: "Just this one property?",
    /** Honest disabled copy when no parcel is active. */
    needsPropertyNote: "Inspect a property first to unlock it.",
    /** Shown on the unlock card when the triggering feature is Studio-only. */
    studioOnlyNote:
      "This feature is not part of the single-property unlock — it needs Studio or Team.",
    busyLabel: "Unlocking…",
  },
  /** Solo subscription — primary self-serve upsell in the two-choice unlock flow. */
  solo: {
    priceLabel: "$49/mo",
    monthlyAmount: "$49",
    monthlySuffix: "/mo",
    annualPriceLabel: "$490",
    annualSuffix: "/yr",
    annualCompare: "$49/mo",
    monthlyCompare: "$490/yr billed annually",
    title: "Solo",
    ctaLabel: "Start Solo",
    blurb: "X-ray, flood study, unlimited AI — the full answer on one parcel at a time",
    features: "X-ray, flood & drainage study, unlimited AI, unlimited properties",
  },
  /** Studio subscription — professional deliverables tier (terrain, CAD, owner data). */
  studio: {
    priceLabel: "$129/mo",
    monthlyAmount: "$129",
    monthlySuffix: "/mo",
    annualPriceLabel: "$1,290",
    annualSuffix: "/yr",
    annualCompare: "$129/mo",
    monthlyCompare: "$1,290/yr billed annually",
    title: "Studio",
    ctaLabel: "Start Studio",
    badge: "Deliverables",
    blurb: "Solo plus site-plan CAD, terrain export, and owner data",
    features: "Everything in Solo + site-plan CAD (DXF, IFC), terrain export, owner data",
  },
  /** Team subscription — firm tier (self-serve; seat expansion priced per seat). */
  team: {
    priceLabel: "$299/mo",
    monthlyAmount: "$299",
    monthlySuffix: "/mo",
    annualPriceLabel: "$2,990",
    annualSuffix: "/yr",
    annualCompare: "$299/mo · 10 seats",
    monthlyCompare: "10 seats · $2,990/yr billed annually",
    extraSeatPriceLabel: "$25",
    extraSeatPeriod: "/mo",
    baseSeats: 10,
    seatNote: "up to 10 seats, then $25 per seat",
    annualSeatCell: "10, then $25 each",
    monthlySeatCell: "10, then $25 each",
    annualCapNote: "Annual Team carries 10 seats. Extra seats are monthly.",
    title: "Team",
    ctaLabel: "Start Team",
    blurb: "Everything in Studio — shared saved properties, seats, one bill",
    features: "Everything in Studio for the whole firm — shared saved properties, one bill",
  },
  cells: {
    included: "✓",
    notIncluded: "—",
    oneSeat: "1",
    comingSoon: "Coming soon",
  },
  checkoutBusyLabel: "Starting checkout…",
  /** Grouped comparison rows (A2). Cell kinds resolve through matrixCellText. */
  groups: {
    answer: {
      title: "Answer this parcel",
      rows: [
        {
          label: "Flood & drainage study",
          solo: "included",
          studio: "included",
          team: "included",
        },
        {
          label: "X-ray",
          solo: "included",
          studio: "included",
          team: "included",
        },
        {
          label: "Unlimited AI and properties",
          solo: "included",
          studio: "included",
          team: "included",
        },
      ],
    },
    handoff: {
      title: "Hand it to someone else",
      rows: [
        {
          label: "Site plan CAD · DXF, IFC",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
        {
          label: "Terrain export · GLB, IFC4, DXF",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
        {
          label: "Owner data",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
      ],
    },
    firm: {
      title: "Work as a firm",
      rows: [
        {
          label: "Seats and shared properties",
          solo: "oneSeat",
          studio: "oneSeat",
          team: "teamSeats",
        },
      ],
    },
  } satisfies Record<
    string,
    {
      title: string;
      rows: Array<{
        label: string;
        solo: MatrixCellKind;
        studio: MatrixCellKind;
        team: MatrixCellKind;
      }>;
    }
  >,
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

export function defaultPricingInterval(): PricingInterval {
  return PE_PRICING.interval.default;
}

export function teamSeatsControlVisible(interval: PricingInterval): boolean {
  return interval === "monthly";
}

/** Cortex checkout enum. UI says annual/monthly; the wire says year/month. */
export type PeCheckoutInterval = "month" | "year";

export function toCheckoutInterval(
  interval: PricingInterval,
): PeCheckoutInterval {
  return interval === "annual" ? "year" : "month";
}

export function fromCheckoutInterval(
  interval: PeCheckoutInterval,
): PricingInterval {
  return interval === "year" ? "annual" : "monthly";
}

/** Annual Team is capped at base seats. Extra seats are monthly-only. */
export function teamSeatsOnWire(
  interval: PricingInterval,
  seats: number,
): number {
  if (interval === "annual") {
    return Math.min(seats, PE_PRICING.team.baseSeats);
  }
  return seats;
}

export function propertyUnlockOffer(): string {
  return `${PE_PRICING.property.priceLabel} for ${PE_PRICING.property.durationDays} days`;
}

export function tierHeadline(
  tier: PePricedTier,
  interval: PricingInterval,
): { amount: string; suffix: string; compare: string } {
  const t = PE_PRICING[tier];
  if (interval === "annual") {
    return {
      amount: t.annualPriceLabel,
      suffix: t.annualSuffix,
      compare: t.annualCompare,
    };
  }
  return {
    amount: t.monthlyAmount,
    suffix: t.monthlySuffix,
    compare: t.monthlyCompare,
  };
}

export function matrixCellText(
  kind: MatrixCellKind,
  interval: PricingInterval,
): string {
  switch (kind) {
    case "included":
      return PE_PRICING.cells.included;
    case "notIncluded":
      return PE_PRICING.cells.notIncluded;
    case "oneSeat":
      return PE_PRICING.cells.oneSeat;
    case "teamSeats":
      return interval === "annual"
        ? PE_PRICING.team.annualSeatCell
        : PE_PRICING.team.monthlySeatCell;
    case "comingSoon":
      return PE_PRICING.cells.comingSoon;
  }
}
