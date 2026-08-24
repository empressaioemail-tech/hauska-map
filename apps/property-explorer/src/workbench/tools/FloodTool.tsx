// apps/property-explorer/src/workbench/tools/FloodTool.tsx
//
// FLOOD & DRAINAGE — the report SECTION inside the Reports & exports bubble
// (10x consolidation: the standalone flood bubble is gone; the map is the
// star and the report's viz moved ONTO it):
//   map overlay  → while this section holds a study for the active property,
//                  the drainage picture renders on the MAIN map through the
//                  host seam (setFloodMapOverlay): the FD5 WARM AMBER hydro
//                  family (three dissolved zone concentration bands, pooled
//                  ponding, dashed catchment boundary) + parcel-relevant
//                  flow lines with a handful of small direction arrows and
//                  diamond exit markers. FEMA stays blue as the reference
//                  layer, so the two layers no longer compete.
//                  Applied on study load; cleared on section unmount (tool
//                  close), study replacement (re-run), and property switch
//                  (the app shell's auto-clear, WB6 precedent).
//   run-in-dock  → honest progress (the drainage study is real work,
//                  ~15-45 s: DEM fetch + hydrology model);
//   mini viz     → the sharp in-dock SVG grid stays (operator call) — parcel
//                  ring + catchment + zones + ponding + flow exits + legend +
//                  provenance; the layman briefing text below;
//   PDF export   → the Sheet-Standard flood-drainage sheet via the gated
//                  BFF download, and the WB6 auto-attach to the dossier.
//
// PAID gate: the Reports tool hosts the section behind the standard
// property-entitlement lock (flood IS in the $15 property unlock — the
// two-choice flow, never Pro-only), so this section renders only signed-in
// and unlocked (or entitlement-unknown, where the reactive server-402 belt
// stays authoritative via host.openPaywall). Honest-empty renders the
// ENGINE's reason verbatim — never a fake result on flat terrain / DEM void.
//
// PER-PROPERTY PERSISTENCE: unchanged — the study snapshot lives under the
// chassis-store key "flood" (the pre-consolidation key, so studies persisted
// before the bubble folded into Reports hydrate exactly as before).

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  fetchFloodDrainageStudy,
  floodDrainageDownloadPath,
  floodDrainageFilename,
  floodProvenanceLine,
  isCurrentStyledFloodStudy,
  requestFloodDrainageRefresh,
  type FloodDrainageStudyView,
} from "../../lib/floodDrainageClient";
import { googleSignInUrl } from "../../lib/auth";
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { attachExportToDossier } from "./reports-dossier";
import { buildFloodVizModel, type FloodVizModel } from "./flood-viz";
import {
  pondingFeatureCount,
  FLOOD_ZONE_LOW_COLOR,
  FLOOD_ZONE_MED_COLOR,
  FLOOD_ZONE_HIGH_COLOR,
  FLOOD_PONDING_FILL_COLOR,
  FLOOD_PONDING_LINE_COLOR,
  FLOOD_CATCHMENT_LINE_COLOR,
  FLOOD_FLOW_LINE_COLOR,
  FLOOD_EXIT_MARKER_COLOR,
  FLOOD_EXIT_MARKER_STROKE,
} from "../../browse/flood-map-overlay";

const TEXT = "var(--text-body, #e5e7eb)";
const MUTED = "var(--surface-muted, #94A3B8)";
const ACCENT = "var(--brand-blue, #3B82F6)"; // PRIMARY interactive hue for tool CHROME (was cyan #7dd3fc)

// Water palette — one hue family, graded; parcel ring stays the neutral star.
// NOTE: this flood-analysis map palette (catchment/flow/ponding/exit) is the
// hydro CONTEXT palette flagged out-of-scope for the rebrand sweep — left as-is
// pending a cross-package taxonomy design decision. Only the tool's UI chrome
// (TEXT/MUTED/ACCENT above) is tokenized here.
const PARCEL_STROKE = "#e6edf3";
const CATCHMENT_STROKE = "rgba(125,211,252,0.55)";
const ZONE_FILL = "56,132,255"; // rgb triplet; alpha graded per zone
const PONDING_FILL = "rgba(56,132,255,0.5)";
const PONDING_STROKE = "rgba(147,197,253,0.9)";
const FLOW_STROKE = "rgba(125,211,252,0.75)";
const EXIT_COLOR = "#fcd34d";

export const FLOOD_PAYWALL_MESSAGE =
  "Flood & drainage report — catchment, drainage zones, rainfall ponding, and flow exits with a Sheet-Standard PDF.";
export const FLOOD_RUNNING_LINE =
  "Running drainage study — fetching the DEM and modeling catchment, ponding, and flow (usually 15-45 s)…";
/**
 * The honest empty-ponding line. A study that models NO standing water on
 * the parcel is a real, useful result — but a legend listing "Ponding" over
 * a map drawing none reads as a rendering failure. When the study carries
 * zero drawable ponding polygons the dock says so in words instead.
 */
export const FLOOD_NO_PONDING_LINE =
  "No modeled ponding on this parcel at the design storm — the drainage zones and flow paths below are the result.";

/** JSON-serializable per-property snapshot (useDockToolState slot "flood"). */
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

// The map-overlay visual language is the CONTEXT SLATE-TEAL family (Phase 0A
// T-H02): FEMA keeps its muted blue as the REFERENCE layer; the drainage-study
// hydro layers sit in the slate-teal family so the two stay legible together.
// Every swatch below is BOUND to the render constants in flood-map-overlay.ts
// (imported, not hand-copied) so the legend can never drift from the render
// again. Legend order mirrors the render's paint stack.
//
// FEMA reference swatch keeps the muted blue of the FEMA render (fill #3b82f6 /
// boundary #1d4ed8 from CONTEXT_FEMA); it is the only non-teal entry, on
// purpose — FEMA is the reference layer.
const LEGEND_FEMA_FILL = "rgba(59,130,246,0.55)";
const LEGEND_FEMA_STROKE = "#1d4ed8";

function Legend({ hasPonding = true }: { hasPonding?: boolean }) {
  const item = (swatch: CSSProperties, label: string) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginRight: 12,
        marginBottom: 2,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 13,
          height: 13,
          borderRadius: 3,
          flex: "0 0 auto",
          ...swatch,
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: "var(--surface-muted, #94A3B8)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </span>
  );
  return (
    <div
      data-testid="flood-viz-legend"
      style={{
        marginTop: 8,
        lineHeight: 1.9,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {item({ border: `2px solid ${PARCEL_STROKE}`, background: "transparent" }, "Parcel")}
      {item(
        { background: LEGEND_FEMA_FILL, border: `1.5px solid ${LEGEND_FEMA_STROKE}` },
        "FEMA flood zone (reference)",
      )}
      {/* Drainage-zone concentration bands — render teal fills, low → high. */}
      {item({ background: FLOOD_ZONE_LOW_COLOR }, "Zone — low concentration")}
      {item({ background: FLOOD_ZONE_MED_COLOR }, "Zone — medium concentration")}
      {item({ background: FLOOD_ZONE_HIGH_COLOR }, "Zone — high concentration")}
      {/* The ponding swatch appears only when ponding is actually drawn — a
          legend entry with nothing on the map reads as a broken render. Render:
          deepest teal fill + heavy dark rim. */}
      {hasPonding &&
        item(
          {
            background: FLOOD_PONDING_FILL_COLOR,
            border: `2px solid ${FLOOD_PONDING_LINE_COLOR}`,
          },
          "Ponding — standing water",
        )}
      {/* Catchment — dashed teal boundary, no fill (render: dashed line). */}
      {item(
        { border: `1.5px dashed ${FLOOD_CATCHMENT_LINE_COLOR}`, background: "transparent" },
        "Catchment boundary",
      )}
      {/* Flow path — solid teal line (render: teal line). */}
      {item(
        { background: FLOOD_FLOW_LINE_COLOR, borderRadius: 6, height: 4, width: 15 },
        "Flow path",
      )}
      {/* Exit point — 45°-rotated square (DIAMOND) in the render: deepest teal
          fill + white stroke. */}
      {item(
        {
          background: FLOOD_EXIT_MARKER_COLOR,
          border: `1.5px solid ${FLOOD_EXIT_MARKER_STROKE}`,
          borderRadius: 0,
          transform: "rotate(45deg)",
          width: 10,
          height: 10,
        },
        "Exit point",
      )}
    </div>
  );
}

/**
 * The Flood & Drainage report section, hosted INSIDE the Reports & exports
 * tool (which owns the entitlement lock around it). One study fetch feeds
 * BOTH the dock mini viz and the main-map overlay.
 */
export function FloodDrainageSection({ embed = false }: { embed?: boolean } = {}) {
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
    // P-39: the study is keyed on the SUBJECT'S sheet id. The report that came
    // back for 48027:498770 while 498778 was selected is why the panel no
    // longer supplies its own target facts.
    const resp = await requestFloodDrainageRefresh(activeParcelNodeId);
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
        // FIX C — STALE-STYLE GATE: a cached study produced before the current
        // visual language shipped is missing its data markers and would render
        // in the OLD look. Those markers live in the study DATA, so a re-run
        // (not a re-render) is the only way to get the current styling. Fail
        // CLOSED: do NOT hydrate an old-styled cached study — leave the section
        // as "not run yet" so the user re-runs and gets the current-styled
        // study. honestEmpty studies pass (nothing to style).
        if (!isCurrentStyledFloodStudy(resp.study)) return;
        // Seed the attach memory: a cached study already attached when it
        // was generated — hydration must not re-fire the dossier write.
        attachedRef.current.set(activeParcelNodeId, resp.study);
        setStored({ study: resp.study, notice: null });
      }
    });
  }, [activeParcelNodeId, stored, busy, ent.status, ent.signedOut, ent.locked, setStored]);

  // FIX C — a study PERSISTED client-side in a prior session (useDockToolState)
  // can also be old-styled. Treat a stored study that is NOT current-styled as
  // absent so the section shows its "generate" state and the user re-runs into
  // the current styling — never render or overlay a stale-styled study.
  const storedStudy = stored?.study ?? null;
  const study =
    storedStudy && isCurrentStyledFloodStudy(storedStudy) ? storedStudy : null;
  const staleStyledStored = !!storedStudy && !study;
  const notice = stored?.notice ?? null;
  const model = study ? buildFloodVizModel(study) : null;
  // Counted off the SAME validation the map overlay uses, so the dock can
  // never claim ponding the map is not drawing (and vice versa).
  const hasPonding = pondingFeatureCount(study) > 0;

  // THE MAP OVERLAY SYNC — the one study snapshot feeds the main map through
  // the host seam. Effect cleanup clears on section unmount (tool close /
  // bubble switch) and on study replacement (re-run redraws); the app
  // shell's property-switch auto-clear is the belt on top (WB6 precedent).
  useEffect(() => {
    const setOverlay = host.setFloodMapOverlay;
    if (!setOverlay || !activeParcelNodeId) return undefined;
    if (!study || study.honestEmpty) return undefined;
    setOverlay(study, activeParcelNodeId);
    return () => setOverlay(null);
  }, [study, activeParcelNodeId, host]);

  // The Reports tool guarantees a non-null active property.
  if (!activeParcelNodeId) return null;

  return (
    <div
      data-testid="flood-drainage-section"
      style={
        embed
          ? undefined
          : {
              marginTop: 10,
              paddingTop: 10,
              borderTop: "0.5px solid rgba(154,166,178,0.22)",
            }
      }
    >
      {embed ? null : (
        <div style={{ fontSize: 10, color: MUTED, marginBottom: 6 }}>
          Flood &amp; drainage report · public-paid
        </div>
      )}

      {!study && !embed && (
        <p style={{ margin: "0 0 8px", fontSize: 11.5, lineHeight: 1.5, color: TEXT }}>
          Model this parcel&apos;s drainage: the upstream catchment delivering
          runoff, where water concentrates, modeled ponding at the design
          storm, and where it exits — drawn on the map.
        </p>
      )}

      {staleStyledStored && !busy && (
        <div
          data-testid="flood-stale-style"
          style={{ margin: "0 0 8px", fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
        >
          A drainage study was run on this parcel in an earlier build — re-run it
          to redraw with the current severity bands and flow paths.
        </div>
      )}

      <button
        type="button"
        data-testid="flood-run"
        disabled={busy}
        onClick={() => void run()}
        style={{
          width: "100%",
          padding: "7px 10px",
          borderRadius: "var(--btn-radius, 9px)",
          border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
          background: busy ? "transparent" : "var(--brand-blue-bg, rgba(59,130,246,0.12))",
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
          {/* The map is the star: the same study is drawn ON the main map
              while this report is open (host seam; absent host → dock only). */}
          {host.setFloodMapOverlay && (
            <div
              data-testid="flood-map-overlay-hint"
              style={{ marginBottom: 6, fontSize: 10, color: ACCENT }}
            >
              Drainage overlay drawn on the map — arrows mark where flow
              crosses the parcel boundary.
            </div>
          )}
          <FloodVizSvg model={model} />
          <Legend hasPonding={hasPonding} />
          {!hasPonding && (
            <div
              data-testid="flood-no-ponding"
              style={{ marginTop: 6, fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
            >
              {FLOOD_NO_PONDING_LINE}
            </div>
          )}
          <div
            data-testid="flood-provenance"
            style={{ marginTop: 6, fontSize: 10, color: MUTED, lineHeight: 1.5 }}
          >
            {floodProvenanceLine(study)}
            {study.gradient?.note ? (
              <span data-testid="flood-gradient-note"> · {study.gradient.note}</span>
            ) : null}
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
              borderRadius: "var(--btn-radius, 9px)",
              border: "0.5px solid var(--brand-blue-border-soft, rgba(59,130,246,0.28))",
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
