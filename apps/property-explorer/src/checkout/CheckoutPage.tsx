// Subscription payment chrome (WDLL item 3 popup). Left column is Smart Site
// markup. Right column mounts Stripe Payment Element. No invented card fields.
// Mounted inside SubscriptionCheckoutModal so the map stays mounted.

import {
  PE_PRICING,
  teamMonthlyTotalLabel,
  type PePricedTier,
} from "../lib/pricing";
import {
  readCheckoutOrigin,
  readCustomCheckoutSession,
  type CustomCheckoutSession,
} from "../lib/checkoutOrigin";
import { resolveCheckoutMountCredentials } from "../lib/stripeCheckoutMount";
import { useStripeCheckoutMount } from "../lib/useStripeCheckoutMount";
import {
  includedLinesForTier,
  subscriptionSubmitLabel,
  tierCheckoutHeadline,
} from "./checkoutCopy";
import { parseCheckoutQuery } from "./checkoutLanding";

const INK = "#0b0e13";
const TEXT = "#F8FAFC";
const MUTED = "#94A3B8";
const ABSENCE = "#7C8BA0";
const BLUE = "#3B82F6";
const FONT =
  "var(--font-body, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";
const DISPLAY =
  "var(--font-display, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";

function checkoutReturnUrl(parcelNodeId: string | null): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://smartsite.cloud";
  return `${origin}/?checkout=success${
    parcelNodeId ? `&parcelNodeId=${encodeURIComponent(parcelNodeId)}` : ""
  }`;
}

export function CheckoutPage({
  search,
  originLabel,
  session,
  onClose,
}: {
  search?: string;
  originLabel?: string | null;
  session?: CustomCheckoutSession | null;
  onClose?: () => void;
} = {}) {
  const q = parseCheckoutQuery(
    search ?? (typeof window !== "undefined" ? window.location.search : ""),
  );
  const tier = q.tier as PePricedTier;
  const headline = tierCheckoutHeadline(tier, q.interval);
  const dueToday =
    tier === "team" && q.interval === "month" && q.seats
      ? teamMonthlyTotalLabel(q.seats)
      : headline.amount;
  const included = includedLinesForTier(tier);
  const origin =
    originLabel !== undefined ? originLabel : readCheckoutOrigin()?.label ?? null;
  const situs = q.situs;
  const submit = subscriptionSubmitLabel(Boolean(origin));
  const resolvedSession =
    session !== undefined ? session : readCustomCheckoutSession();
  const creds = resolveCheckoutMountCredentials({
    clientSecret: resolvedSession?.clientSecret,
    publishableKey: resolvedSession?.publishableKey,
  });
  const mount = useStripeCheckoutMount({
    clientSecret: resolvedSession?.clientSecret,
    publishableKey: resolvedSession?.publishableKey,
  });

  return (
    <div
      data-testid="checkout-page"
      style={{
        width: "min(920px, calc(100vw - 24px))",
        maxHeight: "calc(100dvh - 24px)",
        overflow: "auto",
        borderRadius: 14,
        background: INK,
        color: TEXT,
        fontFamily: FONT,
        border: "0.5px solid rgba(59,130,246,0.28)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
      }}
    >
      <header
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 20px",
          borderBottom: "0.5px solid rgba(154,166,178,0.3)",
          background: "rgba(11,14,19,0.9)",
        }}
      >
        <span
          style={{
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: "0.04em",
          }}
        >
          SMART<span style={{ color: "#F5B95C" }}>SITE</span>
        </span>
        <button
          type="button"
          data-testid="checkout-back"
          onClick={onClose}
          style={{
            fontSize: 12,
            color: ABSENCE,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: FONT,
          }}
        >
          ‹ Back to cart
        </button>
        {tier === "team" ? (
          <button
            type="button"
            data-testid="checkout-change-seats"
            onClick={onClose}
            style={{
              fontSize: 12,
              color: ABSENCE,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: FONT,
            }}
          >
            Change seats
          </button>
        ) : null}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <section
          data-testid="checkout-left"
          style={{
            padding: "56px 60px",
            display: "flex",
            flexDirection: "column",
            gap: 26,
            borderRight: "0.5px solid rgba(154,166,178,0.2)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: BLUE,
              }}
            >
              Subscribe
            </div>
            <div
              data-testid="checkout-product-name"
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 34,
                lineHeight: 1.15,
              }}
            >
              Smart Site {PE_PRICING[tier].title}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                data-testid="checkout-amount"
                style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 40 }}
              >
                {dueToday}
              </span>
              <span data-testid="checkout-interval" style={{ fontSize: 14, color: MUTED }}>
                {headline.periodWord}
              </span>
            </div>
            <div style={{ fontSize: 13, color: MUTED }}>{headline.compare}</div>
          </div>

          <div style={{ height: 1, background: "rgba(154,166,178,0.2)" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#64748B",
              }}
            >
              Included
            </div>
            <ul
              data-testid="checkout-included"
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 9,
                fontSize: 13.5,
              }}
            >
              {included.map((line) => (
                <li key={line} style={{ display: "flex", gap: 11 }}>
                  <span style={{ color: "#10B981" }}>✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {situs || origin ? (
            <div
              data-testid="checkout-parcel-chip"
              style={{
                borderRadius: 8,
                border: "0.5px solid rgba(154,166,178,0.3)",
                background: "rgba(11,14,19,0.6)",
                padding: "14px 16px",
              }}
            >
              {situs ? (
                <div style={{ fontSize: 12.5 }}>
                  Started from <span style={{ fontWeight: 700 }}>{situs}</span>
                </div>
              ) : null}
              {origin ? (
                <div style={{ fontSize: 11.5, color: ABSENCE, marginTop: 3 }}>
                  {origin} is queued and runs the moment this completes.
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ flex: 1 }} />
          <div
            data-testid="checkout-terms"
            style={{ display: "flex", gap: 22, fontSize: 11.5, color: "#64748B" }}
          >
            <span>Cancel any time</span>
            <span>Payments by Stripe</span>
            <span>Terms</span>
            <span>Privacy</span>
          </div>
        </section>

        <section
          style={{
            padding: "56px 60px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {creds.ok ? (
            <div
              ref={mount.mountRef}
              data-testid="stripe-payment-element"
              aria-label="Stripe payment mount"
              style={{
                minHeight: 220,
                maxHeight: "min(420px, 50dvh)",
                overflowY: "auto",
                borderRadius: 6,
                border: "1px dashed rgba(154,166,178,0.28)",
                background: "rgba(20,25,33,0.6)",
              }}
            />
          ) : (
            <div
              data-testid="checkout-mount-error"
              style={{ fontSize: 13.5, color: "#FBBF24", lineHeight: 1.45 }}
            >
              {mount.error}
            </div>
          )}
          {creds.ok && mount.error ? (
            <div
              data-testid="checkout-mount-error"
              style={{ fontSize: 13.5, color: "#FBBF24", lineHeight: 1.45 }}
            >
              {mount.error}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 6,
              borderTop: "0.5px solid rgba(154,166,178,0.2)",
            }}
          >
            <span style={{ fontSize: 13, color: MUTED }}>Total due today</span>
            <span
              data-testid="checkout-total"
              style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20 }}
            >
              {dueToday}
            </span>
          </div>
          <p
            data-testid="checkout-wallet-note"
            style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.45 }}
          >
            {PE_PRICING.walletHonestDecline}
          </p>
          <button
            type="button"
            data-testid="checkout-submit"
            disabled={!mount.canSubmit}
            onClick={() => {
              void mount.submit(checkoutReturnUrl(q.parcelNodeId));
            }}
            style={{
              height: 48,
              borderRadius: 6,
              background: BLUE,
              border: "none",
              fontSize: 15,
              fontWeight: 700,
              color: TEXT,
              opacity: mount.canSubmit ? 1 : 0.55,
              cursor: mount.canSubmit ? "pointer" : "not-allowed",
              fontFamily: FONT,
            }}
          >
            {submit}
          </button>
        </section>
      </div>
    </div>
  );
}
