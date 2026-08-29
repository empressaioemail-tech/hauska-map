// Mobile layout constants + pure layout rules for PE browse chrome.
//
// Breakpoint: viewports narrower than PE_MOBILE_BREAKPOINT_PX use the
// bottom-nav + single-sheet panel model. Desktop (>= breakpoint) keeps the
// existing absolute-positioned panels unchanged.

import type { CSSProperties } from "react";
// ONE z-order table for the whole map chrome, shared with the renderer package
// (packages/map-renderer/src/chrome/panelLayering.ts). Before W4 this file and
// four others hand-wrote z-index literals with no table saying which panel wins.
import { MAP_PANEL_Z } from "../../../../packages/map-renderer/src/chrome/panelLayering";

export { MAP_PANEL_Z };

/** Mobile vs tablet/desktop split — tests pin 390px (iPhone-class). */
export const PE_MOBILE_BREAKPOINT_PX = 768;

/** Fixed bottom navigation bar height (px). */
export const PE_MOBILE_NAV_HEIGHT_PX = 52;

/** Mobile research tool-picker strip above the nav (px). */
export const PE_MOBILE_PICKER_HEIGHT_PX = 46;

/** Search bar + safe top margin reserved above sheets (px). */
export const PE_MOBILE_SEARCH_CHROME_PX = 64;

export type MobileSheetId = "map" | "property" | "research" | "layers";

/** Which sheet wins when multiple panels want to open (single-tenancy). */
export function resolveMobileSheetConflict(
  current: MobileSheetId,
  incoming: MobileSheetId,
): MobileSheetId {
  if (incoming === "map") return "map";
  if (current === incoming) return current;
  return incoming;
}

/** Workbench dock placement — desktop preserves the original top-right box. */
export function dockLayoutStyle(
  isExpanded: boolean,
  isMobile: boolean,
): CSSProperties {
  if (isMobile) {
    if (isExpanded) {
      return {
        position: "fixed",
        top: PE_MOBILE_SEARCH_CHROME_PX,
        left: 0,
        right: 0,
        bottom: PE_MOBILE_NAV_HEIGHT_PX,
        width: "100%",
        maxHeight: "none",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.55)",
        borderRadius: "12px 12px 0 0",
      };
    }
    return {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: PE_MOBILE_NAV_HEIGHT_PX + PE_MOBILE_PICKER_HEIGHT_PX,
      top: "auto",
      width: "100%",
      maxHeight: `min(72vh, calc(100vh - ${PE_MOBILE_SEARCH_CHROME_PX + PE_MOBILE_NAV_HEIGHT_PX + PE_MOBILE_PICKER_HEIGHT_PX}px))`,
      boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
      borderRadius: "12px 12px 0 0",
    };
  }

  // WIDE is a property of the COLUMN, not of one dock.
  //
  // It used to lift a single dock out of the column into a fixed floating box
  // at a different width and offset, which meant it LANDED ON TOP of the docks
  // still in the column. Now the column itself widens: every open dock is
  // 100% of it, so they all grow and shrink together and none of them can
  // overlap another.
  //
  // Same top and the same right:74, so the column stays anchored to the rail
  // and grows LEFTWARD into the map. Same height budget as compact — the only
  // thing that changes is width.
  if (isExpanded) {
    // THE COLUMN STOPS BEFORE THE FIND BAR. Expanded, it used to grow to 860
    // and slide under the search bar, which shares this top band. The bar is
    // not allowed to move (operator, 2026-08-28, after a version that did),
    // so the column yields instead.
    //
    // The arithmetic, so the next person can check it rather than trust it:
    //   12  bar left inset
    //  436  bar width
    //   12  channel between bar and column
    //   74  right gutter the column already anchors to
    //  ---
    //  534  taken out of the viewport before the column gets any
    //
    // CLAMPED AT BOTH ENDS on purpose: never narrower than the 380 compact
    // width (a naive subtraction goes below it under a 914px viewport, which
    // would make the expand control shrink the column), never wider than the
    // 860 ceiling it always had.
    //
    // clamp(), NOT max(380px, min(860px, calc(...))). The nested form shipped
    // first and did not render at all: the column fell back to width:auto and
    // shrink-to-fit, which lands near 855 and looks deceptively like the old
    // 860 — so it read as "the deploy did not take" rather than as a broken
    // value. The old expression was min(calc()) with no nesting, which is why
    // this was the new variable. clamp is the same three numbers with none of
    // the nesting.
    return {
      top: 12,
      right: 74,
      width: "clamp(380px, calc(100vw - 534px), 860px)",
      maxHeight: "calc(100vh - 28px)",
    };
  }
  // ONE dock width for every tool, so the stack has one left edge no matter
  // which bubble opened it. Widened 340 -> 380 on operator ruling 2026-08-27.
  //
  // right:74 — CORRECTED 2026-08-28. It was 66, which I described as leaving
  // "the same 8px channel", and the arithmetic does not say that: the rail
  // capsule is 48 wide (34 bubble + 2x6 padding + 2x1 border) at right:18, so
  // it occupies 18 through 66. A dock at right:66 is FLUSH against it, gap
  // zero, which is what the operator saw. 18 + 48 + 8 = 74 is the number that
  // actually produces the 8px channel, the same one that separates two
  // stacked docks from each other.
  return {
    top: 12,
    right: 74,
    width: "min(380px, calc(100vw - 98px))",
    maxHeight: "calc(100vh - 28px)",
  };
}

/** Cluster placement — desktop top-right column; mobile hidden (nav owns tools). */
export function workbenchClusterStyle(isMobile: boolean): CSSProperties {
  if (isMobile) {
    return { display: "none" };
  }
  // KIT 04 CAPSULE. The rail is no longer seven separate bubbles each carrying
  // its own border and shadow — it is ONE floating glass container holding
  // seven transparent circles. That is why the bubbles below have no edge of
  // their own: the capsule owns the edge, so the rail reads as a single object
  // instead of a column of seven.
  //
  // TOP-ANCHORED, DIRECTLY UNDER THE MAPLIBRE ZOOM CONTROL, and sharing a
  // centre line with it (operator, 2026-08-27 — back where it sat before the
  // kit-04 pass moved it to the middle).
  //
  // The geometry: the capsule is 48 wide (34 bubble + 2x6 padding + 2x1
  // border) at right:18, so its centre sits at right:42. The zoom control is
  // pulled to the SAME centre in pe-tokens.css rather than the capsule being
  // pushed out to meet it — centring a 48px capsule under a 32px control at
  // the default right:10 would have left the capsule at right:1, flush to the
  // viewport edge. The control moves 16px; the rail keeps a sane inset.
  //
  // top:110 clears that control (top:10 + three 30px buttons + borders = 102)
  // with the same 8px channel every other pair of floating things uses.
  return {
    position: "absolute",
    top: 110,
    right: 18,
    zIndex: MAP_PANEL_Z.toolset,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 6px",
    borderRadius: 999,
    background: "var(--ss-ink-92)",
    border: "1px solid rgba(255,255,255,.09)",
    boxShadow: "0 10px 34px rgba(0,0,0,.5)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
  };
}

/** Horizontal tool picker shown inside the mobile research sheet header. */
export function mobileToolPickerStyle(): CSSProperties {
  return {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: PE_MOBILE_NAV_HEIGHT_PX,
    zIndex: MAP_PANEL_Z.overlay,
    display: "flex",
    flexWrap: "nowrap",
    gap: 6,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "8px 12px",
    borderTop: "1px solid var(--ss-line-14)",
    background: "var(--ss-ink)",
  };
}

/** Desktop workbench docks share the left column and shrink as more open. */
export function leftDockStackStyle(): CSSProperties {
  return {
    position: "absolute",
    top: 12,
    left: 12,
    bottom: "max(148px, 38vh)",
    width: "min(360px, calc(100vw - 72px))",
    zIndex: MAP_PANEL_Z.card,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    pointerEvents: "none",
  };
}

export function leftDockCardStyle(): CSSProperties {
  return {
    pointerEvents: "auto",
    flex: "1 1 0",
    minHeight: 96,
    width: "100%",
  };
}

/** Inspect card — desktop embeds in the brief dock; mobile is the property sheet. */
export function inspectCardShellStyle(
  isMobile: boolean,
  embedded = false,
): CSSProperties {
  if (isMobile || embedded) {
    return {
      position: "relative",
      width: "100%",
      maxWidth: "none",
      top: "auto",
      left: "auto",
      zIndex: "auto",
      boxShadow: "none",
      borderRadius: 0,
      border: "none",
      padding: embedded && !isMobile ? 0 : "12px 14px 16px",
    };
  }
  return {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: MAP_PANEL_Z.card,
    width: 288,
    maxWidth: "calc(100% - 60px)",
    padding: "13px 15px",
    borderRadius: 14,
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
    border: "0.5px solid var(--ss-blue-line)",
  };
}

/** Search bar wrapper — stays pinned top on mobile; dropdown becomes sheet-like. */
export function searchBarWrapStyle(isMobile: boolean): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: MAP_PANEL_Z.overlay,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    pointerEvents: "auto",
  };
  if (isMobile) {
    return {
      ...base,
      width: "calc(100vw - 16px)",
      maxWidth: "none",
    };
  }
  // v2 find bar: 436 wide, dropping 6px to its suggestion list.
  //
  // IT STAYS CENTRED ON THE VIEWPORT AND DOES NOT MOVE. A version that shrank
  // around the expanded workbench column shipped on 2026-08-28 and was pulled
  // the same day: the operator did not want the bar relocating as docks open
  // and close. The overlap it addressed is real — an expanded column can sit
  // over the bar — but a bar that moves is the worse of the two. Left here so
  // the next person knows this was tried, not overlooked.
  return {
    ...base,
    width: "min(436px, calc(100vw - 24px))",
  };
}

/** Suggest dropdown on mobile — fills space below the bar without overlapping panels. */
export function searchDropdownStyle(isMobile: boolean): CSSProperties {
  const base: CSSProperties = {
    borderRadius: "var(--ss-r-float)",
    background: "var(--ss-ink-96)",
    border: "1px solid var(--ss-line-14)",
    boxShadow: "var(--ss-sh-dock)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    // The list opens its own height from the top edge of the bar it hangs
    // from: 220ms of height, 140ms of opacity, 180ms of the 2% scale.
    transformOrigin: "top center",
    animation:
      "ss-suggest-in var(--ss-d-move) var(--ss-ease) both",
  };
  if (isMobile) {
    return {
      ...base,
      maxHeight: `calc(100vh - ${PE_MOBILE_SEARCH_CHROME_PX + PE_MOBILE_NAV_HEIGHT_PX}px)`,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    };
  }
  return base;
}

/** Transient chips sit above the bottom nav on mobile. */
export function transientChipsStyle(isMobile: boolean): CSSProperties {
  if (isMobile) {
    return {
      position: "absolute",
      left: 12,
      bottom: PE_MOBILE_NAV_HEIGHT_PX + 8,
      zIndex: MAP_PANEL_Z.ambient,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 5,
      pointerEvents: "none",
      maxWidth: "calc(100vw - 24px)",
    };
  }
  return {
    position: "absolute",
    left: 12,
    bottom: 12,
    zIndex: MAP_PANEL_Z.ambient,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 5,
    pointerEvents: "none",
  };
}

/** Map toolset floating bubble — hidden on mobile (layers tab owns it). */
export function mapToolsetRootStyle(isMobile: boolean): CSSProperties {
  if (isMobile) {
    return { display: "none" };
  }
  return {
    position: "absolute",
    bottom: 16,
    right: 12,
    zIndex: MAP_PANEL_Z.toolset,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
  };
}

/** Embedded layers panel inside the mobile layers sheet. */
export function embeddedToolsetPanelStyle(): CSSProperties {
  return {
    display: "flex",
    width: "100%",
    flexDirection: "column",
    gap: 9,
    padding: "10px 12px 16px",
    color: "#e6edf3",
    fontSize: 12.5,
    maxHeight: `calc(100vh - ${PE_MOBILE_SEARCH_CHROME_PX + PE_MOBILE_NAV_HEIGHT_PX}px)`,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
  };
}

/* ------------------------------------------------------------------ */
/* Mobile sheet dismissal — the pure rule, so it is testable in node.  */
/* ------------------------------------------------------------------ */

/**
 * One element on the path from the clicked node up to the sheet root. The DOM
 * adapter in MobilePanelContext builds these; the RULE below is pure so it can
 * be proven able to fire in a node test with no browser (DEV_PROCESS 2.2 — a
 * gate that has never been shown to fire is not a gate).
 */
export interface SheetClickNode {
  /** Lowercased tag name, e.g. "button". */
  tag: string;
  /** Element carries `data-sheet-dismiss` — always collapses the sheet. */
  dismiss?: boolean;
  /** Element carries `data-sheet-keep-open` — never collapses the sheet. */
  keepOpen?: boolean;
  /**
   * Element declares `aria-expanded` or `aria-pressed`: it is a STATE TOGGLE,
   * not a selection. Collapsing the sheet under a disclosure would hide the
   * thing the user just asked to see.
   */
  stateful?: boolean;
}

/** Controls that change something IN PLACE — a sheet must stay open for them. */
const IN_PLACE_TAGS = new Set(["input", "select", "textarea", "label", "option"]);

/** Controls that ACT — pressing one is the "selection" the operator meant. */
const ACTION_TAGS = new Set(["button", "a", "summary"]);

/**
 * Should a click inside a mobile sheet collapse it?
 *
 * `chain` runs target-first, outward, stopping at the sheet root. The first
 * node that matches a rule decides; a click that matches nothing (plain text,
 * padding, a scroll drag) leaves the sheet open.
 *
 * Operator, verbatim: "In the mobile version when i pull up the menus and make
 * a selection the menu needs to collapse."
 */
export function shouldDismissSheetOnClick(chain: SheetClickNode[]): boolean {
  // A keep-open marker ANYWHERE on the path wins, so a whole region can opt
  // out with one attribute instead of every control inside it.
  if (chain.some((node) => node.keepOpen)) return false;
  for (const node of chain) {
    if (node.dismiss) return true;
    const tag = node.tag.toLowerCase();
    if (IN_PLACE_TAGS.has(tag)) return false;
    if (ACTION_TAGS.has(tag)) return !node.stateful;
  }
  return false;
}

/** Tapping the tab you are already on collapses its sheet. */
export function nextSheetOnToggle(
  current: MobileSheetId,
  incoming: MobileSheetId,
): MobileSheetId {
  if (current === incoming) return "map";
  return resolveMobileSheetConflict(current, incoming);
}

/**
 * The navigation guard. A selection inside a sheet collapses THAT sheet, but
 * only if nothing has navigated since: an in-sheet control that opened another
 * sheet (InspectCard's Research button opens the research sheet) must keep its
 * result. Applied one tick after the click, against the CURRENT sheet.
 */
export function nextSheetOnDismiss(
  current: MobileSheetId,
  from: MobileSheetId,
): MobileSheetId {
  return current === from ? "map" : current;
}
