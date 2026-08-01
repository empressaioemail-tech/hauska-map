// apps/property-explorer/src/workbench/tools/CompareTool.tsx
//
// WB7 COMPARE — two SAVED properties side by side, as a DOCK TOOL.
//
// THE DESIGN LAW (strict): the map stays the star; compare is a bubble that
// opens the ONE shared dock and renders the comparison INSIDE it — never a
// second surface, never a split map. It is a READING surface: picking slots
// never moves the map; each column offers a small optional "view" link that
// flies to that property via host.openProperty (the same reopen flight the
// saved list uses).
//
// NOT propertyScoped: it operates on the SAVED LIST (auth-gated, server is
// the truth) and works with no active property. The active property PRE-FILLS
// slot A when it is saved.
//
// PERSISTENCE: the chassis store is STRICTLY parcel-keyed
// ({parcelNodeId → {toolId → state}}) and useDockToolState no-ops with no
// active property — wrong shape for a global tool. So compare persists under
// a stable SYNTHETIC property key (COMPARE_GLOBAL_STATE_KEY) written through
// the same public store the chassis hands every tool: one global slot,
// localStorage-backed, zero dock-internal changes (the store treats it as
// just another property entry).
//
// HONESTY: every cell renders with the card's own idioms via
// deriveBakedCardModel / composeBriefVerdict (compare-facts.ts — reuse, not
// fork): "not verified here", provisional qualifiers, build-to-line pending,
// honest 0%. Fewer than two saved properties → the honest empty state.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  listSavedProperties,
  subscribeSavedPropertiesChanged,
  type SavedPropertyRow,
} from "../../lib/savedPropertiesClient";
import { savedRowDisplayLabel } from "../../lib/propertyDossier";
import { googleSignInUrl } from "../../lib/auth";
import { useWorkbench } from "../WorkbenchContext";
import {
  cellsDiffer,
  COMPARE_ROWS,
  deriveCompareColumn,
  fetchComparePayload,
  reconcileCompareState,
  type CompareColumn,
  type CompareStoredState,
} from "./compare-facts";

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const TEXT = "#e5e7eb";
const ACCENT = "#7dd3fc";
const FLAG = "#f87171";

/**
 * Dark-theme the Property A/B dropdowns: the native <option> menu paints white
 * unless the options carry an explicit background/color, so the open list gets
 * the dock's solid dark card bg + light text to match the rest of the app.
 */
const OPTION_BG = "#0d1117";
const OPTION_STYLE: React.CSSProperties = { background: OPTION_BG, color: TEXT };

/**
 * The synthetic "property" key the global compare state lives under. The
 * chassis store is strictly parcel-keyed; this key gives the one
 * non-property-scoped tool a stable slot WITHOUT touching dock internals.
 * Double-underscore prefix keeps it visually unmistakable in storage dumps
 * and can never collide with a real "{fips}:{propId}" node id (no colon).
 */
export const COMPARE_GLOBAL_STATE_KEY = "__compare-global__";

const TOOL_ID = "compare";

/**
 * Global (non-property-scoped) persistent state for the compare tool —
 * useDockToolState's contract, re-keyed to the synthetic global slot through
 * the SAME chassis store (useWorkbench().store is the public seam every tool
 * already receives; no dock internals touched).
 */
export function useCompareGlobalState(): readonly [
  CompareStoredState | null,
  (next: CompareStoredState | null) => void,
] {
  const { store } = useWorkbench();
  const read = useCallback(
    () => store.get(COMPARE_GLOBAL_STATE_KEY, TOOL_ID) as CompareStoredState | null,
    [store],
  );
  const state = useSyncExternalStore(store.subscribe, read, read);
  const setState = useCallback(
    (next: CompareStoredState | null) => {
      store.set(COMPARE_GLOBAL_STATE_KEY, TOOL_ID, next);
    },
    [store],
  );
  return [state, setState] as const;
}

// ---------------------------------------------------------------------------
// Presentational view — exported for direct render tests (the container's
// fetch effects do not run under react-dom/server).
// ---------------------------------------------------------------------------

type ListPhase =
  | { kind: "loading" }
  | { kind: "ready"; items: SavedPropertyRow[] }
  | { kind: "sign-in" }
  | { kind: "notice"; text: string };

export function CompareView({
  phase,
  stored,
  failures,
  onSelect,
  onView,
}: {
  phase: ListPhase;
  stored: CompareStoredState | null;
  /** Per-parcel fetch failure copy (transient, never persisted). */
  failures: Record<string, string>;
  onSelect: (slot: "a" | "b", parcelNodeId: string | null) => void;
  /** Optional per-column "view" flight (host.openProperty). */
  onView?: (parcelNodeId: string) => void;
}) {
  if (phase.kind === "sign-in") {
    return (
      <p data-testid="compare-sign-in" style={{ margin: 0, fontSize: 11.5, color: AMBER }}>
        Sign in to compare saved properties — the saved list is account-scoped.{" "}
        <a href={googleSignInUrl()} style={{ color: ACCENT }}>
          Sign in
        </a>
      </p>
    );
  }
  if (phase.kind === "notice") {
    return (
      <p data-testid="compare-notice" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
        {phase.text}
      </p>
    );
  }

  const items = phase.kind === "ready" ? phase.items : [];
  const slots = { a: stored?.a ?? null, b: stored?.b ?? null };
  const bothSelected = slots.a !== null && slots.b !== null;

  // List still loading and no persisted comparison to show → plain loading.
  // (A persisted two-slot comparison renders IMMEDIATELY from its stored
  // payloads while the list refreshes — reopen never blanks the table.)
  if (phase.kind === "loading" && !bothSelected) {
    return (
      <p data-testid="compare-loading" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
        Loading saved properties…
      </p>
    );
  }

  // Honest empty state: compare READS the saved list; fewer than two saved
  // properties means there is nothing to compare — say so, never fake rows.
  if (phase.kind === "ready" && items.length < 2 && !bothSelected) {
    return (
      <p data-testid="compare-empty" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
        Save two properties to compare. Click a parcel on the map, save it from
        the card or My properties, then pick both here.
      </p>
    );
  }

  const labelFor = (parcelNodeId: string): string => {
    const row = items.find((r) => r.parcelNodeId === parcelNodeId);
    if (row) return savedRowDisplayLabel(row);
    const payload = stored?.payloads[parcelNodeId];
    return payload
      ? (deriveColumnCached(payload.parcelNodeId, stored)?.address ?? parcelNodeId)
      : parcelNodeId;
  };

  return (
    <div data-testid="compare-tool">
      {phase.kind === "loading" && (
        <p style={{ margin: "0 0 8px", fontSize: 11, color: MUTED }}>
          Refreshing saved properties…
        </p>
      )}
      {phase.kind === "ready" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["a", "b"] as const).map((slot) => (
            <label key={slot} style={{ flex: 1, fontSize: 10.5, color: MUTED }}>
              {slot === "a" ? "Property A" : "Property B"}
              <select
                data-testid={`compare-select-${slot}`}
                value={slots[slot] ?? ""}
                onChange={(e) => onSelect(slot, e.target.value || null)}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 3,
                  padding: "5px 6px",
                  fontSize: 11.5,
                  color: TEXT,
                  // Solid dark control + dark open-menu (options carry their own
                  // dark bg below): the browser default paints the dropdown list
                  // white unless the OPTIONS are colored, so both are set here.
                  background: OPTION_BG,
                  border: "1px solid rgba(154,166,178,0.35)",
                  borderRadius: 6,
                }}
              >
                <option value="" style={OPTION_STYLE}>Choose a saved property…</option>
                {items
                  // A property can occupy only one slot — no self-compare.
                  .filter(
                    (row) =>
                      row.parcelNodeId !== slots[slot === "a" ? "b" : "a"],
                  )
                  .map((row) => (
                    <option key={row.parcelNodeId} value={row.parcelNodeId} style={OPTION_STYLE}>
                      {savedRowDisplayLabel(row)}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {!bothSelected ? (
        <p data-testid="compare-pick-second" style={{ margin: 0, fontSize: 11.5, color: MUTED }}>
          {slots.a || slots.b
            ? "Pick a second property to compare."
            : "Pick two saved properties to compare their cited facts side by side."}
        </p>
      ) : (
        <CompareTable
          a={slots.a as string}
          b={slots.b as string}
          stored={stored}
          failures={failures}
          labelFor={labelFor}
          onView={onView}
        />
      )}
    </div>
  );
}

// Tiny per-render memo so a payload column derives once per render pass.
function deriveColumnCached(
  parcelNodeId: string,
  stored: CompareStoredState | null,
): CompareColumn | null {
  const payload = stored?.payloads[parcelNodeId];
  return payload ? deriveCompareColumn(payload) : null;
}

function verdictColor(tone: "clear" | "caution" | "flag"): string {
  return tone === "flag" ? FLAG : tone === "caution" ? AMBER : TEXT;
}

function CompareTable({
  a,
  b,
  stored,
  failures,
  labelFor,
  onView,
}: {
  a: string;
  b: string;
  stored: CompareStoredState | null;
  failures: Record<string, string>;
  labelFor: (parcelNodeId: string) => string;
  onView?: (parcelNodeId: string) => void;
}) {
  const colA = deriveColumnCached(a, stored);
  const colB = deriveColumnCached(b, stored);
  const cols: Array<{
    slot: "a" | "b";
    parcelNodeId: string;
    column: CompareColumn | null;
  }> = [
    { slot: "a", parcelNodeId: a, column: colA },
    { slot: "b", parcelNodeId: b, column: colB },
  ];

  const cellStyle = { padding: "5px 6px 5px 0", verticalAlign: "top" as const };

  return (
    <div data-testid="compare-table" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
      {/* Column headers: label + the optional per-column "view" flight. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {cols.map(({ slot, parcelNodeId }) => (
          <div key={slot} style={{ minWidth: 0 }}>
            <div
              data-testid={`compare-header-${slot}`}
              style={{ fontWeight: 600, color: TEXT, overflowWrap: "anywhere" }}
            >
              {labelFor(parcelNodeId)}
            </div>
            <div style={{ fontSize: 10, color: MUTED }}>
              {parcelNodeId}
              {onView && (
                <>
                  {" · "}
                  <button
                    type="button"
                    data-testid={`compare-view-${slot}`}
                    onClick={() => onView(parcelNodeId)}
                    title="Fly the map to this property"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: ACCENT,
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 10,
                    }}
                  >
                    view
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Verdict row — the composer's line per property, tone-colored. */}
      <div
        data-testid="compare-verdicts"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          margin: "8px 0 4px",
          paddingBottom: 6,
          borderBottom: "1px solid rgba(154,166,178,0.2)",
        }}
      >
        {cols.map(({ slot, parcelNodeId, column }) => (
          <div key={slot} data-testid={`compare-verdict-${slot}`} style={{ minWidth: 0 }}>
            {column ? (
              <span style={{ color: verdictColor(column.verdict.tone), fontStyle: "italic" }}>
                {column.verdict.line}
              </span>
            ) : (
              <ColumnPlaceholder message={failures[parcelNodeId]} />
            )}
          </div>
        ))}
      </div>

      {/* Fact rows — label + two cells; the label accents when values differ. */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {COMPARE_ROWS.map(({ id, label }) => {
            const cellA = colA?.cells[id];
            const cellB = colB?.cells[id];
            const differs = cellsDiffer(cellA, cellB);
            return (
              <tr
                key={id}
                data-testid={`compare-row-${id}`}
                data-differs={differs ? "true" : "false"}
                style={{ borderBottom: "1px solid rgba(154,166,178,0.12)" }}
              >
                <td
                  style={{
                    ...cellStyle,
                    width: 86,
                    fontSize: 10.5,
                    // SUBTLE difference emphasis: the row label carries the
                    // accent (color + weight) — legibility without noise.
                    color: differs ? ACCENT : MUTED,
                    fontWeight: differs ? 600 : 400,
                  }}
                >
                  {label}
                </td>
                {cols.map(({ slot, parcelNodeId, column }) => {
                  const cell = column?.cells[id];
                  return (
                    <td
                      key={slot}
                      data-testid={`compare-cell-${id}-${slot}`}
                      style={{ ...cellStyle, width: "50%" }}
                    >
                      {!column ? (
                        <ColumnPlaceholder message={failures[parcelNodeId]} compact />
                      ) : cell ? (
                        <>
                          <span
                            style={{
                              color:
                                cell.state === "present"
                                  ? TEXT
                                  : cell.state === "pending"
                                    ? AMBER
                                    : MUTED,
                              fontStyle: cell.state === "present" ? "normal" : "italic",
                            }}
                          >
                            {cell.value}
                          </span>
                          {cell.source && (
                            <span
                              data-testid="compare-cell-source"
                              style={{ display: "block", fontSize: 9.5, color: MUTED }}
                            >
                              {cell.source}
                            </span>
                          )}
                        </>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Honest per-column placeholder: loading, or the fetch failure verbatim. */
function ColumnPlaceholder({
  message,
  compact,
}: {
  message: string | undefined;
  compact?: boolean;
}) {
  if (message) {
    return (
      <span
        data-testid="compare-column-failed"
        style={{ fontSize: compact ? 10.5 : 11.5, color: AMBER, fontStyle: "italic" }}
      >
        {compact ? "—" : message}
      </span>
    );
  }
  return (
    <span
      data-testid="compare-column-loading"
      style={{ fontSize: compact ? 10.5 : 11.5, color: MUTED, fontStyle: "italic" }}
    >
      {compact ? "…" : "Loading facts…"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Container — saved-list fetch, slot reconciliation, payload fetches.
// ---------------------------------------------------------------------------

export function CompareTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [stored, setStored] = useCompareGlobalState();
  const [phase, setPhase] = useState<ListPhase>({ kind: "loading" });
  // Transient fetch failures (per parcel) — never persisted, so reopening the
  // tool retries instead of pinning a property to "failed" forever.
  const [failures, setFailures] = useState<Record<string, string>>({});

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
        setPhase({ kind: "notice", text: "Could not reach the saved-properties service." });
        return;
      case "error":
        setPhase({ kind: "notice", text: outcome.message });
        return;
    }
  }, []);

  // Saved list on mount + refetch on any save/remove (the one shared flow).
  useEffect(() => {
    let cancelled = false;
    void refresh();
    const unsubscribe = subscribeSavedPropertiesChanged(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  // Reconcile stored slots against the live saved list (drop un-saved
  // selections, pre-fill slot A with the active property when saved).
  useEffect(() => {
    if (phase.kind !== "ready") return;
    const savedIds = new Set(phase.items.map((r) => r.parcelNodeId));
    const next = reconcileCompareState(stored ?? null, savedIds, activeParcelNodeId);
    if (next) setStored(next);
  }, [phase, stored, activeParcelNodeId, setStored]);

  // Fetch missing payloads for the selected slots. Selecting NEVER moves the
  // map — compare is a reading surface; only the explicit "view" link flies.
  useEffect(() => {
    if (!stored) return;
    const wanted = [stored.a, stored.b].filter(
      (id): id is string =>
        id !== null && !stored.payloads[id] && !(id in failures),
    );
    if (wanted.length === 0) return;
    let cancelled = false;
    for (const parcelNodeId of wanted) {
      void fetchComparePayload(parcelNodeId).then((outcome) => {
        if (cancelled) return;
        if (outcome.kind === "ok") {
          // Merge against the LATEST stored state via the store read the hook
          // already reflects; the setter writes whole-state (single writer:
          // this tool). Payloads persist with the selection.
          setStored({
            a: stored.a,
            b: stored.b,
            payloads: { ...stored.payloads, [parcelNodeId]: outcome.data },
          });
        } else {
          setFailures((prev) => ({
            ...prev,
            [parcelNodeId]:
              outcome.kind === "no-snapshot"
                ? "No baked snapshot exists for this parcel yet."
                : outcome.message,
          }));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [stored, failures, setStored]);

  const handleSelect = useCallback(
    (slot: "a" | "b", parcelNodeId: string | null) => {
      const prev: CompareStoredState = stored ?? { a: null, b: null, payloads: {} };
      const next: CompareStoredState = { ...prev, [slot]: parcelNodeId };
      // Prune payloads to the selected pair (bounded persisted state).
      const keep = new Set([next.a, next.b].filter((id): id is string => id !== null));
      next.payloads = Object.fromEntries(
        Object.entries(prev.payloads).filter(([id]) => keep.has(id)),
      );
      setStored(next);
    },
    [stored, setStored],
  );

  const handleView = useCallback(
    (parcelNodeId: string) => host.openProperty?.(parcelNodeId),
    [host],
  );

  return (
    <CompareView
      phase={phase}
      stored={stored ?? null}
      failures={failures}
      onSelect={handleSelect}
      onView={host.openProperty ? handleView : undefined}
    />
  );
}
