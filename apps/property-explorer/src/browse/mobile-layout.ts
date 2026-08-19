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

  if (isExpanded) {
    return {
      top: "5vh",
      right: "max(4vw, 54px)",
      width: "min(860px, 78vw)",
      maxHeight: "90vh",
      boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
    };
  }
  return {
    top: 12,
    right: 54,
    width: "min(400px, calc(100vw - 78px))",
    maxHeight: "calc(100vh - 28px)",
  };
}

/** Cluster placement — desktop top-right column; mobile hidden (nav owns tools). */
export function workbenchClusterStyle(isMobile: boolean): CSSProperties {
  if (isMobile) {
    return { display: "none" };
  }
  return {
    position: "absolute",
    top: 118,
    right: 12,
    zIndex: MAP_PANEL_Z.toolset,
    display: "flex",
    flexDirection: "column",
    gap: 7,
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
    borderTop: "1px solid rgba(154,166,178,0.2)",
    background: "rgba(13,17,23,0.98)",
  };
}

/** Inspect card — desktop floats top-left; mobile lives in the property sheet. */
export function inspectCardShellStyle(isMobile: boolean): CSSProperties {
  if (isMobile) {
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
      padding: "12px 14px 16px",
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
    borderRadius: 10,
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
    border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
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
  return {
    ...base,
    width: "min(440px, calc(100vw - 24px))",
  };
}

/** Suggest dropdown on mobile — fills space below the bar without overlapping panels. */
export function searchDropdownStyle(isMobile: boolean): CSSProperties {
  const base: CSSProperties = {
    borderRadius: 8,
    background: "rgba(13,17,23,0.96)",
    border: "1px solid rgba(154,166,178,0.35)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
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
    fontSize: 11.5,
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
