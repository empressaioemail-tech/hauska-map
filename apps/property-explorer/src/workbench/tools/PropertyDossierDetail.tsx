// WB6 — the DOSSIER DETAIL view inside the My Properties tool (same dock,
// never a second surface). Master list → click a row → THIS view, with a Back
// button returning to the list. Renders the saved property's dossier: header
// (label / address / parcel id / saved date), notes (debounced-saved, 4k cap
// with honest counter), drawings (save current / show on map), the AI chat
// summary (ALWAYS labeled as AI, never verified fact), the capped saved
// thread, and export attachments with working gated download links.

import { useEffect, useRef, useState } from "react";
import type { SavedPropertyRow } from "../../lib/savedPropertiesClient";
import {
  DOSSIER_NOTES_MAX_CHARS,
  DOSSIER_STATUSES,
  savedRowDisplayLabel,
  cleanDisplayString,
  type DossierExportEntry,
  type DossierStatus,
} from "../../lib/propertyDossier";
import { pinAccent } from "../../lib/saved-pins";

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const TEXT = "#e5e7eb";
const ACCENT = "#7dd3fc";
const SECTION_BORDER = "1px solid rgba(154,166,178,0.2)";

/** Debounce delay for notes autosave (ms). Exported for tests. */
export const NOTES_SAVE_DEBOUNCE_MS = 800;

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return iso.slice(0, 10);
}

function sectionHeader(label: string) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: MUTED,
        margin: "12px 0 6px",
      }}
    >
      {label}
    </div>
  );
}

function exportLabel(entry: DossierExportEntry): string {
  return `${entry.kind === "site-plan" ? "Site plan" : "Terrain"} · ${entry.format}`;
}

/** Human labels for the WB7d single-select status chips. */
export const STATUS_LABELS: Record<DossierStatus, string> = {
  researching: "Researching",
  offer: "Offer",
  passed: "Passed",
};

/**
 * WB7d — compact single-select status chips (three states; tapping the
 * selected chip clears back to unset). Colors mirror the map-pin accents so
 * the status language is ONE system across dock and map.
 */
export function DossierStatusSelector({
  status,
  busy,
  onSetStatus,
}: {
  status: DossierStatus | null;
  busy: boolean;
  onSetStatus: (status: DossierStatus | null) => void;
}) {
  return (
    <div data-testid="dossier-status" style={{ display: "flex", gap: 6 }}>
      {DOSSIER_STATUSES.map((s) => {
        const selected = status === s;
        const accent = pinAccent(s);
        return (
          <button
            key={s}
            type="button"
            data-testid={`dossier-status-${s}`}
            aria-pressed={selected}
            disabled={busy}
            onClick={() => onSetStatus(selected ? null : s)}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 999,
              cursor: busy ? "default" : "pointer",
              color: selected ? "#0d1117" : accent,
              background: selected ? accent : "transparent",
              border: `1px solid ${accent}`,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Presentational detail view — exported for direct render tests (fetches and
 * debounced saves live in the callbacks the container provides).
 */
export function PropertyDossierDetail({
  row,
  busy,
  notice,
  onBack,
  onSaveDrawings,
  onShowDrawings,
  onSaveNotes,
  onSetStatus,
  onExportDossier,
}: {
  row: SavedPropertyRow;
  busy: boolean;
  /** Transient outcome line from the last dossier action (honest, muted). */
  notice: string | null;
  onBack: () => void;
  /** Capture the CURRENT map drawings into this property's dossier. */
  onSaveDrawings: () => void;
  /** Redraw the SAVED drawings on the map (dossier overlay). */
  onShowDrawings: () => void;
  /** Persist notes (already debounced by <NotesField>). */
  onSaveNotes: (text: string) => void;
  /** WB7d — persist the single-select status (null clears to unset). */
  onSetStatus: (status: DossierStatus | null) => void;
  /**
   * Export the ONE hand-to-client dossier PDF (engine-assembled: verdict +
   * cited brief facts + AI chat summary + notes + appended site-plan sheets).
   * Optional so existing render tests keep passing; absent hides the section.
   */
  onExportDossier?: () => void;
}) {
  const dossier = row.snapshot ?? {};
  const title = savedRowDisplayLabel(row);
  const address = cleanDisplayString(dossier.address ?? null);
  const savedDate = fmtDate(row.updatedAt) ?? fmtDate(dossier.savedAt);
  const drawingsCount = dossier.drawings?.features.length ?? 0;
  const chatSummary = dossier.chatSummary ?? null;
  const thread = dossier.chatThread ?? [];
  const exports = dossier.exports ?? [];

  return (
    <div data-testid="dossier-detail">
      {/* BACK — returns to the master list (same dock, one surface). */}
      <button
        type="button"
        data-testid="dossier-back"
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: ACCENT,
          cursor: "pointer",
          padding: 0,
          fontSize: 11.5,
          marginBottom: 8,
        }}
      >
        ← All saved properties
      </button>

      {/* HEADER — label / address / parcel id / saved-at. */}
      <div data-testid="dossier-header" style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT }}>{title}</div>
        {address && address !== title && (
          <div style={{ fontSize: 11, color: TEXT }}>{address}</div>
        )}
        <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
          {row.parcelNodeId}
          {savedDate ? ` · saved ${savedDate}` : ""}
        </div>
      </div>

      {notice && (
        <p
          data-testid="dossier-notice"
          style={{ margin: "6px 0 0", fontSize: 10.5, color: AMBER }}
        >
          {notice}
        </p>
      )}

      {/* STATUS — WB7d compact single-select chips (map pins mirror it). */}
      {sectionHeader("Status")}
      <DossierStatusSelector
        status={dossier.status ?? null}
        busy={busy}
        onSetStatus={onSetStatus}
      />

      {/* NOTES — debounced autosave, 4k cap with an honest counter. */}
      {sectionHeader("Notes")}
      <NotesField
        key={row.parcelNodeId}
        initial={dossier.notes ?? ""}
        disabled={busy}
        onSave={onSaveNotes}
      />

      {/* DRAWINGS — capture current map annotations / redraw saved ones. */}
      {sectionHeader("Map drawings")}
      <div data-testid="dossier-drawings">
        <p style={{ margin: "0 0 6px", fontSize: 10.5, color: MUTED }}>
          {drawingsCount > 0
            ? `${drawingsCount} saved shape${drawingsCount === 1 ? "" : "s"} (draw / marker / measure).`
            : "No drawings saved for this property yet."}
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            data-testid="dossier-save-drawings"
            onClick={onSaveDrawings}
            disabled={busy}
            style={actionButtonStyle(busy)}
          >
            Save current drawings
          </button>
          {drawingsCount > 0 && (
            <button
              type="button"
              data-testid="dossier-show-drawings"
              onClick={onShowDrawings}
              disabled={busy}
              style={actionButtonStyle(busy)}
            >
              Show on map
            </button>
          )}
        </div>
      </div>

      {/* CHAT — AI summary (labeled, never verified fact) + saved thread. */}
      {(chatSummary || thread.length > 0) && (
        <>
          {sectionHeader("Chat research")}
          {chatSummary && (
            <div data-testid="dossier-chat-summary" style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: AMBER, fontWeight: 600 }}>
                AI summary · saved {fmtDate(chatSummary.savedAt) ?? chatSummary.savedAt}
              </div>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 11,
                  color: TEXT,
                  whiteSpace: "pre-wrap",
                }}
              >
                {chatSummary.summary}
              </p>
              <p
                data-testid="dossier-summary-disclaimer"
                style={{ margin: "3px 0 0", fontSize: 9.5, color: MUTED }}
              >
                {chatSummary.disclaimer ??
                  "AI-generated summary of a research chat — verify against the cited sources before relying on it."}
              </p>
            </div>
          )}
          {thread.length > 0 && (
            <details data-testid="dossier-chat-thread">
              <summary style={{ fontSize: 10.5, color: MUTED, cursor: "pointer" }}>
                Saved thread · {chatSummary?.turnCount ?? thread.length} turns
                {chatSummary && chatSummary.turnCount > thread.length
                  ? ` (last ${thread.length} kept)`
                  : ""}
              </summary>
              <div style={{ marginTop: 4, borderLeft: SECTION_BORDER, paddingLeft: 8 }}>
                {thread.map((turn, i) => (
                  <p
                    key={i}
                    style={{
                      margin: "0 0 5px",
                      fontSize: 10.5,
                      color: turn.role === "user" ? ACCENT : TEXT,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {turn.role === "user" ? "You: " : "AI: "}
                    </span>
                    {turn.content}
                  </p>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* DOSSIER PDF — the one hand-to-client document. The ENGINE assembles
          it from what this property already holds (verdict + cited brief
          facts + the AI chat summary + notes, site-plan sheets appended);
          anything absent renders honestly absent. Property entitlement
          gates it server-side (402 → paywall). */}
      {onExportDossier && (
        <>
          {sectionHeader("Dossier PDF")}
          <div data-testid="dossier-export-pdf">
            <p style={{ margin: "0 0 6px", fontSize: 10.5, color: MUTED }}>
              One PDF for this property — verdict, cited brief facts, the AI
              chat summary, your notes, and the site-plan sheets when
              available.
            </p>
            <button
              type="button"
              data-testid="dossier-export-pdf-button"
              onClick={onExportDossier}
              disabled={busy}
              style={actionButtonStyle(busy)}
            >
              {busy ? "Working…" : "Export dossier PDF"}
            </button>
          </div>
        </>
      )}

      {/* EXPORTS — auto-attached entries; downloads go through the EXISTING
          gated path (bytes never live in the dossier). */}
      {exports.length > 0 && (
        <>
          {sectionHeader("Exports")}
          <div data-testid="dossier-exports">
            {exports.map((entry) => {
              const date = fmtDate(entry.savedAt);
              return (
                <div
                  key={`${entry.kind}:${entry.format}`}
                  data-testid="dossier-export-row"
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "3px 0",
                    fontSize: 11,
                  }}
                >
                  <span style={{ flex: 1, color: TEXT }}>
                    {exportLabel(entry)}
                    {date && (
                      <span style={{ color: MUTED, fontSize: 9.5 }}> · {date}</span>
                    )}
                  </span>
                  {entry.downloadPath ? (
                    <a
                      href={entry.downloadPath}
                      data-testid="dossier-export-download"
                      style={{ color: ACCENT, fontSize: 10.5, fontWeight: 600 }}
                    >
                      Download
                    </a>
                  ) : (
                    <span style={{ color: MUTED, fontSize: 9.5 }}>
                      re-run in Reports to download
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function actionButtonStyle(busy: boolean): React.CSSProperties {
  return {
    fontSize: 10.5,
    fontWeight: 600,
    color: ACCENT,
    background: "transparent",
    border: "1px solid rgba(125,211,252,0.45)",
    borderRadius: 5,
    padding: "3px 9px",
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  };
}

/**
 * Notes textarea with debounced autosave and the honest character counter.
 * Local draft state — the dossier write happens through `onSave` after
 * NOTES_SAVE_DEBOUNCE_MS of quiet. The 4k cap is enforced at input time
 * (maxLength) AND at sanitize time server-write side.
 */
export function NotesField({
  initial,
  disabled,
  onSave,
}: {
  initial: string;
  disabled: boolean;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initial);
  const draftRef = useRef(initial);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Flush a pending save on unmount so the last keystrokes are not lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        if (draftRef.current !== lastSavedRef.current) {
          lastSavedRef.current = draftRef.current;
          onSaveRef.current(draftRef.current);
        }
      }
    };
  }, []);

  const handleChange = (value: string) => {
    const capped = value.slice(0, DOSSIER_NOTES_MAX_CHARS);
    setDraft(capped);
    draftRef.current = capped;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (capped !== lastSavedRef.current) {
        lastSavedRef.current = capped;
        onSave(capped);
      }
    }, NOTES_SAVE_DEBOUNCE_MS);
  };

  return (
    <div data-testid="dossier-notes">
      <textarea
        data-testid="dossier-notes-input"
        value={draft}
        disabled={disabled}
        maxLength={DOSSIER_NOTES_MAX_CHARS}
        placeholder="Notes about this property…"
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontSize: 11,
          lineHeight: 1.45,
          color: TEXT,
          background: "rgba(154,166,178,0.08)",
          border: "1px solid rgba(154,166,178,0.35)",
          borderRadius: 6,
          padding: "6px 8px",
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <div
        data-testid="dossier-notes-counter"
        style={{ fontSize: 9.5, color: MUTED, textAlign: "right" }}
      >
        {draft.length.toLocaleString()} / {DOSSIER_NOTES_MAX_CHARS.toLocaleString()}
      </div>
    </div>
  );
}
