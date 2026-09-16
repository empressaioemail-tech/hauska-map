// apps/property-explorer/src/coldopen/SampleReportPanel.tsx
//
// State 2 of the redesigned sign-in flow (P-247): a real sample parcel
// report over the live aerial map, no account required. Wired to this app's
// one read path (lib/fact-sheet-resolver.ts) — every value on every tab is
// either a real present figure with its citation or the honest absent chip.
// Never a mockup value.
//
// The left panel is a second FloatingMap instance (floating=false,
// useFixture=false — the same real-imagery mode ExplorerMap itself runs),
// flown to the resolved parcel's own geometry once it loads. It is
// deliberately independent of the shared app-wide map: this overlay sits
// before any account or search selection exists, and must not repoint the
// one persistent map or the global subject store as a side effect of a
// sample preview.

import { useEffect, useRef, useState } from "react";
import { FloatingMap } from "@hauska/map-renderer";
import "@hauska/map-renderer/styles.css";
import type { ParcelFactSheet } from "@empressaio/parcel-fact-sheet";
import { factSheetResolver } from "../lib/fact-sheet-resolver";
import { sampleParcel, type SampleParcelKey } from "./sample-parcels";
import { xrayRows, floodRows, terrainRows, type FactRowView } from "./report-rows";
import { ReportRow } from "./ReportRow";
import { Button } from "../components/Button";
import { PE, TYPE } from "../styles/pe-chrome";

export type ReportTab = "xray" | "flood" | "terrain";

const TABS: Array<{ key: ReportTab; label: string }> = [
  { key: "xray", label: "X-ray" },
  { key: "flood", label: "Flood & Drainage" },
  { key: "terrain", label: "Terrain" },
];

type SheetState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unplaceable" }
  | { status: "ok"; sheet: ParcelFactSheet };

function rowsFor(tab: ReportTab, sheet: ParcelFactSheet): FactRowView[] {
  if (tab === "xray") return xrayRows(sheet);
  if (tab === "flood") return floodRows(sheet);
  return terrainRows(sheet);
}

export function SampleReportPanel({
  parcelKey,
  activeTab,
  onTabChange,
  onLookUpOwn,
  onSignIn,
  mobile,
}: {
  parcelKey: SampleParcelKey;
  activeTab: ReportTab;
  onTabChange: (tab: ReportTab) => void;
  onLookUpOwn: () => void;
  onSignIn: () => void;
  mobile: boolean;
}) {
  const [state, setState] = useState<SheetState>({ status: "loading" });
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    setState({ status: "loading" });
    const parcel = sampleParcel(parcelKey);
    factSheetResolver
      .resolve(parcel.parcelNodeId)
      .then((result) => {
        if (generationRef.current !== generation) return;
        if (result.kind === "unplaceable") {
          setState({ status: "unplaceable" });
          return;
        }
        const { kind: _kind, ...sheet } = result;
        setState({ status: "ok", sheet: sheet as ParcelFactSheet });
      })
      .catch((err: unknown) => {
        if (generationRef.current !== generation) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not read this parcel.",
        });
      });
  }, [parcelKey]);

  const sheet = state.status === "ok" ? state.sheet : null;

  return (
    <div
      data-testid="sample-report-panel"
      style={{
        width: mobile ? "min(560px, calc(100vw - 16px))" : "min(1180px, calc(100vw - 32px))",
        height: mobile ? "min(760px, calc(100vh - 16px))" : "min(800px, calc(100vh - 32px))",
        background: PE.modalBg,
        border: `1px solid ${PE.line14}`,
        borderRadius: PE.rModal,
        boxShadow: PE.shModal,
        overflow: "hidden",
        display: "flex",
        flexDirection: mobile ? "column" : "row",
      }}
    >
      <div
        style={{
          width: mobile ? "100%" : "55%",
          height: mobile ? "40%" : "100%",
          position: "relative",
          background: PE.void,
          borderRight: mobile ? "none" : `1px solid ${PE.line14}`,
          borderBottom: mobile ? `1px solid ${PE.line14}` : "none",
          flexShrink: 0,
        }}
      >
        {sheet ? (
          <FloatingMap
            key={parcelKey}
            floating={false}
            useFixture={false}
            suppressAttributionControl
            legendChrome="none"
            center={{ latitude: sheet.geometry.centroid.lat, longitude: sheet.geometry.centroid.lng }}
            parcel={{ lat: sheet.geometry.centroid.lat, lng: sheet.geometry.centroid.lng }}
            style={{ position: "absolute", inset: 0 }}
          />
        ) : (
          <div
            data-testid="sample-report-map-loading"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: PE.t5,
              fontFamily: PE.ui,
              fontSize: 12.5,
            }}
          >
            {state.status === "error" ? "Could not load the map for this parcel." : "Reading this parcel…"}
          </div>
        )}
      </div>

      <div style={{ width: mobile ? "100%" : "45%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: PE.modalBg }}>
        <div style={{ padding: "20px 26px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", paddingBottom: 6 }}>
            <img src="/smart-site-logo.svg" alt="Smart Site" style={{ height: 22, width: "auto", display: "block" }} />
          </div>
          <div style={{ ...TYPE.subject, fontWeight: 600, color: PE.t1 }} data-testid="sample-report-address">
            {sheet
              ? sheet.identity.situsAddress.state === "present"
                ? sheet.identity.situsAddress.value
                : "Address not on record for this parcel"
              : "Reading this parcel…"}
          </div>
          <div style={{ fontFamily: PE.mono, fontSize: 12.5, color: PE.t5 }}>
            {sheet
              ? sheet.identity.apn.state === "present"
                ? `APN ${sheet.identity.apn.value}`
                : "APN not on record"
              : " "}
          </div>
          <div style={{ ...TYPE.label, textTransform: "none", letterSpacing: "normal", color: PE.t6, paddingTop: 2 }}>
            Example parcel. No account needed.
          </div>
        </div>

        <div role="tablist" style={{ display: "flex", gap: 24, padding: "0 26px", borderBottom: `1px solid ${PE.line14}` }}>
          {TABS.map((tab) => (
            <div
              key={tab.key}
              role="tab"
              tabIndex={0}
              aria-selected={activeTab === tab.key}
              data-testid={`report-tab-${tab.key}`}
              onClick={() => onTabChange(tab.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTabChange(tab.key);
                }
              }}
              className="ss-focusable"
              style={{
                padding: "11px 0",
                marginBottom: -1,
                borderBottom: activeTab === tab.key ? `2px solid ${PE.gold}` : "2px solid transparent",
                fontFamily: PE.ui,
                fontSize: 12.5,
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? PE.t1 : PE.t5,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }} className="pe-scroll">
          <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
            {state.status === "error" && (
              <div style={{ fontFamily: PE.ui, fontSize: 14.5, color: PE.t4 }}>{state.message}</div>
            )}
            {state.status === "unplaceable" && (
              <div style={{ fontFamily: PE.ui, fontSize: 14.5, color: PE.t4 }}>
                This parcel could not be placed on the map right now.
              </div>
            )}
            {sheet && (
              <div style={{ border: `1px solid ${PE.line14}`, borderRadius: PE.rChip, background: PE.ink }}>
                {rowsFor(activeTab, sheet).map((row, i, arr) => (
                  <ReportRow key={row.label} row={row} showDivider={i < arr.length - 1} />
                ))}
              </div>
            )}
            {state.status === "loading" && (
              <div style={{ fontFamily: PE.ui, fontSize: 14.5, color: PE.t5 }}>Reading this parcel…</div>
            )}
            <div style={{ fontFamily: PE.ui, fontSize: 12.5, lineHeight: 1.5, color: PE.t4 }}>
              When the record does not say, we say so. We do not invent a setback.
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 26px 22px", borderTop: `1px solid ${PE.line14}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <Button
            type="button"
            variant="subtle"
            fullWidth
            data-testid="look-up-own-parcel"
            onClick={onLookUpOwn}
            style={{ height: 48, fontSize: 15.5, background: PE.gold, color: PE.void }}
          >
            Look up your own parcel
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            data-testid="sign-in-to-save"
            onClick={onSignIn}
            style={{ height: 44, fontSize: 15.5 }}
          >
            Sign in to save and share this
          </Button>
        </div>
      </div>
    </div>
  );
}
