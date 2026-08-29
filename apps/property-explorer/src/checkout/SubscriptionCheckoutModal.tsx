// Subscription payment modal — sibling of PricingModal. Map stays mounted.
// Left Smart Site copy + right Stripe Payment Element. No invented fields.

import { useRef } from "react";
import type { CustomCheckoutSession } from "../lib/checkoutOrigin";
import { useDialogFocus } from "../components/useDialogFocus";
import { CheckoutPage } from "./CheckoutPage";

export function SubscriptionCheckoutModal({
  search,
  session,
  originLabel,
  onClose,
}: {
  search?: string;
  session?: CustomCheckoutSession | null;
  originLabel?: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Subscribe"
      data-testid="subscription-checkout-scrim"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ss-scrim, rgba(6,9,13,.74))",
        padding: 16,
      }}
    >
      <div
        data-testid="subscription-checkout-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <CheckoutPage
          search={search}
          session={session}
          originLabel={originLabel}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
