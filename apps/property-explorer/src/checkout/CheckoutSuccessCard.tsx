// 3b return card (WDLL item 8). Replaces checkout-reconcile-banner for
// confirmed + timeout. Timeout says confirming failed and never says paid.

import {
  readCheckoutOrigin,
  readCheckoutPurchase,
  type CheckoutPurchase,
} from "../lib/checkoutOrigin";
import { PE_PRICING } from "../lib/pricing";
import { PE } from "../styles/pe-chrome";
import { Button } from "../components/Button";

const FONT = PE.ui;
const DISPLAY = PE.ui;

export function successCardTitle(
  status: "confirmed" | "timeout",
  purchase: CheckoutPurchase | null,
): string {
  if (status === "timeout") return "Confirming failed";
  if (purchase?.kind === "unlock") return "This parcel is unlocked";
  const tier = purchase?.tier ?? "studio";
  return `${PE_PRICING[tier].title} is active`;
}

export function successCardBody(
  status: "confirmed" | "timeout",
  purchase: CheckoutPurchase | null,
  originLabel: string | null,
): string {
  if (status === "timeout") {
    return "We could not confirm this purchase. Refresh or open Billing. This screen does not treat a timeout as complete.";
  }
  const situs = purchase?.situs?.trim();
  if (originLabel) {
    return situs
      ? `${originLabel} for ${situs} is generating now.`
      : `${originLabel} is generating now.`;
  }
  if (purchase?.kind === "unlock" && situs) {
    return `All reports on ${situs} are unlocked for ${PE_PRICING.property.durationDays} days.`;
  }
  return "Receipt is on the way. Open reports to keep working.";
}

export function CheckoutSuccessCard({
  status,
  purchase,
  originLabel,
  onOpenReports,
  onBilling,
  onDismiss,
}: {
  status: "confirmed" | "timeout";
  purchase?: CheckoutPurchase | null;
  originLabel?: string | null;
  onOpenReports?: () => void;
  onBilling?: () => void;
  onDismiss?: () => void;
}) {
  const resolvedPurchase = purchase !== undefined ? purchase : readCheckoutPurchase();
  const resolvedOrigin =
    originLabel !== undefined ? originLabel : readCheckoutOrigin()?.label ?? null;
  const title = successCardTitle(status, resolvedPurchase);
  const body = successCardBody(status, resolvedPurchase, resolvedOrigin);
  // Paid is green, confirming-failed is red. The card NEVER says paid on a
  // timeout — the register is the whole message here.
  const border =
    status === "timeout"
      ? "1px solid color-mix(in oklab, var(--ss-err) 34%, transparent)"
      : "1px solid color-mix(in oklab, var(--ss-ok) 34%, transparent)";

  return (
    <div
      data-testid="checkout-success-card"
      data-status={status}
      role="status"
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 40,
        width: 470,
        maxWidth: "calc(100vw - 32px)",
        borderRadius: PE.rModal,
        background: PE.modalBg,
        border,
        boxShadow: PE.shModal,
        padding: "20px 20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 13,
        fontFamily: FONT,
        color: PE.t3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background:
              status === "timeout"
                ? "color-mix(in oklab, var(--ss-err) 13%, transparent)"
                : "color-mix(in oklab, var(--ss-ok) 13%, transparent)",
            border:
              status === "timeout"
                ? "1px solid color-mix(in oklab, var(--ss-err) 34%, transparent)"
                : "1px solid color-mix(in oklab, var(--ss-ok) 34%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: status === "timeout" ? PE.err : PE.ok,
            fontSize: 15.5,
          }}
        >
          {status === "timeout" ? "!" : "✓"}
        </div>
        <span
          data-testid="checkout-success-title"
          style={{
            fontFamily: DISPLAY,
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: "-.01em",
            color: status === "timeout" ? PE.err : PE.ok,
          }}
        >
          {title}
        </span>
      </div>
      <div
        data-testid="checkout-success-receipt"
        style={{ fontSize: 14.5, color: PE.t3, lineHeight: 1.55 }}
      >
        {body}
      </div>
      {resolvedOrigin && status === "confirmed" ? (
        <div data-testid="checkout-success-job" style={{ fontSize: 12.5, color: PE.t5 }}>
          Queued: {resolvedOrigin}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <Button
          variant="primary"
          fullWidth
          type="button"
          data-testid="checkout-success-open-reports"
          onClick={onOpenReports}
          style={{ flex: 1 }}
        >
          Open reports
        </Button>
        <Button
          variant="secondary"
          type="button"
          data-testid="checkout-success-billing"
          onClick={onBilling}
        >
          Billing
        </Button>
      </div>
      {onDismiss ? (
        <button
          type="button"
          data-testid="checkout-success-dismiss"
          onClick={onDismiss}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            color: PE.t5,
            fontSize: 12.5,
            cursor: "pointer",
            padding: 0,
            fontFamily: FONT,
          }}
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
