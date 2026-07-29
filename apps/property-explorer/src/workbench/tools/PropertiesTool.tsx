// MY PROPERTIES — the saved-properties workspace tool (Workbench W4).
//
// Surfaces the EXISTING cortex saved-properties backend (auth-gated, through
// the deep proxy). The SERVER IS THE TRUTH: nothing is persisted chassis-side;
// this tool holds only the transient fetched list per mount and refetches when
// any entry point mutates (savedPropertiesClient change notifications — the
// InspectCard "Save property" button and this tool share ONE save flow).
//
// UX:
//   - list of saved properties (label = server label → address, else parcel
//     id; updatedAt date), newest first (server-ordered);
//   - save-current action when the ACTIVE property isn't saved yet (label
//     seeded from the ported node store's address when it knows this parcel);
//   - remove action per row;
//   - REOPEN: clicking a saved property calls host.openProperty — the same
//     find/fly+inspect flow as the search bar's parcel fast path; the dock
//     re-scopes automatically as the active property changes;
//   - 401 → honest sign-in state (link to the OIDC start).

import { useCallback, useEffect, useState } from "react";
import {
  listSavedProperties,
  removeSavedProperty,
  saveProperty,
  subscribeSavedPropertiesChanged,
  type SavedPropertyRow,
} from "../../lib/savedPropertiesClient";
import { googleSignInUrl } from "../../lib/auth";
import { parcelNodes } from "../../lib/parcel-node-store.js";
import { useWorkbench } from "../WorkbenchContext";

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const TEXT = "#e5e7eb";
const ACCENT = "#7dd3fc";

type ListPhase =
  | { kind: "loading" }
  | { kind: "ready"; items: SavedPropertyRow[] }
  | { kind: "sign-in" }
  | { kind: "notice"; text: string };

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
  onReopen,
  onRemove,
}: {
  phase: ListPhase;
  activeParcelNodeId: string | null;
  busy: boolean;
  onSaveCurrent: () => void;
  onReopen: (parcelNodeId: string) => void;
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
          const date = fmtDate(row.updatedAt);
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
              {/* REOPEN — the row itself navigates the map to the property. */}
              <button
                type="button"
                data-testid="properties-reopen"
                onClick={() => onReopen(row.parcelNodeId)}
                title={`Open ${row.parcelNodeId} on the map`}
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
                <span style={{ fontWeight: 600 }}>
                  {row.label ?? row.parcelNodeId}
                </span>
                <span style={{ display: "block", fontSize: 10, color: MUTED }}>
                  {row.label ? `${row.parcelNodeId}` : "parcel"}
                  {date ? ` · saved ${date}` : ""}
                  {row.parcelNodeId === activeParcelNodeId ? " · active" : ""}
                </span>
              </button>
              <button
                type="button"
                data-testid="properties-remove"
                aria-label={`Remove ${row.label ?? row.parcelNodeId}`}
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

  const handleSaveCurrent = useCallback(async () => {
    if (!activeParcelNodeId) return;
    setBusy(true);
    const label = activePropertyLabel(activeParcelNodeId);
    const outcome = await saveProperty(activeParcelNodeId, { label });
    setBusy(false);
    if (outcome.kind === "sign-in") setPhase({ kind: "sign-in" });
    else if (outcome.kind === "error") setPhase({ kind: "notice", text: outcome.message });
    else if (outcome.kind === "unreachable") {
      setPhase({ kind: "notice", text: "Could not reach the saved-properties service." });
    }
    // "ok" refreshes via the change notification.
  }, [activeParcelNodeId]);

  const handleRemove = useCallback(async (parcelNodeId: string) => {
    setBusy(true);
    const outcome = await removeSavedProperty(parcelNodeId);
    setBusy(false);
    if (outcome.kind === "sign-in") setPhase({ kind: "sign-in" });
    else if (outcome.kind === "error") setPhase({ kind: "notice", text: outcome.message });
    else if (outcome.kind === "unreachable") {
      setPhase({ kind: "notice", text: "Could not reach the saved-properties service." });
    }
  }, []);

  const handleReopen = useCallback(
    (parcelNodeId: string) => {
      // Optional host action (W2/W3 convention) — no-op when unimplemented.
      host.openProperty?.(parcelNodeId);
    },
    [host],
  );

  return (
    <PropertiesList
      phase={phase}
      activeParcelNodeId={activeParcelNodeId}
      busy={busy}
      onSaveCurrent={() => void handleSaveCurrent()}
      onReopen={handleReopen}
      onRemove={(id) => void handleRemove(id)}
    />
  );
}
