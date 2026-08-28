// MY PROPERTIES — the saved-properties workspace tool (Workbench W4, WB6).
//
// Surfaces the EXISTING cortex saved-properties backend (auth-gated, through
// the deep proxy). The SERVER IS THE TRUTH: nothing is persisted chassis-side;
// this tool holds only the transient fetched list per mount and refetches when
// any entry point mutates (savedPropertiesClient change notifications — the
// InspectCard "Save property" button and this tool share ONE save flow).
//
// WB6 — MASTER → DETAIL inside the SAME dock (the design law: one dock, no
// second surface):
//   - the LIST stays the master view (label fallback: label → dossier address
//     → parcel id; NEVER an empty-comma artifact like ", ,");
//   - clicking a saved property opens the DOSSIER DETAIL view in the dock
//     (PropertyDossierDetail: header, notes, drawings, chat summary, exports)
//     AND navigates the map to the property (the #104 reopen flight, kept)
//     AND redraws any saved drawings as the read-only dossier overlay;
//   - a Back button returns to the master list;
//   - saving a property (list save-current) seeds the dossier with savedAt /
//     address / the CURRENT map drawings (savePropertyWithDossier — merges,
//     never clobbers an existing dossier);
//   - 401 → honest sign-in state (link to the OIDC start).

import { useCallback, useEffect, useState } from "react";
import {
  listSavedProperties,
  removeSavedProperty,
  savePropertyWithDossier,
  updatePropertyDossier,
  subscribeSavedPropertiesChanged,
  type SavedPropertyRow,
} from "../../lib/savedPropertiesClient";
import {
  savedRowDisplayLabel,
  sanitizeDrawings,
  statusRemovesProperty,
  type DossierFeatureCollection,
  type DossierStatus,
} from "../../lib/propertyDossier";
import {
  notesExcludeNeedsGrantId,
  upsertSharePackage,
} from "../../lib/share-package";
import { mintShareLink } from "../../lib/shareClient";
import { pinAccent, resolvePinForSave } from "../../lib/saved-pins";
import { Button } from "../../components/Button";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { PE } from "../../styles/pe-chrome";
import { parcelNodes } from "../../lib/parcel-node-store.js";
import { useWorkbench } from "../WorkbenchContext";
import {
  PropertyDossierDetail,
  PropertyRowReports,
  STATUS_LABELS,
  type PropertyShareMint,
} from "./PropertyDossierDetail";
import {
  initialPropertiesView,
  type PropertiesView,
} from "./properties-pending-open";

const MUTED = PE.muted;
const AMBER = PE.warning;
const TEXT = PE.text;
const ACCENT = PE.accent;

type ListPhase =
  | { kind: "loading" }
  | { kind: "ready"; items: SavedPropertyRow[] }
  | { kind: "sign-in" }
  | { kind: "notice"; text: string };

/** Master list vs. one property's dossier detail — same dock, one surface. */
export type { PropertiesView } from "./properties-pending-open";

/** WB7d — list filter value: all, or one of the three statuses. */
export type StatusFilter = "all" | DossierStatus;

/** The filter row only appears once the list outgrows this (keep small lists clean). */
export const STATUS_FILTER_MIN_ENTRIES = 6;

/** Apply the status filter ("all" passes everything through). */
export function filterRowsByStatus(
  items: SavedPropertyRow[],
  filter: StatusFilter,
): SavedPropertyRow[] {
  if (filter === "all") return items;
  return items.filter((row) => (row.snapshot?.status ?? null) === filter);
}

/** Best-effort label for the ACTIVE property from the ported node store. */
export function activePropertyLabel(activeParcelNodeId: string): string | null {
  const store = parcelNodes as {
    getInspected?: () => { attrs?: { parcelNodeId?: unknown }; address?: unknown } | null;
    getSubject?: () => { attrs?: { parcelNodeId?: unknown }; address?: unknown } | null;
  };
  for (const node of [store.getInspected?.(), store.getSubject?.()]) {
    if (
      node &&
      node.attrs?.parcelNodeId === activeParcelNodeId &&
      typeof node.address === "string" &&
      node.address.trim()
    ) {
      return node.address;
    }
  }
  return null;
}

/** WB7c — best-effort centroid for the ACTIVE property from the node store
 *  (the save flow's known center; resolvePinForSave falls back from here). */
export function activePropertyCenter(
  activeParcelNodeId: string,
): { lat: number; lng: number } | null {
  const store = parcelNodes as {
    getInspected?: () => {
      attrs?: { parcelNodeId?: unknown };
      centroid?: { lat?: unknown; lng?: unknown } | null;
    } | null;
    getSubject?: () => {
      attrs?: { parcelNodeId?: unknown };
      centroid?: { lat?: unknown; lng?: unknown } | null;
    } | null;
  };
  for (const node of [store.getInspected?.(), store.getSubject?.()]) {
    if (
      node &&
      node.attrs?.parcelNodeId === activeParcelNodeId &&
      typeof node.centroid?.lat === "number" &&
      typeof node.centroid?.lng === "number"
    ) {
      return { lat: node.centroid.lat, lng: node.centroid.lng };
    }
  }
  return null;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return iso.slice(0, 10);
}

/**
 * Presentational list — exported for direct render tests (the container's
 * fetch effect does not run under react-dom/server).
 */
export function PropertiesList({
  phase,
  activeParcelNodeId,
  busy,
  statusFilter = "all",
  onStatusFilterChange,
  onSaveCurrent,
  onOpen,
  onRemove,
  onToggleShareReport,
}: {
  phase: ListPhase;
  activeParcelNodeId: string | null;
  busy: boolean;
  /** WB7d — active status filter; the row only renders on lists with more
   *  than 5 entries (small lists stay clean). */
  statusFilter?: StatusFilter;
  onStatusFilterChange?: (filter: StatusFilter) => void;
  onSaveCurrent: () => void;
  /** Open the dossier DETAIL view AND navigate the map (the reopen flight). */
  onOpen: (parcelNodeId: string) => void;
  onRemove: (parcelNodeId: string) => void;
  onToggleShareReport?: (
    parcelNodeId: string,
    report: "xray" | "flood",
    included: boolean,
  ) => void;
}) {
  if (phase.kind === "loading") {
    return (
      <p data-testid="properties-loading" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
        Loading saved properties…
      </p>
    );
  }
  if (phase.kind === "sign-in") {
    return (
      <div data-testid="properties-sign-in" style={{ margin: 0, fontSize: 11.5, color: AMBER }}>
        Sign in to save properties and see your workspace across devices.
        <div style={{ marginTop: 8 }}>
          <GoogleSignInButton size="sm" testId="properties-sign-in-link" />
        </div>
      </div>
    );
  }
  if (phase.kind === "notice") {
    return (
      <p data-testid="properties-notice" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
        {phase.text}
      </p>
    );
  }

  const items = phase.items;
  const activeSaved =
    activeParcelNodeId !== null &&
    items.some((row) => row.parcelNodeId === activeParcelNodeId);
  // WB7d — the filter row appears only once the list outgrows a handful of
  // entries; filtering applies to the RENDERED rows (server order preserved).
  const showFilter = items.length >= STATUS_FILTER_MIN_ENTRIES;
  const visibleItems = showFilter ? filterRowsByStatus(items, statusFilter) : items;

  return (
    <div data-testid="properties-list">
      {activeParcelNodeId && !activeSaved && (
        <Button
          variant="primary"
          fullWidth
          type="button"
          data-testid="properties-save-current"
          onClick={onSaveCurrent}
          disabled={busy}
          style={{ marginBottom: 10 }}
        >
          Save current property
        </Button>
      )}

      {showFilter && (
        <div
          data-testid="properties-status-filter"
          style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}
        >
          {(["all", "researching", "offer", "passed"] as const).map((f) => {
            const selected = statusFilter === f;
            const accent = f === "all" ? ACCENT : pinAccent(f);
            return (
              <button
                key={f}
                type="button"
                data-testid={`properties-filter-${f}`}
                aria-pressed={selected}
                onClick={() => onStatusFilterChange?.(f)}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  cursor: "pointer",
                  color: selected ? "#0B0E13" : accent,
                  background: selected ? accent : "transparent",
                  border: `1px solid ${accent}`,
                }}
              >
                {f === "all" ? "All" : STATUS_LABELS[f]}
              </button>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <p data-testid="properties-empty" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
          No saved properties yet. Click a parcel on the map and save it — your
          workspace lives on the server, not this browser.
        </p>
      ) : visibleItems.length === 0 ? (
        <p data-testid="properties-filter-empty" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
          No saved properties with this status.
        </p>
      ) : (
        visibleItems.map((row) => {
          const date = fmtDate(row.updatedAt) ?? fmtDate(row.snapshot?.savedAt ?? null);
          // WB6 label fallback chain: label → dossier address → parcel id.
          // cleanDisplayString inside guarantees no ", ," artifacts render.
          const title = savedRowDisplayLabel(row);
          const dossierBits = [
            row.snapshot?.notes ? "notes" : null,
            row.snapshot?.drawings ? "drawings" : null,
            row.snapshot?.chatSummary ||
            row.snapshot?.chatThread ||
            row.snapshot?.chatThreads?.length
              ? "chat"
              : null,
            row.snapshot?.exports?.length ? "exports" : null,
          ].filter((b): b is string => b !== null);
          const status = row.snapshot?.status ?? null;
          return (
            <div
              key={row.parcelNodeId}
              data-testid="properties-row"
              data-active={
                row.parcelNodeId === activeParcelNodeId ? "1" : undefined
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 8px 8px 0",
                borderBottom: `1px solid ${PE.line06}`,
                borderLeft: `3px solid ${
                  row.parcelNodeId === activeParcelNodeId
                    ? PE.blue
                    : "transparent"
                }`,
                paddingLeft: 9,
              }}
            >
              {/* OPEN — the row opens the dossier detail AND navigates the map. */}
              <button
                type="button"
                data-testid="properties-reopen"
                onClick={() => onOpen(row.parcelNodeId)}
                title={`Open ${title} — dossier + map`}
                style={{
                  flex: 1,
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  color: TEXT,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12.5,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontWeight: 600, color: PE.t1 }}>{title}</span>
                {status && (
                  <span
                    data-testid="properties-status-chip"
                    style={{
                      marginLeft: 7,
                      display: "inline-block",
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: "1px 7px",
                      borderRadius: PE.rChip,
                      color: pinAccent(status),
                      border: `1px solid ${pinAccent(status)}`,
                      verticalAlign: "middle",
                    }}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                )}
                <span
                  style={{
                    display: "block",
                    marginTop: 3,
                    fontFamily: PE.mono,
                    fontSize: 11.5,
                    color: PE.t6,
                  }}
                >
                  {title === row.parcelNodeId ? "parcel" : row.parcelNodeId}
                  {date ? ` · saved ${date}` : ""}
                  {dossierBits.length > 0 ? ` · ${dossierBits.join(" · ")}` : ""}
                  {row.parcelNodeId === activeParcelNodeId ? " · active" : ""}
                </span>
              </button>
              <PropertyRowReports
                selection={row.snapshot?.shareReportSelection ?? null}
                disabled={busy}
                onToggle={(report, included) =>
                  onToggleShareReport?.(row.parcelNodeId, report, included)
                }
              />
              <button
                type="button"
                data-testid="properties-remove"
                aria-label={`Remove ${title}`}
                onClick={() => onRemove(row.parcelNodeId)}
                disabled={busy}
                style={{
                  background: "transparent",
                  border: "none",
                  color: MUTED,
                  cursor: busy ? "default" : "pointer",
                  fontSize: 13.5,
                  lineHeight: 1,
                  padding: "2px 4px",
                }}
              >
                ×
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

export function PropertiesTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [phase, setPhase] = useState<ListPhase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PropertiesView>(initialPropertiesView);
  // Transient dossier-action outcome shown in the detail view (honest line).
  const [dossierNotice, setDossierNotice] = useState<string | null>(null);
  // WB7d — transient list filter (renders only on lists with >5 entries).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const outcome = await listSavedProperties();
    switch (outcome.kind) {
      case "ready":
        setPhase({ kind: "ready", items: outcome.items });
        return;
      case "sign-in":
        setPhase({ kind: "sign-in" });
        return;
      case "unreachable":
        setPhase({
          kind: "notice",
          text: "Could not reach the saved-properties service.",
        });
        return;
      case "error":
        setPhase({ kind: "notice", text: outcome.message });
        return;
    }
  }, []);

  // Fetch on mount + refetch whenever ANY entry point mutates (one flow).
  useEffect(() => {
    let cancelled = false;
    void refresh().then(() => {
      /* phase set inside */
    });
    const unsubscribe = subscribeSavedPropertiesChanged(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  const applyMutationOutcome = useCallback(
    (outcome: { kind: string; message?: string }) => {
      if (outcome.kind === "sign-in") setPhase({ kind: "sign-in" });
      else if (outcome.kind === "error" && outcome.message) {
        setPhase({ kind: "notice", text: outcome.message });
      } else if (outcome.kind === "unreachable") {
        setPhase({ kind: "notice", text: "Could not reach the saved-properties service." });
      }
      // "ok" refreshes via the change notification.
    },
    [],
  );

  const handleSaveCurrent = useCallback(async () => {
    if (!activeParcelNodeId) return;
    setBusy(true);
    const label = activePropertyLabel(activeParcelNodeId);
    // WB6: seed the dossier — savedAt/address plus the CURRENT map drawings.
    const drawings = sanitizeDrawings(host.getMapDrawings?.() ?? null);
    // WB7c: save-time pin — the node store's known centroid, else ONE pass
    // through the #104 center-resolution chain; unresolvable → honestly none.
    const center = activePropertyCenter(activeParcelNodeId);
    const pin = await resolvePinForSave(
      activeParcelNodeId,
      center?.lat ?? null,
      center?.lng ?? null,
    );
    const outcome = await savePropertyWithDossier(activeParcelNodeId, {
      label,
      address: label,
      drawings: drawings ?? undefined,
      pin: pin ?? undefined,
    });
    setBusy(false);
    applyMutationOutcome(outcome);
  }, [activeParcelNodeId, host, applyMutationOutcome]);

  const handleRemove = useCallback(
    async (parcelNodeId: string) => {
      setBusy(true);
      const outcome = await removeSavedProperty(parcelNodeId);
      setBusy(false);
      applyMutationOutcome(outcome);
    },
    [applyMutationOutcome],
  );

  // OPEN a saved property: detail view in THIS dock + fly the map.
  // openProperty must not switch the rail to Brief (W3.1).
  const handleOpen = useCallback(
    (parcelNodeId: string) => {
      setDossierNotice(null);
      setShareUrl(null);
      setView({ kind: "detail", parcelNodeId });
      host.openProperty?.(parcelNodeId);
      const row =
        phase.kind === "ready"
          ? phase.items.find((r) => r.parcelNodeId === parcelNodeId)
          : undefined;
      if (row?.snapshot?.drawings) {
        host.showDossierDrawings?.(row.snapshot.drawings, parcelNodeId);
      }
    },
    [host, phase],
  );

  const handleBack = useCallback(() => {
    setDossierNotice(null);
    setShareUrl(null);
    setView({ kind: "list" });
  }, []);

  // --- Dossier actions (detail view) — all read-modify-write on the server. ---

  const handleSaveDrawings = useCallback(
    async (parcelNodeId: string) => {
      const drawings = sanitizeDrawings(host.getMapDrawings?.() ?? null);
      if (!drawings) {
        setDossierNotice(
          "Nothing drawn on the map yet — use the map tools (draw / marker / measure) first.",
        );
        return;
      }
      setBusy(true);
      const outcome = await updatePropertyDossier(parcelNodeId, { drawings });
      setBusy(false);
      if (outcome.kind === "ok") {
        setDossierNotice(
          `Saved ${drawings.features.length} shape${drawings.features.length === 1 ? "" : "s"} to this property.`,
        );
      } else if (outcome.kind === "not-saved") {
        setDossierNotice("This property is no longer saved.");
      } else {
        setDossierNotice("Could not save drawings — try again.");
        applyMutationOutcome(outcome);
      }
    },
    [host, applyMutationOutcome],
  );

  const handleShowDrawings = useCallback(
    (row: SavedPropertyRow) => {
      if (row.snapshot?.drawings) {
        host.showDossierDrawings?.(
          row.snapshot.drawings as DossierFeatureCollection,
          row.parcelNodeId,
        );
        setDossierNotice(null);
      }
    },
    [host],
  );

  // WB7d — persist the single-select status (null clears). Quiet on ok; the
  // change notification refreshes the list (and the map pins' accent).
  const handleSetStatus = useCallback(
    async (parcelNodeId: string, status: DossierStatus | null) => {
      if (statusRemovesProperty(status)) {
        setDossierNotice("Status does not remove a saved property.");
        return;
      }
      const outcome = await updatePropertyDossier(parcelNodeId, { status });
      if (outcome.kind === "not-saved") {
        setDossierNotice("This property is no longer saved — status not stored.");
      } else if (outcome.kind !== "ok") {
        setDossierNotice("Status could not be saved — try again.");
        applyMutationOutcome(outcome);
      } else {
        setDossierNotice(null);
      }
    },
    [applyMutationOutcome],
  );

  const handleSaveNotes = useCallback(
    async (parcelNodeId: string, text: string) => {
      const outcome = await updatePropertyDossier(parcelNodeId, {
        notes: text.trim() ? text : null,
      });
      if (outcome.kind === "not-saved") {
        setDossierNotice("This property is no longer saved — notes not stored.");
      } else if (outcome.kind !== "ok") {
        setDossierNotice("Notes could not be saved — they are not stored.");
      }
      // Quiet on ok — autosave should not chatter.
    },
    [],
  );

  const handleToggleShareReport = useCallback(
    async (parcelNodeId: string, report: "xray" | "flood", included: boolean) => {
      const outcome = await updatePropertyDossier(parcelNodeId, (current) => ({
        shareReportSelection: {
          xray: report === "xray" ? included : current.shareReportSelection?.xray === true,
          flood: report === "flood" ? included : current.shareReportSelection?.flood === true,
        },
      }));
      if (outcome.kind !== "ok") {
        setDossierNotice("Report include/exclude could not be saved.");
        applyMutationOutcome(outcome);
      }
    },
    [applyMutationOutcome],
  );

  const handleMintShare = useCallback(
    async (parcelNodeId: string, pkg: PropertyShareMint) => {
      setBusy(true);
      const outcome = await mintShareLink(parcelNodeId, {
        includeNotes: pkg.includeNotes,
      });
      setBusy(false);
      if (outcome.kind === "sign-in") {
        setDossierNotice("Sign in to create a share link for this property.");
        return;
      }
      if (outcome.kind !== "ready") {
        setDossierNotice(
          outcome.kind === "not-configured"
            ? outcome.message
            : outcome.kind === "message"
              ? outcome.text
              : "Could not reach the sharing service.",
        );
        return;
      }
      const grantId = outcome.link.grantId ?? null;
      if (notesExcludeNeedsGrantId(pkg.includeNotes, grantId)) {
        setShareUrl(null);
        setDossierNotice(
          "Notes were excluded, but the grant id did not return. The link was not shown.",
        );
        return;
      }
      if (grantId) {
        const bound = await updatePropertyDossier(parcelNodeId, (current) => ({
          sharePackages: upsertSharePackage(current.sharePackages ?? undefined, {
            grantId,
            includeNotes: pkg.includeNotes,
            includeXray: pkg.includeXray,
            includeFlood: pkg.includeFlood,
            persona: pkg.persona,
            message: pkg.message,
            savedAt: new Date().toISOString(),
          }),
          shareReportSelection: {
            xray: pkg.includeXray,
            flood: pkg.includeFlood,
          },
        }));
        if (bound.kind !== "ok") {
          if (pkg.includeNotes === false) {
            setShareUrl(null);
            setDossierNotice(
              "Share package could not be stored. The link was not shown because notes were excluded.",
            );
            return;
          }
          setDossierNotice("Share link created. Package bind did not store.");
        }
      }
      setShareUrl(outcome.link.url);
      setDossierNotice(null);
    },
    [],
  );

  // DETAIL view — needs a ready list carrying the row; otherwise fall back to
  // the master states (loading / sign-in / notice render as usual).
  if (view.kind === "detail" && phase.kind === "ready") {
    const row = phase.items.find((r) => r.parcelNodeId === view.parcelNodeId);
    if (!row) {
      // Row vanished (removed elsewhere) — honest return to the list.
      return (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: MUTED }}>
            This property is no longer saved.
          </p>
          <Button
            variant="ghost"
            dense
            type="button"
            data-testid="dossier-back"
            onClick={handleBack}
            style={{ padding: 0, border: "none", fontSize: 11.5 }}
          >
            ← All saved properties
          </Button>
        </div>
      );
    }
    return (
      <PropertyDossierDetail
        row={row}
        busy={busy}
        notice={dossierNotice}
        onBack={handleBack}
        onSaveDrawings={() => void handleSaveDrawings(row.parcelNodeId)}
        onShowDrawings={() => handleShowDrawings(row)}
        onSaveNotes={(text) => void handleSaveNotes(row.parcelNodeId, text)}
        onSetStatus={(status) => void handleSetStatus(row.parcelNodeId, status)}
        onMintShare={(pkg) => void handleMintShare(row.parcelNodeId, pkg)}
        onToggleShareReport={(report, included) =>
          void handleToggleShareReport(row.parcelNodeId, report, included)
        }
        shareUrl={shareUrl}
      />
    );
  }

  return (
    <PropertiesList
      phase={phase}
      activeParcelNodeId={activeParcelNodeId}
      busy={busy}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      onSaveCurrent={() => void handleSaveCurrent()}
      onOpen={handleOpen}
      onRemove={(id) => void handleRemove(id)}
      onToggleShareReport={(id, report, included) =>
        void handleToggleShareReport(id, report, included)
      }
    />
  );
}
