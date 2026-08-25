// $15 unlock modal chrome (WDLL item 5). Stripe Payment Element in the
// slot. Do not invent card/email/ZIP fields.

import { PE_PRICING } from "../lib/pricing";
import { resolveCheckoutMountCredentials } from "../lib/stripeCheckoutMount";
import { useStripeCheckoutMount } from "../lib/useStripeCheckoutMount";
import { UNLOCK_PRICE, UNLOCK_SUBMIT } from "./checkoutCopy";

const TEXT = "#F8FAFC";
const MUTED = "#94A3B8";
const BLUE = "#3B82F6";
const FONT =
  "var(--font-body, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";
const DISPLAY =
  "var(--font-display, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";

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
        background: "rgba(6,9,13,0.72)",
        padding: 16,
      }}
    >
      <div
        data-testid="unlock-checkout-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 470,
          maxWidth: "100%",
          borderRadius: 12,
          background: "rgba(17,21,28,0.96)",
          border: "0.5px solid rgba(59,130,246,0.28)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
          color: TEXT,
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            padding: "20px 22px 16px",
            borderBottom: "0.5px solid rgba(154,166,178,0.2)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
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
              style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 20 }}
            >
              {situs}
            </span>
            <span
              data-testid="unlock-checkout-price"
              style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22 }}
            >
              {UNLOCK_PRICE}
            </span>
          </div>
          <div data-testid="unlock-checkout-window" style={{ fontSize: 12.5, color: MUTED }}>
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
              style={{
                minHeight: 88,
                borderRadius: 6,
                border: "1px dashed rgba(154,166,178,0.28)",
                background: "rgba(20,25,33,0.9)",
              }}
            />
          ) : (
            <div
              data-testid="checkout-mount-error"
              style={{ fontSize: 13, color: "#FBBF24", lineHeight: 1.45 }}
            >
              {mount.error}
            </div>
          )}
          {creds.ok && mount.error ? (
            <div
              data-testid="checkout-mount-error"
              style={{ fontSize: 13, color: "#FBBF24", lineHeight: 1.45 }}
            >
              {mount.error}
            </div>
          ) : null}
          <button
            type="button"
            data-testid="unlock-checkout-submit"
            disabled={!mount.canSubmit}
            onClick={() => {
              void mount.submit(unlockReturnUrl(parcelNodeId ?? null));
            }}
            style={{
              height: 44,
              borderRadius: 6,
              background: BLUE,
              border: "none",
              fontSize: 14,
              fontWeight: 700,
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
