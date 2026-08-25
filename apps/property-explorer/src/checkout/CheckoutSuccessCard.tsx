// 3b return card (WDLL item 8). Replaces checkout-reconcile-banner for
// confirmed + timeout. Timeout says confirming failed and never says paid.

import {
  readCheckoutOrigin,
  readCheckoutPurchase,
  type CheckoutPurchase,
} from "../lib/checkoutOrigin";
import { PE_PRICING } from "../lib/pricing";

const FONT =
  "var(--font-body, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";
const DISPLAY =
  "var(--font-display, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";

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
  const border =
    status === "timeout"
      ? "0.5px solid rgba(239,68,68,0.45)"
      : "0.5px solid rgba(16,185,129,0.35)";

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
        borderRadius: 12,
        background: "rgba(17,21,28,0.96)",
        border,
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        padding: "24px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 15,
        fontFamily: FONT,
        color: "#e5e7eb",
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
                ? "rgba(239,68,68,0.15)"
                : "rgba(16,185,129,0.15)",
            border:
              status === "timeout"
                ? "1px solid rgba(239,68,68,0.5)"
                : "1px solid rgba(16,185,129,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: status === "timeout" ? "#EF4444" : "#10B981",
            fontSize: 13,
          }}
        >
          {status === "timeout" ? "!" : "✓"}
        </div>
        <span
          data-testid="checkout-success-title"
          style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 19 }}
        >
          {title}
        </span>
      </div>
      <div
        data-testid="checkout-success-receipt"
        style={{ fontSize: 13, color: "#c6d0dc", lineHeight: 1.55 }}
      >
        {body}
      </div>
      {resolvedOrigin && status === "confirmed" ? (
        <div data-testid="checkout-success-job" style={{ fontSize: 12.5, color: "#94A3B8" }}>
          Queued: {resolvedOrigin}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          data-testid="checkout-success-open-reports"
          onClick={onOpenReports}
          style={{
            flex: 1,
            height: 42,
            borderRadius: 6,
            background: "#3B82F6",
            border: "none",
            fontSize: 13.5,
            fontWeight: 700,
            color: "#F8FAFC",
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Open reports
        </button>
        <button
          type="button"
          data-testid="checkout-success-billing"
          onClick={onBilling}
          style={{
            height: 42,
            padding: "0 16px",
            borderRadius: 6,
            border: "1px solid rgba(59,130,246,0.4)",
            background: "rgba(59,130,246,0.08)",
            fontSize: 13.5,
            color: "#e5e7eb",
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Billing
        </button>
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
            color: "#94A3B8",
            fontSize: 11.5,
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
