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
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { recordPeGtmEvent } from "../lib/gtmClient";

const CARD_BG = "rgba(17, 21, 28, 0.92)";
const ACCENT = "var(--brand-blue, #3B82F6)"; // PRIMARY interactive hue (was cyan #7dd3fc)

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
          width: "min(420px, calc(100vw - 32px))",
          padding: "28px 28px 24px",
          borderRadius: 16,
          background: CARD_BG,
          border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          color: "#e9eef5",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          backdropFilter: "blur(2px)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: ACCENT,
            marginBottom: 14,
          }}
        >
          SMART SITE
        </div>

        <h1
          style={{
            margin: "0 0 14px",
            fontSize: 24,
            lineHeight: 1.22,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          See what you can build on Texas parcels — where data is verified.
        </h1>

        <ul
          style={{
            listStyle: "none",
            margin: "0 0 22px",
            padding: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {[
            "Browse the map and inspect card free — zoning, setbacks, flood, and buildable envelope when verified.",
            "Save properties and share analysis links at no cost — share is free for every account.",
            "Deep research, reports, and unlimited AI start at $15 per property for 30 days or Solo from $49/mo.",
          ].map((t) => (
            <li
              key={t}
              style={{
                display: "flex",
                gap: 10,
                fontSize: 14,
                lineHeight: 1.4,
                color: "#c6d0dc",
              }}
            >
              <span aria-hidden style={{ color: ACCENT, marginTop: 1 }}>
                ●
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>

        {loadError && (
          <p data-testid="auth-load-error" style={{ color: "var(--semantic-error, #EF4444)", fontSize: 13, marginBottom: 12 }}>
            {loadError}
          </p>
        )}

        {!signInConfigured && authStatus && (
          <p
            data-testid="sign-in-not-configured"
            style={{
              fontSize: 13,
              color: "#aeb8c4",
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 8,
              border: "0.5px solid var(--surface-border-rgba, rgba(154,166,178,0.3))",
              background: "rgba(0,0,0,0.2)",
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
          <button
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
          </button>
        )}

        <button
          type="button"
          data-testid="browse-instead"
          onClick={dismissBrowse}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 500,
            color: "#aeb8c4",
            background: "transparent",
            border: "0.5px solid var(--surface-border-rgba, rgba(154,166,178,0.3))",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Just browse the map
        </button>

        <p
          style={{
            margin: "14px 0 0",
            fontSize: 10.5,
            lineHeight: 1.45,
            color: "var(--surface-muted, #94A3B8)",
          }}
        >
          Coverage varies by county and city. Comal countywide land-use remains an
          honest gap on browse.
        </p>
      </div>
    </div>
  );
}

function primaryBtnStyle(busy: boolean) {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 600,
    color: "#11151c",
    background: "#ffffff",
    border: "none",
    borderRadius: 10,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.7 : 1,
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
