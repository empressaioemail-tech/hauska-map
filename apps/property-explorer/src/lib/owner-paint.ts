/**
 * Owner paint gate (P-60 / WDLL item 2; widened 2026-09-05).
 *
 * Owner name is Studio, Team, OR an active Property Unlock on this specific
 * parcel. A leaky ownerName on free/Solo is refused. CAD / GIS / bake names
 * are never a fallback.
 *
 * WIDENED (operator, 2026-09-05): "owner needs to be a part of unlock too.
 * i just kept it out of solo as a way to graduate user through the tiers."
 * Solo's exclusion is the deliberate tier-graduation lever and is
 * UNCHANGED; Property Unlock's exclusion was not deliberate in the same
 * way and is corrected here — Property Unlock has grown into a rich,
 * near-Studio single-property door (P-119) since this gate was first
 * written.
 */

import {
  subscriptionTierGrantsStudio,
  type PeSubscriptionTier,
} from "./entitlementClient";

export const OWNER_STUDIO_UPGRADE_CUE =
  "Owner data is on Studio — upgrade to see who owns this parcel.";

export const OWNER_STUDIO_GATED_REASON = "owner-fact studio-gated";

/**
 * `propertyUnlocked` is THIS parcel's own unlock flag (the same field
 * `usePropertyEntitlement`/`PropertyEntitlementState.propertyUnlocked`
 * already resolves per-parcel) — never a user-level default. Solo stays
 * excluded on its own; Property Unlock now grants alongside Studio/Team.
 */
export function ownerPaintAllowed(
  subscriptionTier: PeSubscriptionTier | null,
  propertyUnlocked = false,
): boolean {
  return subscriptionTierGrantsStudio(subscriptionTier) || propertyUnlocked;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export type OwnerPaint =
  | { kind: "name"; display: string }
  | { kind: "absence"; reason: string; upgrade: boolean };

/**
 * Second gate. `cadOwnerName` is accepted only so tests can prove it is
 * ignored. It never becomes the display.
 */
export type OwnerFactPresentation = {
  state: string;
  value?: string | null;
  reason?: string;
  label?: string;
};

/**
 * Inspect-row second gate. Free/Solo never receive a name, even when
 * `fact` is present. CAD names are not an argument here on purpose.
 * `propertyUnlocked` is this specific parcel's own unlock flag — see
 * `ownerPaintAllowed`.
 */
export function gateOwnerPresentation<T extends OwnerFactPresentation | null>(
  fact: T,
  subscriptionTier: PeSubscriptionTier | null,
  propertyUnlocked = false,
): T | { state: "absent-covered"; reason: string; provenance: null } {
  if (!ownerPaintAllowed(subscriptionTier, propertyUnlocked)) {
    return {
      state: "absent-covered",
      reason: OWNER_STUDIO_UPGRADE_CUE,
      provenance: null,
    };
  }
  return fact;
}

export function resolveOwnerPaint(input: {
  ownerFact: unknown;
  subscriptionTier: PeSubscriptionTier | null;
  cadOwnerName?: string | null;
  propertyUnlocked?: boolean;
}): OwnerPaint {
  void input.cadOwnerName;
  const granted = ownerPaintAllowed(input.subscriptionTier, input.propertyUnlocked);
  const fact = rec(input.ownerFact);
  const ownerName = fact ? str(fact.ownerName) : null;

  if (!granted) {
    return { kind: "absence", reason: OWNER_STUDIO_UPGRADE_CUE, upgrade: true };
  }
  if (!ownerName) {
    const code = fact ? str(fact.code) : null;
    return {
      kind: "absence",
      reason: code
        ? `${OWNER_STUDIO_GATED_REASON} (${code})`
        : "owner-fact present without ownerName on this tier",
      upgrade: false,
    };
  }
  return { kind: "name", display: ownerName };
}
