// W7 reports and exports picker. Coming soon is not on the purchase surface.
// Persistence keys unchanged: reports.sitePlan, reports.terrain, flood.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { liveViewHref } from "../../lib/live-view";
import {
  defaultReceivedShareStore,
  readReceivedShares,
  type ReceivedShareRow,
} from "../../share/share-received";
import {
  SitePlanExportSection,
  type SitePlanExportSectionState,
} from "../../browse/SitePlanExportSection";
import {
  TerrainExportSection,
  type TerrainExportSectionState,
} from "../../browse/TerrainExportSection";
import { Button } from "../../components/Button";
import { PE } from "../../styles/pe-chrome";
import { DownloadFileButton } from "../../components/DownloadFileButton";
import {
  recordPeActivationMilestone,
  recordPeGtmEvent,
} from "../../lib/gtmClient";
import { studioGrantedForEntitlement } from "../../lib/entitlementClient";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import { persistCheckoutOrigin } from "../../lib/checkoutOrigin";
import { PdfViewer } from "../../components/PdfViewer";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import {
  listSavedProperties,
  subscribeSavedPropertiesChanged,
} from "../../lib/savedPropertiesClient";
import {
  attachExportToDossier,
  fileReportOnProperty,
  filedReportsFromSaved,
  isPdfExportFormat,
  type FiledReportRow,
} from "./reports-dossier";
import { FloodDrainageSection } from "./FloodTool";
import {
  RECORDS_PAYWALL_MESSAGE,
  RecordsRequestSection,
} from "./RecordsRequestSection";
import {
  isUnseen,
  loadSeen,
  reportKey,
  resolveSeen,
  saveSeen,
} from "./reports-seen";
import {
  effectiveSelectedDoc,
  routePick,
  shouldPromotePending,
} from "./reports-doc-selection";
import {
  assembleDossierExportBody,
  dossierExportNotice,
  requestDossierExport,
} from "./dossier-export";
import { runBriefResearch } from "./brief-research";
import {
  findReportDoc,
  isReportDocId,
  normalizeReportDocId,
  reportCatalogGroups,
  reportDocLockChip,
  reportDocMeta,
  reportDocStatus,
  reportsFreshnessLine,
  type ReportDocDef,
  type ReportDocId,
} from "./reports-catalog";

export const REPORTS_LOCKED_VALUE_LINE =
  "Professional reports on this property — the cited site-plan export (layered DXF/IFC + PDF sheet with setbacks, contours, and provenance), the flood & drainage study drawn on the map with its PDF sheet, and every report that ships next.";
export const SITE_PLAN_PAYWALL_MESSAGE =
  "Cited site-plan export — layered DXF/IFC plus a PDF sheet with setbacks, contours, and provenance.";
/** TERRAIN IS STUDIO-ONLY: never claimed by the $15 property unlock. */
export const TERRAIN_PAYWALL_MESSAGE =
  "Multi-format terrain export (GLB, IFC, DXF) is a Studio feature — it is not part of the single-property unlock.";
export const DOSSIER_PAYWALL_MESSAGE =
  "The property X-ray PDF — verdict, cited brief facts, your notes and AI research summary, with the site-plan sheets appended.";

const MUTED = PE.muted2;
const TEXT = PE.text;
const CARD_BORDER = PE.line14;
const BLUE = PE.accent;
/** Unread marker. Amber is the operator-chosen colour for "new to you". */
const AMBER = PE.warning;

export interface DossierDockState {
  notice: string | null;
  downloadUrl: string | null;
  generatedAt: string | null;
}

function lockedDefaultDoc(locked: boolean): ReportDocId | null {
  return locked ? "SITEPLAN" : null;
}

function shortAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const first = address.split(",")[0]?.trim();
  return first || null;
}

function generatedDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  return day.length === 10 ? day : null;
}

export function ReportsTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [sitePlan, setSitePlan] =
    useDockToolState<SitePlanExportSectionState>("reports.sitePlan");
  const [terrain, setTerrain] =
    useDockToolState<TerrainExportSectionState>("reports.terrain");
  const [selectedRaw, setSelectedRaw] =
    useDockToolState<string>("reports.selectedDoc");
  const [dossier, setDossier] =
    useDockToolState<DossierDockState>("reports.dossier");
  const [pickerOpen, setPickerOpen] = useState(false);
  // PRE-PARCEL PICK. useDockToolState refuses a write with no active parcel
  // ("no phantom-property writes" in WorkbenchContext) — correctly, since that
  // state is keyed BY property. But it meant picking a report before choosing
  // a parcel silently did nothing: the operator clicked a doc and the picker
  // just closed on an empty module. So a pre-parcel choice is held HERE, in
  // component state, and handed to the per-property store the moment a parcel
  // arrives. Pick the report, then click the parcel, and it is already set.
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);
  const [reportsTab, setReportsTab] = useState<"mine" | "shared">("mine");
  const receivedShares = readReceivedShares(defaultReceivedShareStore());
  const ent = usePropertyEntitlement(activeParcelNodeId);

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

  if (ent.signedOut && reportsTab === "mine") {
    return (
      <div data-testid="reports-tool">
        <ReportsTabs tab={reportsTab} onTab={setReportsTab} />
        <LockedToolPanel
          valueLine={REPORTS_LOCKED_VALUE_LINE}
          signedOut
          signInLine="Sign in to run reports and exports on this parcel."
          testId="reports-locked"
        />
      </div>
    );
  }

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
  const address =
    shortAddress(host.getActivePropertyAddress?.() ?? facts.address);

  const paywall = (
    message: string,
    opts?: { studioOnly?: boolean; highlightTier?: "solo" | "studio" | "team" },
  ) => {
    void recordPeGtmEvent({
      eventType: "pe_paywall_hit",
      parcelNodeId: activeParcelNodeId,
    });
    persistCheckoutOrigin({
      kind: message.toLowerCase().includes("export") ? "export" : "report",
      label: message,
      parcelNodeId: activeParcelNodeId,
    });
    host.openPaywall(message, opts);
  };

  const studioGranted =
    ent.status === "ready" && studioGrantedForEntitlement(ent);
  const terrainProLocked = ent.status === "ready" && !studioGranted;
  const locked = ent.locked;

  const effectiveRaw = effectiveSelectedDoc(activeParcelNodeId, selectedRaw, pendingDoc);
  const selectedIdRaw = isReportDocId(effectiveRaw)
    ? normalizeReportDocId(effectiveRaw)
    : lockedDefaultDoc(locked);
  const selectedCandidate = selectedIdRaw ? findReportDoc(selectedIdRaw) : null;
  const selected =
    selectedCandidate && selectedCandidate.purchaseSurface
      ? selectedCandidate
      : locked
        ? findReportDoc("SITEPLAN")
        : null;
  const selectedId = selected?.id ?? null;
  const freshness = reportsFreshnessLine(address, new Date());

  const pick = (id: ReportDocId) => {
    if (routePick(activeParcelNodeId) === "store") {
      setSelectedRaw(id);
    } else {
      // Held, not dropped. The header pill says what is still missing.
      setPendingDoc(id);
    }
    setPickerOpen(false);
  };

  // Carry the held pick into per-property state as soon as there IS one.
  useEffect(() => {
    if (!shouldPromotePending(activeParcelNodeId, pendingDoc)) return;
    setSelectedRaw(pendingDoc);
    setPendingDoc(null);
  }, [activeParcelNodeId, pendingDoc, setSelectedRaw]);

  const generatedLabel = selected
    ? generatedLabelFor(selected, sitePlan, terrain, dossier)
    : null;
  const status = selected
    ? reportDocStatus(selected, {
        studioGranted,
        generatedLabel,
      })
    : null;

  return (
    <div
      data-testid="reports-tool"
      data-selected-doc={selectedId ?? ""}
    >
      <ReportsTabs tab={reportsTab} onTab={setReportsTab} />
      {reportsTab === "shared" ? (
        <SharedWithMeList rows={receivedShares} />
      ) : (
        <>
          {locked ? (
        <div data-testid="reports-locked" data-pro-only="false">
          <OptionDChrome
            freshness={freshness}
            pickerOpen={pickerOpen}
            selected={selected}
            status={status}
            generatedLabel={generatedLabel}
            studioGranted={false}
            onTogglePicker={() => setPickerOpen((v) => !v)}
            onPick={pick}
            onChange={() => {
              setSelectedRaw(null);
              setPickerOpen(true);
            }}
            locked
            onViewPricing={() => paywall(REPORTS_LOCKED_VALUE_LINE)}
          />
        </div>
      ) : (
        <OptionDChrome
          freshness={freshness}
          pickerOpen={pickerOpen}
          selected={selected}
          status={status}
          generatedLabel={generatedLabel}
            studioGranted={studioGranted}
          onTogglePicker={() => setPickerOpen((v) => !v)}
          onPick={pick}
          onChange={() => {
            setSelectedRaw(null);
            setPickerOpen(true);
          }}
        >
          {activeParcelNodeId && selected && !locked ? (
            <SelectedEngine
              doc={selected}
              parcelNodeId={activeParcelNodeId}
              facts={facts}
              sitePlan={sitePlan}
              terrain={terrain}
              dossier={dossier}
              terrainProLocked={
                selected.studioGated ? terrainProLocked : false
              }
              onSitePlan={(next) => {
                setSitePlan(next);
                maybeAttach(activeParcelNodeId, "site-plan", next.result);
              }}
              onTerrain={(next) => {
                setTerrain(next);
                maybeAttach(activeParcelNodeId, "terrain", next.result);
              }}
              onDossier={setDossier}
              onPaymentRequired={paywall}
              onOpenBrief={() => host.openTool?.("brief")}
            />
          ) : null}
        </OptionDChrome>
          )}
          {/* NO PARCEL: the generator MODULE still renders above — it is the
              top of this dock in both states now. Only the engine needs a
              parcel. The dock header carries the amber "select a property"
              pill, so this line is the HOW, not a second copy of the WHAT.
              It sits OUTSIDE OptionDChrome because that component only
              renders children once a doc is selected. */}
          {!activeParcelNodeId ? (
            <p
              data-testid="reports-no-property"
              style={{
                margin: "10px 0 0",
                fontSize: 14.5,
                lineHeight: 1.55,
                color: MUTED,
              }}
            >
              Click a parcel on the map, or search an address or parcel id.
            </p>
          ) : null}
          {/* MY REPORTS, ALWAYS UNDER THE GENERATOR, one list in both states.
              Account-wide (listSavedProperties), so selecting a parcel never
              hides it. Operator 2026-08-28. */}
          <div style={{ marginTop: 14 }}>
            <ReportsLibrary />
          </div>
        </>
      )}
    </div>
  );
}

function filedKindLabel(kind: FiledReportRow["kind"]): string {
  if (kind === "flood-drainage") return "Flood & drainage";
  if (kind === "xray") return "X-ray";
  if (kind === "site-plan") return "Site plan";
  return "Terrain";
}

function ReportsLibrary() {
  const [rows, setRows] = useState<FiledReportRow[] | null>(null);
  const [mode, setMode] = useState<"loading" | "ready" | "sign-in" | "error">(
    "loading",
  );
  const [viewing, setViewing] = useState<FiledReportRow | null>(null);
  // null until the rows land: the seed decision needs the rows to seed WITH.
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);

  /** Opening a report is what marks it read. Nothing else does. */
  const markSeen = (row: FiledReportRow) => {
    setSeen((cur) => {
      const next = new Set(cur ?? []);
      next.add(reportKey(row));
      saveSeen(next);
      return next;
    });
  };

  // SUBSCRIBED, not fetch-once. This effect had an EMPTY dep array, so the
  // library read the list when the dock mounted and never again — generate a
  // report while the dock is open and the list under the generator is from
  // before you started. That is the "I ran this report and it didn't show up"
  // bug; nothing was lost, the list was stale.
  //
  // The signal already existed and already fires on every write
  // (notifySavedPropertiesChanged in savedPropertiesClient, which InspectCard
  // and SavedPropertyPins were already listening to). This library simply was
  // not a subscriber. No new mechanism, no poll.
  useEffect(() => {
    let cancelled = false;
    const read = () => {
    void listSavedProperties().then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "sign-in") {
        setMode("sign-in");
        setRows([]);
        return;
      }
      if (outcome.kind !== "ready") {
        setMode("error");
        setRows([]);
        return;
      }
      const filed = filedReportsFromSaved(outcome.items);
      setRows(filed);
      // Seed here, not on mount: an untracked reader's EXISTING library is
      // not news, and only rows filed after this point may light up.
      const resolved = resolveSeen(filed, loadSeen());
      saveSeen(resolved);
      setSeen(resolved);
      setMode("ready");
    });
    };
    read();
    const unsubscribe = subscribeSavedPropertiesChanged(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (mode === "sign-in") {
    return (
      <div data-testid="reports-library-signin">
        <p style={{ margin: "0 0 10px", fontSize: 14.5, color: MUTED }}>
          Sign in to see reports you have already filed. You do not need to
          pick a parcel first.
        </p>
        <GoogleSignInButton size="md" testId="reports-library-sign-in" />
      </div>
    );
  }
  if (mode === "loading") {
    return (
      <p data-testid="reports-library-loading" style={{ margin: 0, fontSize: 14.5, color: MUTED }}>
        Loading your reports…
      </p>
    );
  }
  if (mode === "error") {
    return (
      <p data-testid="reports-library-error" style={{ margin: 0, fontSize: 14.5, color: MUTED }}>
        Could not load filed reports. Open My properties and retry.
      </p>
    );
  }
  if (!rows?.length) {
    return (
      <p data-testid="reports-library-empty" style={{ margin: 0, fontSize: 14.5, color: MUTED }}>
        No filed reports yet. Run Flood or X-ray on a property and it lands
        here.
      </p>
    );
  }
  return (
    <div data-testid="reports-library">
      {rows.map((row) => (
        <div
          key={`${row.parcelNodeId}:${row.kind}:${row.format}:${row.savedAt}`}
          data-testid="reports-library-row"
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            padding: "6px 0",
            borderBottom: `1px solid ${CARD_BORDER}`,
            fontSize: 14.5,
          }}
        >
          <span
            data-testid={
              seen && isUnseen(row, seen)
                ? "reports-library-unseen"
                : "reports-library-seen"
            }
            aria-label={seen && isUnseen(row, seen) ? "Not opened yet" : undefined}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              flex: "0 0 auto",
              alignSelf: "center",
              // Amber only when we actually know it is new. While `seen` is
              // still null we know nothing, so the slot holds its space and
              // shows no colour rather than guessing.
              background: seen && isUnseen(row, seen) ? AMBER : "transparent",
            }}
          />
          <span style={{ flex: 1, color: TEXT }}>
            {filedKindLabel(row.kind)}
            <span style={{ color: MUTED, fontSize: 12.5 }}>
              {" "}
              · {row.address}
              {row.savedAt ? ` · ${row.savedAt.slice(0, 10)}` : ""}
            </span>
          </span>
          {isPdfExportFormat(row.format) ? (
            <Button
              type="button"
              data-testid="reports-library-view"
              onClick={() => {
                markSeen(row);
                setViewing(row);
              }}
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                height: "auto",
                color: BLUE,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              View
            </Button>
          ) : null}
          <a
            href={row.downloadPath}
            data-testid="reports-library-download"
            style={{ color: BLUE, fontSize: 12.5, fontWeight: 600 }}
          >
            Download
          </a>
        </div>
      ))}
      {viewing ? (
        <PdfViewer
          href={viewing.downloadPath}
          title={filedKindLabel(viewing.kind)}
          parcelNodeId={viewing.parcelNodeId}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

function ReportsTabs({
  tab,
  onTab,
}: {
  tab: "mine" | "shared";
  onTab: (next: "mine" | "shared") => void;
}) {
  return (
    <div
      data-testid="reports-tabs"
      style={{ display: "flex", gap: 8, marginBottom: 12 }}
    >
      <Button
        type="button"
        data-testid="reports-tab-mine"
        aria-pressed={tab === "mine"}
        onClick={() => onTab("mine")}
        style={{
          flex: 1,
          padding: "7px 8px",
          fontSize: 14.5,
          fontWeight: 600,
          borderRadius: 10,
          border: `1px solid ${CARD_BORDER}`,
          background: tab === "mine" ? PE.blueBg : "transparent",
          color: TEXT,
          cursor: "pointer",
        }}
      >
        My reports
      </Button>
      <Button
        type="button"
        data-testid="reports-tab-shared"
        aria-pressed={tab === "shared"}
        onClick={() => onTab("shared")}
        style={{
          flex: 1,
          padding: "7px 8px",
          fontSize: 14.5,
          fontWeight: 600,
          borderRadius: 10,
          border: `1px solid ${CARD_BORDER}`,
          background: tab === "shared" ? PE.blueBg : "transparent",
          color: TEXT,
          cursor: "pointer",
        }}
      >
        Shared with me
      </Button>
    </div>
  );
}

function SharedWithMeList({ rows }: { rows: ReceivedShareRow[] }) {
  if (rows.length === 0) {
    return (
      <p data-testid="reports-shared-empty" style={{ margin: 0, fontSize: 14.5, color: MUTED }}>
        Nothing has been shared with this browser yet. Open a share link to
        file it here. You can read shared reports; generating new ones stays
        on My reports after upgrade.
      </p>
    );
  }
  return (
    <div data-testid="reports-shared-list">
      {rows.map((row) => {
        const live = liveViewHref({
          parcelNodeId: row.parcelNodeId,
          grantId: row.grantId,
        });
        return (
          <article
            key={row.id}
            data-testid="reports-shared-row"
            style={{
              marginBottom: 10,
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${CARD_BORDER}`,
            }}
          >
            <strong style={{ display: "block", fontSize: 15.5 }}>
              {row.address ?? `Parcel ${row.parcelNodeId}`}
            </strong>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
              {row.parcelNodeId}
              {row.expiresAt ? ` · expires ${row.expiresAt.slice(0, 10)}` : ""}
            </div>
            {row.notes ? (
              <p
                data-testid="reports-shared-notes"
                style={{ margin: "6px 0 0", fontSize: 14.5, whiteSpace: "pre-wrap" }}
              >
                {row.notes}
              </p>
            ) : null}
            <div style={{ marginTop: 6, fontSize: 12.5, color: MUTED }}>
              {[
                row.artifacts.xray ? "X-ray" : null,
                row.artifacts.sitePlan ? "Site plan" : null,
                row.artifacts.terrain ? "Terrain" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Shared analysis"}
            </div>
            {live ? (
              <a
                href={live}
                data-testid="reports-shared-live-view"
                style={{ display: "inline-block", marginTop: 6, fontSize: 14.5, color: BLUE }}
              >
                Open live view
              </a>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function generatedLabelFor(
  doc: ReportDocDef,
  sitePlan: SitePlanExportSectionState | null,
  terrain: TerrainExportSectionState | null,
  dossier: DossierDockState | null,
): string | null {
  if (doc.engine === "site-plan") {
    return generatedDay(sitePlan?.result?.atom.fetchedAt);
  }
  if (doc.engine === "terrain") {
    return generatedDay(terrain?.result?.atom.fetchedAt);
  }
  if (doc.engine === "dossier") {
    return generatedDay(dossier?.generatedAt);
  }
  return null;
}

function OptionDChrome({
  freshness,
  pickerOpen,
  selected,
  status,
  generatedLabel,
  studioGranted,
  onTogglePicker,
  onPick,
  onChange,
  locked,
  onViewPricing,
  children,
}: {
  freshness: string;
  pickerOpen: boolean;
  selected: ReportDocDef | null;
  status: { text: string; color: string } | null;
  generatedLabel: string | null;
  studioGranted: boolean;
  onTogglePicker: () => void;
  onPick: (id: ReportDocId) => void;
  onChange: () => void;
  locked?: boolean;
  onViewPricing?: () => void;
  children?: ReactNode;
}) {
  return (
    <div>
      <div
        data-testid="reports-freshness"
        style={{ fontSize: 12.5, color: MUTED, marginBottom: 10 }}
      >
        {freshness}
      </div>

      <div
        style={{
          fontSize: 12.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: MUTED,
          marginBottom: 6,
        }}
      >
        Reports and exports
      </div>

      <Button
        type="button"
        data-testid="reports-doc-picker"
        aria-expanded={pickerOpen}
        onClick={onTogglePicker}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "11px 12px",
          borderRadius: 12,
          background: "color-mix(in oklab, var(--ss-ink) 90%, transparent)",
          border: `1px solid ${PE.line28}`,
          color: selected ? TEXT : MUTED,
          fontSize: 15.5,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span>{selected ? selected.name : "Choose a report or export"}</span>
        <span style={{ color: MUTED, fontSize: 12.5 }} aria-hidden>
          ▾
        </span>
      </Button>

      <div
        data-testid="reports-doc-menu"
        hidden={!pickerOpen}
        className="ss-stagger"
        data-ss-motion=""
        style={{
          marginTop: 8,
          borderRadius: PE.rFloat,
          background: PE.sheet,
          border: `1px solid ${PE.line14}`,
          overflow: "hidden",
        }}
      >
        {reportCatalogGroups().map((g) => (
          <div key={g.group}>
            <div
              style={{
                padding: "10px 12px 5px",
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: ".13em",
                textTransform: "uppercase",
                color: PE.t6,
              }}
            >
              {g.group}
            </div>
            {g.rows.map((row) => {
              const lock = reportDocLockChip(row, { studioGranted });
              const rowStatus = lock ?? reportDocStatus(row, { studioGranted });
              const isSel = selected?.id === row.id;
              return (
                <Button
                  key={row.id}
                  type="button"
                  data-testid={`reports-doc-option-${row.id}`}
                  onClick={() => onPick(row.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    minHeight: 36,
                    padding: "7px 12px",
                    cursor: "pointer",
                    border: "none",
                    borderTop: `1px solid ${PE.line06}`,
                    background: isSel ? PE.blueBg : "transparent",
                    color: TEXT,
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontSize: 14.5, color: PE.t2 }}>{row.name}</span>
                    <span
                      style={{
                        fontFamily: PE.mono,
                        fontSize: 11.5,
                        color: PE.t6,
                      }}
                    >
                      {row.formatLabel}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      color: rowStatus.color,
                    }}
                  >
                    {rowStatus.text}
                  </span>
                </Button>
              );
            })}
          </div>
        ))}
      </div>

      {!selected ? (
        <div
          data-testid="reports-pick-hint"
          style={{
            padding: "14px 2px 4px",
            fontSize: 14.5,
            lineHeight: 1.55,
            color: PE.t5,
          }}
        >
          Pick a document to see what it is, what it contains, and whether it
          has been generated for this parcel.
        </div>
      ) : (
        <div
          data-testid="reports-doc-card"
          data-doc={selected.id}
          style={{
            marginTop: 10,
            borderRadius: 14,
            border: `1px solid ${CARD_BORDER}`,
            background: "color-mix(in oklab, var(--ss-ink) 50%, transparent)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: BLUE,
              }}
            >
              {selected.kind}
            </span>
            <span style={{ fontSize: 12.5, color: status?.color ?? MUTED }}>
              {status?.text}
            </span>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 17.5, color: TEXT }}>
              {selected.name}
            </div>
            <div
              style={{
                marginTop: 5,
                fontSize: 14.5,
                lineHeight: 1.5,
                color: MUTED,
              }}
            >
              {selected.promise}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "6px 12px",
              fontSize: 12.5,
              borderTop: `1px solid ${CARD_BORDER}`,
              paddingTop: 10,
            }}
          >
            {reportDocMeta(selected, generatedLabel).map((m) => (
              <span key={m.k} style={{ display: "contents" }}>
                <span style={{ color: MUTED }}>{m.k}</span>
                <span style={{ color: PE.t3 }}>{m.v}</span>
              </span>
            ))}
          </div>

          {locked ? (
            <Button
              type="button"
              variant="primary"
              fullWidth
              data-testid="view-pricing-button"
              onClick={onViewPricing}
            >
              Unlock this property, 30 days
            </Button>
          ) : (
            children
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="button"
              variant="secondary"
              data-testid="reports-doc-change"
              onClick={onChange}
            >
              Change
            </Button>
          </div>
        </div>
      )}

      <div
        data-testid="reports-footer"
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${CARD_BORDER}`,
          fontSize: 12.5,
          color: MUTED,
        }}
      >
        The inspect card and map layers stay free.
      </div>
    </div>
  );
}

function SelectedEngine({
  doc,
  parcelNodeId,
  facts,
  sitePlan,
  terrain,
  dossier,
  terrainProLocked,
  onSitePlan,
  onTerrain,
  onDossier,
  onPaymentRequired,
  onOpenBrief,
}: {
  doc: ReportDocDef;
  parcelNodeId: string;
  facts: { address: string | null; countyName: string | null };
  sitePlan: SitePlanExportSectionState | null;
  terrain: TerrainExportSectionState | null;
  dossier: DossierDockState | null;
  terrainProLocked: boolean;
  onSitePlan: (next: SitePlanExportSectionState) => void;
  onTerrain: (next: TerrainExportSectionState) => void;
  onDossier: (next: DossierDockState) => void;
  onPaymentRequired: (
    message: string,
    opts?: { studioOnly?: boolean; highlightTier?: "solo" | "studio" | "team" },
  ) => void;
  onOpenBrief: () => void;
}) {
  if (doc.catalogStatus === "coming") {
    return (
      <Button type="button" variant="secondary" fullWidth disabled>
        Coming soon
      </Button>
    );
  }

  if (doc.engine === "brief") {
    return (
      <Button
        type="button"
        variant="primary"
        fullWidth
        data-testid="reports-open-brief"
        onClick={onOpenBrief}
      >
        Open brief
      </Button>
    );
  }

  if (doc.engine === "dossier") {
    return (
      <DossierExportAction
        parcelNodeId={parcelNodeId}
        facts={facts}
        state={dossier}
        onStateChange={onDossier}
        onPaymentRequired={() => onPaymentRequired(DOSSIER_PAYWALL_MESSAGE)}
      />
    );
  }

  if (doc.engine === "flood") {
    return <FloodDrainageSection embed />;
  }

  if (doc.engine === "records") {
    return (
      <RecordsRequestSection
        parcelNodeId={parcelNodeId}
        address={facts.address}
        countyName={facts.countyName}
        studioLocked={terrainProLocked}
        onPaymentRequired={() =>
          onPaymentRequired(RECORDS_PAYWALL_MESSAGE, {
            studioOnly: true,
            highlightTier: "studio",
          })
        }
        embed
      />
    );
  }

  if (doc.engine === "site-plan") {
    return (
      <SitePlanExportSection
        key={`site-plan:${parcelNodeId}`}
        parcelNodeId={parcelNodeId}
        address={facts.address}
        countyName={facts.countyName}
        onPaymentRequired={() => onPaymentRequired(SITE_PLAN_PAYWALL_MESSAGE)}
        initialState={
          sitePlan ?? {
            format: "pdf-site-plan",
            notice: null,
            result: null,
          }
        }
        onStateChange={onSitePlan}
        embed
      />
    );
  }

  if (doc.engine === "terrain") {
    if (terrainProLocked) {
      return (
        <LockedToolPanel
          valueLine="Terrain export — the parcel's real terrain as GLB, IFC, or DXF for modeling tools."
          proOnly
          proOnlyNote={TERRAIN_PAYWALL_MESSAGE}
          testId="terrain-pro-lock"
        />
      );
    }
    return (
      <TerrainExportSection
        key={`terrain:${parcelNodeId}`}
        parcelNodeId={parcelNodeId}
        onPaymentRequired={() =>
          onPaymentRequired(TERRAIN_PAYWALL_MESSAGE, {
            studioOnly: true,
            highlightTier: "studio",
          })
        }
        initialState={
          terrain ?? { format: "glb", notice: null, result: null }
        }
        onStateChange={onTerrain}
        embed
      />
    );
  }

  return null;
}

function DossierExportAction({
  parcelNodeId,
  facts,
  state,
  onStateChange,
  onPaymentRequired,
}: {
  parcelNodeId: string;
  facts: { address: string | null; countyName: string | null };
  state: DossierDockState | null;
  onStateChange: (next: DossierDockState) => void;
  onPaymentRequired: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const briefOutcome = await runBriefResearch(parcelNodeId);
    const brief = briefOutcome.kind === "ready" ? briefOutcome.brief : null;
    const body = assembleDossierExportBody({
      parcelNodeId,
      dossier: null,
      brief,
      facts,
    });
    const result = await requestDossierExport(body);
    setBusy(false);
    if (!result.ok && result.status === 402) {
      onPaymentRequired();
      onStateChange({
        notice: dossierExportNotice(result),
        downloadUrl: null,
        generatedAt: null,
      });
      return;
    }
    if (!result.ok) {
      onStateChange({
        notice: dossierExportNotice(result),
        downloadUrl: null,
        generatedAt: state?.generatedAt ?? null,
      });
      return;
    }
    // P-100 item 4. Fired on the SUCCESS path only: a 402 or a failure is
    // not a report opened, and counting the attempt would make the activation
    // rate a measure of clicks rather than of a first useful answer. Once per
    // account is held by the composite primary key, so this fires on every
    // successful report and only the first one lands.
    void recordPeActivationMilestone("first_report_opened", "reports-tool");
    onStateChange({
      notice: dossierExportNotice(result),
      downloadUrl: result.downloadUrl,
      generatedAt: new Date().toISOString(),
    });
    void fileReportOnProperty(
      parcelNodeId,
      "xray",
      {
        selectedFormat: "pdf-dossier",
        downloadUrl: result.downloadUrl,
      },
      { label: facts.address, address: facts.address },
    );
  };

  const hasFile = !!state?.downloadUrl;

  return (
    <div data-testid="reports-dossier-action">
      {hasFile ? (
        <DownloadFileButton
          href={state.downloadUrl}
          label="Download PDF"
          testId="reports-dossier-download"
          parcelNodeId={parcelNodeId}
        />
      ) : busy ? (
        <DownloadFileButton
          label="Download PDF"
          state="generating"
          testId="reports-dossier-download"
        />
      ) : null}
      {state?.notice ? (
        <div
          data-testid="reports-dossier-notice"
          style={{ marginTop: 8, fontSize: 12.5, color: MUTED, lineHeight: 1.45 }}
        >
          {state.notice}
        </div>
      ) : null}
      <Button
        type="button"
        variant={hasFile ? "secondary" : "primary"}
        fullWidth
        data-testid="reports-dossier-run"
        disabled={busy}
        onClick={() => void run()}
        style={{ marginTop: hasFile || busy || state?.notice ? 8 : 0 }}
      >
        {busy ? "Building…" : hasFile ? "Re-run" : "Generate"}
      </Button>
    </div>
  );
}
