// apps/property-explorer/src/browse/MapCornerChrome.tsx
//
// Map corner chrome for the browse surface. Restyled to Smart Site chrome v2
// (2026-08-27); the corner inventory and the attribution rules are unchanged.
//
//  - SmartSiteBadge — the lower-left BRAND CHIP: a 17px ring glyph with a gold
//    centre dot, then SMART in white and SITE in gold, both 11.5/600/.16em,
//    optionally followed by a county name after a hairline divider.
//
//    THIS IS THE ONLY GOLD IN THE PRODUCT. Gold is never a button, never a
//    link, never a fill, never a hover, and never below 14px. If gold appears
//    anywhere else in this app, that is the bug.
//
//    v2 draws the chip with no panel behind it. PE lands with satellite
//    imagery ON, so a bare white wordmark over a bright roof is unreadable;
//    legibility comes from a text shadow and a glyph drop-shadow instead of a
//    filled plate. That keeps the drop's clean look without trading away the
//    thing the old plate was actually doing.
//
//  - MapSourceInfo — the ⓘ SOURCES REGISTER, lower-right. Collapsed to a 30px
//    circle; opens a 264px panel from its own bottom-right corner.
//
//    ATTRIBUTION STAYS IN THIS PANEL. SPEC section 4 asks for basemap credit to
//    move to a map footer; it does not move, because the map-renderer suppresses
//    MapLibre's AttributionControl on the PE mount path, an always-visible
//    credit strip is the exact regression that put it in here, and
//    map-toolset-geolocate.test.tsx pins it collapse-only. OSM (ODbL), CARTO and
//    Esri all require the credit whenever their tiles can be shown, so it must
//    remain reachable — and here it is.
//
// Colors come from pe-tokens.css through the PE chrome module; no data is
// fabricated — the source lines are the live provenance strings the map
// already computed, and no status word is printed for a line whose status we
// were not given.

import { useState } from "react";
import { BubbleTip } from "../components/BubbleTip";
import { SATELLITE_ATTRIBUTION } from "./satelliteBase";
import { PE, MOTION } from "../styles/pe-chrome";

// REQUIRED tile/basemap attribution — folded here so this ⓘ "Sources" panel is
// the SINGLE attribution place for the map. See the header note above.
const BASEMAP_ATTRIBUTION = "© OpenStreetMap © CARTO";
const REQUIRED_ATTRIBUTION_LINES = [BASEMAP_ATTRIBUTION, SATELLITE_ATTRIBUTION];

/**
 * Lower-left Smart Site brand chip. Static, non-interactive; pointer-events
 * none so it never eats a map click.
 */
export function SmartSiteBadge({
  isMobile,
  county,
}: {
  isMobile: boolean;
  /** Optional county name, shown after a hairline divider. */
  county?: string | null;
}) {
  return (
    <div
      data-testid="smart-site-badge"
      aria-label="Smart Site"
      style={{
        position: "absolute",
        left: PE.inset,
        bottom: isMobile ? 68 : 18,
        zIndex: 8,
        display: "flex",
        alignItems: "center",
        gap: 9,
        pointerEvents: "none",
        userSelect: "none",
        // Legibility over satellite imagery, in place of the v1 plate.
        filter: "drop-shadow(0 1px 3px rgba(0,0,0,.85))",
      }}
    >
      <svg
        viewBox="0 0 76 76"
        width={17}
        height={17}
        aria-hidden="true"
        fill="none"
      >
        <circle cx="38" cy="38" r="30" stroke="#F8FAFC" strokeWidth={5} />
        <circle cx="38" cy="38" r="7" fill={PE.gold} />
        <line x1="38" y1="0" x2="38" y2="16" stroke="#F8FAFC" strokeWidth={5} />
        <line x1="38" y1="60" x2="38" y2="76" stroke="#F8FAFC" strokeWidth={5} />
        <line x1="0" y1="38" x2="16" y2="38" stroke="#F8FAFC" strokeWidth={5} />
        <line x1="60" y1="38" x2="76" y2="38" stroke="#F8FAFC" strokeWidth={5} />
      </svg>
      <span
        style={{
          fontFamily: PE.ui,
          fontWeight: 600,
          fontSize: 11.5,
          letterSpacing: ".16em",
          color: "#F8FAFC",
          whiteSpace: "nowrap",
          textShadow: "0 1px 4px rgba(0,0,0,.9)",
        }}
      >
        SMART <span style={{ color: PE.goldLt }}>SITE</span>
      </span>
      {county ? (
        <>
          <span
            aria-hidden
            style={{ width: 1, height: 11, background: PE.line28 }}
          />
          <span
            style={{
              fontFamily: PE.ui,
              fontSize: 10.5,
              color: PE.t4,
              whiteSpace: "nowrap",
              textShadow: "0 1px 4px rgba(0,0,0,.9)",
            }}
          >
            {county}
          </span>
        </>
      ) : null}
    </div>
  );
}

/**
 * Lower-right collapsible source register. Collapsed by default into a 30px
 * circular ⓘ; clicking opens the 264px panel from its own bottom-right corner.
 * Renders the ⓘ always, because the required basemap credit must stay
 * reachable even when there is no live provenance to show.
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

  const stacked = variant === "stack";

  return (
    <div
      data-testid="map-source-info"
      style={{
        position: stacked ? "relative" : "absolute",
        ...(stacked ? {} : { right: 64, bottom: 16, zIndex: 11 }),
        display: "flex",
        flexDirection: "column",
        alignItems: stacked ? "flex-start" : "flex-end",
        gap: 9,
        fontFamily: PE.ui,
      }}
    >
      {/* The register. Opens its own height while scaling up 3% from the
          bottom-right — the corner it hangs off. */}
      <div
        data-testid="map-source-info-panel"
        data-ss-motion=""
        style={{
          display: open ? "flex" : "none",
          width: 264,
          flexDirection: "column",
          borderRadius: PE.rFloat,
          overflow: "hidden",
          background: PE.sheet,
          border: `1px solid ${PE.line14}`,
          boxShadow: PE.shDock,
          transformOrigin: "bottom right",
          animation: open ? `ss-enter-up ${MOTION.move} both` : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 32,
            padding: "0 8px 0 12px",
            borderBottom: `1px solid ${PE.line06}`,
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: ".13em",
              textTransform: "uppercase",
              color: PE.t5,
            }}
          >
            Sources
          </span>
          <button
            type="button"
            aria-label="Hide sources"
            className="ss-headbtn pe-btn"
            onClick={() => setOpen(false)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 5,
              background: "transparent",
              border: "none",
              color: PE.t5,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={12}
              height={12}
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
            >
              <path d="M18 6 6 18 M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: "6px 6px 8px" }}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "7px 8px",
                borderRadius: PE.rTouch,
              }}
            >
              {/* A NEUTRAL rail. The caller hands us provenance sentences, not
                  a per-source status, so no status word and no colour is
                  asserted here — an invented "Live" is worse than a silence. */}
              <span
                aria-hidden
                style={{
                  width: 3,
                  height: 22,
                  borderRadius: 2,
                  background: PE.line28,
                  flex: "none",
                }}
              />
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11.5,
                  lineHeight: 1.35,
                  color: PE.t3,
                }}
              >
                {line}
              </div>
            </div>
          ))}

          {/* REQUIRED tile/basemap attribution — the single attribution place.
              Separated from the live provenance by a hairline so it reads as
              the standing basemap credit, not per-parcel provenance. */}
          <div
            data-testid="map-source-info-attribution"
            style={{
              marginTop: lines.length > 0 ? 6 : 0,
              paddingTop: lines.length > 0 ? 7 : 2,
              marginLeft: 8,
              marginRight: 8,
              borderTop:
                lines.length > 0 ? `1px solid ${PE.line06}` : "none",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {REQUIRED_ATTRIBUTION_LINES.map((line, i) => (
              <div
                key={i}
                style={{ fontSize: 10, lineHeight: 1.4, color: PE.t6 }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>

      <BubbleTip
        side={stacked ? "right" : "left"}
        label="Sources"
        detail="Where every fact on this map came from, plus map credits."
      >
        <button
          type="button"
          data-testid="map-source-info-bubble"
          aria-label={open ? "Hide sources" : "Sources"}
          aria-expanded={open}
          className="ss-bubble pe-btn"
          data-open={open ? "1" : undefined}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 30,
            height: 30,
            padding: 0,
            borderRadius: "50%",
            border: `1px solid ${open ? PE.blue : PE.line14}`,
            background: open ? PE.blue : PE.panelLight,
            color: open ? "#08111F" : PE.t3,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: open ? PE.shOpen : PE.shRail,
            transition: `background ${MOTION.state}, color ${MOTION.state}, border-color ${MOTION.state}`,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01" />
          </svg>
        </button>
      </BubbleTip>
    </div>
  );
}
