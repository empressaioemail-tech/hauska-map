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
  type DossierChatThread,
  type DossierExportEntry,
  type DossierStatus,
} from "../../lib/propertyDossier";
import { pinAccent } from "../../lib/saved-pins";
import { cleanChatDisplay, nextOpenChatThread } from "../../lib/chat-display";
import {
  SHARE_PERSONAS,
  SHARE_PERSONA_LABELS,
  defaultShareMessage,
  type SharePersona,
} from "../../lib/share-personas";
import type { ShareReportSelection } from "../../lib/share-package";
import { Button } from "../../components/Button";
import { TextArea } from "../../components/Input";
import { PE } from "../../styles/pe-chrome";

const MUTED = PE.muted;
const AMBER = PE.warning;
const TEXT = PE.text;
const ACCENT = PE.accent;
const SECTION_BORDER = "1px solid rgba(154,166,178,0.2)";
const PERSONA_BG = "#0d1117";
const PERSONA_FG = "#e5e7eb";

/** Debounce delay for notes autosave (ms). Exported for tests. */
export const NOTES_SAVE_DEBOUNCE_MS = 800;

export interface PropertyShareMint {
  persona: SharePersona;
  message: string;
  includeNotes: boolean;
  includeXray: boolean;
  includeFlood: boolean;
}

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
  const kindLabel =
    entry.kind === "site-plan"
      ? "Site plan"
      : entry.kind === "flood-drainage"
        ? "Flood & drainage"
        : entry.kind === "xray"
          ? "X-ray"
          : "Terrain";
  return `${kindLabel} · ${entry.format}`;
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
  onMintShare,
  onToggleShareReport,
  shareUrl,
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
  /** On-property share mint (W3.3). Optional for older render tests. */
  onMintShare?: (pkg: PropertyShareMint) => void;
  onToggleShareReport?: (report: "xray" | "flood", included: boolean) => void;
  shareUrl?: string | null;
}) {
  const dossier = row.snapshot ?? {};
  const title = savedRowDisplayLabel(row);
  const address = cleanDisplayString(dossier.address ?? null);
  const savedDate = fmtDate(row.updatedAt) ?? fmtDate(dossier.savedAt);
  const drawingsCount = dossier.drawings?.features.length ?? 0;
  const chatSummary = dossier.chatSummary ?? null;
  const thread = dossier.chatThread ?? [];
  const chatThreads = dossier.chatThreads ?? [];
  const exports = dossier.exports ?? [];

  return (
    <div data-testid="dossier-detail">
      {/* BACK — returns to the master list (same dock, one surface). */}
      <Button
        variant="ghost"
        dense
        type="button"
        data-testid="dossier-back"
        onClick={onBack}
        style={{ padding: 0, border: "none", marginBottom: 8, fontSize: 11.5 }}
      >
        ← All saved properties
      </Button>

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

      {sectionHeader("Share")}
      <PropertySharePicker
        notesPresent={Boolean(dossier.notes && dossier.notes.trim())}
        reportSelection={dossier.shareReportSelection ?? null}
        busy={busy}
        shareUrl={shareUrl ?? null}
        onMintShare={onMintShare}
        onToggleShareReport={onToggleShareReport}
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
          <Button
            variant="secondary"
            dense
            type="button"
            data-testid="dossier-save-drawings"
            onClick={onSaveDrawings}
            disabled={busy}
          >
            Save current drawings
          </Button>
          {drawingsCount > 0 && (
            <Button
              variant="secondary"
              dense
              type="button"
              data-testid="dossier-show-drawings"
              onClick={onShowDrawings}
              disabled={busy}
            >
              Show on map
            </Button>
          )}
        </div>
      </div>

      {/* CHAT — AI summary (labeled, never verified fact) + saved thread(s).
          MULTI-THREAD: a property keeps a LIST of chat threads; each is an
          expandable transcript here (the durable, cross-device record). The
          live ChatTool's own thread picker continues any of them. */}
      {(chatSummary || thread.length > 0 || chatThreads.length > 0) && (
        <>
          {sectionHeader("Chat research")}

          {chatThreads.length > 0 && (
            <DossierChatThreads threads={chatThreads} />
          )}

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
                {cleanChatDisplay(chatSummary.summary)}
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
          {/* Legacy single-thread record — shown only when a dossier predates
              the multi-thread list (older saves carry chatThread but no
              chatThreads), so the same thread never renders twice. */}
          {thread.length > 0 && chatThreads.length === 0 && (
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
                        {cleanChatDisplay(turn.content)}
                  </p>
                ))}
              </div>
            </details>
          )}
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

export function DossierChatThreads({
  threads,
  openThreadId,
  onToggleThread,
}: {
  threads: DossierChatThread[];
  openThreadId?: string | null;
  onToggleThread?: (id: string) => void;
}) {
  const [internalOpen, setInternalOpen] = useState<string | null>(null);
  const openId = openThreadId !== undefined ? openThreadId : internalOpen;
  const toggle = (id: string) => {
    if (onToggleThread) onToggleThread(id);
    else setInternalOpen((cur) => nextOpenChatThread(cur, id));
  };
  const dated = [...threads].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));

  return (
    <div data-testid="dossier-chat-threads" style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>
        {dated.length} saved chat{dated.length === 1 ? "" : "s"} on this property
      </div>
      {dated.map((t) => {
        const open = openId === t.id;
        return (
          <div
            key={t.id}
            data-testid="dossier-chat-thread-item"
            data-open={open ? "true" : "false"}
            style={{ marginBottom: 4 }}
          >
            <button
              type="button"
              data-testid="dossier-chat-thread-toggle"
              aria-expanded={open}
              onClick={() => toggle(t.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 11,
                color: TEXT,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {t.title ? cleanChatDisplay(t.title) : "Untitled chat"}
              <span style={{ color: MUTED, fontWeight: 400, fontSize: 9.5 }}>
                {" "}
                · {t.turnCount} turn{t.turnCount === 1 ? "" : "s"}
                {fmtDate(t.savedAt) ? ` · ${fmtDate(t.savedAt)}` : ""}
              </span>
            </button>
            {open && (
              <div
                data-testid="dossier-chat-thread-body"
                style={{ marginTop: 4, borderLeft: SECTION_BORDER, paddingLeft: 8 }}
              >
                {t.turns.map((turn, i) => (
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
                    {cleanChatDisplay(turn.content)}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PropertyRowReports({
  selection,
  onToggle,
  disabled,
}: {
  selection: ShareReportSelection | null;
  onToggle?: (report: "xray" | "flood", included: boolean) => void;
  disabled?: boolean;
}) {
  const xray = selection?.xray === true;
  const flood = selection?.flood === true;
  return (
    <div data-testid="properties-row-reports" style={{ display: "flex", gap: 6 }}>
      <label
        data-testid="properties-row-report-xray"
        style={{ fontSize: 10, color: TEXT, cursor: disabled ? "default" : "pointer" }}
      >
        <input
          type="checkbox"
          checked={xray}
          disabled={disabled}
          onChange={(e) => onToggle?.("xray", e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />{" "}
        X-ray
      </label>
      <label
        data-testid="properties-row-report-flood"
        style={{ fontSize: 10, color: TEXT, cursor: disabled ? "default" : "pointer" }}
      >
        <input
          type="checkbox"
          checked={flood}
          disabled={disabled}
          onChange={(e) => onToggle?.("flood", e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />{" "}
        Flood
      </label>
    </div>
  );
}

export function PropertySharePicker({
  notesPresent,
  reportSelection,
  busy,
  shareUrl,
  onMintShare,
  onToggleShareReport,
}: {
  notesPresent: boolean;
  reportSelection: ShareReportSelection | null;
  busy: boolean;
  shareUrl: string | null;
  onMintShare?: (pkg: PropertyShareMint) => void;
  onToggleShareReport?: (report: "xray" | "flood", included: boolean) => void;
}) {
  const [persona, setPersona] = useState<SharePersona>("agent");
  const [message, setMessage] = useState(defaultShareMessage("agent"));
  const [includeNotes, setIncludeNotes] = useState(notesPresent);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastDefaultRef = useRef(defaultShareMessage("agent"));

  const pickPersona = (next: SharePersona) => {
    const nextDefault = defaultShareMessage(next);
    if (message === lastDefaultRef.current) {
      setMessage(nextDefault);
    }
    lastDefaultRef.current = nextDefault;
    setPersona(next);
  };

  const includeXray = reportSelection?.xray === true;
  const includeFlood = reportSelection?.flood === true;

  return (
    <div data-testid="dossier-share-picker">
      <p style={{ margin: "0 0 6px", fontSize: 10.5, color: MUTED }}>
        Copy a message and a /s/{"{grantId}"} link. This does not send email.
      </p>
      <label style={{ display: "block", fontSize: 10.5, color: MUTED, marginBottom: 4 }}>
        Who I am sharing with
        <div
          data-testid="dossier-share-persona"
          data-value={persona}
          style={{ position: "relative", marginTop: 3, colorScheme: "dark" }}
        >
          <button
            type="button"
            disabled={busy}
            aria-haspopup="listbox"
            aria-expanded={personaOpen}
            aria-label="Who I am sharing with"
            onClick={() => setPersonaOpen((open) => !open)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              fontSize: 11.5,
              color: PERSONA_FG,
              background: PERSONA_BG,
              border: PE.border,
              borderRadius: PE.radiusCard,
              padding: "6px 8px",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {SHARE_PERSONA_LABELS[persona]}
          </button>
          <ul
            role="listbox"
            data-testid="dossier-share-persona-menu"
            hidden={!personaOpen}
            style={{
              display: personaOpen ? "block" : "none",
              position: "absolute",
              left: 0,
              right: 0,
              zIndex: 4,
              margin: "4px 0 0",
              padding: 4,
              listStyle: "none",
              background: PERSONA_BG,
              color: PERSONA_FG,
              border: PE.border,
              borderRadius: PE.radiusCard,
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.45)",
            }}
          >
            {SHARE_PERSONAS.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p === persona}
                  value={p}
                  data-testid={`dossier-share-persona-${p}`}
                  onClick={() => {
                    pickPersona(p);
                    setPersonaOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontSize: 11.5,
                    color: PERSONA_FG,
                    background:
                      p === persona ? "rgba(59,130,246,0.18)" : PERSONA_BG,
                    border: "none",
                    borderRadius: 4,
                    padding: "6px 8px",
                    cursor: "pointer",
                  }}
                >
                  {SHARE_PERSONA_LABELS[p]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </label>
      <TextArea
        data-testid="dossier-share-message"
        value={message}
        disabled={busy}
        rows={3}
        onChange={(e) => setMessage(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
      />
      <label
        data-testid="dossier-share-include-notes"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          fontSize: 11.5,
          color: TEXT,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          data-testid="dossier-share-include-notes-input"
          checked={includeNotes}
          disabled={busy || !notesPresent}
          onChange={(e) => setIncludeNotes(e.target.checked)}
        />
        Include notes
      </label>
      <PropertyRowReports
        selection={reportSelection}
        onToggle={onToggleShareReport}
        disabled={busy}
      />
      {shareUrl ? (
        <div
          data-testid="dossier-share-url"
          style={{
            fontSize: 10.5,
            color: ACCENT,
            wordBreak: "break-all",
            margin: "8px 0 6px",
          }}
        >
          {shareUrl}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {shareUrl ? (
          <Button
            variant="primary"
            dense
            type="button"
            data-testid="dossier-share-copy"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl).then(
                () => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                },
                () => {
                  setCopied(false);
                },
              );
            }}
            style={{ flex: 1 }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        ) : null}
        {onMintShare ? (
          <Button
            variant={shareUrl ? "secondary" : "primary"}
            dense
            type="button"
            data-testid="dossier-share-create"
            disabled={busy || !message.trim()}
            onClick={() =>
              onMintShare({
                persona,
                message: message.trim(),
                includeNotes: notesPresent ? includeNotes : false,
                includeXray,
                includeFlood,
              })
            }
            style={{ flex: 1 }}
          >
            {busy ? "Creating link…" : shareUrl ? "New link" : "Create share link"}
          </Button>
        ) : null}
      </div>
    </div>
  );
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
  testId = "dossier-notes",
  inputTestId = "dossier-notes-input",
  counterTestId = "dossier-notes-counter",
}: {
  initial: string;
  disabled: boolean;
  onSave: (text: string) => void;
  testId?: string;
  inputTestId?: string;
  counterTestId?: string;
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
    <div data-testid={testId}>
      <TextArea
        data-testid={inputTestId}
        value={draft}
        disabled={disabled}
        maxLength={DOSSIER_NOTES_MAX_CHARS}
        placeholder="Notes about this property…"
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
        }}
      />
      <div
        data-testid={counterTestId}
        style={{ fontSize: 9.5, color: MUTED, textAlign: "right" }}
      >
        {draft.length.toLocaleString()} / {DOSSIER_NOTES_MAX_CHARS.toLocaleString()}
      </div>
    </div>
  );
}
