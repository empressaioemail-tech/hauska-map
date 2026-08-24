// apps/property-explorer/src/browse/PaywallGate.tsx
//
// R1 PAYWALL — the unlock MODAL (the reactive server-402 belt). Renders the
// SAME unified two-choice unlock flow the in-dock locked states use
// (UnlockFlow.tsx) — one flow everywhere, never a different wall per bubble.
// The old Pro-hardcoded copy ("R1–R10 … Pro entitlement" + checkout-mode
// note) is REPLACED by the value line the triggering bubble passes plus the
// two purchase units from the pricing config.

import { UnlockChoices } from "./UnlockFlow";

const PANEL_BG = "var(--surface-panel-translucent, rgba(13,17,23,0.9))";
const MUTED = "var(--surface-muted, #94A3B8)";

export function PaywallGate({
  parcelNodeId,
  valueLine,
  proOnly,
  statusNote,
  onClose,
}: {
  /** The active property the unlock applies to (null → Pro checkout only). */
  parcelNodeId: string | null;
  /** What the locked capability is worth — set by the bubble that gated. */
  valueLine: string;
  /** Studio-only feature (terrain): the flow offers ONLY the Studio choice. */
  proOnly?: boolean;
  /** Honest status footnote (e.g. ICC citation licensing state). */
  statusNote?: string | null;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlock property tools"
      data-testid="paywall-gate"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,9,13,0.72)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(400px, 100%)",
          padding: "20px 18px",
          borderRadius: 12,
          background: PANEL_BG,
          border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
          color: "var(--text-strong, #e6edf3)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          {proOnly ? "This is a Studio feature" : "Unlock this property's tools"}
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.5, color: "#c6d0dc" }}>
          {valueLine}
        </p>
        <UnlockChoices
          parcelNodeId={parcelNodeId}
          proOnly={proOnly}
          onUnlocked={onClose}
        />
        {statusNote ? (
          <p
            data-testid="paywall-status-note"
            style={{ margin: "10px 0 0", fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
          >
            {statusNote}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 8,
            border: "0.5px solid rgba(154,166,178,0.35)",
            background: "transparent",
            color: MUTED,
            cursor: "pointer",
          }}
        >
          Keep browsing — the map and inspect card stay free
        </button>
      </div>
    </div>
  );
}
