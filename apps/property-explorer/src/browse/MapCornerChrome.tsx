// apps/property-explorer/src/browse/MapCornerChrome.tsx
//
// Map corner chrome for the browse surface (REBRAND map-chrome cluster,
// 2026-08-03):
//
//  - SmartSiteBadge — the lower-left corner brand chip (Smart Site crosshair
//    mark + wordmark). This is the ONLY thing in the lower-left now; the old
//    transient scroll notifications (TransientChips) were removed as redundant
//    chrome (the inspect card already carries the honest-absence signal).
//
//  - MapSourceInfo — the REQUIRED source/attribution tag, moved from the
//    lower-left (and from the fading transient toasts) to a small circular ⓘ
//    bubble in the LOWER-RIGHT next to the layers bubble. Collapsed by default;
//    clicking the ⓘ expands the attribution. Styled to match the layers bubble
//    (same 44px circle / border / shadow / panel chrome). The ⓘ uses
//    --brand-blue per the design system (blue = info affordance).
//
// Colors come from pe-tokens.css design tokens; no data is fabricated — the
// source lines are the live provenance strings the map already computed.

import { useState } from "react";

/** PANEL chrome matched to the lower-right layers bubble (MapToolset). */
const PANEL_BG = "rgba(13,17,23,0.9)";
const PANEL_BORDER = "0.5px solid rgba(154,166,178,0.28)";

/**
 * Lower-left Smart Site brand chip. Static, non-interactive; pointer-events
 * none so it never eats a map click. Uses the crosshair mark + SMART SITE
 * wordmark (gold "SITE" per the brand lockup).
 */
export function SmartSiteBadge({ isMobile }: { isMobile: boolean }) {
  return (
    <div
      data-testid="smart-site-badge"
      aria-label="Smart Site"
      style={{
        position: "absolute",
        left: 12,
        bottom: isMobile ? 68 : 12,
        zIndex: 8,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 10px",
        borderRadius: 8,
        background: PANEL_BG,
        border: PANEL_BORDER,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <svg
        viewBox="0 0 76 76"
        width={18}
        height={18}
        aria-hidden="true"
        fill="none"
      >
        <circle cx="38" cy="38" r="30" stroke="#F8FAFC" strokeWidth={5} />
        <circle cx="38" cy="38" r="7" fill="var(--brand-gold, #E8963B)" />
        <line x1="38" y1="0" x2="38" y2="16" stroke="#F8FAFC" strokeWidth={5} />
        <line x1="38" y1="60" x2="38" y2="76" stroke="#F8FAFC" strokeWidth={5} />
        <line x1="0" y1="38" x2="16" y2="38" stroke="#F8FAFC" strokeWidth={5} />
        <line x1="60" y1="38" x2="76" y2="38" stroke="#F8FAFC" strokeWidth={5} />
      </svg>
      <span
        style={{
          fontFamily:
            "'Oxygen', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontWeight: 700,
          fontSize: 11.5,
          letterSpacing: 0.5,
          color: "#F8FAFC",
          whiteSpace: "nowrap",
        }}
      >
        SMART <span style={{ color: "var(--brand-gold-light, #F5B95C)" }}>SITE</span>
      </span>
    </div>
  );
}

/**
 * Lower-right collapsible source/attribution bubble. Collapsed by default into
 * a circular ⓘ button that matches the layers bubble chrome; clicking expands
 * the source lines panel upward. Renders nothing when there are no source lines
 * to disclose (never an empty affordance).
 */
export function MapSourceInfo({
  lines,
  isMobile,
}: {
  lines: string[];
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (isMobile) return null; // the layers sheet owns the lower-right on mobile
  if (lines.length === 0) return null;

  return (
    <div
      data-testid="map-source-info"
      style={{
        position: "absolute",
        // sit just above the layers bubble (bottom:16 / 44px tall) in the same
        // lower-right column so the two bubbles stack, not overlap.
        right: 12,
        bottom: 68,
        zIndex: 11,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* The expanded attribution panel — matches the layers panel chrome. */}
      <div
        data-testid="map-source-info-panel"
        style={{
          display: open ? "flex" : "none",
          width: 210,
          flexDirection: "column",
          gap: 5,
          padding: "10px 12px",
          borderRadius: 9,
          background: PANEL_BG,
          border: PANEL_BORDER,
          boxShadow: "0 10px 32px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--brand-blue, #3B82F6)",
            marginBottom: 2,
          }}
        >
          Sources
        </div>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 11,
              lineHeight: 1.35,
              color: "var(--surface-muted, #94A3B8)",
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* The ⓘ bubble — always visible, toggles the panel. Same size/shape/
          chrome as the layers bubble; the glyph uses --brand-blue (info). */}
      <button
        type="button"
        data-testid="map-source-info-bubble"
        aria-label={open ? "Hide data sources" : "Show data sources"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: PANEL_BORDER,
          background: open ? "rgba(59,130,246,0.18)" : PANEL_BG,
          color: "var(--brand-blue, #3B82F6)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={22}
          height={22}
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  );
}
