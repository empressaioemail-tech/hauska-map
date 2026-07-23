// apps/property-explorer/src/App.tsx
//
// Empressa Property Explorer — the map-first consumer shell.
//
// COLD OPEN: the LIVE map boots FIRST (anonymous, no auth), full-bleed. A
// sign-up card floats over it with the real app DIMMED behind it via a CSS
// scrim (not a screenshot). Dismissing the card ("Continue with Google",
// or "Just browse the map") lifts the scrim into full browse. After a
// successful OIDC callback (?signed_in=1) or an existing pe_session cookie,
// cold-open is skipped.

import { useEffect, useState } from "react";
import { ExplorerMap } from "./browse/ExplorerMap";
import { SignUpCard } from "./coldopen/SignUpCard";
import { fetchSession } from "./lib/auth";
import { recordPeGtmEvent } from "./lib/gtmClient";

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

export function App() {
  const [coldOpen, setColdOpen] = useState(readInitialColdOpen);

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
        background: "#0b0e13",
        overflow: "hidden",
      }}
    >
      {/* The live map is ALWAYS mounted underneath — it boots first. */}
      <ExplorerMap />

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
                "radial-gradient(120% 90% at 50% 42%, rgba(6,9,13,0.45), rgba(6,9,13,0.82))",
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
