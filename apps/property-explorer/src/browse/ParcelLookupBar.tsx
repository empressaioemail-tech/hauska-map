// Single front-door lookup: parcel node id OR street address → parent opens inspect.

import { useState, type FormEvent, type CSSProperties } from "react";

export interface ParcelLookupBarProps {
  busy?: boolean;
  error?: string | null;
  onSubmit: (query: string) => void;
  /** Prefill from deep-link once (controlled by parent if needed). */
  initialValue?: string;
}

const wrap: CSSProperties = {
  position: "absolute",
  top: 12,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 12,
  width: "min(440px, calc(100vw - 24px))",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  pointerEvents: "auto",
};

const form: CSSProperties = {
  display: "flex",
  gap: 6,
  padding: 6,
  borderRadius: 8,
  background: "rgba(13,17,23,0.92)",
  border: "1px solid rgba(154,166,178,0.4)",
  boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
};

const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#e5e7eb",
  font: "13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  padding: "6px 8px",
};

const button: CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
  font: "600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  color: "#0b0e13",
  background: "#7dd3fc",
};

const hint: CSSProperties = {
  font: "11px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  color: "#9aa6b2",
  padding: "0 4px",
};

const errStyle: CSSProperties = {
  ...hint,
  color: "#fcd34d",
};

export function ParcelLookupBar({
  busy = false,
  error = null,
  onSubmit,
  initialValue = "",
}: ParcelLookupBarProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    onSubmit(q);
  };

  return (
    <div data-testid="parcel-lookup-bar" style={wrap}>
      <form style={form} onSubmit={handleSubmit}>
        <input
          data-testid="parcel-lookup-input"
          type="search"
          name="parcel-lookup"
          placeholder="Parcel id (48209:156346) or address"
          aria-label="Find parcel by id or address"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          style={input}
          autoComplete="street-address"
        />
        <button
          data-testid="parcel-lookup-submit"
          type="submit"
          disabled={busy || !value.trim()}
          style={{
            ...button,
            opacity: busy || !value.trim() ? 0.55 : 1,
            cursor: busy || !value.trim() ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "…" : "Find"}
        </button>
      </form>
      {error ? (
        <div data-testid="parcel-lookup-error" style={errStyle}>
          {error}
        </div>
      ) : (
        <div style={hint}>Opens the inspect card for that parcel (atom path when available).</div>
      )}
    </div>
  );
}
