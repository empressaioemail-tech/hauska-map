// packages/map-renderer/src/chrome/panelLayering.ts
//
// ONE z-order table and ONE panel-dismiss channel for the map chrome.
//
// WHY THIS FILE EXISTS (W4). The operator's QA pass on Smart Site: "How do i
// make the tools disappear so I can read this". Three floating panels — the
// workbench dock (Reports and exports), TOOLS and LAYERS — stacked over the
// map and over each other. Auditing the repo at that moment found z-index
// literals hand-written in eleven places across two apps and the shared
// package (8, 9, 11, 12, 13, 14, 15, 20, 30, 40), with no table saying which
// should win. Two implementations of one rule with nothing keeping them in
// step is the divergence shape DEV_PROCESS 2.4 names, so the fix is a single
// data table rather than eleven careful edits.
//
// THE RULE, stated once: SMALL IN FRONT OF LARGE. A small control that sits on
// top of a large surface must out-rank it, otherwise it becomes unreachable
// exactly when it is needed. Ambient decoration is behind everything; modals
// are in front of everything.
//
// Dependency-free on purpose: imported by the React chrome here AND by the
// Property Explorer's pure layout module, which is unit-tested in a node
// environment with no DOM.

/** The z-order table. Higher wins. Every map-chrome surface reads from here. */
export const MAP_PANEL_Z = {
  /** Brand chip, transient notices — decoration, never interactive-critical. */
  ambient: 8,
  /** The large right-side workbench dock (Reports and exports, brief, chat). */
  dock: 9,
  /** Small map-utility clusters: the tools/layers bubble, the source ⓘ. */
  toolset: 11,
  /** The inspect card — a reading surface, above the dock it may overlap. */
  card: 12,
  /** Mobile bottom sheets. */
  sheet: 13,
  /** Chrome that must stay reachable ABOVE a sheet: the Find bar and its
   *  suggestion list, the mobile research tool picker. */
  overlay: 14,
  /** Mobile bottom navigation — the way out of any sheet. */
  nav: 20,
  /** Paywall / unlock / sign-up modals. */
  modal: 30,
} as const;

export type MapPanelLayer = keyof typeof MAP_PANEL_Z;

/**
 * Panel-dismiss channel.
 *
 * A window CustomEvent rather than a prop chain, because the map chrome lives
 * in the shared renderer package while the mobile sheet state lives in the
 * Property Explorer, and neither may import the other. Inert when nothing is
 * listening, so Command Center is unaffected.
 *
 * `detail.reason` says WHY, so a listener can decide (a tool activation must
 * collapse a mobile sheet; a layer checkbox must not, or you could never turn
 * two layers on).
 */
export const MAP_PANEL_DISMISS_EVENT = "hauska-map:panel-dismiss";

export interface MapPanelDismissDetail {
  /** What asked for the dismissal, e.g. "tool-activated" | "hide-all". */
  reason: string;
}

/** Ask any listening host to collapse its overlay panels. Safe in SSR/node. */
export function dispatchPanelDismiss(reason: string): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<MapPanelDismissDetail>(MAP_PANEL_DISMISS_EVENT, {
        detail: { reason },
      }),
    );
  } catch {
    /* no window / no CustomEvent — nothing to dismiss */
  }
}
