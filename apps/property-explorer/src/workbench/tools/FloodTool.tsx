// apps/property-explorer/src/workbench/tools/FloodTool.tsx
//
// R3 — the FLOOD & DRAINAGE report bubble: the FIRST paid report bubble in
// the workbench, and the pattern-setter for every future report:
//   run-in-dock  → honest progress (the drainage study is real work,
//                  ~15-45 s: DEM fetch + hydrology model);
//   sharp viz    → a self-contained SVG in the dock — parcel ring +
//                  catchment boundary + drainage zones (graded subtle
//                  fills) + rainfall ponding + flow-exit arrows + legend +
//                  provenance line; the layman briefing text below;
//   PDF export   → the Sheet-Standard flood-drainage sheet via the gated
//                  BFF download (same UX as the site-plan download), and
//                  the WB6 auto-attach to the saved property's dossier.
//
// PAID gate: proactive usePropertyEntitlement (locked → LockedToolPanel —
// flood & drainage IS in the $15 property unlock, so the standard
// two-choice flow, never Pro-only) + the reactive server-402 belt
// (host.openPaywall). Honest-empty renders the ENGINE's reason verbatim —
// never a fake result on flat terrain / DEM void.
//
// PER-PROPERTY PERSISTENCE: the fetched study snapshot lives in the chassis
// store via useDockToolState — the viz survives dock close/reopen and
// property switches re-scope automatically. A server-cached study hydrates
// silently on first open (cheap GET) so a re-visit never re-runs the model.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  fetchFloodDrainageStudy,
  floodDrainageDownloadPath,
  floodDrainageFilename,
  floodProvenanceLine,
  requestFloodDrainageRefresh,
  type FloodDrainageStudyView,
} from "../../lib/floodDrainageClient";
import { googleSignInUrl } from "../../lib/auth";
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import { attachExportToDossier } from "./reports-dossier";
import { buildFloodVizModel, type FloodVizModel } from "./flood-viz";

const TEXT = "#e5e7eb";
const MUTED = "#8b97a5";
const ACCENT = "#7dd3fc";

// Water palette — one hue family, graded; parcel ring stays the neutral star.
const PARCEL_STROKE = "#e6edf3";
const CATCHMENT_STROKE = "rgba(125,211,252,0.55)";
const ZONE_FILL = "56,132,255"; // rgb triplet; alpha graded per zone
const PONDING_FILL = "rgba(56,132,255,0.5)";
const PONDING_STROKE = "rgba(147,197,253,0.9)";
const FLOW_STROKE = "rgba(125,211,252,0.75)";
const EXIT_COLOR = "#fcd34d";

export const FLOOD_LOCKED_VALUE_LINE =
  "Flood & drainage study on this property — the upstream catchment, drainage concentration zones, modeled rainfall ponding at the design storm, and where water exits the parcel, with a professional PDF sheet.";
export const FLOOD_PAYWALL_MESSAGE =
  "Flood & drainage report — catchment, drainage zones, rainfall ponding, and flow exits with a Sheet-Standard PDF.";
export const FLOOD_RUNNING_LINE =
  "Running drainage study — fetching the DEM and modeling catchment, ponding, and flow (usually 15-45 s)…";

/** JSON-serializable per-property snapshot (useDockToolState slot). */
export interface FloodToolStoredState {
  study: FloodDrainageStudyView | null;
  notice: string | null;
}

/** The sharp in-dock SVG. Pure render over the viz model — testable. */
export function FloodVizSvg({ model }: { model: FloodVizModel }) {
  return (
    <svg
      data-testid="flood-viz"
      viewBox={model.viewBox}
      width="100%"
      role="img"
      aria-label="Flood and drainage visualization"
      style={{ display: "block", borderRadius: 8, background: "rgba(6,9,13,0.55)" }}
    >
      {/* Drainage zones — graded subtle fills (upstream → concentrated). */}
      {model.zonePaths.map((z, i) => (
        <path
          key={`zone-${i}`}
          data-testid="flood-viz-zone"
          d={z.d}
          fill={`rgba(${ZONE_FILL},${(0.10 + 0.22 * z.grade).toFixed(3)})`}
          stroke="none"
        />
      ))}
      {/* Catchment boundary. */}
      {model.catchmentPaths.map((d, i) => (
        <path
          key={`catchment-${i}`}
          data-testid="flood-viz-catchment"
          d={d}
          fill="none"
          stroke={CATCHMENT_STROKE}
          strokeWidth={1.2}
          strokeDasharray="5 3"
        />
      ))}
      {/* Flow lines. */}
      {model.flowPaths.map((d, i) => (
        <path
          key={`flow-${i}`}
          data-testid="flood-viz-flow"
          d={d}
          fill="none"
          stroke={FLOW_STROKE}
          strokeWidth={1}
          strokeLinecap="round"
        />
      ))}
      {/* Rainfall ponding at the design storm. */}
      {model.pondingPaths.map((d, i) => (
        <path
          key={`ponding-${i}`}
          data-testid="flood-viz-ponding"
          d={d}
          fill={PONDING_FILL}
          stroke={PONDING_STROKE}
          strokeWidth={0.8}
        />
      ))}
      {/* Parcel ring — the star, drawn on top. */}
      {model.parcelPath && (
        <path
          data-testid="flood-viz-parcel"
          d={model.parcelPath}
          fill="none"
          stroke={PARCEL_STROKE}
          strokeWidth={1.6}
        />
      )}
      {/* Flow-exit arrows — where water leaves the parcel. */}
      {model.exitArrows.map((a, i) => (
        <g
          key={`exit-${i}`}
          data-testid="flood-viz-exit"
          transform={`translate(${a.x} ${a.y}) rotate(${a.angleDeg})`}
        >
          <path d="M0 0 L10 0" stroke={EXIT_COLOR} strokeWidth={1.6} />
          <path d="M10 0 L5.5 -3 M10 0 L5.5 3" stroke={EXIT_COLOR} strokeWidth={1.6} fill="none" />
        </g>
      ))}
    </svg>
  );
}

function Legend() {
  const item = (swatch: CSSProperties, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 10 }}>
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: 2,
          ...swatch,
        }}
      />
      <span style={{ fontSize: 9.5, color: MUTED }}>{label}</span>
    </span>
  );
  return (
    <div data-testid="flood-viz-legend" style={{ marginTop: 6, lineHeight: 1.7 }}>
      {item({ border: `1.5px solid ${PARCEL_STROKE}`, background: "transparent" }, "Parcel")}
      {item(
        { border: `1px dashed ${CATCHMENT_STROKE}`, background: "transparent" },
        "Catchment",
      )}
      {item({ background: `rgba(${ZONE_FILL},0.28)` }, "Drainage zones")}
      {item({ background: PONDING_FILL, border: `1px solid ${PONDING_STROKE}` }, "Ponding")}
      {item({ background: EXIT_COLOR, borderRadius: 5, height: 3, width: 12 }, "Flow exits")}
    </div>
  );
}

export function FloodTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [stored, setStored] = useDockToolState<FloodToolStoredState>("flood");
  const ent = usePropertyEntitlement(activeParcelNodeId);
  const [busy, setBusy] = useState(false);

  // WB6 auto-attach memory: one attach per settled study object.
  const attachedRef = useRef(new Map<string, unknown>());
  // One silent cache-hydration probe per (mount, property).
  const probedRef = useRef(new Set<string>());

  const settle = useCallback(
    (next: FloodToolStoredState) => {
      setStored(next);
      if (next.study && !next.study.honestEmpty && activeParcelNodeId) {
        const key = activeParcelNodeId;
        if (attachedRef.current.get(key) !== next.study) {
          attachedRef.current.set(key, next.study);
          void attachExportToDossier(activeParcelNodeId, "flood-drainage", {
            selectedFormat: "pdf-flood-drainage",
            downloadUrl: floodDrainageDownloadPath(activeParcelNodeId),
          });
        }
      }
    },
    [activeParcelNodeId, setStored],
  );

  const run = useCallback(async () => {
    if (!activeParcelNodeId) return;
    setBusy(true);
    const facts = host.getActiveParcelFacts?.() ?? { address: null, countyName: null };
    const resp = await requestFloodDrainageRefresh(activeParcelNodeId, facts);
    setBusy(false);
    if (!resp.ok) {
      if (resp.status === 401) {
        settle({ study: null, notice: "Sign in to run the flood & drainage report." });
        return;
      }
      if (resp.status === 402) {
        settle({ study: null, notice: null });
        void recordPeGtmEvent({
          eventType: "pe_paywall_hit",
          parcelNodeId: activeParcelNodeId,
        });
        host.openPaywall(FLOOD_PAYWALL_MESSAGE);
        return;
      }
      if (resp.status === 422) {
        // The engine's honest refresh failure — show its reason verbatim.
        settle({
          study: null,
          notice: resp.message ?? "Drainage study could not be produced for this parcel.",
        });
        return;
      }
      settle({
        study: null,
        notice: resp.message ?? `Report failed (${resp.status || "network"}).`,
      });
      return;
    }
    settle({ study: resp.study, notice: null });
  }, [activeParcelNodeId, host, settle]);

  // Hydrate silently from the SERVER cache when this property has no local
  // snapshot yet (the study is written at refresh; a 404 just means "not
  // run yet" and stays silent). Entitlement-gated: never probes while
  // locked/signed-out. Effects do not run in static renders (test idiom).
  useEffect(() => {
    if (!activeParcelNodeId || stored || busy) return;
    if (ent.status !== "ready" || ent.signedOut || ent.locked) return;
    if (probedRef.current.has(activeParcelNodeId)) return;
    probedRef.current.add(activeParcelNodeId);
    void fetchFloodDrainageStudy(activeParcelNodeId).then((resp) => {
      if (resp.ok) {
        // Seed the attach memory: a cached study already attached when it
        // was generated — hydration must not re-fire the dossier write.
        attachedRef.current.set(activeParcelNodeId, resp.study);
        setStored({ study: resp.study, notice: null });
      }
    });
  }, [activeParcelNodeId, stored, busy, ent.status, ent.signedOut, ent.locked, setStored]);

  // The dock guarantees a non-null active property for propertyScoped tools.
  if (!activeParcelNodeId) return null;

  if (ent.signedOut) {
    return (
      <LockedToolPanel
        parcelNodeId={activeParcelNodeId}
        valueLine={FLOOD_LOCKED_VALUE_LINE}
        signedOut
        signInLine="Sign in to run the flood & drainage report on this parcel."
        testId="flood-locked"
      />
    );
  }
  if (ent.locked) {
    return (
      <LockedToolPanel
        parcelNodeId={activeParcelNodeId}
        valueLine={FLOOD_LOCKED_VALUE_LINE}
        testId="flood-locked"
      />
    );
  }

  const study = stored?.study ?? null;
  const notice = stored?.notice ?? null;
  const model = study ? buildFloodVizModel(study) : null;

  return (
    <div data-testid="flood-tool">
      <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>
        Flood &amp; drainage report · public-paid
      </div>

      {!study && (
        <p style={{ margin: "0 0 8px", fontSize: 11.5, lineHeight: 1.5, color: TEXT }}>
          Model this parcel&apos;s drainage: the upstream catchment delivering
          runoff, where water concentrates, modeled ponding at the design
          storm, and where it exits.
        </p>
      )}

      <button
        type="button"
        data-testid="flood-run"
        disabled={busy}
        onClick={() => void run()}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: 7,
          border: "0.5px solid rgba(125,211,252,0.35)",
          background: busy ? "transparent" : "rgba(125,211,252,0.12)",
          color: ACCENT,
          fontWeight: 600,
          fontSize: 12,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Running…" : study ? "Re-run study" : "Generate flood & drainage study"}
      </button>

      {busy && (
        <div
          data-testid="flood-progress"
          style={{ marginTop: 8, fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
        >
          {FLOOD_RUNNING_LINE}
        </div>
      )}

      {notice && !busy && (
        <div
          data-testid="flood-notice"
          style={{ marginTop: 8, fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
        >
          {notice}
          {notice.includes("Sign in") && (
            <>
              {" "}
              <a href={googleSignInUrl()} style={{ color: ACCENT }} data-testid="flood-sign-in">
                Continue with Google
              </a>
            </>
          )}
        </div>
      )}

      {study && study.honestEmpty && (
        <div data-testid="flood-honest-empty" style={{ marginTop: 10 }}>
          {/* HONEST-EMPTY: the engine's reason VERBATIM — never a fake result. */}
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: TEXT }}>
            {study.honestEmpty.reason}
          </p>
          <div style={{ marginTop: 6, fontSize: 10, color: MUTED }}>
            {floodProvenanceLine(study)}
          </div>
        </div>
      )}

      {study && !study.honestEmpty && model && (
        <div data-testid="flood-result" style={{ marginTop: 10 }}>
          <FloodVizSvg model={model} />
          <Legend />
          <div
            data-testid="flood-provenance"
            style={{ marginTop: 6, fontSize: 10, color: MUTED, lineHeight: 1.5 }}
          >
            {floodProvenanceLine(study)}
          </div>
          {study.briefing && (
            <p
              data-testid="flood-briefing"
              style={{ margin: "8px 0 0", fontSize: 11.5, lineHeight: 1.55, color: TEXT }}
            >
              {study.briefing}
            </p>
          )}
          <a
            data-testid="flood-download-link"
            href={floodDrainageDownloadPath(activeParcelNodeId)}
            download={floodDrainageFilename(activeParcelNodeId)}
            style={{
              display: "inline-block",
              marginTop: 10,
              padding: "6px 10px",
              borderRadius: 7,
              border: "0.5px solid rgba(125,211,252,0.35)",
              color: ACCENT,
              fontSize: 11.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Export PDF sheet
          </a>
        </div>
      )}
    </div>
  );
}
