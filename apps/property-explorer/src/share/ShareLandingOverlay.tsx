// src/share/ShareLandingOverlay.tsx — the share landing's PERSISTENT,
// NON-BLOCKING sign-up prompt + the invalid/expired-link notice.
//
// The prompt reuses the app's EXISTING standard sign-in entry point — the same
// googleSignInUrl() anchor behind the "Sign in" affordances in
// workbench/tools/ChatTool.tsx and LockedToolPanel.tsx (an <a> to
// /api/auth/google/start; the OIDC callback lands back with ?signed_in=1).
// Nothing is gated by the prompt: the whole app stays usable behind it
// (anonymous entitlements unchanged) — pointer events only on the card.
//
// Signed-in → the prompt renders nothing (the recipient is a standard user).
// Invalid/expired link → the honest notice renders REGARDLESS of sign-in
// state, so a signed-in viewer still learns why no dossier docked.

import { googleSignInUrl } from "../lib/auth";
import { recordPeGtmEvent } from "../lib/gtmClient";
import type { SharePhase } from "./ShareView";

const CARD_BG = "rgba(13,17,23,0.94)";
const TEXT = "#e5e7eb";
const MUTED = "#9aa6b2";
const ACCENT = "#7dd3fc";
const AMBER = "#fcd34d";

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
        font: "12px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {linkBad && (
        <div
          data-testid="share-landing-notice"
          style={{
            pointerEvents: "auto",
            padding: "8px 12px",
            borderRadius: 8,
            background: CARD_BG,
            border: "1px solid rgba(252,211,77,0.45)",
            color: AMBER,
            fontSize: 11.5,
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
            borderRadius: 10,
            background: CARD_BG,
            border: "1px solid rgba(125,211,252,0.35)",
            boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
            color: TEXT,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.45 }}>
            <strong>Shared with you</strong> — sign up free to explore this and
            any property.
          </p>
          <a
            href={googleSignInUrl()}
            data-testid="share-signup-link"
            onClick={() => void recordPeGtmEvent({ eventType: "pe_signup_intent" })}
            style={{ color: ACCENT, fontSize: 12, fontWeight: 600 }}
          >
            Sign up free with Google
          </a>
          <p style={{ margin: "6px 0 0", fontSize: 10, color: MUTED }}>
            Browsing the map stays free — no account needed to look around.
          </p>
        </div>
      )}
    </div>
  );
}
