import type { Persona } from "../lib/gtmClient";

const PANEL_BG = "rgba(13,17,23,0.96)";
const ACCENT = "#7dd3fc";
const MUTED = "#8b97a5";

export function PaywallGate({
  message,
  checkoutNote,
  onUpgrade,
  onClose,
  busy,
}: {
  message: string;
  checkoutNote?: string | null;
  onUpgrade: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unlock deep research"
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
          width: "min(380px, 100%)",
          padding: "20px 18px",
          borderRadius: 12,
          background: PANEL_BG,
          border: "0.5px solid rgba(125,211,252,0.35)",
          color: "#e6edf3",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
          Deep research is paywalled
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.5, color: "#c6d0dc" }}>
          {message}
        </p>
        {checkoutNote && (
          <p
            data-testid="checkout-honest-note"
            style={{ margin: "0 0 14px", fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}
          >
            {checkoutNote}
          </p>
        )}
        <button
          type="button"
          data-testid="paywall-upgrade"
          disabled={busy}
          onClick={onUpgrade}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: ACCENT,
            color: "#0d1117",
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Starting checkout…" : "Upgrade for deep research"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "0.5px solid rgba(154,166,178,0.35)",
            background: "transparent",
            color: MUTED,
            cursor: "pointer",
          }}
        >
          Keep browsing
        </button>
      </div>
    </div>
  );
}

export type { Persona };
