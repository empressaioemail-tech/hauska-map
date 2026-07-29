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

  // The dock guarantees a non-null active property for propertyScoped tools.
  if (!activeParcelNodeId) return null;

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
        onStateChange={setSitePlan}
      />
      <TerrainExportSection
        key={`terrain:${activeParcelNodeId}`}
        parcelNodeId={activeParcelNodeId}
        onPaymentRequired={() => paywall(TERRAIN_PAYWALL_MESSAGE)}
        initialState={terrain}
        onStateChange={setTerrain}
      />
    </div>
  );
}
