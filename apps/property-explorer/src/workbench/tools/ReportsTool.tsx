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
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import { attachExportToDossier } from "./reports-dossier";

/** R1 value lines — the unified unlock flow renders under them (replaces the
 *  Pro-hardcoded "Sign in and upgrade to Pro" copy). */
export const REPORTS_LOCKED_VALUE_LINE =
  "Professional reports on this property — the cited site-plan export (layered DXF/IFC + PDF sheet with setbacks, contours, and provenance) and every report that ships next.";
export const SITE_PLAN_PAYWALL_MESSAGE =
  "Cited site-plan export — layered DXF/IFC plus a PDF sheet with setbacks, contours, and provenance.";
/** TERRAIN IS PRO-ONLY: never claimed by the $15 property unlock. */
export const TERRAIN_PAYWALL_MESSAGE =
  "Multi-format terrain export (GLB, IFC, DXF) is a Pro feature — it is not part of the single-property unlock.";

export function ReportsTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [sitePlan, setSitePlan] =
    useDockToolState<SitePlanExportSectionState>("reports.sitePlan");
  const [terrain, setTerrain] =
    useDockToolState<TerrainExportSectionState>("reports.terrain");
  // R1 PROACTIVE gate: reports are a PAID bubble. locked → the in-dock LOCKED
  // state; signedOut → sign-in-first; entitled-but-not-Pro → site-plan runs,
  // terrain shows its PRO-ONLY lock; loading/error → run as today (the
  // server-402 belt stays authoritative).
  const ent = usePropertyEntitlement(activeParcelNodeId);

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

  if (ent.signedOut) {
    return (
      <LockedToolPanel
        parcelNodeId={activeParcelNodeId}
        valueLine={REPORTS_LOCKED_VALUE_LINE}
        signedOut
        signInLine="Sign in to run reports and exports on this parcel."
        testId="reports-locked"
      />
    );
  }
  if (ent.locked) {
    return (
      <LockedToolPanel
        parcelNodeId={activeParcelNodeId}
        valueLine={REPORTS_LOCKED_VALUE_LINE}
        testId="reports-locked"
      />
    );
  }

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

  const paywall = (message: string, opts?: { proOnly?: boolean }) => {
    void recordPeGtmEvent({
      eventType: "pe_paywall_hit",
      parcelNodeId: activeParcelNodeId,
    });
    host.openPaywall(message, opts);
  };

  // TERRAIN = PRO-ONLY: a property-unlocked (non-Pro) user gets the site-plan
  // section live and the terrain slot as its Pro-only lock — the $15 unlock
  // never claims terrain. Pro (or an unresolved/soft entitlement — belt
  // decides) renders the real section.
  const terrainProLocked = ent.status === "ready" && !ent.pro;

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
      {terrainProLocked ? (
        <div style={{ marginTop: 14 }}>
          <LockedToolPanel
            parcelNodeId={activeParcelNodeId}
            valueLine="Terrain export — the parcel's real terrain as GLB, IFC, or DXF for modeling tools."
            proOnly
            proOnlyNote={TERRAIN_PAYWALL_MESSAGE}
            testId="terrain-pro-lock"
          />
        </div>
      ) : (
        <TerrainExportSection
          key={`terrain:${activeParcelNodeId}`}
          parcelNodeId={activeParcelNodeId}
          onPaymentRequired={() =>
            paywall(TERRAIN_PAYWALL_MESSAGE, { proOnly: true })
          }
          initialState={terrain}
          onStateChange={(next) => {
            setTerrain(next);
            maybeAttach(activeParcelNodeId, "terrain", next.result);
          }}
        />
      )}
    </div>
  );
}
