// Subscription payment modal — sibling of PricingModal. Map stays mounted.
// Left Smart Site copy + right Stripe Payment Element. No invented fields.

import type { CustomCheckoutSession } from "../lib/checkoutOrigin";
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
  return (
    <div
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
        background: "rgba(6,9,13,0.72)",
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
