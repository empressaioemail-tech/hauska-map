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
  type DossierFeatureCollection,
} from "../../lib/propertyDossier";
import { googleSignInUrl } from "../../lib/auth";
import { parcelNodes } from "../../lib/parcel-node-store.js";
import { useWorkbench } from "../WorkbenchContext";
import { PropertyDossierDetail } from "./PropertyDossierDetail";

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const TEXT = "#e5e7eb";
const ACCENT = "#7dd3fc";

type ListPhase =
  | { kind: "loading" }
  | { kind: "ready"; items: SavedPropertyRow[] }
  | { kind: "sign-in" }
  | { kind: "notice"; text: string };

/** Master list vs. one property's dossier detail — same dock, one surface. */
export type PropertiesView =
  | { kind: "list" }
  | { kind: "detail"; parcelNodeId: string };

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
  onSaveCurrent,
  onOpen,
  onRemove,
}: {
  phase: ListPhase;
  activeParcelNodeId: string | null;
  busy: boolean;
  onSaveCurrent: () => void;
  /** Open the dossier DETAIL view AND navigate the map (the reopen flight). */
  onOpen: (parcelNodeId: string) => void;
  onRemove: (parcelNodeId: string) => void;
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
      <p data-testid="properties-sign-in" style={{ margin: 0, fontSize: 11.5, color: AMBER }}>
        Sign in to save properties and see your workspace across devices.{" "}
        <a href={googleSignInUrl()} style={{ color: ACCENT }}>
          Sign in
        </a>
      </p>
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

  return (
    <div data-testid="properties-list">
      {activeParcelNodeId && !activeSaved && (
        <button
          type="button"
          data-testid="properties-save-current"
          onClick={onSaveCurrent}
          disabled={busy}
          style={{
            width: "100%",
            marginBottom: 10,
            padding: "7px 10px",
            fontSize: 11.5,
            fontWeight: 600,
            color: "#0d1117",
            background: ACCENT,
            border: "none",
            borderRadius: 6,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Save current property
        </button>
      )}

      {items.length === 0 ? (
        <p data-testid="properties-empty" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
          No saved properties yet. Click a parcel on the map and save it — your
          workspace lives on the server, not this browser.
        </p>
      ) : (
        items.map((row) => {
          const date = fmtDate(row.updatedAt) ?? fmtDate(row.snapshot?.savedAt ?? null);
          // WB6 label fallback chain: label → dossier address → parcel id.
          // cleanDisplayString inside guarantees no ", ," artifacts render.
          const title = savedRowDisplayLabel(row);
          const dossierBits = [
            row.snapshot?.notes ? "notes" : null,
            row.snapshot?.drawings ? "drawings" : null,
            row.snapshot?.chatSummary || row.snapshot?.chatThread ? "chat" : null,
            row.snapshot?.exports?.length ? "exports" : null,
          ].filter((b): b is string => b !== null);
          return (
            <div
              key={row.parcelNodeId}
              data-testid="properties-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid rgba(154,166,178,0.15)",
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
                  fontSize: 11.5,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontWeight: 600 }}>{title}</span>
                <span style={{ display: "block", fontSize: 10, color: MUTED }}>
                  {title === row.parcelNodeId ? "parcel" : row.parcelNodeId}
                  {date ? ` · saved ${date}` : ""}
                  {dossierBits.length > 0 ? ` · ${dossierBits.join(" · ")}` : ""}
                  {row.parcelNodeId === activeParcelNodeId ? " · active" : ""}
                </span>
              </button>
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
                  fontSize: 13,
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
  const [view, setView] = useState<PropertiesView>({ kind: "list" });
  // Transient dossier-action outcome shown in the detail view (honest line).
  const [dossierNotice, setDossierNotice] = useState<string | null>(null);

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
    const outcome = await savePropertyWithDossier(activeParcelNodeId, {
      label,
      address: label,
      drawings: drawings ?? undefined,
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

  // OPEN a saved property: detail view in the SAME dock + the reopen flight
  // (host.openProperty — find/fly+inspect, kept from #104) + redraw its saved
  // drawings as the dossier overlay (cleared automatically on property switch).
  const handleOpen = useCallback(
    (parcelNodeId: string) => {
      setDossierNotice(null);
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
          <button
            type="button"
            data-testid="dossier-back"
            onClick={handleBack}
            style={{
              background: "transparent",
              border: "none",
              color: ACCENT,
              cursor: "pointer",
              padding: 0,
              fontSize: 11.5,
            }}
          >
            ← All saved properties
          </button>
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
      />
    );
  }

  return (
    <PropertiesList
      phase={phase}
      activeParcelNodeId={activeParcelNodeId}
      busy={busy}
      onSaveCurrent={() => void handleSaveCurrent()}
      onOpen={handleOpen}
      onRemove={(id) => void handleRemove(id)}
    />
  );
}
