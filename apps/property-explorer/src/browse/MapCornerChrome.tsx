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
//  - MapSourceInfo — the REQUIRED source/attribution tag AND the single
//    attribution place for the map (the map-renderer no longer mounts MapLibre's
//    AttributionControl on the PE mount path, so the two attribution UIs no
//    longer pile up in the lower-right corner). A small circular ⓘ bubble in the
//    LOWER-RIGHT, BESIDE (to the left of) the layers bubble on the same row.
//    Collapsed by default; clicking the ⓘ expands the panel, which shows the
//    live per-parcel/layer provenance PLUS the required basemap/imagery credit
//    (© OSM / © CARTO, Esri World Imagery). Styled to match the layers bubble
//    (same 44px circle / border / shadow / panel chrome). The ⓘ uses
//    --brand-blue per the design system (blue = info affordance).
//
// Colors come from pe-tokens.css design tokens; no data is fabricated — the
// source lines are the live provenance strings the map already computed.

import { useState } from "react";
import { BubbleTip } from "../components/BubbleTip";
import { PE } from "../styles/pe-chrome";
import { SATELLITE_ATTRIBUTION } from "./satelliteBase";

/** PANEL chrome matched to the lower-right layers bubble (MapToolset). */
const PANEL_BG = "rgba(13,17,23,0.9)";
const PANEL_BORDER = "0.5px solid rgba(154,166,178,0.28)";

// REQUIRED tile/basemap attribution — folded here so this ⓘ "Sources" panel is
// the SINGLE attribution place for the map. The map-renderer no longer mounts
// MapLibre's AttributionControl on the PE mount path (suppressAttributionControl),
// so these credits must live in the app chrome. OSM (ODbL) and the CARTO basemap
// terms require the © OSM / © CARTO credit whenever the basemap is shown (always);
// Esri's terms require the imagery credit whenever World Imagery CAN be shown.
// Both basemaps are always mountable on this surface, so both are always credited
// (always-showing the required credit is safe + compliant, per the design ruling).
const BASEMAP_ATTRIBUTION = "© OpenStreetMap © CARTO";
// SATELLITE_ATTRIBUTION = "Imagery: Esri, Maxar, Earthstar Geographics, GIS User
// Community" — the exact string the suppressed MapLibre control used to carry.
const REQUIRED_ATTRIBUTION_LINES = [BASEMAP_ATTRIBUTION, SATELLITE_ATTRIBUTION];

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
            "var(--font-display, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)",
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
  variant = "corner",
}: {
  lines: string[];
  isMobile: boolean;
  /** `stack` sits in the left map-utility column (no absolute corner pin). */
  variant?: "corner" | "stack";
}) {
  const [open, setOpen] = useState(false);
  if (isMobile) return null; // the layers sheet owns the lower-right on mobile
  // NOTE: no early-return on empty `lines` — the REQUIRED tile/basemap
  // attribution below must always be reachable, so the ⓘ bubble always renders.

  const stacked = variant === "stack";

  return (
    <div
      data-testid="map-source-info"
      style={{
        position: stacked ? "relative" : "absolute",
        ...(stacked
          ? {}
          : { right: 64, bottom: 16, zIndex: 11 }),
        display: "flex",
        flexDirection: "column",
        alignItems: stacked ? "flex-start" : "flex-end",
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

        {/* REQUIRED tile/basemap attribution — the single attribution place
            (the MapLibre control is suppressed on this mount path). Separated
            from the live provenance lines by a hairline so it reads as the
            standing basemap/imagery credit, not per-parcel provenance. */}
        <div
          data-testid="map-source-info-attribution"
          style={{
            marginTop: lines.length > 0 ? 6 : 0,
            paddingTop: lines.length > 0 ? 6 : 0,
            borderTop: lines.length > 0 ? PANEL_BORDER : "none",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {REQUIRED_ATTRIBUTION_LINES.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                lineHeight: 1.35,
                color: "var(--surface-muted, #94A3B8)",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      <BubbleTip
        side={stacked ? "right" : "left"}
        label="Notifications"
        detail="Sources, credits, and layer honesty notes."
      >
      <button
        type="button"
        data-testid="map-source-info-bubble"
        aria-label={open ? "Hide notifications" : "Notifications"}
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
          width={20}
          height={20}
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </button>
      </BubbleTip>
    </div>
  );
}

export function MapLegendBubble({
  rows,
}: {
  rows: Array<{ key: string; label: string; note?: string }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-testid="map-legend"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
      }}
    >
      {open ? (
        <div
          data-testid="map-legend-panel"
          style={{
            width: 210,
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
              color: PE.accent,
              marginBottom: 8,
            }}
          >
            Legend
          </div>
          {rows.length === 0 ? (
            <div style={{ fontSize: 11, color: PE.muted }}>
              No layers on. Open Layers to turn some on.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.key}
                style={{
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: PE.text,
                  padding: "3px 0",
                }}
              >
                {row.label}
                {row.note ? (
                  <div style={{ fontSize: 10, color: PE.muted }}>{row.note}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
      <BubbleTip
        side="right"
        label="Legend"
        detail="What is drawn on the map right now."
      >
        <button
          type="button"
          data-testid="map-legend-bubble"
          aria-label={open ? "Hide legend" : "Legend"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: PANEL_BORDER,
            background: open ? "rgba(59,130,246,0.18)" : PANEL_BG,
            color: open ? "var(--brand-blue, #3B82F6)" : "#e6edf3",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h16M4 12h10M4 18h7" />
            <circle cx="18" cy="12" r="2" />
            <circle cx="15" cy="18" r="2" />
          </svg>
        </button>
      </BubbleTip>
    </div>
  );
}
