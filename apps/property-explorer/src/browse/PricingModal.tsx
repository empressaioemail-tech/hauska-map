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

import { useRef, useState } from "react";
import { Button } from "../components/Button";
import { useDialogFocus } from "../components/useDialogFocus";
import { PE } from "../styles/pe-chrome";
import { useCheckoutActions, clampTeamSeats } from "./useCheckoutActions";
import { UnlockCheckoutModal } from "../checkout/UnlockCheckoutModal";
import { SubscriptionCheckoutModal } from "../checkout/SubscriptionCheckoutModal";
import { checkoutPageHref } from "../checkout/checkoutLanding";
import type { PeCheckoutTier } from "../lib/billingClient";
import {
  PE_PRICING,
  defaultPricingInterval,
  matrixCellText,
  propertyUnlockOffer,
  teamMonthlyTotalLabel,
  teamMonthlyTotalUsd,
  teamSeatsControlVisible,
  tierHeadline,
  toCheckoutInterval,
  type MatrixCellKind,
  type PricingInterval,
} from "../lib/pricing";
import { shouldShowSoloCompare, unlocksThisWeek } from "../lib/unlock-week";

const CARD_BG = PE.modalBg;
const ACCENT = PE.blue;
const TEXT = PE.t1;
const BODY = PE.t3;
const MUTED = PE.t5;
const ABSENCE = PE.slate;
const AMBER = PE.warn;
// Three hairline weights, one hue. ROW_BORDER is the edge OF a band,
// ROW_BORDER_SOFT the rule INSIDE it.
const ROW_BORDER = `1px solid ${PE.line14}`;
const ROW_BORDER_SOFT = `1px solid ${PE.line06}`;
const COL_BORDER = `1px solid ${PE.line06}`;
const EMPHASIS_BORDER = `1px solid ${PE.blueLine}`;
const EMPHASIS_BG = PE.blueBg;
const FONT = PE.ui;
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
  initialTeamSeats,
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
  /** Test / first-paint override. Default is monthly (PE_PRICING.interval.default). */
  initialInterval?: PricingInterval;
  /** Test override. Default is the 10-seat base. */
  initialTeamSeats?: number;
  onClose: () => void;
}) {
  const {
    busy,
    note,
    handleProperty,
    handleSubscription,
    unlockSession,
    dismissUnlock,
    subscriptionSession,
    dismissSubscription,
  } = useCheckoutActions(parcelNodeId, {
    onUnlocked: onClose,
    situsAddress: situsAddress ?? null,
  });
  const [interval, setInterval] = useState<PricingInterval>(
    initialInterval ?? defaultPricingInterval(),
  );
  const [teamSeats, setTeamSeats] = useState<number>(
    initialTeamSeats ?? PE_PRICING.team.baseSeats,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);

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

  if (subscriptionSession) {
    return (
      <SubscriptionCheckoutModal
        search={checkoutPageHref({
          tier: subscriptionSession.tier,
          interval: subscriptionSession.interval,
          parcelNodeId: subscriptionSession.parcelNodeId,
          situs: subscriptionSession.situs,
          seats: subscriptionSession.seats,
        }).replace(/^\/checkout/, "")}
        session={{
          clientSecret: subscriptionSession.clientSecret,
          publishableKey: subscriptionSession.publishableKey,
          sessionId: subscriptionSession.sessionId,
          kind: "subscription",
        }}
        onClose={dismissSubscription}
      />
    );
  }

  return (
    <div
      ref={dialogRef}
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
        background: PE.scrim,
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
          borderRadius: PE.rModal,
          background: CARD_BG,
          border: `1px solid ${PE.line28}`,
          boxShadow: PE.shModal,
          color: TEXT,
          fontFamily: FONT,
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
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: ".18em",
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
                fontSize: 32,
                lineHeight: 1.15,
                fontWeight: 700,
                letterSpacing: "-.02em",
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
                borderRadius: 12,
                background: "color-mix(in oklab, var(--ss-ink) 60%, transparent)",
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
            <Button
              type="button"
              aria-label="Close"
              data-testid="pricing-modal-close"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: MUTED,
                cursor: "pointer",
                fontSize: 17.5,
                lineHeight: 1,
                padding: 0,
                height: "auto",
              }}
            >
              ×
            </Button>
          </div>
        </div>

        {contextLine ? (
          <p
            data-testid="pricing-context-line"
            style={{
              margin: 0,
              padding: "8px 20px",
              borderBottom: ROW_BORDER,
              background: "color-mix(in oklab, var(--ss-blue) 8%, transparent)",
              fontSize: 14.5,
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
              fontSize: 14.5,
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
              teamSeats={tier === "team" ? teamSeats : undefined}
              onTeamSeatsChange={
                tier === "team"
                  ? (next) => setTeamSeats(clampTeamSeats(next))
                  : undefined
              }
              seatsDisabled={busy !== null}
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
              fontSize: 12.5,
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
            background: "color-mix(in oklab, var(--ss-ink) 35%, transparent)",
            opacity: studioOnly ? 0.62 : 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, lineHeight: 1.45 }}>
              {PE_PRICING.property.footerLead}{" "}
              <span style={{ fontWeight: 600 }}>{propertyUnlockOffer()}</span>
              {" — "}
              {PE_PRICING.property.blurb}
            </div>
            {shouldShowSoloCompare(unlocksThisWeek()) ? (
              <p
                data-testid="pricing-solo-second-unlock"
                style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: BODY }}
              >
                {PE_PRICING.soloSecondUnlockFact}
              </p>
            ) : null}
            {studioOnly ? (
              <p
                data-testid="pricing-unlock-na-note"
                style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45, color: AMBER }}
              >
                {PE_PRICING.property.studioOnlyNote}
              </p>
            ) : null}
            {!parcelNodeId ? (
              <p
                data-testid="pricing-unlock-needs-property"
                style={{ margin: 0, fontSize: 12.5, color: MUTED }}
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
            style={{
              margin: 0,
              padding: "6px 20px 10px",
              fontSize: 11.5,
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
  teamSeats,
  onTeamSeatsChange,
  seatsDisabled,
}: {
  tier: PeCheckoutTier;
  interval: PricingInterval;
  emphasized: boolean;
  teamSeats?: number;
  onTeamSeatsChange?: (next: number) => void;
  seatsDisabled?: boolean;
}) {
  const headline =
    tier === "team" && interval === "monthly" && teamSeats != null
      ? {
          amount: teamMonthlyTotalLabel(teamSeats),
          suffix: PE_PRICING.team.monthlySuffix,
          compare: `${teamSeats} seats · then ${PE_PRICING.team.extraSeatPriceLabel}${PE_PRICING.team.extraSeatPeriod} after ${PE_PRICING.team.baseSeats}`,
        }
      : tierHeadline(tier, interval);
  const showSeats =
    tier === "team" &&
    teamSeats != null &&
    onTeamSeatsChange != null &&
    teamSeatsControlVisible(interval);
  return (
    <div
      data-testid={`pricing-${tier}-card`}
      data-emphasized={emphasized ? "true" : "false"}
      style={{
        padding: "8px 12px",
        borderBottom: ROW_BORDER,
        borderLeft: emphasized ? EMPHASIS_BORDER : COL_BORDER,
        borderTop: emphasized
          ? "2px solid color-mix(in oklab, var(--ss-blue) 55%, transparent)"
          : undefined,
        background: emphasized ? EMPHASIS_BG : "transparent",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: TEXT,
          }}
        >
          {PE_PRICING[tier].title}
        </span>
        {tier === "studio" ? (
          <span
            data-testid="pricing-studio-badge"
            style={{
              fontSize: 11.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: ACCENT,
            }}
          >
            {PE_PRICING.studio.badge}
          </span>
        ) : null}
      </div>
      <div style={{ fontFamily: PE.mono, fontWeight: 400, fontSize: 17.5, letterSpacing: "-.01em", color: TEXT }}>
        {headline.amount}
        <span style={{ fontSize: 14.5, fontWeight: 400, color: MUTED }}>
          {headline.suffix}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: MUTED }}>{headline.compare}</div>
      {tier === "team" && interval === "annual" ? (
        <div
          data-testid="pricing-team-annual-note"
          style={{ fontSize: 11.5, color: ACCENT }}
        >
          {PE_PRICING.interval.teamAnnualNote}
        </div>
      ) : null}
      {showSeats ? (
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: 4,
            fontSize: 11.5,
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
            disabled={seatsDisabled}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              if (Number.isNaN(parsed) || !onTeamSeatsChange) return;
              onTeamSeatsChange(parsed);
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 10,
              border: "1px solid color-mix(in oklab, var(--ss-blue) 40%, transparent)",
              background: "transparent",
              color: TEXT,
              padding: "3px 6px",
              fontFamily: "inherit",
              fontSize: 14.5,
            }}
          />
          <span>{PE_PRICING.team.seatNote}</span>
          <span
            data-testid="pricing-team-12-total"
            data-usd={String(teamMonthlyTotalUsd(12))}
            style={{ color: TEXT }}
          >
            12 seats {teamMonthlyTotalLabel(12)}/mo
          </span>
        </label>
      ) : null}
    </div>
  );
}

/**
 * The CheckRow glyph for one matrix cell.
 *
 *   included        check   ok       — you get this
 *   notIncluded     slash   slate    — this tier does not have it
 *   oneSeat         lock    warn     — a higher tier, or more seats, unlocks it
 *   teamSeats       lock    warn     — same, seat-scaled
 *   comingSoon      alert   t6       — NOT BUILT YET. Never sold as present.
 *
 * Never a greyed check. An exclusion gets its own glyph, at the same size as
 * an inclusion, so the row reads as a decision rather than as a faded yes.
 */
const CELL_GLYPH: Record<MatrixCellKind, { d: string; color: string }> = {
  included: { d: "M20 6 9 17l-5-5", color: PE.ok },
  notIncluded: {
    d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M6 6l12 12",
    color: PE.slate,
  },
  oneSeat: { d: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4", color: PE.warn },
  teamSeats: { d: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4", color: PE.warn },
  comingSoon: { d: "M12 3 2 20h20L12 3z M12 10v4 M12 17h.01", color: PE.t6 },
};

function CellGlyph({ kind }: { kind: MatrixCellKind }) {
  const g = CELL_GLYPH[kind];
  return (
    <svg
      viewBox="0 0 24 24"
      width={12}
      height={12}
      aria-hidden
      fill="none"
      stroke={g.color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none", marginTop: 2 }}
    >
      <path d={g.d} />
    </svg>
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
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: ".13em",
          textTransform: "uppercase",
          color: PE.t6,
          background: "rgba(255,255,255,.015)",
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
          padding: "6px 16px 6px 20px",
          borderBottom: ROW_BORDER_SOFT,
          fontSize: 14.5,
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
            data-cell-kind={kind}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 7,
              padding: "6px 12px",
              borderBottom: ROW_BORDER_SOFT,
              borderLeft: emphasize(tier) ? EMPHASIS_BORDER : COL_BORDER,
              background: emphasize(tier) ? EMPHASIS_BG : "transparent",
              fontSize: 14.5,
              lineHeight: 1.35,
              color: muted ? ABSENCE : TEXT,
            }}
          >
            <CellGlyph kind={kind} />
            <span>{text}</span>
          </div>
        );
      })}
    </>
  );
}
