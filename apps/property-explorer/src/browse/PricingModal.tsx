// apps/property-explorer/src/browse/PricingModal.tsx
//
// THE ONE PRICING POPUP (operator ruling 2026-08-24): ALL pricing info lives
// here, styled after the cold-open SignUpCard. The dock's locked panels keep
// only the tool's value line + a button that opens this modal (via the
// host.openPaywall capability), and the reactive server-402 belt opens the
// same modal — one surface, never a different wall per bubble.
//
// Every price string comes from src/lib/pricing.ts (PE_PRICING + label
// helpers) — NO price literals here. Checkout wiring is the shared
// useCheckoutActions hook (the same seams the retired UnlockFlow used):
// $15 unlock → startPropertyUnlock; Solo/Studio/Team → startPeCheckout with
// the exact tier the button shows. NEVER a fake success.

import { useState } from "react";
import { useCheckoutActions, clampTeamSeats } from "./useCheckoutActions";
import type { PeCheckoutTier } from "../lib/billingClient";
import {
  PE_PRICING,
  propertyChoiceLabel,
  soloChoiceLabel,
  studioChoiceLabel,
  teamChoiceLabel,
} from "../lib/pricing";

const CARD_BG = "rgba(17, 21, 28, 0.92)"; // same as SignUpCard
const ACCENT = "var(--brand-blue, #3B82F6)";
const TEXT = "#e9eef5";
const BODY = "#c6d0dc";
const MUTED = "var(--surface-muted, #94A3B8)";
const AMBER = "var(--semantic-warning, #F59E0B)";
const ROW_BORDER = "0.5px solid var(--surface-border-rgba, rgba(154,166,178,0.3))";
const EMPHASIS_BORDER =
  "1px solid var(--brand-blue-border, rgba(59,130,246,0.55))";

export function PricingModal({
  parcelNodeId,
  highlightTier,
  contextLine,
  studioOnly,
  statusNote,
  onClose,
}: {
  /** The active property (null → the $15 unlock is disabled with honest copy). */
  parcelNodeId: string | null;
  /** Visually emphasize one subscription card. */
  highlightTier?: PeCheckoutTier;
  /** The triggering tool's value line — why the user is seeing this. */
  contextLine?: string | null;
  /** Studio-only feature path (terrain): emphasize Studio/Team; mark the $15
   *  unlock as not applicable for this feature (still rendered). */
  studioOnly?: boolean;
  /** Honest status footnote (e.g. ICC citation licensing state). */
  statusNote?: string | null;
  onClose: () => void;
}) {
  const { busy, note, handleProperty, handleSubscription } =
    useCheckoutActions(parcelNodeId, { onUnlocked: onClose });
  // Team seat count — TOTAL seats desired (the base covers 10).
  const [teamSeats, setTeamSeats] = useState(10);

  const emphasize = (tier: PeCheckoutTier): boolean =>
    highlightTier === tier || (studioOnly === true && tier !== "solo");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pricing"
      data-testid="pricing-modal-scrim"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,9,13,0.72)",
        padding: 16,
      }}
    >
      <div
        data-testid="pricing-modal"
        data-studio-only={studioOnly ? "true" : "false"}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "min(84vh, 760px)",
          overflowY: "auto",
          padding: "24px 24px 20px",
          borderRadius: 16,
          background: CARD_BG,
          border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          color: TEXT,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          backdropFilter: "blur(2px)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: ACCENT,
            }}
          >
            SMART SITE
          </div>
          <button
            type="button"
            aria-label="Close"
            data-testid="pricing-modal-close"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: MUTED,
              cursor: "pointer",
              fontSize: 17,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <h2
          style={{
            margin: "0 0 4px",
            fontSize: 22,
            lineHeight: 1.22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          {PE_PRICING.header.title}
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.5, color: BODY }}>
          {PE_PRICING.header.framing}
        </p>

        {contextLine ? (
          <p
            data-testid="pricing-context-line"
            style={{
              margin: "0 0 14px",
              padding: "9px 12px",
              borderRadius: 8,
              border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
              background: "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: BODY,
            }}
          >
            {contextLine}
          </p>
        ) : null}

        {/* FREE — what every account gets at $0. */}
        <div
          data-testid="pricing-free-row"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "baseline",
            padding: "8px 0 12px",
            borderBottom: ROW_BORDER,
            marginBottom: 12,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            {PE_PRICING.free.title} — {PE_PRICING.free.priceLabel}
          </span>
          <span style={{ fontSize: 12, lineHeight: 1.45, color: BODY }}>
            {PE_PRICING.free.blurb}
          </span>
        </div>

        {/* $15 PER-PROPERTY UNLOCK. */}
        <div
          data-testid="pricing-unlock-card"
          data-not-applicable={studioOnly ? "true" : "false"}
          style={{
            borderRadius: 10,
            border: ROW_BORDER,
            padding: "12px 14px",
            marginBottom: 10,
            opacity: studioOnly ? 0.62 : 1,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{propertyChoiceLabel()}</div>
          <p style={{ margin: "3px 0 8px", fontSize: 12, lineHeight: 1.45, color: BODY }}>
            {PE_PRICING.property.blurb}
          </p>
          {studioOnly ? (
            <p
              data-testid="pricing-unlock-na-note"
              style={{ margin: "0 0 8px", fontSize: 11, lineHeight: 1.45, color: AMBER }}
            >
              {PE_PRICING.property.studioOnlyNote}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="pricing-unlock-button"
            disabled={busy !== null || !parcelNodeId}
            onClick={() => void handleProperty()}
            style={secondaryBtnStyle(busy === "property")}
          >
            {busy === "property" ? "Unlocking…" : propertyChoiceLabel()}
          </button>
          {!parcelNodeId ? (
            <p
              data-testid="pricing-unlock-needs-property"
              style={{ margin: "6px 0 0", fontSize: 10.5, color: MUTED }}
            >
              {PE_PRICING.property.needsPropertyNote}
            </p>
          ) : null}
        </div>

        {/* SUBSCRIPTIONS — Solo / Studio / Team, all from config. */}
        <SubscriptionCard
          tier="solo"
          label={soloChoiceLabel()}
          blurb={PE_PRICING.solo.blurb}
          features={PE_PRICING.solo.features}
          emphasized={emphasize("solo")}
          busy={busy}
          onCheckout={() => void handleSubscription("solo")}
        />
        <SubscriptionCard
          tier="studio"
          label={studioChoiceLabel()}
          blurb={PE_PRICING.studio.blurb}
          features={PE_PRICING.studio.features}
          emphasized={emphasize("studio")}
          busy={busy}
          onCheckout={() => void handleSubscription("studio")}
        />
        <SubscriptionCard
          tier="team"
          label={teamChoiceLabel()}
          blurb={PE_PRICING.team.blurb}
          features={PE_PRICING.team.features}
          emphasized={emphasize("team")}
          busy={busy}
          onCheckout={() => void handleSubscription("team", teamSeats)}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
              fontSize: 11,
              color: MUTED,
            }}
          >
            Seats
            <input
              type="number"
              data-testid="pricing-team-seats"
              min={1}
              max={500}
              step={1}
              value={teamSeats}
              disabled={busy !== null}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                if (Number.isNaN(parsed)) return;
                setTeamSeats(clampTeamSeats(parsed));
              }}
              style={{
                width: 64,
                borderRadius: 6,
                border: "1px solid var(--brand-blue-border, rgba(59,130,246,0.4))",
                background: "transparent",
                color: TEXT,
                padding: "3px 6px",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            />
            <span>{PE_PRICING.team.seatNote}</span>
          </label>
        </SubscriptionCard>

        {note ? (
          <p
            data-testid="pricing-note"
            style={{
              margin: "10px 0 0",
              fontSize: 11.5,
              lineHeight: 1.45,
              color: note.tone === "amber" ? AMBER : MUTED,
            }}
          >
            {note.text}
          </p>
        ) : null}

        {statusNote ? (
          <p
            data-testid="pricing-status-note"
            style={{ margin: "10px 0 0", fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
          >
            {statusNote}
          </p>
        ) : null}

        <p style={{ margin: "12px 0 0", fontSize: 10.5, lineHeight: 1.45, color: MUTED }}>
          The inspect card and map layers stay free.
        </p>
      </div>
    </div>
  );
}

function SubscriptionCard({
  tier,
  label,
  blurb,
  features,
  emphasized,
  busy,
  onCheckout,
  children,
}: {
  tier: PeCheckoutTier;
  label: string;
  blurb: string;
  features: string;
  emphasized: boolean;
  busy: string | null;
  onCheckout: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid={`pricing-${tier}-card`}
      data-emphasized={emphasized ? "true" : "false"}
      style={{
        borderRadius: 10,
        border: emphasized ? EMPHASIS_BORDER : ROW_BORDER,
        background: emphasized
          ? "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))"
          : "transparent",
        padding: "12px 14px",
        marginBottom: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
      <p style={{ margin: "3px 0 2px", fontSize: 12, lineHeight: 1.45, color: BODY }}>
        {blurb}
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 11, lineHeight: 1.45, color: MUTED }}>
        {features}
      </p>
      <button
        type="button"
        data-testid={`pricing-${tier}-button`}
        disabled={busy !== null}
        onClick={onCheckout}
        style={emphasized ? primaryBtnStyle(busy === tier) : secondaryBtnStyle(busy === tier)}
      >
        {busy === tier ? "Starting checkout…" : label}
      </button>
      {children}
    </div>
  );
}

function primaryBtnStyle(busy: boolean) {
  return {
    width: "100%",
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#f8fafc",
    background: "var(--brand-blue, #3B82F6)",
    border: "none",
    borderRadius: 8,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.7 : 1,
    fontFamily: "inherit",
  } as const;
}

function secondaryBtnStyle(busy: boolean) {
  return {
    width: "100%",
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-body, #e5e7eb)",
    background: "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))",
    border: "1px solid var(--brand-blue-border, rgba(59,130,246,0.4))",
    borderRadius: 8,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.7 : 1,
    fontFamily: "inherit",
  } as const;
}
