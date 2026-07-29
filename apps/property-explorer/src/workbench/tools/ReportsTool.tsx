// apps/property-explorer/src/workbench/tools/ReportsTool.tsx
//
// W2 REPORTS BUBBLE — the run-a-report actions, moved OFF the inspect card
// into the workbench dock (the design law: one dock, no second surface).
// Exactly the two existing exports, nothing new (further report types are
// deferred by spec):
//   - SITE-PLAN EXPORT (format select + export + download link + honest
//     status/retry messages) — the SitePlanExportSection internals, reused;
//   - TERRAIN EXPORT (format select + export) — TerrainExportSection, reused.
//
// Every honest state is intact: 503/502 retryable upstream copy, 402 →
// host.openPaywall (with the same paywall copy + pe_paywall_hit event the
// card path recorded), 401 sign-in link, 422 anti-fabrication copy.
//
// PER-PROPERTY PERSISTENCE: each section's terminal snapshot (format + notice
// + result, incl. the inline-download bytes the download link derives from)
// lives in the chassis store via useDockToolState, so the last export result
// and its download link survive dock close/reopen and property switches
// re-scope automatically. Sections are keyed on the active property so their
// mount-time state re-seeds from the right slot.

import { useCallback, useRef } from "react";
import {
  SitePlanExportSection,
  type SitePlanExportSectionState,
} from "../../browse/SitePlanExportSection";
import {
  TerrainExportSection,
  type TerrainExportSectionState,
} from "../../browse/TerrainExportSection";
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { attachExportToDossier } from "./reports-dossier";

/** Verbatim paywall copy the card's 402 handlers carried (moved, not changed). */
export const SITE_PLAN_PAYWALL_MESSAGE =
  "Cited site-plan export (layered DXF/IFC + PDF sheet with setbacks, contours, and provenance) is a paid public-paid spine atom. Sign in and upgrade to Pro to export.";
export const TERRAIN_PAYWALL_MESSAGE =
  "Multi-format terrain export (GLB, IFC, DXF) is a paid public-paid spine atom. Sign in and upgrade to Pro to export.";

export function ReportsTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [sitePlan, setSitePlan] =
    useDockToolState<SitePlanExportSectionState>("reports.sitePlan");
  const [terrain, setTerrain] =
    useDockToolState<TerrainExportSectionState>("reports.terrain");

  // WB6 auto-attach: remember which result object was already attached per
  // (property, kind) so a format-change settle carrying the SAME result does
  // not re-fire. Attach is fire-and-forget; `not-saved` is a silent no-op
  // (nothing to attach to) and the dossier upsert dedupes kind+format anyway.
  const attachedRef = useRef(new Map<string, unknown>());
  const maybeAttach = useCallback(
    (
      parcelNodeId: string,
      kind: "site-plan" | "terrain",
      result:
        | SitePlanExportSectionState["result"]
        | TerrainExportSectionState["result"],
    ) => {
      if (!result) return;
      const key = `${parcelNodeId}:${kind}`;
      if (attachedRef.current.get(key) === result) return;
      attachedRef.current.set(key, result);
      void attachExportToDossier(parcelNodeId, kind, result);
    },
    [],
  );

  // The dock guarantees a non-null active property for propertyScoped tools.
  if (!activeParcelNodeId) return null;

  // Seed the attach memory with results that were PERSISTED before this mount
  // — those exports already attached when they happened; only a NEW settle
  // (new result object) should auto-attach.
  if (sitePlan?.result && !attachedRef.current.has(`${activeParcelNodeId}:site-plan`)) {
    attachedRef.current.set(`${activeParcelNodeId}:site-plan`, sitePlan.result);
  }
  if (terrain?.result && !attachedRef.current.has(`${activeParcelNodeId}:terrain`)) {
    attachedRef.current.set(`${activeParcelNodeId}:terrain`, terrain.result);
  }

  const facts = host.getActiveParcelFacts?.() ?? {
    address: null,
    countyName: null,
  };

  const paywall = (message: string) => {
    void recordPeGtmEvent({
      eventType: "pe_paywall_hit",
      parcelNodeId: activeParcelNodeId,
    });
    host.openPaywall(message);
  };

  return (
    <div data-testid="reports-tool">
      <SitePlanExportSection
        key={`site-plan:${activeParcelNodeId}`}
        parcelNodeId={activeParcelNodeId}
        address={facts.address}
        countyName={facts.countyName}
        onPaymentRequired={() => paywall(SITE_PLAN_PAYWALL_MESSAGE)}
        initialState={sitePlan}
        onStateChange={(next) => {
          setSitePlan(next);
          maybeAttach(activeParcelNodeId, "site-plan", next.result);
        }}
      />
      <TerrainExportSection
        key={`terrain:${activeParcelNodeId}`}
        parcelNodeId={activeParcelNodeId}
        onPaymentRequired={() => paywall(TERRAIN_PAYWALL_MESSAGE)}
        initialState={terrain}
        onStateChange={(next) => {
          setTerrain(next);
          maybeAttach(activeParcelNodeId, "terrain", next.result);
        }}
      />
    </div>
  );
}
