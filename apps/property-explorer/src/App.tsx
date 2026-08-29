// apps/property-explorer/src/App.tsx
//
// Smart Site (Property Explorer) — the map-first consumer shell.
//
// COLD OPEN: the LIVE map boots FIRST (anonymous, no auth), full-bleed. A
// sign-up card floats over it with the real app DIMMED behind it via a CSS
// scrim (not a screenshot). Dismissing the card ("Sign in with Google",
// or "Just browse the map") lifts the scrim into full browse. After a
// successful OIDC callback (?signed_in=1) or an existing pe_session cookie,
// cold-open is skipped.

import { useEffect, useState } from "react";
import { ExplorerMap } from "./browse/ExplorerMap";
import { SignUpCard } from "./coldopen/SignUpCard";
import { ShareFunnelApp } from "./share/ShareFunnelApp";
import {
  defaultShareStash,
  resolveShareLanding,
  type ShareLanding,
} from "./share/share-landing";
import { fetchSession } from "./lib/auth";
import { claimAnonymousStateOnSignIn } from "./lib/claimClient";
import { recordPeGtmEvent } from "./lib/gtmClient";
import { usePostCheckoutRefresh } from "./lib/usePostCheckoutRefresh";
import { CheckoutSuccessCard } from "./checkout/CheckoutSuccessCard";
import { SubscriptionCheckoutModal } from "./checkout/SubscriptionCheckoutModal";
import {
  checkoutPageHref,
  consumeCheckoutDeepLink,
  parsePendingCheckout,
  stripPendingCheckoutFromUrl,
} from "./checkout/checkoutLanding";
import { useCheckoutActions } from "./browse/useCheckoutActions";
import { fromCheckoutInterval } from "./lib/pricing";
import { PE } from "./styles/pe-chrome";

const COLD_OPEN_DISMISSED_KEY = "pe_cold_open_dismissed";

function readInitialColdOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(COLD_OPEN_DISMISSED_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("signed_in") === "1") return false;
  // Mid-checkout-flow / just returned from Stripe — already engaged, never
  // bury the reconcile behind the cold-open sign-up card.
  if (params.get("checkout") === "success") return false;
  if (params.get("peCheckout") === "1") return false;
  // Deep-link / share URLs open inspect immediately — don't bury under cold-open.
  if (
    params.get("parcelNodeId")?.trim() ||
    params.get("parcel")?.trim() ||
    params.get("address")?.trim()
  ) {
    return false;
  }
  return true;
}

function stripSignedInParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("signed_in")) return;
  url.searchParams.delete("signed_in");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

/** This load's share landing, resolved ONCE at module-app boot: /share#<token>
 *  (URL shape unchanged — existing links keep working), bare /share (honest
 *  invalid), or a post-sign-in restore (?signed_in=1 + stashed token). */
function readShareLanding(): ShareLanding | null {
  if (typeof window === "undefined") return null;
  return resolveShareLanding(window.location, defaultShareStash());
}

function rewriteCheckoutDeepLink(): void {
  if (typeof window === "undefined") return;
  const consumed = consumeCheckoutDeepLink({
    pathname: window.location.pathname,
    search: window.location.search,
  });
  if (!consumed) return;
  window.history.replaceState({}, "", consumed.mapHref);
}

export function App() {
  // SHARE FUNNEL: /share#<token> loads the FULL map app (not the old
  // standalone read-only page) — flight to the shared property, read-only
  // dossier docked in the workbench, persistent sign-up prompt. See
  // src/share/ShareFunnelApp.tsx. Everything below (hooks included) belongs
  // to the normal map app only.
  const [shareLanding] = useState<ShareLanding | null>(readShareLanding);
  if (shareLanding) {
    return <ShareFunnelApp landing={shareLanding} />;
  }
  // /checkout?tier= rewrites onto the map. Never a bare checkout page.
  const [rewrote] = useState(() => {
    rewriteCheckoutDeepLink();
    return true;
  });
  void rewrote;
  return <MapApp />;
}

function CheckoutDeepLinkHost() {
  const pending =
    typeof window !== "undefined"
      ? parsePendingCheckout(window.location.search)
      : null;
  const {
    handleSubscription,
    subscriptionSession,
    dismissSubscription,
    note,
  } = useCheckoutActions(pending?.parcelNodeId ?? null, {
    situsAddress: pending?.situs ?? null,
  });

  useEffect(() => {
    if (!pending) return;
    const href = stripPendingCheckoutFromUrl(window.location.href);
    window.history.replaceState({}, "", href);
    void handleSubscription(
      pending.tier,
      fromCheckoutInterval(pending.interval),
    );
    // Start once for this boot's pending query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (subscriptionSession) {
    return (
      <SubscriptionCheckoutModal
        search={checkoutPageHref({
          tier: subscriptionSession.tier,
          interval: subscriptionSession.interval,
          parcelNodeId: subscriptionSession.parcelNodeId,
          situs: subscriptionSession.situs,
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
  if (note) {
    return (
      <div
        data-testid="checkout-deeplink-note"
        role="status"
        style={{
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 40,
          padding: "8px 16px",
          borderRadius: 12,
          background: PE.panelLight,
          border: "0.5px solid color-mix(in oklab, var(--ss-warn) 50%, transparent)",
          color: PE.warn,
          fontFamily: "system-ui, sans-serif",
          fontSize: 14.5,
        }}
      >
        {note.text}
      </div>
    );
  }
  return null;
}

function MapApp() {
  const [coldOpen, setColdOpen] = useState(readInitialColdOpen);
  const [successDismissed, setSuccessDismissed] = useState(false);
  // WDLL item 7 — clears the entitlement cache and reconciles the post-Stripe
  // state; renders an honest "confirming" note while `checking`.
  const checkoutStatus = usePostCheckoutRefresh();

  useEffect(() => {
    void recordPeGtmEvent({ eventType: "pe_browse_started" });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromCallback = params.get("signed_in") === "1";
    if (fromCallback) {
      try {
        sessionStorage.setItem(COLD_OPEN_DISMISSED_KEY, "1");
      } catch {
        /* ignore */
      }
      setColdOpen(false);
      stripSignedInParam();
      // WDLL item 6 — claim this browser's anonymous install history + any
      // local-only workbench state onto the freshly authenticated user.
      // Never blocks or reverts sign-in on failure (see claimClient.ts).
      void claimAnonymousStateOnSignIn();
      return;
    }

    let cancelled = false;
    void fetchSession().then((session) => {
      if (cancelled || !session.authenticated) return;
      try {
        sessionStorage.setItem(COLD_OPEN_DISMISSED_KEY, "1");
      } catch {
        /* ignore */
      }
      setColdOpen(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissColdOpen = () => {
    try {
      sessionStorage.setItem(COLD_OPEN_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setColdOpen(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: PE.ink,
        overflow: "hidden",
      }}
    >
      {/* The live map is ALWAYS mounted underneath — it boots first. */}
      <ExplorerMap />
      <CheckoutDeepLinkHost />

      {checkoutStatus === "checking" && (
        <div
          data-testid="checkout-reconcile-banner"
          role="status"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 40,
            padding: "8px 16px",
            borderRadius: 999,
            background: PE.panelLight,
            border: "0.5px solid color-mix(in oklab, var(--ss-blue) 40%, transparent)",
            color: PE.t2,
            fontFamily: "system-ui, sans-serif",
            fontSize: 14.5,
          }}
        >
          Confirming your purchase…
        </div>
      )}

      {!successDismissed &&
        (checkoutStatus === "confirmed" || checkoutStatus === "timeout") && (
          <CheckoutSuccessCard
            status={checkoutStatus}
            onDismiss={() => setSuccessDismissed(true)}
          />
        )}

      {coldOpen && (
        <>
          {/* CSS scrim dimming the LIVE map (halftone real app, not a shot). */}
          <div
            data-testid="cold-open-scrim"
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 15,
              background:
                "radial-gradient(120% 90% at 50% 42%, color-mix(in oklab, var(--ss-void) 45%, transparent), color-mix(in oklab, var(--ss-void) 82%, transparent))",
              backdropFilter: "blur(1.5px) saturate(0.9)",
              pointerEvents: "auto",
            }}
          />
          <SignUpCard onDismiss={dismissColdOpen} />
        </>
      )}
    </div>
  );
}
