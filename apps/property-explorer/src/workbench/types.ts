// apps/property-explorer/src/workbench/types.ts
//
// PE WORKBENCH CHASSIS — the PINNED tool API (WB1). Later waves (W2 reports /
// verdict, W3 chat, W4 properties + share) plug tools in through THIS contract
// and must not touch dock internals.
//
// THE DESIGN LAW the chassis enforces: the clean map-first PE stays the star;
// every capability is a bubble in the TOP-RIGHT cluster that opens into ONE
// shared dock (the space the property brief used); ONE tool open at a time;
// state persists PER-PROPERTY across open/close; NO permanent second surface,
// NO split screen. If a feature wants a permanent panel, it is designed wrong.
//
// HOW A LATER WAVE ADDS A TOOL (the whole recipe — no dock edits):
//   1. Append a `WorkbenchToolDef` to `WORKBENCH_TOOLS` in `registry.tsx`
//      (or flip an existing "coming" entry to `status: "live"` and give it a
//      `render`).
//   2. Inside the tool component, call `useDockToolState<T>(toolId)` for state
//      that must persist per property across open/close (chat transcript,
//      fetched report, notes). The hook is ALREADY scoped to the active
//      property and ALREADY localStorage-backed — write plain JSON-serializable
//      values and re-scoping on property switch is automatic.
//   3. Need the app shell (paywall, etc.)? Use `useWorkbench().host` — extend
//      `WorkbenchHostActions` and wire the implementation in ExplorerMap.
//
// ACTIVE PROPERTY: the currently INSPECTED parcel's baked node id, falling
// back to the SUBJECT parcel's node id (ExplorerMap binds `cardNodeId ??
// subjectNodeId` into <Workbench activeParcelNodeId=...>). With no active
// property, the dock renders the honest "select a property first" state for
// property-scoped tools — tools never render against a phantom property.

import type { ReactNode } from "react";

/** Stable tool id — the registry key AND the per-property state key. */
export type WorkbenchToolId = string;

/**
 * Everything a tool receives from the chassis. Tools rendered as components
 * can read the same values via `useWorkbench()` instead.
 */
export interface WorkbenchToolContext {
  /**
   * The active property's stable baked parcel node id ("{fips}:{propId}").
   * For `propertyScoped` tools this is always non-null when `render` runs —
   * the dock short-circuits to the honest no-property state otherwise.
   */
  activeParcelNodeId: string | null;
  /** Collapse the dock back to the bubble cluster (the dock's × / active-bubble tap). */
  closeDock: () => void;
  /** App-shell actions the chassis cannot own (paywall gate, etc.). */
  host: WorkbenchHostActions;
}

/**
 * Actions implemented by the app shell (ExplorerMap) and handed to tools.
 * Later waves EXTEND this interface rather than threading new props through
 * the dock.
 */
export interface WorkbenchHostActions {
  /** Open the PE paywall gate with the given message (the 402 path). */
  openPaywall: (message: string) => void;
  /**
   * The ACTIVE property's situs address when the app shell knows it (inspect
   * card), else null. W3 chat sends it as the research-chat address selector;
   * tools must degrade honestly when it is null. Optional so injected test
   * hosts predating W3 stay valid.
   */
  getActivePropertyAddress?: () => string | null;
  /**
   * W2: best-known display facts for the ACTIVE parcel (the site-plan export
   * sheet header wants address/county). Optional — tools must treat a missing
   * implementation or null fields as honest absence, never fabricate.
   */
  getActiveParcelFacts?: () => {
    address: string | null;
    countyName: string | null;
  };
  /**
   * REOPEN a property (W4 My Properties): navigate the LIVE map to this
   * parcel and open its inspect card — the same find/fly+inspect flow the
   * search bar's parcel fast path uses (runParcelLookup: resolve facets →
   * inspectInPlace → rebindProperty + resolveSubjectAndFit; never a remount).
   * Re-scopes the dock automatically because the active property changes.
   * Optional (same convention as the W2/W3 actions) — the tool no-ops when
   * the host does not implement it.
   */
  openProperty?: (parcelNodeId: string) => void;
  /**
   * WB6 dossier: the CURRENT map draw/measure/marker geometries as a plain
   * GeoJSON FeatureCollection (features tagged `properties.tool`), or null
   * when the map tools are not installed / nothing is drawn. Pure read.
   */
  getMapDrawings?: () => {
    type: "FeatureCollection";
    features: unknown[];
  } | null;
  /**
   * WB6 dossier: REDRAW a saved property's drawings on the live map as the
   * read-only dossier overlay (null clears it). `forParcelNodeId` records
   * which property the overlay belongs to — the app shell auto-clears the
   * overlay when the ACTIVE property switches to a different parcel, so
   * dossier drawings never linger over the wrong property.
   */
  showDossierDrawings?: (
    fc: { type: "FeatureCollection"; features: unknown[] } | null,
    forParcelNodeId?: string,
  ) => void;
}

/** One bubble in the top-right cluster. */
export interface WorkbenchToolDef {
  id: WorkbenchToolId;
  /** Human label — bubble tooltip, aria-label, and dock header title. */
  label: string;
  /** Bubble glyph. Prefer a 15px stroke SVG (see `WorkbenchIcon` in Workbench.tsx). */
  icon: ReactNode;
  /**
   * "live" tools render `render(ctx)` in the dock; "coming" tools render the
   * chassis-owned honest coming state (registered, visibly not wired — never
   * dead-looking UI).
   */
  status: "live" | "coming";
  /**
   * True → the tool works on the active property; with none selected the dock
   * renders the honest "select a property first" state instead of `render`.
   */
  propertyScoped: boolean;
  /** Dock content for live tools. Omit for "coming" entries. */
  render?: (ctx: WorkbenchToolContext) => ReactNode;
}
