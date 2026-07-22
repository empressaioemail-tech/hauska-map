// apps/property-explorer/src/App.tsx
//
// Empressa Property Explorer — the map-first consumer shell.
//
// COLD OPEN: the LIVE map boots FIRST (anonymous, no auth), full-bleed. A
// sign-up card floats over it with the real app DIMMED behind it via a CSS
// scrim (not a screenshot). Dismissing the card ("Continue with Google" stub,
// or "Just browse the map") lifts the scrim into full anonymous browse.
//
// Empressa brand only — zero "Hauska" strings in user-facing text.

import { useEffect, useState } from "react";
import { ExplorerMap } from "./browse/ExplorerMap";
import { SignUpCard } from "./coldopen/SignUpCard";
import { recordPeGtmEvent } from "./lib/gtmClient";

export function App() {
  const [coldOpen, setColdOpen] = useState(true);

  useEffect(() => {
    void recordPeGtmEvent({ eventType: "pe_browse_started" });
  }, []);

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
          <SignUpCard onDismiss={() => setColdOpen(false)} />
        </>
      )}
    </div>
  );
}
