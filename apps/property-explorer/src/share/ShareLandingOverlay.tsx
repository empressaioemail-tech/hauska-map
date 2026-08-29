// src/share/ShareLandingOverlay.tsx — the share landing's PERSISTENT,
// NON-BLOCKING sign-up prompt + the invalid/expired-link notice.
//
// The prompt reuses GoogleSignInButton — the same /api/auth/google/start
// entry ChatTool and LockedToolPanel use.
// Nothing is gated by the prompt: the whole app stays usable behind it
// (anonymous entitlements unchanged) — pointer events only on the card.
//
// Signed-in → the prompt renders nothing (the recipient is a standard user).
// Invalid/expired link → the honest notice renders REGARDLESS of sign-in
// state, so a signed-in viewer still learns why no dossier docked.

import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { PE } from "../styles/pe-chrome";
import { recordPeGtmEvent } from "../lib/gtmClient";
import type { SharePhase } from "./ShareView";

const CARD_BG = PE.panel;
const TEXT = PE.t3;
const MUTED = PE.t4;
const AMBER = PE.warn;

export function ShareLandingOverlay({
  phase,
  signedIn,
}: {
  phase: SharePhase;
  signedIn: boolean;
}) {
  const linkBad = phase.kind === "expired" || phase.kind === "invalid";
  if (!linkBad && signedIn) return null;

  return (
    <div
      data-testid="share-landing-overlay"
      style={{
        position: "absolute",
        left: 12,
        bottom: 16,
        zIndex: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(320px, calc(100vw - 90px))",
        pointerEvents: "none",
        font: "12.5px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {linkBad && (
        <div
          data-testid="share-landing-notice"
          style={{
            pointerEvents: "auto",
            padding: "8px 12px",
            borderRadius: 12,
            background: CARD_BG,
            border:
              "1px solid color-mix(in oklab, var(--ss-warn) 34%, transparent)",
            color: AMBER,
            fontSize: 12.5,
          }}
        >
          {phase.kind === "expired"
            ? "This share link has expired."
            : "This share link is invalid or has expired."}{" "}
          <span style={{ color: MUTED }}>
            Ask the sender for a fresh link — the map stays open.
          </span>
        </div>
      )}

      {!signedIn && (
        <div
          data-testid="share-signup-prompt"
          style={{
            pointerEvents: "auto",
            padding: "12px 14px",
            borderRadius: 14,
            background: CARD_BG,
            border: "1px solid var(--ss-blue-line)",
            boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
            color: TEXT,
          }}
        >
          <p
            data-testid="share-inspect-cta"
            style={{ margin: "0 0 8px", fontSize: 14.5, lineHeight: 1.45 }}
          >
            This property is open — use the inspect card.
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 14.5, lineHeight: 1.45 }}>
            <strong>Shared with you</strong> — sign up free to explore this and
            any property.
          </p>
          <GoogleSignInButton
            size="md"
            testId="share-signup-link"
            onClick={() => void recordPeGtmEvent({ eventType: "pe_signup_intent" })}
          />
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: MUTED }}>
            Browsing the map stays free — no account needed to look around.
          </p>
        </div>
      )}
    </div>
  );
}
