// apps/property-explorer/src/browse/UnlockFlow.tsx
//
// R1 PAYWALL — THE UNIFIED UNLOCK FLOW. ONE flow, TWO choices, everywhere a
// paid bubble gates (replaces the old Pro-hardcoded PaywallGate copy):
//
//   "Unlock this property — $15 · all reports + AI on this property, forever"
//   "Go Pro — $99/mo (reg. $149/mo) · unlimited everything, all properties"
//   + the many-buys→Pro nudge line.
//
// Prices come from the ONE config module (src/lib/pricing.ts) — no literals
// here. TERRAIN (and any Pro-only feature) renders the proOnly variant: ONLY
// the Pro choice, with copy saying the $15 unlock never includes it.
//
// Selecting a choice calls the billingClient seam:
//   - Pro → the EXISTING Stripe subscription checkout wiring (startPeCheckout);
//   - $15 → startPropertyUnlock: a stub seam, clearly marked "checkout wiring
//     follows" — dev-bypass environments may hit the cortex dev-unlock; prod
//     shows the honest "purchase flow coming — contact us" state. NEVER a
//     fake success.
//
// Used inline by the in-dock LockedToolPanel AND inside the PaywallGate modal
// (the reactive server-402 belt) — one flow, never a different wall per bubble.

import { useState } from "react";
import {
  startPeCheckout,
  startPropertyUnlock,
} from "../lib/billingClient";
import { invalidatePropertyEntitlement } from "../lib/entitlementClient";
import { recordPeGtmEvent } from "../lib/gtmClient";
import {
  PE_PRICING,
  proChoiceLabel,
  propertyChoiceLabel,
} from "../lib/pricing";

const TEXT = "#e5e7eb";
const MUTED = "#8b97a5";
const ACCENT = "#E8963B";
const AMBER = "#fcd34d";

const choiceButtonBase = {
  width: "100%",
  textAlign: "left" as const,
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

export function UnlockChoices({
  parcelNodeId,
  proOnly,
  proOnlyNote,
  onUnlocked,
}: {
  /** The active property (null → property choice disabled with honest copy). */
  parcelNodeId: string | null;
  /** Pro-only feature (terrain): render ONLY the Pro choice. */
  proOnly?: boolean;
  /** Copy explaining WHY only Pro (shown in place of the nudge, proOnly). */
  proOnlyNote?: string;
  /** Fires only on a REAL unlock (dev-bypass server unlock) — never faked. */
  onUnlocked?: () => void;
}) {
  const [busy, setBusy] = useState<"property" | "pro" | null>(null);
  const [note, setNote] = useState<{
    text: string;
    tone: "muted" | "amber";
  } | null>(null);

  const handleProperty = async () => {
    if (busy || !parcelNodeId) return;
    setBusy("property");
    setNote(null);
    void recordPeGtmEvent({
      eventType: "pe_upgrade_started",
      parcelNodeId,
    });
    const result = await startPropertyUnlock(parcelNodeId);
    setBusy(null);
    switch (result.kind) {
      case "unlocked":
        // REAL server-side unlock (dev-bypass) — refresh the proactive read.
        invalidatePropertyEntitlement(parcelNodeId);
        setNote({ text: "Property unlocked.", tone: "muted" });
        onUnlocked?.();
        return;
      case "coming":
        // The honest pre-payments state — never a fake success.
        setNote({ text: result.message, tone: "muted" });
        return;
      case "error":
        setNote({ text: result.message, tone: "amber" });
        return;
    }
  };

  const handlePro = async () => {
    if (busy) return;
    setBusy("pro");
    setNote(null);
    void recordPeGtmEvent({
      eventType: "pe_upgrade_started",
      parcelNodeId,
    });
    const result = await startPeCheckout({ parcelNodeId });
    setBusy(null);
    if (!result.ok) {
      setNote({ text: result.message ?? "Checkout unavailable.", tone: "amber" });
      return;
    }
    if (result.honestNote) setNote({ text: result.honestNote, tone: "muted" });
    if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
  };

  return (
    <div data-testid="unlock-choices" data-pro-only={proOnly ? "true" : "false"}>
      {!proOnly && (
        <button
          type="button"
          data-testid="unlock-property-choice"
          disabled={busy !== null || !parcelNodeId}
          onClick={() => void handleProperty()}
          style={{
            ...choiceButtonBase,
            border: "1px solid rgba(125,211,252,0.5)",
            background: "rgba(125,211,252,0.10)",
            color: TEXT,
            opacity: busy === "property" ? 0.7 : 1,
          }}
        >
          <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>
            {busy === "property" ? "Unlocking…" : propertyChoiceLabel()}
          </span>
          <span style={{ display: "block", fontSize: 11, color: MUTED }}>
            {PE_PRICING.property.blurb}
          </span>
        </button>
      )}
      <button
        type="button"
        data-testid="unlock-pro-choice"
        disabled={busy !== null}
        onClick={() => void handlePro()}
        style={{
          ...choiceButtonBase,
          marginTop: proOnly ? 0 : 8,
          border: "none",
          background: ACCENT,
          color: "#0d1117",
          opacity: busy === "pro" ? 0.7 : 1,
        }}
      >
        <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>
          {busy === "pro" ? "Starting checkout…" : proChoiceLabel()}
        </span>
        <span style={{ display: "block", fontSize: 11, color: "#22303c" }}>
          {PE_PRICING.pro.blurb}
        </span>
      </button>
      <p
        data-testid={proOnly ? "unlock-pro-only-note" : "unlock-pro-nudge"}
        style={{ margin: "8px 0 0", fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
      >
        {proOnly
          ? (proOnlyNote ??
            "This is a Pro feature — it is not part of the single-property unlock.")
          : PE_PRICING.proNudge}
      </p>
      {note && (
        <p
          data-testid="unlock-note"
          style={{
            margin: "8px 0 0",
            fontSize: 11,
            color: note.tone === "amber" ? AMBER : MUTED,
            lineHeight: 1.45,
          }}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
