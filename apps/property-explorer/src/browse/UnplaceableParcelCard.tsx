// apps/property-explorer/src/browse/UnplaceableParcelCard.tsx
//
// THE DESIGNED STATE for a parcel we hold the record for but cannot place on
// the map (contract AMENDMENT 1, `UnplaceableParcel`).
//
// Why this exists rather than a thrown error: geometry is REQUIRED on a
// ParcelFactSheet, which is what makes invariant I5 structural — anything
// holding a sheet can be placed, so no surface downstream needs a null check or
// a still-map branch. But the first implementation of that turned an
// unplaceable parcel into a Find that failed outright, and the QA pass this
// whole programme answers was ABOUT parcels that could not be found. Making
// them vanish is a worse honest failure than the "card opens, map stays still"
// behaviour it replaced.
//
// So the parcel gets a card of its own. It says three things and no more: what
// we hold, that we cannot place it, and what would fix that. It is deliberately
// NOT styled as an error — nothing has gone wrong, a data gap has been named.
// That is the I4 distinction applied at the level of a whole parcel: a failure
// and an absence must not look alike.

import type { CSSProperties } from "react";
import { isPresent, type UnplaceableParcel } from "@empressaio/parcel-fact-sheet";
import { Button } from "../components/Button";

const MUTED = "var(--surface-muted, #94A3B8)";
const CARD_BG = "var(--surface-card-translucent, rgba(11,14,19,0.94))";

const shell: CSSProperties = {
  position: "absolute",
  left: 14,
  top: 74,
  zIndex: 5,
  width: 320,
  maxWidth: "calc(100vw - 28px)",
  padding: "12px 14px",
  borderRadius: 10,
  background: CARD_BG,
  border: "1px solid rgba(154,166,178,0.35)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
  font: "13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  color: "var(--text-body, #e5e7eb)",
};

export function UnplaceableParcelCard({
  parcel,
  onClose,
  embedded = false,
}: {
  parcel: UnplaceableParcel;
  onClose: () => void;
  /** True inside the mobile sheet, which supplies its own shell. */
  embedded?: boolean;
}) {
  const { identity } = parcel;
  const address = isPresent(identity.situsAddress)
    ? identity.situsAddress.value
    : null;
  const apn = isPresent(identity.apn) ? identity.apn.value : null;

  return (
    <div
      data-testid="unplaceable-parcel-card"
      data-parcel-node-id={parcel.parcelNodeId}
      style={embedded ? undefined : shell}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 13.5, lineHeight: 1.3 }}>
          {address ?? `Parcel ${apn ?? parcel.parcelNodeId}`}
        </strong>
        <Button variant="ghost" dense onClick={onClose} data-testid="unplaceable-close">
          Close
        </Button>
      </div>

      {/* WHAT WE HOLD. The record is real, and saying so is the point. */}
      <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>
        {parcel.parcelNodeId} · {identity.county.name} County (
        {identity.county.fips})
      </div>

      {/* THAT WE CANNOT PLACE IT. Absence styling, never error styling. */}
      <p
        data-testid="unplaceable-reason"
        style={{
          margin: "10px 0 0",
          fontSize: 12,
          color: "var(--semantic-absence)",
        }}
      >
        {parcel.reason}
      </p>

      {/* WHAT WOULD FIX IT. An honest absence that cannot say what would fill
          it is not honest, it is just empty (I4). */}
      <p
        data-testid="unplaceable-would-be-filled-by"
        style={{ margin: "6px 0 0", fontSize: 11, color: MUTED }}
      >
        Filled by: {parcel.wouldBeFilledBy}
      </p>
    </div>
  );
}
