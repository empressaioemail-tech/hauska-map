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

import { BubbleTip } from "../components/BubbleTip";
import { Button } from "../components/Button";
import { SATELLITE_ATTRIBUTION } from "./satelliteBase";
import { PE, MOTION } from "../styles/pe-chrome";

// REQUIRED tile/basemap attribution — folded here so this ⓘ "Sources" panel is
// the SINGLE attribution place for the map. See the header note above.
const BASEMAP_ATTRIBUTION = "© OpenStreetMap © CARTO";
const REQUIRED_ATTRIBUTION_LINES = [BASEMAP_ATTRIBUTION, SATELLITE_ATTRIBUTION];

/**
 * The FIPS comes off the county name on the brand chip.
 *
 * `card.county` is composed as "Bastrop County (48021)" in sheet-to-card.ts,
 * and that is RIGHT for the inspect card's County row, which is an identity
 * row where the code earns its place. On the brand chip it is noise beside a
 * wordmark. Stripped here rather than at the source so the identity row keeps
 * it. Pure and exported, so the rule is testable.
 */
export function countyDisplayName(county: string | null | undefined): string | null {
  if (!county) return null;
  const trimmed = county.trim();
  if (!trimmed) return null;
  // Only a trailing parenthesised FIPS — never a general paren strip, which
  // would eat a legitimate name like "Doña Ana County (formerly ...)".
  return trimmed.replace(/\s*\(\d{4,6}\)$/, "").trim() || null;
}

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
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        height: 34,
        padding: "0 13px",
        // Kit 04 gives the chip a plate back, as GLASS. The v2 text-shadow
        // solved legibility over satellite but left the mark floating; the
        // pill sits it on the same glass language as the rails and the
        // tooltips, and holds against imagery without a hard fill.
        borderRadius: 17,
        background: "rgba(11,14,19,.78)",
        border: "1px solid rgba(255,255,255,.09)",
        boxShadow: "0 10px 34px rgba(0,0,0,.5)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <svg
        viewBox="0 0 76 76"
        width={17}
        height={17}
        aria-hidden="true"
        fill="none"
      >
        <circle cx="38" cy="38" r="30" stroke={PE.t1} strokeWidth={5} />
        <circle cx="38" cy="38" r="7" fill={PE.gold} />
        <line x1="38" y1="0" x2="38" y2="16" stroke={PE.t1} strokeWidth={5} />
        <line x1="38" y1="60" x2="38" y2="76" stroke={PE.t1} strokeWidth={5} />
        <line x1="0" y1="38" x2="16" y2="38" stroke={PE.t1} strokeWidth={5} />
        <line x1="60" y1="38" x2="76" y2="38" stroke={PE.t1} strokeWidth={5} />
      </svg>
      <span
        style={{
          fontFamily: PE.ui,
          fontWeight: 600,
          fontSize: 11.5,
          letterSpacing: ".16em",
          color: PE.t1,
          whiteSpace: "nowrap",
          flex: "none",
        }}
      >
        SMART <span style={{ color: PE.goldLt }}>SITE</span>
      </span>
      {countyDisplayName(county) ? (
        <>
          <span
            aria-hidden
            style={{
              width: 1,
              height: 12,
              background: "rgba(255,255,255,.16)",
              flex: "none",
            }}
          />
          <span
            style={{
              fontFamily: PE.ui,
              fontSize: 11.5,
              fontWeight: 600,
              color: PE.t2,
              whiteSpace: "nowrap",
            }}
          >
            {countyDisplayName(county)}
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
// SPLIT IN TWO, 2026-08-28. The bubble belongs in the left CAPSULE with the
// other three tools; the panel belongs in the left COLUMN with the other two
// panels. While one component owned both, the panel could only float beside
// its own bubble — which is why sources and the legend hung loose over the map
// instead of joining the stack. The open state lifts to the caller so the two
// halves can live in two different containers.

/** The circular tool bubble. Lives in the left capsule. */
export function SourcesBubble({
  open,
  onToggle,
  side = "right",
}: {
  open: boolean;
  onToggle: () => void;
  side?: "left" | "right";
}) {
  return (
    <BubbleTip side={side} label="Sources">
      <button
        type="button"
        data-testid="map-source-info-bubble"
        aria-label={open ? "Hide sources" : "Sources"}
        aria-expanded={open}
        className="ss-bubble pe-btn"
        data-open={open ? "1" : undefined}
        onClick={onToggle}
        style={{
          width: 34,
          height: 34,
          padding: 0,
          borderRadius: "50%",
          border: "none",
          background: open ? "rgba(255,255,255,.14)" : "transparent",
          color: open ? PE.blue : "rgba(255,255,255,.58)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "none",
          transition: `background ${MOTION.state}, color ${MOTION.state}`,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
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
  );
}

/**
 * SETTINGS — the fifth capsule bubble. Opens the standalone Settings popup
 * (account, plan, connections, team), a peer of the pricing and checkout
 * modals rather than a dock tool: none of it is property-scoped, so putting
 * it in the workbench would have tied account settings to whether a parcel
 * happened to be selected.
 */
export function SettingsBubble({
  onOpen,
  side = "right",
}: {
  onOpen: () => void;
  side?: "left" | "right";
}) {
  return (
    <BubbleTip side={side} label="Settings">
      <button
        type="button"
        data-testid="map-settings-bubble"
        aria-label="Settings"
        className="ss-bubble pe-btn"
        onClick={onOpen}
        style={{
          width: 34,
          height: 34,
          padding: 0,
          borderRadius: "50%",
          border: "none",
          background: "transparent",
          color: "rgba(255,255,255,.58)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "none",
          transition: `background ${MOTION.state}, color ${MOTION.state}`,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </BubbleTip>
  );
}

/**
 * The source register. Lives in the left column as a panel among panels, so it
 * shares that column's width, its scroll and its collapse behaviour.
 *
 * ATTRIBUTION STAYS HERE. The renderer suppresses MapLibre's own control on
 * this mount path and OSM, CARTO and Esri all require the credit to remain
 * reachable, so it sits below a hairline as the standing basemap credit rather
 * than as per-parcel provenance.
 */
export function SourcesPanel({
  lines,
  onClose,
}: {
  lines: string[];
  onClose: () => void;
}) {
  return (
    <div
      data-testid="map-source-info-panel"
      data-ss-motion=""
      className="pe-scroll ss-enter-up"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        flex: "0 0 auto",
        maxHeight: "46vh",
        overflowY: "auto",
        borderRadius: 10,
        background: PE.sheet,
        border: `1px solid ${PE.line14}`,
        boxShadow: "0 10px 32px rgba(0,0,0,.45)",
        fontFamily: PE.ui,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          // 36 and the uppercase 11/600 title, matching StackPanel on the
          // left and the dock header on the right. One header treatment for
          // every panel in the product.
          height: 36,
          padding: "0 8px 0 12px",
          borderBottom: `1px solid ${PE.line06}`,
          flex: "0 0 auto",
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: PE.sheet,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: PE.t3,
          }}
        >
          Sources
        </span>
        <Button
          type="button"
          aria-label="Hide sources"
          className="ss-headbtn pe-btn"
          onClick={onClose}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: 6,
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
        </Button>
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
            {/* A NEUTRAL rail. The caller hands us provenance sentences, not a
                per-source status, so no status word and no colour is asserted
                here — an invented "Live" is worse than a silence. */}
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

        <div
          data-testid="map-source-info-attribution"
          style={{
            marginTop: lines.length > 0 ? 6 : 0,
            paddingTop: lines.length > 0 ? 7 : 2,
            marginLeft: 8,
            marginRight: 8,
            borderTop: lines.length > 0 ? `1px solid ${PE.line06}` : "none",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {REQUIRED_ATTRIBUTION_LINES.map((line, i) => (
            <div key={i} style={{ fontSize: 10, lineHeight: 1.4, color: PE.t6 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
