// apps/property-explorer/src/browse/PricingModal.tsx
//
// THE ONE PRICING POPUP (operator ruling 2026-08-24): ALL pricing info lives
// here. A2 comparison table (Lane 2 / P-60): header + annual/monthly toggle,
// Free as a caption strip, three purchasable columns, grouped rows, Unlock
// as a footer offer. Studio is the emphasized Deliverables column.
//
// Every price string comes from src/lib/pricing.ts (PE_PRICING + label
// helpers) — NO price literals here. Checkout wiring is the shared
// useCheckoutActions hook (the same seams the retired UnlockFlow used):
// unlock → startPropertyUnlock; Solo/Studio/Team → startPeCheckout with
// the exact tier the button shows and interval from the toggle (year/month
// on the wire). NEVER a fake success.
//
// CTAs use Button.tsx. --brand-blue is the only interactive accent. Gold is
// mark-only. No --sc-* tokens. No Oxygen CDN.

import { useState } from "react";
import { Button } from "../components/Button";
import { useCheckoutActions, clampTeamSeats } from "./useCheckoutActions";
import { UnlockCheckoutModal } from "../checkout/UnlockCheckoutModal";
import type { PeCheckoutTier } from "../lib/billingClient";
import {
  PE_PRICING,
  defaultPricingInterval,
  matrixCellText,
  propertyUnlockOffer,
  teamSeatsControlVisible,
  tierHeadline,
  toCheckoutInterval,
  type MatrixCellKind,
  type PricingInterval,
} from "../lib/pricing";

const CARD_BG = "rgba(17, 21, 28, 0.92)";
const ACCENT = "var(--brand-blue, #3B82F6)";
const TEXT = "#e9eef5";
const BODY = "#c6d0dc";
const MUTED = "var(--surface-muted, #94A3B8)";
const ABSENCE = "var(--semantic-absence, #7C8BA0)";
const AMBER = "var(--semantic-warning, #F59E0B)";
const ROW_BORDER = "0.5px solid var(--surface-border-rgba, rgba(154,166,178,0.3))";
const ROW_BORDER_SOFT =
  "0.5px solid var(--surface-border-rgba, rgba(154,166,178,0.22))";
const COL_BORDER = "0.5px solid var(--surface-border-rgba, rgba(154,166,178,0.3))";
const EMPHASIS_BORDER = "1px solid var(--brand-blue-border, rgba(59,130,246,0.55))";
const EMPHASIS_BG = "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))";
const FONT =
  "var(--font-body, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";
const DISPLAY =
  "var(--font-display, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";

const TIERS: PeCheckoutTier[] = ["solo", "studio", "team"];

const GROUPS = [
  { key: "answer", testId: "pricing-group-answer", ...PE_PRICING.groups.answer },
  { key: "handoff", testId: "pricing-group-handoff", ...PE_PRICING.groups.handoff },
  { key: "firm", testId: "pricing-group-firm", ...PE_PRICING.groups.firm },
] as const;

export function PricingModal({
  parcelNodeId,
  highlightTier,
  contextLine,
  studioOnly,
  statusNote,
  initialInterval,
  situsAddress,
  onClose,
}: {
  /** The active property (null → the unlock is disabled with honest copy). */
  parcelNodeId: string | null;
  /** Inspected situs for unlock-modal chrome. Absent → parcel id, never invented. */
  situsAddress?: string | null;
  /** Visually emphasize one subscription column in addition to Studio. */
  highlightTier?: PeCheckoutTier;
  /** The triggering tool's value line — why the user is seeing this. */
  contextLine?: string | null;
  /** Studio-only feature path (terrain): mark the unlock as not applicable
   *  for this feature (still rendered); Studio + Team stay the covering tiers. */
  studioOnly?: boolean;
  /** Honest status footnote (e.g. ICC citation licensing state). */
  statusNote?: string | null;
  /** Test / first-paint override. Default is annual (PE_PRICING.interval.default). */
  initialInterval?: PricingInterval;
  onClose: () => void;
}) {
  const { busy, note, handleProperty, handleSubscription, unlockSession, dismissUnlock } =
    useCheckoutActions(parcelNodeId, {
      onUnlocked: onClose,
      situsAddress: situsAddress ?? null,
    });
  const [interval, setInterval] = useState<PricingInterval>(
    initialInterval ?? defaultPricingInterval(),
  );
  const [teamSeats, setTeamSeats] = useState<number>(PE_PRICING.team.baseSeats);
  const showSeatStepper = teamSeatsControlVisible(interval);

  const emphasize = (tier: PeCheckoutTier): boolean =>
    tier === "studio" ||
    highlightTier === tier ||
    (studioOnly === true && tier !== "solo");

  const checkoutSeats =
    interval === "annual" ? PE_PRICING.team.baseSeats : teamSeats;

  if (unlockSession) {
    return (
      <UnlockCheckoutModal
        situs={unlockSession.situs?.trim() || parcelNodeId || "This parcel"}
        clientSecret={unlockSession.clientSecret}
        publishableKey={unlockSession.publishableKey}
        parcelNodeId={unlockSession.parcelNodeId}
        onClose={dismissUnlock}
      />
    );
  }

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
        data-scroll="none"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(940px, calc(100vw - 24px))",
          maxHeight: "calc(100dvh - 24px)",
          overflow: "hidden",
          borderRadius: 14,
          background: CARD_BG,
          border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          color: TEXT,
          fontFamily: FONT,
          backdropFilter: "blur(2px)",
        }}
      >
        <div
          style={{
            padding: "14px 20px 12px",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            borderBottom: ROW_BORDER,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: ACCENT,
              }}
            >
              {PE_PRICING.header.eyebrow}
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: DISPLAY,
                fontSize: 26,
                lineHeight: 1.15,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {PE_PRICING.header.title}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div
              data-testid="pricing-interval"
              data-interval={interval}
              style={{
                display: "flex",
                padding: 3,
                borderRadius: 8,
                background: "rgba(11,14,19,0.6)",
                border: ROW_BORDER,
                gap: 2,
              }}
            >
              <Button
                type="button"
                dense
                variant={interval === "annual" ? "primary" : "ghost"}
                data-testid="pricing-interval-annual"
                aria-pressed={interval === "annual"}
                disabled={busy !== null}
                onClick={() => setInterval("annual")}
              >
                {PE_PRICING.interval.annualLabel}
              </Button>
              <Button
                type="button"
                dense
                variant={interval === "monthly" ? "primary" : "ghost"}
                data-testid="pricing-interval-monthly"
                aria-pressed={interval === "monthly"}
                disabled={busy !== null}
                onClick={() => setInterval("monthly")}
              >
                {PE_PRICING.interval.monthlyLabel}
              </Button>
            </div>
            <span style={{ fontSize: 11, color: ACCENT }}>
              {PE_PRICING.interval.savingsNote}
            </span>
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
        </div>

        {contextLine ? (
          <p
            data-testid="pricing-context-line"
            style={{
              margin: 0,
              padding: "8px 20px",
              borderBottom: ROW_BORDER,
              background: "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: BODY,
            }}
          >
            {contextLine}
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(160px, 1.15fr) 1fr 1fr 1fr",
          }}
        >
          <div
            data-testid="pricing-free-row"
            style={{
              padding: "16px 26px",
              borderBottom: ROW_BORDER,
              display: "flex",
              alignItems: "flex-end",
              fontSize: 12,
              color: ABSENCE,
              lineHeight: 1.45,
            }}
          >
            {PE_PRICING.free.blurb}
          </div>
          {TIERS.map((tier) => (
            <ColumnHead
              key={tier}
              tier={tier}
              interval={interval}
              emphasized={emphasize(tier)}
            />
          ))}

          {GROUPS.map((group) => (
            <GroupBlock
              key={group.key}
              testId={group.testId}
              title={group.title}
              rows={group.rows}
              interval={interval}
              emphasize={emphasize}
            />
          ))}

          <div
            style={{
              padding: "10px 20px",
              fontSize: 11.5,
              color: MUTED,
              lineHeight: 1.5,
            }}
          >
            {PE_PRICING.team.annualCapNote}
          </div>
          {TIERS.map((tier) => (
            <div
              key={`cta-${tier}`}
              data-testid={`pricing-${tier}-cta-cell`}
              style={{
                padding: 10,
                borderLeft: emphasize(tier) ? EMPHASIS_BORDER : COL_BORDER,
                background: emphasize(tier) ? EMPHASIS_BG : "transparent",
              }}
            >
              <Button
                type="button"
                fullWidth
                dense
                variant={tier === "studio" ? "primary" : "subtle"}
                data-testid={`pricing-${tier}-button`}
                data-amount={tierHeadline(tier, interval).amount}
                data-checkout-interval={toCheckoutInterval(interval)}
                disabled={busy !== null}
                onClick={() =>
                  void handleSubscription(
                    tier,
                    interval,
                    tier === "team" ? checkoutSeats : undefined,
                  )
                }
              >
                {busy === tier ? PE_PRICING.checkoutBusyLabel : PE_PRICING[tier].ctaLabel}
              </Button>
            </div>
          ))}
        </div>

        {showSeatStepper ? (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 26px 14px",
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
        ) : null}

        <div
          data-testid="pricing-unlock-card"
          data-not-applicable={studioOnly ? "true" : "false"}
          style={{
            padding: "10px 20px",
            borderTop: ROW_BORDER,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            background: "rgba(11,14,19,0.35)",
            opacity: studioOnly ? 0.62 : 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {PE_PRICING.property.footerLead}{" "}
              <span style={{ fontWeight: 700 }}>{propertyUnlockOffer()}</span>
              {" — "}
              {PE_PRICING.property.blurb}
            </div>
            {studioOnly ? (
              <p
                data-testid="pricing-unlock-na-note"
                style={{ margin: 0, fontSize: 11, lineHeight: 1.45, color: AMBER }}
              >
                {PE_PRICING.property.studioOnlyNote}
              </p>
            ) : null}
            {!parcelNodeId ? (
              <p
                data-testid="pricing-unlock-needs-property"
                style={{ margin: 0, fontSize: 10.5, color: MUTED }}
              >
                {PE_PRICING.property.needsPropertyNote}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            dense
            variant="subtle"
            data-testid="pricing-unlock-button"
            disabled={busy !== null || !parcelNodeId}
            onClick={() => void handleProperty()}
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {busy === "property"
              ? PE_PRICING.property.busyLabel
              : PE_PRICING.property.title}
          </Button>
        </div>

        {note ? (
          <p
            data-testid="pricing-note"
            style={{
              margin: 0,
              padding: "8px 20px 0",
              fontSize: 11,
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
            style={{
              margin: 0,
              padding: "6px 20px 10px",
              fontSize: 10,
              color: MUTED,
              lineHeight: 1.45,
            }}
          >
            {statusNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ColumnHead({
  tier,
  interval,
  emphasized,
}: {
  tier: PeCheckoutTier;
  interval: PricingInterval;
  emphasized: boolean;
}) {
  const headline = tierHeadline(tier, interval);
  return (
    <div
      data-testid={`pricing-${tier}-card`}
      data-emphasized={emphasized ? "true" : "false"}
      style={{
        padding: "8px 12px",
        borderBottom: ROW_BORDER,
        borderLeft: emphasized ? EMPHASIS_BORDER : COL_BORDER,
        borderTop: emphasized ? "2px solid var(--brand-blue-border, rgba(59,130,246,0.55))" : undefined,
        background: emphasized ? EMPHASIS_BG : "transparent",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{PE_PRICING[tier].title}</span>
        {tier === "studio" ? (
          <span
            data-testid="pricing-studio-badge"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: ACCENT,
            }}
          >
            {PE_PRICING.studio.badge}
          </span>
        ) : null}
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18 }}>
        {headline.amount}
        <span style={{ fontSize: 12, fontWeight: 400, color: MUTED }}>
          {headline.suffix}
        </span>
      </div>
      <div style={{ fontSize: 11, color: MUTED }}>{headline.compare}</div>
    </div>
  );
}

function GroupBlock({
  testId,
  title,
  rows,
  interval,
  emphasize,
}: {
  testId: string;
  title: string;
  rows: ReadonlyArray<{
    label: string;
    solo: MatrixCellKind;
    studio: MatrixCellKind;
    team: MatrixCellKind;
  }>;
  interval: PricingInterval;
  emphasize: (tier: PeCheckoutTier) => boolean;
}) {
  return (
    <>
      <div
        data-testid={testId}
        style={{
          padding: "6px 20px 4px",
          gridColumn: "1 / -1",
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: ACCENT,
          background: "rgba(11,14,19,0.35)",
        }}
      >
        {title}
      </div>
      {rows.map((row) => (
        <FeatureRow
          key={row.label}
          label={row.label}
          cells={{ solo: row.solo, studio: row.studio, team: row.team }}
          interval={interval}
          emphasize={emphasize}
        />
      ))}
    </>
  );
}

function FeatureRow({
  label,
  cells,
  interval,
  emphasize,
}: {
  label: string;
  cells: Record<PeCheckoutTier, MatrixCellKind>;
  interval: PricingInterval;
  emphasize: (tier: PeCheckoutTier) => boolean;
}) {
  return (
    <>
      <div
        style={{
          padding: "5px 16px 5px 20px",
          borderBottom: ROW_BORDER_SOFT,
          fontSize: 12,
          color: BODY,
        }}
      >
        {label}
      </div>
      {TIERS.map((tier) => {
        const kind = cells[tier];
        const text = matrixCellText(kind, interval);
        const muted = kind === "notIncluded" || kind === "oneSeat" || kind === "comingSoon";
        return (
          <div
            key={`${label}-${tier}`}
            style={{
              padding: "5px 12px",
              borderBottom: ROW_BORDER_SOFT,
              borderLeft: emphasize(tier) ? EMPHASIS_BORDER : COL_BORDER,
              background: emphasize(tier) ? EMPHASIS_BG : "transparent",
              fontSize: 12,
              color: muted ? ABSENCE : TEXT,
            }}
          >
            {kind === "comingSoon" ? (
              <span
                style={{
                  fontSize: 10,
                  color: ABSENCE,
                  background: "var(--semantic-absence-bg, rgba(124,139,160,0.12))",
                  border: "1px solid var(--semantic-absence-border, rgba(124,139,160,0.35))",
                  borderRadius: 4,
                  padding: "2px 6px",
                }}
              >
                {text}
              </span>
            ) : (
              text
            )}
          </div>
        );
      })}
    </>
  );
}
