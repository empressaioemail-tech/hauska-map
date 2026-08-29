// apps/property-explorer/src/coldopen/SignUpCard.tsx
//
// Cold-open sign-up card over the live dimmed map. Google + Microsoft OIDC
// when env is configured; honest "sign-in not configured" when secrets missing.
// "Just browse" stays anonymous — no auth required.

import { useEffect, useState } from "react";
import {
  fetchAuthStatus,
  googleSignInUrl,
  microsoftSignInUrl,
  type AuthStatus,
} from "../lib/auth";
import { Button } from "../components/Button";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { recordPeGtmEvent } from "../lib/gtmClient";
import { PE } from "../styles/pe-chrome";

const CARD_BG = PE.modalBg;

export function SignUpCard({ onDismiss }: { onDismiss: () => void }) {
  const [busy, setBusy] = useState<"google" | "microsoft" | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthStatus()
      .then(setAuthStatus)
      .catch(() => setLoadError("Could not reach auth status"));
  }, []);

  const dismissBrowse = () => {
    void recordPeGtmEvent({ eventType: "pe_cold_open_dismissed" });
    onDismiss();
  };

  const startGoogle = () => {
    if (!authStatus?.configured.google) return;
    setBusy("google");
    void recordPeGtmEvent({ eventType: "pe_signup_intent" });
    window.location.href = googleSignInUrl();
  };

  const startMicrosoft = () => {
    if (!authStatus?.configured.microsoft) return;
    setBusy("microsoft");
    void recordPeGtmEvent({ eventType: "pe_signup_intent" });
    window.location.href = microsoftSignInUrl();
  };

  const signInConfigured = authStatus?.anyProvider ?? false;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Get started"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        data-testid="signup-card"
        style={{
          pointerEvents: "auto",
          width: "min(460px, calc(100vw - 32px))",
          padding: "26px 26px 22px",
          borderRadius: PE.rModal,
          background: CARD_BG,
          border: `1px solid ${PE.line28}`,
          boxShadow: PE.shModal,
          color: PE.t2,
          fontFamily: PE.ui,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginBottom: 16,
          }}
        >
          <svg viewBox="0 0 76 76" width={26} height={26} aria-hidden fill="none">
            <circle cx="38" cy="38" r="30" stroke={PE.t1} strokeWidth={5} />
            <circle cx="38" cy="38" r="7" fill={PE.gold} />
            <line x1="38" y1="0" x2="38" y2="16" stroke={PE.t1} strokeWidth={5} />
            <line x1="38" y1="60" x2="38" y2="76" stroke={PE.t1} strokeWidth={5} />
            <line x1="0" y1="38" x2="16" y2="38" stroke={PE.t1} strokeWidth={5} />
            <line x1="60" y1="38" x2="76" y2="38" stroke={PE.t1} strokeWidth={5} />
          </svg>
          <span
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              letterSpacing: ".16em",
              color: PE.t1,
            }}
          >
            SMART <span style={{ color: PE.goldLt }}>SITE</span>
          </span>
        </div>

        <h1
          style={{
            margin: "0 0 16px",
            fontSize: 32,
            lineHeight: 1.2,
            fontWeight: 700,
            letterSpacing: "-.02em",
            color: PE.t1,
          }}
        >
          See what you can build on Texas parcels — where data is verified.
        </h1>

        <ul
          style={{
            listStyle: "none",
            margin: "0 0 20px",
            padding: 0,
            display: "grid",
            gap: 0,
          }}
        >
          {[
            "Browse the map and inspect card free — zoning, setbacks, flood, and buildable envelope when verified.",
            "Save properties and share analysis links at no cost — share is free for every account.",
            "Deep research, reports, and unlimited AI start at $15 per property for 30 days or Solo from $49/mo.",
          ].map((t, i) => (
            <li
              key={t}
              style={{
                fontSize: 14.5,
                lineHeight: 1.55,
                color: PE.t3,
                padding: i === 0 ? "0 0 10px" : "10px 0",
                borderTop: i === 0 ? "none" : `1px solid ${PE.line06}`,
              }}
            >
              {t}
            </li>
          ))}
        </ul>

        {loadError && (
          <p data-testid="auth-load-error" style={{ color: PE.err, fontSize: 14.5, marginBottom: 12 }}>
            {loadError}
          </p>
        )}

        {!signInConfigured && authStatus && (
          <p
            data-testid="sign-in-not-configured"
            style={{
              fontSize: 14.5,
              lineHeight: 1.45,
              color: PE.t4,
              marginBottom: 14,
              padding: "12px 13px",
              borderRadius: PE.rTip,
              border: `1px dashed ${PE.line28}`,
              background: "color-mix(in oklab, var(--ss-slate) 7%, transparent)",
            }}
          >
            Sign-in is not configured on this deploy yet. You can browse the map anonymously.
          </p>
        )}

        {authStatus?.configured.google && (
          <GoogleSignInButton
            size="lg"
            variant="light"
            fullWidth
            pending={busy === "google"}
            testId="continue-google"
            onClick={startGoogle}
          />
        )}

        {authStatus?.configured.microsoft && (
          <Button
            type="button"
            data-testid="continue-microsoft"
            onClick={startMicrosoft}
            disabled={busy !== null}
            style={{
              ...primaryBtnStyle(busy === "microsoft"),
              marginTop: authStatus?.configured.google ? 10 : 0,
            }}
          >
            <MicrosoftGlyph />
            {busy === "microsoft" ? "Redirecting…" : "Continue with Microsoft"}
          </Button>
        )}

        <Button
          variant="secondary"
          fullWidth
          type="button"
          data-testid="browse-instead"
          onClick={dismissBrowse}
          style={{ marginTop: 10 }}
        >
          Just browse the map
        </Button>

        <p
          style={{
            margin: "14px 0 0",
            fontSize: 12.5,
            lineHeight: 1.45,
            color: PE.t5,
          }}
        >
          Coverage varies by county and city. Comal countywide land-use remains an
          honest gap on browse.
        </p>
      </div>
    </div>
  );
}

/** Microsoft's own dark brand button (#2F2F2F on white text, unmodified
 *  four-square glyph). It is deliberately NOT the white slab: the Google
 *  button above it is the one filled primary on this surface. */
function primaryBtnStyle(busy: boolean) {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    height: 44,
    fontSize: 15.5,
    fontWeight: 600,
    fontFamily: PE.ui,
    color: "#FFFFFF",
    background: "#2F2F2F",
    border: `1px solid ${PE.line28}`,
    borderRadius: 10,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.45 : 1,
  } as const;
}

function MicrosoftGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden focusable="false">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
