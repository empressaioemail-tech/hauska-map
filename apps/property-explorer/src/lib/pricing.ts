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
//     Solo plus WORKING A LIST: screens and boards, owner data, and the
//     records package; plus the professional deliverables you hand off,
//     site-plan CAD (DXF, IFC) and terrain export.
//
//   TEAM — $299/mo · $2,990/yr for up to 3 seats, then $25 per additional
//     seat (extra seats monthly-only; annual Team is capped at 3).
//     Everything in Studio for a firm — shared saved properties, one bill.

// AMENDED 2026-08-31 (operator, P-101): "Solo answers one parcel. Studio works
// a list of them." Prices are UNTOUCHED — every number above still stands. What
// changed is which rung a capability sits on and how the comparison surface
// groups them:
//
//   - screens and boards move from ungated to Studio and Team (enforced on the
//     api-server screens routes, not here; this file is the price list);
//   - the records package, already Studio inside the `dossier` export kind,
//     gets its own named row so the buyer can see what they are paying for;
//   - the groups become four: answer / list / handoff / firm, and owner data
//     moves out of "hand it off" into "work a list", because the investor and
//     agent segment that wants owner data was reading a group header that told
//     them the tier was not for them;
//   - Studio's badge stops being "The packet".
//
// STRUCTURE IS NOT CONFIG. `groups` is now iterated by PricingModal, so a new
// group here renders. That was NOT true before P-101: the modal hand-wrote its
// three groups and an edit to this file alone would have shipped a fourth group
// that rendered nowhere while every existing test still passed.

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
    title: "Plans",
    eyebrow: "Smart Site",
    /** Retired 3a copy cut — kept so stale imports do not invent a new line. */
    framing: "",
    stayFree: "",
  },
  /** Monthly is the default selected state (operator 2026-08-27). Annual stays. */
  interval: {
    /** 9-4 UI review: the toggle defaulted to Monthly while the intended
     *  presentation is Annual (the better deal, and the one the marked-up
     *  monthly price is framed against). */
    default: "annual" as const,
    annualLabel: "Annual",
    monthlyLabel: "Monthly",
    /** Retired header chip. Annual math lives per-tier now: see
     *  annualMonthsFreeLabel, which replaced this column's old
     *  "10 × monthly" note with the same fact in plain words. */
    savingsNote: "",
  },
  /** The free row — what every account gets at $0. Caption strip, not a column. */
  free: {
    title: "Free",
    priceLabel: "$0",
    blurb:
      "Map, layers, inspect card, saved properties, share links, and three AI questions per parcel.",
  },
  /** Per-property unlock — the low-commitment on-ramp (30-day freshness window). */
  property: {
    priceLabel: "$15",
    durationDays: 30,
    title: "Unlock this property, 30 days",
    /** Disabled-state button label: what the button says instead of
     *  greying out its normal title over something it will not do (9-4 UI
     *  review: "the disabled button with no explanation is the most
     *  confusing element on the screen"). */
    needsPropertyTitle: "Inspect a parcel first",
    blurb: "covers every report on it for 30 days.",
    footerLead: "Just this one property?",
    /** Honest disabled copy when no parcel is active. */
    needsPropertyNote: "Inspect a parcel on the map first, then unlock it here.",
    /** Shown on the unlock card when the triggering feature is Studio-only. */
    studioOnlyNote:
      "This feature is not part of the single-property unlock. It needs Studio or Team.",
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
    blurb: "X-ray, flood study, unlimited AI: the full answer on one parcel at a time",
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
    /** P-101: was "The packet", which told the largest segment the tier was
     *  for someone else while it held the one thing they would pay for. */
    badge: "Work a list",
    blurb: "Work a list of parcels: screens, owner data, records, and the sheets you hand off",
    features: "Screens and boards, owner data, records request, site-plan CAD (DXF, IFC), terrain export",
  },
  /** Team subscription — firm tier (self-serve; seat expansion priced per seat). */
  team: {
    priceLabel: "$299/mo",
    monthlyAmount: "$299",
    monthlySuffix: "/mo",
    annualPriceLabel: "$2,990",
    annualSuffix: "/yr",
    annualCompare: "$299/mo · 3 seats",
    monthlyCompare: "3 seats · $2,990/yr billed annually",
    extraSeatPriceLabel: "$25",
    extraSeatPeriod: "/mo",
    baseSeats: 3,
    seatNote: "up to 3 seats, then $25 per seat",
    annualSeatCell: "3, then $25 each",
    monthlySeatCell: "3, then $25 each",
    annualCapNote: "Annual Team carries 3 seats. Extra seats are monthly.",
    title: "Team",
    ctaLabel: "Start Team",
    blurb: "Everything in Studio: shared saved properties, seats, one bill",
    features: "Everything in Studio for the whole firm: shared saved properties, one bill",
  },
  cells: {
    // 9-4 UI review: "every included row renders two check glyphs instead of
    // one." CellGlyph already draws a check icon for "included"; this text
    // used to repeat it as a literal "✓" character next to its own icon.
    // Every other kind pairs its icon with text that says something the icon
    // doesn't (a count, a duration, "Coming soon") — included has nothing
    // left to add once the icon is there.
    included: "",
    notIncluded: "—",
    oneSeat: "1",
    comingSoon: "Coming soon",
  },
  checkoutBusyLabel: "Starting checkout…",
  /**
   * Grouped comparison rows (A2, regrouped by P-101). Cell kinds resolve
   * through matrixCellText. PricingModal ITERATES this object, so key order is
   * render order and a new key renders; the test in pricing-modal.test.tsx
   * walks Object.keys and fails if one stops rendering.
   */
  groups: {
    answer: {
      title: "Answer this parcel",
      subline: "Everything about the one property you are deciding on.",
      rows: [
        {
          label: "Flood and drainage study",
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
          label: "Unlimited questions, unlimited properties",
          solo: "included",
          studio: "included",
          team: "included",
        },
      ],
    },
    /**
     * P-101, the rung the amendment exists to make legible. Screens are
     * enforced on the api-server screens routes (POST create / POST rows);
     * the two GET routes stay open so a free connector user still mounts the
     * Smart Site panel and meets this prompt in context.
     *
     * The workbench catalog calls this row's feature "Records request"
     * (reports-catalog.ts, id REC); the price-list row itself was de-jargoned
     * to name what it actually gets you (9-4 UI review). Neither name is
     * "dossier": the MCP means a Studio export kind by that word and the
     * workbench means the X-ray report engine, which is not Studio-gated. A
     * price list must not inherit that ambiguity.
     */
    list: {
      title: "Work a list of them",
      subline:
        "Twelve addresses from a buyer, thirty from a broker, a corridor you are farming.",
      rows: [
        {
          label: "Work a list of parcels on one board",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
        {
          label: "Owner of record and mailing address",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
        {
          label: "Records package, the county documents behind the answer",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
      ],
    },
    handoff: {
      title: "Hand it off",
      subline: "Give a client, a partner or a designer a file they can open.",
      rows: [
        {
          label: "Site plan file your designer can open (DXF, IFC)",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
        {
          label: "Terrain model of the site (GLB, IFC4, DXF)",
          solo: "notIncluded",
          studio: "included",
          team: "included",
        },
      ],
    },
    firm: {
      title: "Work as a firm",
      subline: "More than one person working the same properties.",
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
      subline: string;
      rows: Array<{
        label: string;
        solo: MatrixCellKind;
        studio: MatrixCellKind;
        team: MatrixCellKind;
      }>;
    }
  >,
  /** First unlock this week stays quiet. Second unlock states the fact. */
  soloNudge:
    "Unlocking more than a few properties? Solo covers unlimited properties: one subscription instead of many 30-day unlocks.",
  soloSecondUnlockFact:
    "This is your second property this week. Solo is unlimited at $49.",
  walletHonestDecline:
    "Cash App Pay and wallets open as a QR in this box. If they do not appear, they are not available for this charge. Use a card.",
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
  return `${PE_PRICING.property.title}: ${PE_PRICING.property.priceLabel}`;
}

/** "Solo — $49/mo" */
export function soloChoiceLabel(): string {
  return `${PE_PRICING.solo.title}: ${PE_PRICING.solo.priceLabel}`;
}

/** "Studio — $129/mo" */
export function studioChoiceLabel(): string {
  return `${PE_PRICING.studio.title}: ${PE_PRICING.studio.priceLabel}`;
}

/** "Team — $299/mo" */
export function teamChoiceLabel(): string {
  return `${PE_PRICING.team.title}: ${PE_PRICING.team.priceLabel}`;
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

export function usdFromLabel(label: string): number {
  const n = Number(label.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) {
    throw new Error(`pricing: unreadable amount ${label}`);
  }
  return n;
}

export function extraSeatUsd(): number {
  return usdFromLabel(PE_PRICING.team.extraSeatPriceLabel);
}

export function extraSeatCount(seats: number): number {
  return Math.max(0, seats - PE_PRICING.team.baseSeats);
}

/** Team monthly total: $299 through 3 seats, then $25 each. 5 seats is $349. */
export function teamMonthlyTotalUsd(seats: number): number {
  return usdFromLabel(PE_PRICING.team.monthlyAmount) + extraSeatCount(seats) * extraSeatUsd();
}

export function teamMonthlyTotalLabel(seats: number): string {
  return `$${teamMonthlyTotalUsd(seats).toLocaleString("en-US")}`;
}

/** Annual is 10 × monthly (2 months free). */
export function annualFromMonthlyUsd(monthlyUsd: number): number {
  return monthlyUsd * 10;
}

/** "$1,290" -> 1290. Strips the currency symbol and thousands separator only. */
function usdToNumber(label: string): number {
  return Number(label.replace(/[^0-9.]/g, ""));
}

/**
 * "2 months free", derived from the tier's own configured prices rather than
 * asserted as prose (9-4 UI review: this messaging was missing everywhere;
 * Team alone carried the same fact spelled as "10 × monthly", math the buyer
 * has to do themselves rather than a claim they can just read).
 *
 * Returns null rather than a wrong or fractional claim when the numbers do
 * not resolve to a clean whole number of months — a savings claim is a
 * checkable fact, not a vibe, and nothing should print one it cannot derive.
 */
export function annualMonthsFreeLabel(tier: PePricedTier): string | null {
  const t = PE_PRICING[tier];
  const monthly = usdToNumber(t.monthlyAmount);
  const annual = usdToNumber(t.annualPriceLabel);
  if (!Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(annual)) {
    return null;
  }
  const monthsFree = (monthly * 12 - annual) / monthly;
  if (!Number.isInteger(monthsFree) || monthsFree <= 0) return null;
  return `${monthsFree} month${monthsFree === 1 ? "" : "s"} free`;
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
