// W2 REPORTS BUBBLE — Option D (2026-08-24): one document at a time.
// Picker holds the catalog (including Coming soon). The selected row gets
// one description and one action. Live engines stay the existing sections;
// they mount only when that document is selected. Persistence keys unchanged:
// reports.sitePlan, reports.terrain, flood.

import { useCallback, useRef, useState, type ReactNode } from "react";
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
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { studioGrantedForEntitlement } from "../../lib/entitlementClient";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import { persistCheckoutOrigin } from "../../lib/checkoutOrigin";
import { attachExportToDossier } from "./reports-dossier";
import { FloodDrainageSection } from "./FloodTool";
import {
  RECORDS_PAYWALL_MESSAGE,
  RecordsRequestSection,
} from "./RecordsRequestSection";
import {
  assembleDossierExportBody,
  dossierExportNotice,
  requestDossierExport,
} from "./dossier-export";
import {
  findReportDoc,
  isReportDocId,
  readyCount,
  reportCatalogGroups,
  reportDocMeta,
  reportDocStatus,
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
const CARD_BORDER = "var(--surface-border, #243247)";
const BLUE = PE.accent;

export interface DossierDockState {
  notice: string | null;
  downloadUrl: string | null;
  generatedAt: string | null;
}

function lockedDefaultDoc(locked: boolean): ReportDocId | null {
  return locked ? "SPPDF" : null;
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

  if (!activeParcelNodeId) return null;

  if (ent.signedOut) {
    return (
      <LockedToolPanel
        valueLine={REPORTS_LOCKED_VALUE_LINE}
        signedOut
        signInLine="Sign in to run reports and exports on this parcel."
        testId="reports-locked"
      />
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

  const selectedId = isReportDocId(selectedRaw)
    ? selectedRaw
    : lockedDefaultDoc(ent.locked);
  const selected = selectedId ? findReportDoc(selectedId) : null;
  const counts = readyCount(
    ent.locked ? false : studioGranted,
  );
  const locked = ent.locked;

  const pick = (id: ReportDocId) => {
    setSelectedRaw(id);
    setPickerOpen(false);
  };

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
      {locked ? (
        <div data-testid="reports-locked" data-pro-only="false">
          <OptionDChrome
            address={address}
            readyLine={null}
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
          address={address}
          readyLine={`${counts.ready} ready of ${counts.total}`}
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
          {selected && !locked ? (
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
  address,
  readyLine,
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
  address: string | null;
  readyLine: string | null;
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
  const sub = [address, readyLine].filter(Boolean).join(" · ");
  return (
    <div>
      {sub ? (
        <div
          data-testid="reports-ready-count"
          style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}
        >
          {sub}
        </div>
      ) : null}

      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: MUTED,
          marginBottom: 6,
        }}
      >
        Document
      </div>

      <button
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
          borderRadius: 8,
          background: "rgba(13,17,23,0.9)",
          border: "1px solid rgba(154,166,178,0.4)",
          color: selected ? TEXT : "var(--text-muted, #94A3B8)",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span>{selected ? selected.name : "Choose a report or export"}</span>
        <span style={{ color: MUTED, fontSize: 11 }} aria-hidden>
          ▾
        </span>
      </button>

      <div
        data-testid="reports-doc-menu"
        hidden={!pickerOpen}
        style={{
          marginTop: 8,
          borderRadius: 8,
          background: "rgba(13,17,23,0.96)",
          border: "1px solid rgba(154,166,178,0.3)",
          overflow: "hidden",
        }}
      >
        {reportCatalogGroups().map((g) => (
          <div key={g.group}>
            <div
              style={{
                padding: "9px 12px 6px",
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: BLUE,
              }}
            >
              {g.group}
            </div>
            {g.rows.map((row) => {
              const rowStatus = reportDocStatus(row, { studioGranted });
              const isSel = selected?.id === row.id;
              return (
                <button
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
                    padding: "9px 12px",
                    cursor: "pointer",
                    border: "none",
                    borderTop: "1px solid rgba(30,41,59,0.55)",
                    background: isSel ? "rgba(59,130,246,0.10)" : "transparent",
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
                    <span style={{ fontSize: 12.5 }}>{row.name}</span>
                    <span
                      style={{
                        fontFamily: "ui-monospace, Menlo, monospace",
                        fontSize: 10,
                        color: MUTED,
                      }}
                    >
                      {row.formatLabel}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      whiteSpace: "nowrap",
                      color: rowStatus.color,
                    }}
                  >
                    {rowStatus.text}
                  </span>
                </button>
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
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--text-muted, #7C8BA0)",
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
            borderRadius: 9,
            border: `1px solid ${CARD_BORDER}`,
            background: "rgba(11,14,19,0.5)",
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
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: BLUE,
              }}
            >
              {selected.kind}
            </span>
            <span style={{ fontSize: 10.5, color: status?.color ?? MUTED }}>
              {status?.text}
            </span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: TEXT }}>
              {selected.name}
            </div>
            <div
              style={{
                marginTop: 5,
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--text-muted, #94A3B8)",
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
              fontSize: 11.5,
              borderTop: "1px solid var(--surface-border, #1E293B)",
              paddingTop: 10,
            }}
          >
            {reportDocMeta(selected, generatedLabel).map((m) => (
              <span key={m.k} style={{ display: "contents" }}>
                <span style={{ color: MUTED }}>{m.k}</span>
                <span style={{ color: "#cbd5e1" }}>{m.v}</span>
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
              View pricing & unlock
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
          borderTop: "1px solid var(--surface-border, #1E293B)",
          fontSize: 11,
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
        studioLocked={false}
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

  if (doc.engine === "site-plan" && doc.sitePlanFormat) {
    return (
      <SitePlanExportSection
        key={`site-plan:${parcelNodeId}:${doc.sitePlanFormat}`}
        parcelNodeId={parcelNodeId}
        address={facts.address}
        countyName={facts.countyName}
        onPaymentRequired={() => onPaymentRequired(SITE_PLAN_PAYWALL_MESSAGE)}
        initialState={
          sitePlan
            ? { ...sitePlan, format: doc.sitePlanFormat }
            : {
                format: doc.sitePlanFormat,
                notice: null,
                result: null,
              }
        }
        onStateChange={onSitePlan}
        embed
        lockedFormat={doc.sitePlanFormat}
      />
    );
  }

  if (doc.engine === "terrain" && doc.terrainFormat) {
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
        key={`terrain:${parcelNodeId}:${doc.terrainFormat}`}
        parcelNodeId={parcelNodeId}
        onPaymentRequired={() =>
          onPaymentRequired(TERRAIN_PAYWALL_MESSAGE, {
            studioOnly: true,
            highlightTier: "studio",
          })
        }
        initialState={
          terrain
            ? { ...terrain, format: doc.terrainFormat }
            : { format: doc.terrainFormat, notice: null, result: null }
        }
        onStateChange={onTerrain}
        embed
        lockedFormat={doc.terrainFormat}
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
    const body = assembleDossierExportBody({
      parcelNodeId,
      dossier: null,
      brief: null,
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
    onStateChange({
      notice: dossierExportNotice(result),
      downloadUrl: result.downloadUrl,
      generatedAt: new Date().toISOString(),
    });
  };

  const hasFile = !!state?.downloadUrl;

  return (
    <div data-testid="reports-dossier-action">
      {hasFile ? (
        <DownloadFileButton
          href={state.downloadUrl}
          label="Download PDF"
          testId="reports-dossier-download"
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
          style={{ marginTop: 8, fontSize: 10.5, color: MUTED, lineHeight: 1.45 }}
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
