// $15 unlock modal chrome (WDLL item 5). Stripe Payment Element in the
// slot. Do not invent card/email/ZIP fields.

import { PE_PRICING } from "../lib/pricing";
import { resolveCheckoutMountCredentials } from "../lib/stripeCheckoutMount";
import { useStripeCheckoutMount } from "../lib/useStripeCheckoutMount";
import { UNLOCK_PRICE, UNLOCK_SUBMIT } from "./checkoutCopy";

import { PE } from "../styles/pe-chrome";

const TEXT = PE.t1;
const MUTED = PE.t5;
const BLUE = PE.blue;
const FONT = PE.ui;
const DISPLAY = PE.ui;

function unlockReturnUrl(parcelNodeId: string | null): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://smartsite.cloud";
  return `${origin}/?checkout=success${
    parcelNodeId ? `&parcelNodeId=${encodeURIComponent(parcelNodeId)}` : ""
  }`;
}

export function UnlockCheckoutModal({
  situs,
  onClose,
  clientSecret,
  publishableKey,
  parcelNodeId,
}: {
  situs: string;
  onClose: () => void;
  clientSecret?: string | null;
  publishableKey?: string | null;
  parcelNodeId?: string | null;
}) {
  const creds = resolveCheckoutMountCredentials({ clientSecret, publishableKey });
  const mount = useStripeCheckoutMount({ clientSecret, publishableKey });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlock this property"
      data-testid="unlock-checkout-scrim"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PE.scrim,
        padding: 16,
      }}
    >
      <div
        data-testid="unlock-checkout-modal"
        className="pe-scroll"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 470,
          maxWidth: "100%",
          maxHeight: "calc(100dvh - 24px)",
          overflowY: "auto",
          borderRadius: PE.rModal,
          background: PE.modalBg,
          border: `1px solid ${PE.line28}`,
          boxShadow: PE.shModal,
          color: TEXT,
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            padding: "20px 22px 16px",
            borderBottom: `1px solid ${PE.line06}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: DISPLAY,
              fontWeight: 600,
              fontSize: 11.5,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: BLUE,
            }}
          >
            Unlock
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span
              data-testid="unlock-checkout-situs"
              style={{ fontFamily: DISPLAY, fontWeight: 300, fontSize: 26, letterSpacing: "-.02em" }}
            >
              {situs}
            </span>
            <span
              data-testid="unlock-checkout-price"
              style={{ fontFamily: PE.mono, fontWeight: 400, fontSize: 17.5, letterSpacing: "-.01em" }}
            >
              {UNLOCK_PRICE}
            </span>
          </div>
          <div data-testid="unlock-checkout-window" style={{ fontSize: 14.5, color: MUTED }}>
            All reports on this parcel, {PE_PRICING.property.durationDays} days. One charge.
          </div>
        </div>
        <div
          style={{
            padding: "18px 22px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 13,
          }}
        >
          {creds.ok ? (
            <div
              ref={mount.mountRef}
              data-testid="stripe-payment-element"
              aria-label="Stripe payment mount"
              className="pe-scroll"
              style={{
                minHeight: 88,
                maxHeight: "min(360px, 50dvh)",
                overflowY: "auto",
                borderRadius: 10,
                border: "1px dashed var(--ss-line-28)",
                background: "color-mix(in oklab, var(--ss-raised) 90%, transparent)",
              }}
            />
          ) : (
            <div
              data-testid="checkout-mount-error"
              style={{ fontSize: 15.5, color: "#FBBF24", lineHeight: 1.45 }}
            >
              {mount.error}
            </div>
          )}
          {creds.ok && mount.error ? (
            <div
              data-testid="checkout-mount-error"
              style={{ fontSize: 15.5, color: "#FBBF24", lineHeight: 1.45 }}
            >
              {mount.error}
            </div>
          ) : null}
          <p
            data-testid="unlock-wallet-note"
            style={{ margin: 0, fontSize: 14.5, color: MUTED, lineHeight: 1.45 }}
          >
            {PE_PRICING.walletHonestDecline}
          </p>
          <button
            type="button"
            data-testid="unlock-checkout-submit"
            disabled={!mount.canSubmit}
            onClick={() => {
              void mount.submit(unlockReturnUrl(parcelNodeId ?? null));
            }}
            style={{
              height: 44,
              borderRadius: 10,
              background: BLUE,
              border: "none",
              fontSize: 15.5,
              fontWeight: 600,
              color: TEXT,
              opacity: mount.canSubmit ? 1 : 0.55,
              cursor: mount.canSubmit ? "pointer" : "not-allowed",
              fontFamily: FONT,
            }}
          >
            {UNLOCK_SUBMIT}
          </button>
        </div>
      </div>
    </div>
  );
}
