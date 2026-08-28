// apps/property-explorer/src/workbench/tools/ChatTool.tsx
//
// W3 — the AI CHAT workbench tool. A FLOW port of the brief-extension's
// research chat (starter chips → cited answers → in-thread atom expand →
// freshness badges), PE-native styling, mounted through the pinned chassis
// API only (registry entry + useDockToolState — no dock edits).
//
// Behavior:
//   - PER-PROPERTY PERSISTENT thread via useDockToolState("chat"): close the
//     dock mid-conversation, reopen → the thread is still there; switch
//     property → THAT property's thread. An answer that lands after the dock
//     closed still persists (the store outlives the mount).
//   - Empty thread → the INVESTOR starter chips (extension set, verbatim);
//     tapping one sends its question with the REMAPPED starterPromptId
//     (unknown ids 400 server-side — the remap is the extension's own).
//   - Each request carries the last-8-turn history window + areaContext built
//     SELF-SUFFICIENTLY from the property's baked facets (zoning, setbacks,
//     envelope, situs address — fetched once per property, module-cached),
//     supplemented by the stored R1 brief when present (never a prerequisite)
//     and the inspect card address (host seam). See chat-research.ts.
//   - R2 CITATION LAYER: requests ride presentationMode "pro" (the pro ICP —
//     consumer mode strips [n] markers server-side), so answers carry inline
//     [n] anchors mapped to the citation chips. Tapping a chip or an inline
//     anchor opens ONE accordion card inside the thread (shared controller,
//     one open at a time): BRIEF renders from the LOCAL citation immediately,
//     then enriches via GET /api/spine/retrieval/atoms/:did (cached; any
//     non-200 degrades to the local content with an honest "full record
//     unavailable" line — the chip never breaks). "more →" reveals FULL:
//     provenance, NEVER-BARE confidence (honestly "asserted" — PE calibration
//     is not live), times, accessPolicy, and the CLIENT-COMPOSED lineage walk
//     (COMPUTED-FROM / WOULD-AFFECT chips from the property's atom-chain;
//     tapping one swaps the card with ← back — envelope → setback → code, in
//     place, no navigation). Atom chips wear the RESERVED violet accent used
//     nowhere else; websearch-derived sources render as distinct non-atom
//     links labeled unverified.
//   - Honest states: loading is "Researching…" (never an optimistic fake
//     answer); 401 sign-in notice; 402 opens the pricing modal + records
//     pe_paywall_hit; 400/404 "could not scope" with the server's message in
//     muted text; 5xx / network offer Try again. Notices are transient —
//     never persisted into the thread.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { TextArea } from "../../components/Input";
import { PE } from "../../styles/pe-chrome";
import {
  attachDossierToChatSubject,
  chatDossierContextFrom,
  getChatPropertyDossier,
} from "./dossier-chat-context";
import { UnverifiedSource } from "../../components/StatusChip";
import { TypingDots } from "../../components/Loading";
import { invalidatePropertyEntitlement } from "../../lib/entitlementClient";
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import type { BriefToolStoredState } from "./BriefTool";
import { LockedToolPanel } from "./LockedToolPanel";
import {
  buildChatSubjectFromFacets,
  chatOutcomeNotice,
  CHAT_FREE_EXHAUSTED_MESSAGE,
  CHAT_SUMMARY_LOCK_MESSAGE,
  getChatPropertyFacets,
  INVESTOR_STARTER_PROMPTS,
  runChatTurn,
  type ChatAnswer,
  type ChatTurn,
} from "./chat-research";
import {
  attachRecordsToChatSubject,
  chatRecordsContextFromFetch,
  enrichChatAnswerWithRecords,
  getChatPropertyRecords,
} from "./records-chat-context";
import {
  ATOM_ACCENT,
  ATOM_ACCENT_BG,
  ATOM_ACCENT_BORDER,
  ATOM_ACCENT_CONTRAST,
  deriveChipFreshness,
  freshnessTitle,
  isWebUnverifiedRef,
  parseAnswerSegments,
  parseInlineMarkdown,
  refForCitationNumber,
  type ChatRef,
} from "./chat-citations";
import {
  atomFromChain,
  composeLineage,
  deriveAtomCardModel,
  displayedDid,
  fetchAtomByDid,
  getChainEntries,
  openCitationCard,
  popLineage,
  pushLineage,
  type AtomCardModel,
  type AtomLineage,
  type CitationCardState,
  type ConfidenceDisplay,
} from "./chat-atom-card";
import { freshnessVerdict } from "../../browse/brief-view-model";
import { saveChatToProperty } from "./chat-dossier";
import { savePropertyWithDossier } from "../../lib/savedPropertiesClient";
import {
  activeSession as selectActiveSession,
  deleteSession,
  readSessionsState,
  sessionsByRecency,
  setActiveAttachments,
  setActiveTurns,
  startNewSession,
  switchSession,
  type ChatSession,
  type ChatSessionsState,
  type ChatStoredTurn as SessionStoredTurn,
} from "./chat-sessions";
import {
  composeMessageWithAttachments,
  formatBytes,
  ingestAttachment,
  ATTACH_MAX_PER_THREAD,
  type ChatAttachment,
} from "./chat-attach";

const TEXT = PE.text;
const MUTED = PE.muted;
const ACCENT = PE.accent;
const AMBER = PE.warning;
const CHIP_BORDER = PE.border;
const DETAIL_BG = "rgba(154,166,178,0.10)";

// ---------------------------------------------------------------------------
// Stored (per-property, JSON-serializable) thread state.
//
// The chassis store now holds a MULTI-SESSION shape per property
// (ChatSessionsState — sessions[] + activeSessionId, defined in chat-sessions).
// The legacy single-thread shape { turns } is migrated forward on read
// (readSessionsState), so an existing saved thread is never lost. The active
// session's turns are the working transcript. `ChatToolStoredState` /
// `ChatStoredTurn` stay exported as the legacy shape for existing tests +
// external callers (the store still accepts a bare { turns } and migrates it).
// ---------------------------------------------------------------------------

export type ChatStoredTurn = SessionStoredTurn;

export interface ChatToolStoredState {
  turns: ChatStoredTurn[];
}

// Transient per-mount phase — NEVER persisted (a failed/gated send never
// pollutes the stored thread; reopening retries cleanly).
type ChatPhase =
  | { kind: "idle" }
  | { kind: "sending" }
  | {
      kind: "notice";
      text: string;
      /** Server's own words, shown muted under the notice when present. */
      detail: string | null;
      tone: "muted" | "amber";
      /** Set → a "Try again" affordance resends this message. */
      retry: { message: string; starterPromptId?: string; personaBucket?: string } | null;
    };

// ---------------------------------------------------------------------------
// Citation chips + the ONE in-thread accordion (shared controller — state
// lives at the tool level so only one card is open across the whole thread).
// ---------------------------------------------------------------------------

/** Inline freshness badge — empty render for "unknown" (never a bare claim). */
export function FreshnessBadge({ chatRef }: { chatRef: ChatRef }) {
  const f = deriveChipFreshness(chatRef);
  if (f.status === "unknown") return null;
  const outdated = f.status === "outdated";
  return (
    <span
      data-testid="chat-chip-freshness"
      data-fresh={f.status}
      title={freshnessTitle(f)}
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        color: outdated ? AMBER : MUTED,
        border: `1px solid ${outdated ? "rgba(245,158,11,0.5)" : "rgba(154,166,178,0.4)"}`,
        borderRadius: 4,
        padding: "0 3px",
        marginLeft: 4,
      }}
    >
      {outdated ? "Outdated" : "Current"}
    </span>
  );
}

/**
 * Chip row (presentational). Atom chips wear the RESERVED accent — the one
 * hue that means "openable recorded atom evidence". Websearch-derived refs
 * render as visually distinct NON-atom links labeled unverified (they must
 * not borrow the atom accent's authority). The accordion renders separately
 * (AtomCard) under the row.
 */
export function ChatCitationChips({
  refs,
  openDid,
  onToggle,
}: {
  refs: ChatRef[];
  /** The did whose card is open ON THIS TURN (anchor), else null. */
  openDid: string | null;
  onToggle: (did: string) => void;
}) {
  if (refs.length === 0) return null;
  return (
    <div data-testid="chat-citations" style={{ marginTop: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {refs.map((r) => {
          if (isWebUnverifiedRef(r)) {
            const href =
              /^https?:\/\//.test(r.entityId) ? r.entityId : /^https?:\/\//.test(r.did) ? r.did : null;
            // ONE unverified-source pill for the whole app. It never wears
            // atom teal: teal marks an openable record, and a web source we
            // could not verify is the opposite of that.
            return (
              <UnverifiedSource
                key={r.did}
                domain={r.label}
                href={href ?? undefined}
                testId="chat-web-source"
              />
            );
          }
          const isOpen = r.did === openDid;
          return (
            <button
              key={r.did}
              type="button"
              data-testid="chat-citation-chip"
              aria-expanded={isOpen}
              onClick={() => onToggle(r.did)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                maxWidth: "100%",
                fontSize: 11.5,
                color: isOpen ? ATOM_ACCENT_CONTRAST : ATOM_ACCENT,
                background: isOpen ? ATOM_ACCENT : "transparent",
                border: `1px solid ${isOpen ? ATOM_ACCENT : ATOM_ACCENT_BORDER}`,
                borderRadius: 10,
                padding: "1px 7px",
                cursor: "pointer",
                lineHeight: 1.5,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width={10}
                height={10}
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6" />
              </svg>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.label}
              </span>
              <FreshnessBadge chatRef={r} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline [n] anchors (PRO mode keeps the markers in answer text). An anchor
// renders ONLY when the [n] maps to a real delivered citation — an invented
// [99] the backend dropped from citations[] stays plain text, never evidence.
// ---------------------------------------------------------------------------

function markdownNodes(text: string): ReactNode[] {
  return parseInlineMarkdown(text).map((seg, i) => {
    if (seg.kind === "bold") return <strong key={i}>{seg.text}</strong>;
    if (seg.kind === "italic") return <em key={i}>{seg.text}</em>;
    return <span key={i}>{seg.text}</span>;
  });
}

export function InlineAnswerText({
  content,
  refs,
  onCitationTap,
}: {
  content: string;
  refs: ChatRef[];
  onCitationTap: (did: string) => void;
}) {
  const paragraphs = content.split(/\n{2,}|\n/).filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : "6px 0 0", color: TEXT }}>
          {parseAnswerSegments(p).map((seg, j) => {
            if (seg.kind === "text") {
              return <span key={j}>{markdownNodes(seg.text)}</span>;
            }
            const ref = refForCitationNumber(refs, seg.n);
            if (!ref || isWebUnverifiedRef(ref)) {
              // No matching recorded atom → the marker is not evidence.
              return <span key={j}>{`[${seg.n}]`}</span>;
            }
            return (
              <button
                key={j}
                type="button"
                data-testid="chat-inline-citation"
                title={ref.label}
                onClick={() => onCitationTap(ref.did)}
                style={{
                  display: "inline-block",
                  verticalAlign: "super",
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: ATOM_ACCENT,
                  background: "transparent",
                  border: "none",
                  padding: "0 1px",
                  cursor: "pointer",
                }}
              >
                [{seg.n}]
              </button>
            );
          })}
        </p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The accordion card (BRIEF → "more →" → FULL, with the lineage walk).
// AtomCardView is presentational (test seam); AtomCard wires the fetches.
// ---------------------------------------------------------------------------

function ConfidenceLine({
  confidence,
  calibrated,
}: {
  confidence: ConfidenceDisplay | null;
  calibrated: ConfidenceDisplay | null;
}) {
  // NEVER-BARE: no basis → no number at all.
  if (!confidence) return null;
  return (
    <p
      data-testid="atom-card-confidence"
      style={{ margin: "3px 0 0", fontSize: 10, color: MUTED }}
    >
      Confidence {confidence.value.toFixed(2)} ·{" "}
      <span data-testid="atom-card-confidence-basis">{confidence.basis}</span>
      {calibrated ? (
        <>
          {" "}
          · calibrated {calibrated.value.toFixed(2)} ({calibrated.basis}, n=
          {calibrated.n ?? 0})
        </>
      ) : null}
    </p>
  );
}

function AsOfLine({ model }: { model: AtomCardModel }) {
  const asOf = model.asOf ?? model.capturedAt;
  if (!asOf) return null;
  const verdict = freshnessVerdict(asOf, Date.now());
  const date = asOf.slice(0, 10);
  const stale = verdict === "stale";
  return (
    <p style={{ margin: "3px 0 0", fontSize: 10, color: MUTED }}>
      As of {date}
      {verdict !== "unknown" ? (
        <span
          data-testid="atom-card-freshness"
          data-fresh={verdict}
          style={{
            marginLeft: 5,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: stale ? AMBER : verdict === "fresh" ? "#4ade80" : MUTED,
            border: `1px solid ${
              stale
                ? "rgba(245,158,11,0.5)"
                : verdict === "fresh"
                  ? "rgba(74,222,128,0.45)"
                  : "rgba(154,166,178,0.4)"
            }`,
            borderRadius: 4,
            padding: "0 3px",
          }}
        >
          {verdict}
        </span>
      ) : null}
    </p>
  );
}

function LineageChipRow({
  title,
  chips,
  testId,
  onTap,
}: {
  title: string;
  chips: AtomLineage["computedFrom"];
  testId: string;
  onTap: (did: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div style={{ marginTop: 5 }}>
      <p
        style={{
          margin: 0,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
        {chips.map((c) => (
          <button
            key={c.did}
            type="button"
            data-testid={testId}
            data-did={c.did}
            onClick={() => onTap(c.did)}
            style={{
              fontSize: 10,
              color: ATOM_ACCENT,
              background: ATOM_ACCENT_BG,
              border: `1px solid ${ATOM_ACCENT_BORDER}`,
              borderRadius: 8,
              padding: "1px 7px",
              cursor: "pointer",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface AtomCardViewProps {
  did: string;
  /** Local citation backing the anchor (BRIEF fallback content). */
  localRef: ChatRef | null;
  model: AtomCardModel | null;
  /** Fetch failed → keep local BRIEF content + honest unavailable line. */
  degraded: boolean;
  loading: boolean;
  full: boolean;
  lineage: AtomLineage | null;
  canBack: boolean;
  onBack: () => void;
  onToggleFull: () => void;
  onLineageTap: (did: string) => void;
}

export function AtomCardView({
  did,
  localRef,
  model,
  degraded,
  loading,
  full,
  lineage,
  canBack,
  onBack,
  onToggleFull,
  onLineageTap,
}: AtomCardViewProps) {
  const title =
    model?.claim ??
    localRef?.label ??
    model?.entityType?.replace(/-/g, " ") ??
    did;
  return (
    <div
      data-testid="chat-citation-detail"
      style={{
        marginTop: 5,
        padding: "6px 8px",
        borderRadius: 6,
        background: DETAIL_BG,
        border: `1px solid ${ATOM_ACCENT_BORDER}`,
      }}
    >
      {canBack && (
        <button
          type="button"
          data-testid="atom-card-back"
          onClick={onBack}
          style={{
            fontSize: 10,
            color: ATOM_ACCENT,
            background: "transparent",
            border: "none",
            padding: 0,
            marginBottom: 3,
            cursor: "pointer",
          }}
        >
          ← back
        </button>
      )}
      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: TEXT }}>
        {title}
        {localRef ? <FreshnessBadge chatRef={localRef} /> : null}
      </p>

      {/* BRIEF: local snippet immediately; enrichment layers on when it lands. */}
      {localRef?.snippet ? (
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: TEXT }}>
          {localRef.snippet.slice(0, full ? 1000 : 480)}
        </p>
      ) : !model?.claim && !loading ? (
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: MUTED }}>
          No excerpt for this source — open the property brief for full code
          context.
        </p>
      ) : null}

      {loading && (
        <p
          data-testid="atom-card-loading"
          style={{ margin: "3px 0 0", fontSize: 10, color: MUTED, fontStyle: "italic" }}
        >
          Loading atom record…
        </p>
      )}

      {degraded && (
        <p
          data-testid="atom-card-unavailable"
          style={{ margin: "3px 0 0", fontSize: 10, color: MUTED }}
        >
          Full record unavailable — showing the cited excerpt.
        </p>
      )}

      {model && (
        <>
          {(model.source || model.method) && (
            <p
              data-testid="atom-card-provenance"
              style={{ margin: "3px 0 0", fontSize: 10, color: MUTED }}
            >
              {[model.source, model.method].filter(Boolean).join(" · ")}
            </p>
          )}
          <ConfidenceLine
            confidence={model.confidence}
            calibrated={model.calibrated}
          />
          <AsOfLine model={model} />
          {model.accessPolicy && (
            <p
              data-testid="atom-card-access"
              style={{ margin: "3px 0 0", fontSize: 10, color: MUTED }}
            >
              access: {model.accessPolicy}
            </p>
          )}
        </>
      )}

      {full && (
        <div data-testid="atom-card-full">
          {model?.calibrated == null && model?.confidence != null && (
            <p style={{ margin: "4px 0 0", fontSize: 10, color: MUTED }}>
              Calibration not yet earned for this atom — the figure above is
              an asserted basis, not an outcome-calibrated one.
            </p>
          )}
          {model?.sourceCitation && (
            <p style={{ margin: "4px 0 0", fontSize: 10, color: MUTED }}>
              {model.sourceCitation.slice(0, 300)}
            </p>
          )}
          {(model?.sourceUrl ?? localRef?.sourceUrl) && (
            <a
              data-testid="atom-card-source-link"
              href={model?.sourceUrl ?? localRef?.sourceUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: 4,
                fontSize: 10,
                color: ACCENT,
              }}
            >
              Open cited source
            </a>
          )}
          {lineage && (
            <>
              <LineageChipRow
                title="Computed from"
                chips={lineage.computedFrom}
                testId="atom-card-computed-from"
                onTap={onLineageTap}
              />
              <LineageChipRow
                title="Would affect"
                chips={lineage.wouldAffect}
                testId="atom-card-would-affect"
                onTap={onLineageTap}
              />
              {lineage.citedInputs.length > 0 && (
                <p
                  data-testid="atom-card-cited-inputs"
                  style={{ margin: "4px 0 0", fontSize: 10, color: MUTED }}
                >
                  Cited inputs: {lineage.citedInputs.join(" · ")}
                </p>
              )}
            </>
          )}
          <code
            style={{
              display: "block",
              marginTop: 4,
              fontSize: 10,
              color: MUTED,
              wordBreak: "break-all",
            }}
          >
            {did}
          </code>
        </div>
      )}

      <button
        type="button"
        data-testid="atom-card-more"
        onClick={onToggleFull}
        style={{
          display: "block",
          marginTop: 4,
          fontSize: 10,
          color: ATOM_ACCENT,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
      >
        {full ? "less ←" : "more →"}
      </button>
    </div>
  );
}

/** Container: wires the chain/atom fetches + the walk state for one card. */
function AtomCard({
  state,
  refs,
  parcelNodeId,
  onWalk,
  onBack,
}: {
  state: CitationCardState;
  refs: ChatRef[];
  parcelNodeId: string;
  onWalk: (did: string) => void;
  onBack: () => void;
}) {
  const did = displayedDid(state);
  const localRef =
    refs.find((r) => r.did === did) ??
    (did === state.anchorDid
      ? (refs.find((r) => r.did === state.anchorDid) ?? null)
      : null);
  const [full, setFull] = useState(false);
  const [enrich, setEnrich] = useState<{
    forDid: string | null;
    model: AtomCardModel | null;
    degraded: boolean;
    lineage: AtomLineage | null;
  }>({ forDid: null, model: null, degraded: false, lineage: null });

  // Swapping the displayed atom resets to BRIEF (the walk starts shallow).
  useEffect(() => {
    setFull(false);
  }, [did]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const entries = parcelNodeId
        ? await getChainEntries(parcelNodeId)
        : null;
      // Chain-first (lineage taps resolve without a network hop), then the
      // atoms/:did route; both missing → the honest degrade.
      const fromChain = atomFromChain(did, entries);
      let model: AtomCardModel | null = fromChain
        ? deriveAtomCardModel(did, fromChain)
        : null;
      let degraded = false;
      if (!model) {
        const fetched = await fetchAtomByDid(did);
        if (fetched.kind === "ok") {
          model = deriveAtomCardModel(did, fetched.atom);
        } else {
          degraded = true;
        }
      }
      const lineage = composeLineage(did, entries);
      if (live) setEnrich({ forDid: did, model, degraded, lineage });
    })();
    return () => {
      live = false;
    };
  }, [did, parcelNodeId]);

  const settled = enrich.forDid === did;
  return (
    <AtomCardView
      did={did}
      localRef={localRef}
      model={settled ? enrich.model : null}
      degraded={settled ? enrich.degraded : false}
      loading={!settled}
      full={full}
      lineage={settled ? enrich.lineage : null}
      canBack={state.stack.length > 1}
      onBack={onBack}
      onToggleFull={() => setFull((f) => !f)}
      onLineageTap={onWalk}
    />
  );
}

function AssistantTurn({
  turn,
  turnIndex,
  parcelNodeId,
  cardState,
  copied,
  onCopy,
  onOpenCard,
  onWalk,
  onBack,
}: {
  turn: ChatStoredTurn;
  turnIndex: number;
  parcelNodeId: string;
  cardState: CitationCardState | null;
  copied?: boolean;
  onCopy?: () => void;
  onOpenCard: (turnIndex: number, did: string) => void;
  onWalk: (did: string) => void;
  onBack: () => void;
}) {
  const refs = turn.refs ?? [];
  const cardHere = cardState?.turnIndex === turnIndex ? cardState : null;
  return (
    <div data-testid="chat-turn-assistant" style={{ marginBottom: 10 }}>
      <InlineAnswerText
        content={turn.content}
        refs={refs}
        onCitationTap={(did) => onOpenCard(turnIndex, did)}
      />
      <ChatCitationChips
        refs={refs}
        openDid={cardHere?.anchorDid ?? null}
        onToggle={(did) => onOpenCard(turnIndex, did)}
      />
      {cardHere && (
        <AtomCard
          state={cardHere}
          refs={refs}
          parcelNodeId={parcelNodeId}
          onWalk={onWalk}
          onBack={onBack}
        />
      )}
      {turn.disclaimer ? (
        <p
          data-testid="chat-disclaimer"
          style={{ margin: "5px 0 0", fontSize: 10, color: MUTED }}
        >
          {turn.disclaimer}
        </p>
      ) : null}
      {onCopy && (
        <div style={{ marginTop: 3 }}>
          <CopyMessageButton copied={!!copied} onCopy={onCopy} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tool.
// ---------------------------------------------------------------------------

const starterChipStyle: CSSProperties = {
  fontSize: 11.5,
  color: TEXT,
  background: "transparent",
  border: CHIP_BORDER,
  borderRadius: 6,
  padding: "4px 9px",
  cursor: "pointer",
  textAlign: "left",
};

// ---------------------------------------------------------------------------
// Session bar — "New chat" + the thread picker. Every thread here is anchored
// to the CURRENT property; the bar switches the CONVERSATION, never the anchor.
// ---------------------------------------------------------------------------

const smallBtn: CSSProperties = {
  fontSize: 11.5,
  color: ACCENT,
  background: "transparent",
  border: "1px solid var(--brand-blue-border, rgba(59,130,246,0.4))",
  borderRadius: 6,
  padding: "2px 8px",
  cursor: "pointer",
};

export function ChatSessionBar({
  sessions,
  activeId,
  pickerOpen,
  disabled,
  onNewChat,
  onTogglePicker,
  onSwitch,
  onDelete,
}: {
  sessions: ChatSession[];
  activeId: string;
  pickerOpen: boolean;
  disabled: boolean;
  onNewChat: () => void;
  onTogglePicker: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];
  const activeLabel = active?.title ?? "New chat";
  const multiple = sessions.length > 1;
  return (
    <div
      data-testid="chat-session-bar"
      style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}
    >
      <button
        type="button"
        data-testid="chat-new-chat"
        onClick={onNewChat}
        disabled={disabled}
        style={{ ...smallBtn, opacity: disabled ? 0.55 : 1 }}
      >
        + New chat
      </button>
      <button
        type="button"
        data-testid="chat-thread-picker-toggle"
        aria-expanded={pickerOpen}
        onClick={onTogglePicker}
        title="Chats on this property"
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          fontSize: 11.5,
          color: TEXT,
          background: "rgba(154,166,178,0.08)",
          border: CHIP_BORDER,
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
        }}
      >
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {activeLabel}
          {multiple ? ` · ${sessions.length} chats` : ""}
        </span>
        <span style={{ color: MUTED, fontSize: 10 }}>{pickerOpen ? "▲" : "▼"}</span>
      </button>

      {pickerOpen && (
        <div
          data-testid="chat-thread-picker"
          className="pe-scroll"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            left: 0,
            zIndex: 5,
            marginTop: 3,
            maxHeight: "40vh",
            overflowY: "auto",
            background: "#0B0E13",
            border: CHIP_BORDER,
            borderRadius: 6,
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          }}
        >
          {sessions.map((s) => {
            const isActive = s.id === activeId;
            const label = s.title ?? "New chat";
            const meta = `${s.turns.length} turn${s.turns.length === 1 ? "" : "s"}${
              s.attachments.length
                ? ` · ${s.attachments.length} file${s.attachments.length === 1 ? "" : "s"}`
                : ""
            }`;
            return (
              <div
                key={s.id}
                data-testid="chat-thread-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  borderBottom: "1px solid rgba(154,166,178,0.15)",
                  background: isActive ? "var(--brand-blue-bg-soft, rgba(59,130,246,0.08))" : "transparent",
                }}
              >
                <button
                  type="button"
                  data-testid="chat-thread-open"
                  onClick={() => onSwitch(s.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    color: TEXT,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      fontWeight: isActive ? 600 : 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ display: "block", fontSize: 10, color: MUTED }}>
                    {meta}
                    {isActive ? " · current" : ""}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="chat-thread-delete"
                  aria-label={`Delete ${label}`}
                  onClick={() => onDelete(s.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: MUTED,
                    cursor: "pointer",
                    fontSize: 13.5,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Copy-to-clipboard affordance on a message bubble (user + assistant). */
export function CopyMessageButton({
  copied,
  onCopy,
}: {
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="chat-copy-message"
      aria-label="Copy message"
      onClick={onCopy}
      style={{
        fontSize: 10,
        color: copied ? "#4ade80" : MUTED,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** In-thread attachment chips (per-thread; tenant-private). */
export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove?: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div
      data-testid="chat-attachments"
      style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}
    >
      {attachments.map((a) => (
        <span
          key={a.id}
          data-testid="chat-attachment-chip"
          title={a.note ?? `${a.name} — passed to the AI as context`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            maxWidth: "100%",
            fontSize: 10,
            color: TEXT,
            background: "rgba(154,166,178,0.10)",
            border: CHIP_BORDER,
            borderRadius: 10,
            padding: "1px 7px",
          }}
        >
          <span aria-hidden="true">📎</span>
          <span
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {a.name}
          </span>
          <span style={{ color: MUTED, fontSize: 10 }}>
            {formatBytes(a.sizeBytes)}
            {a.extractedText ? "" : " · not read"}
          </span>
          {onRemove && (
            <button
              type="button"
              data-testid="chat-attachment-remove"
              aria-label={`Remove ${a.name}`}
              onClick={() => onRemove(a.id)}
              style={{
                background: "transparent",
                border: "none",
                color: MUTED,
                cursor: "pointer",
                fontSize: 12.5,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export function ChatTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  // R1 PROACTIVE entitlement: chat is PARTIALLY free — 3 signed-in free
  // messages per property (server-counted), then the wall. Entitled ($15
  // unlock or Pro) chats without limits. loading/error never blocks — the
  // server-402 belt stays authoritative.
  const ent = usePropertyEntitlement(activeParcelNodeId);
  const chatWalled = ent.locked && ent.freeMessagesLeft <= 0;
  // The chassis store holds the MULTI-SESSION state (or a legacy { turns }
  // shape, migrated forward on read). We read it as raw and normalize.
  const [storedRaw, setStoredRaw] = useDockToolState<unknown>("chat");
  const sessionsState: ChatSessionsState = readSessionsState(
    storedRaw,
    // A stable "now" per render is fine — helpers that need a real timestamp
    // (send/new/delete) pass their own; this only seeds a fresh empty state.
    new Date().toISOString(),
  );
  const session = selectActiveSession(sessionsState);
  const setStored = setStoredRaw as (next: ChatSessionsState | null) => void;
  // Read-only view of the BRIEF tool's stored state for the SAME property —
  // the chassis store is shared, keyed (property, toolId). Fuels areaContext.
  const [briefStored] = useDockToolState<BriefToolStoredState>("brief");
  const [phase, setPhase] = useState<ChatPhase>({ kind: "idle" });
  const [draft, setDraft] = useState("");
  // Attach action state (transient — never persisted).
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  // Copy affordance feedback (which message index flashed "Copied").
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // Thread picker open/closed (transient).
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // WB6 save-to-property: transient action state (never persisted).
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    text: string;
    tone: "muted" | "amber";
    /** True → the property is unsaved; offer "save the property first". */
    offerSave?: boolean;
  } | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const turns = session.turns;
  const attachments = session.attachments;

  // ONE accordion card across the whole thread (shared controller) — with the
  // lineage walk stack. Transient: never persisted, resets on property switch.
  const [cardState, setCardState] = useState<CitationCardState | null>(null);

  // Save-status + open card are per property — switching the active property
  // resets both.
  useEffect(() => {
    setSaveStatus(null);
    setCardState(null);
    setAttachError(null);
    setPickerOpen(false);
  }, [activeParcelNodeId]);

  // Switching to a different session (new chat / open a thread) resets the
  // transient open-card + copy feedback + picker.
  useEffect(() => {
    setCardState(null);
    setCopiedIndex(null);
    setPickerOpen(false);
  }, [session.id]);

  // Keep the newest turn in view as the thread grows.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, phase.kind]);

  const send = useCallback(
    async (
      text: string,
      meta: { starterPromptId?: string; personaBucket?: string } = {},
      opts: { isRetry?: boolean } = {},
    ) => {
      const message = text.trim();
      if (!message || !activeParcelNodeId) return;

      const stateNow = readSessionsState(storedRaw, new Date().toISOString());
      const activeSess = selectActiveSession(stateNow);
      const priorTurns = activeSess.turns;
      // History = turns BEFORE this message (the question rides as `message`;
      // the builder windows to the last 8). The stored/displayed user turn is
      // the CLEAN question — the attachment context is injected only into the
      // upstream `message`, never into the persisted bubble or the history.
      const history: ChatTurn[] = priorTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      // The user's turn persists immediately (a retry re-sends the SAME
      // already-persisted turn — never a duplicate bubble).
      const withUser: ChatStoredTurn[] = opts.isRetry
        ? priorTurns
        : [...priorTurns, { role: "user", content: message }];
      const nowIso = new Date().toISOString();
      if (!opts.isRetry) {
        setStored(setActiveTurns(stateNow, withUser, nowIso));
      }
      setPhase({ kind: "sending" });

      // ATTACH: inject the thread's readable attachment context into the
      // OUTGOING message (tenant-private client context passed to the model).
      // Persisted bubble + history stay the clean question — no leakage of the
      // wrapped block into storage or the shared layer.
      const messageForModel = composeMessageWithAttachments(
        message,
        activeSess.attachments,
      );

      // SELF-SUFFICIENT context: the chat sources the property's BAKED FACETS
      // itself (fetched once per property, module-cached) — zoning, setbacks,
      // envelope, situs address — so answers know the property even when the
      // Brief tool was never opened. The stored brief supplements when present.
      const facets = await getChatPropertyFacets(activeParcelNodeId);
      const recordsFetch = await getChatPropertyRecords(activeParcelNodeId);
      const recordsContext = chatRecordsContextFromFetch(recordsFetch);
      // The user's OWN work on this property — notes, status, and which
      // reports they generated. Filing records only; report contents are not
      // read here (see dossier-chat-context.ts).
      const userWork = chatDossierContextFrom(
        await getChatPropertyDossier(activeParcelNodeId),
      );
      const subject = attachDossierToChatSubject(
        attachRecordsToChatSubject(
          buildChatSubjectFromFacets(
            activeParcelNodeId,
            facets,
            briefStored?.brief ?? null,
            host.getActivePropertyAddress?.() ?? null,
          ),
          recordsContext,
        ),
        userWork,
      );
      const outcome = await runChatTurn({
        message: messageForModel,
        history: opts.isRetry ? history.slice(0, -1) : history,
        subject,
        starterPromptId: meta.starterPromptId,
        personaBucket: meta.personaBucket,
      });

      if (outcome.kind === "answer") {
        const answer = enrichChatAnswerWithRecords(outcome.answer, recordsContext);
        // Persist even if the dock closed mid-flight — setStored is bound to
        // the property this send STARTED for and the store outlives the mount.
        // Writes the user+answer turns onto the session this send started on.
        setStored(
          setActiveTurns(
            stateNow,
            [...withUser, answerTurn(answer)],
            new Date().toISOString(),
          ),
        );
        // A free (not-entitled) answer consumed a server-counted message —
        // refresh the proactive read so the remaining-messages line is true.
        if (!ent.entitled) invalidatePropertyEntitlement(activeParcelNodeId);
        if (mountedRef.current) setPhase({ kind: "idle" });
        return;
      }

      if (outcome.kind === "paywall") {
        void recordPeGtmEvent({
          eventType: "pe_paywall_hit",
          parcelNodeId: activeParcelNodeId,
        });
        // The server said 402 — refresh the proactive read (the wall renders
        // from it) and open the unified unlock flow with the honest reason.
        invalidatePropertyEntitlement(activeParcelNodeId);
        host.openPaywall(chatOutcomeNotice(outcome));
      }
      if (!mountedRef.current) return;
      setPhase({
        kind: "notice",
        text: chatOutcomeNotice(outcome),
        detail: outcome.kind === "scope-failed" ? outcome.text : null,
        tone:
          outcome.kind === "sign-in" || outcome.kind === "paywall"
            ? "amber"
            : "muted",
        retry:
          outcome.kind === "retryable" ||
          outcome.kind === "unreachable" ||
          outcome.kind === "sign-in"
            ? { message, ...meta }
            : null,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeParcelNodeId, storedRaw, briefStored, host, setStored, ent.entitled],
  );

  // WB6 — SAVE TO PROPERTY: store the thread (capped) into the saved
  // property's dossier + ONE extra call to the same research route for the AI
  // summary. An unsaved property gets the honest offer to save it first; a
  // failed summary still saves the thread, honestly noted.
  const handleSaveToProperty = useCallback(
    async (opts: { savePropertyFirst?: boolean } = {}) => {
      if (!activeParcelNodeId || turns.length === 0 || saveBusy) return;
      setSaveBusy(true);
      setSaveStatus(null);
      try {
        // Same subject construction as a normal send — the summary call is
        // scoped exactly like the thread it summarizes.
        const facets = await getChatPropertyFacets(activeParcelNodeId);
        const recordsFetch = await getChatPropertyRecords(activeParcelNodeId);
        const recordsContext = chatRecordsContextFromFetch(recordsFetch);
        const subject = attachRecordsToChatSubject(
          buildChatSubjectFromFacets(
            activeParcelNodeId,
            facets,
            briefStored?.brief ?? null,
            host.getActivePropertyAddress?.() ?? null,
          ),
          recordsContext,
        );
        if (opts.savePropertyFirst) {
          const saved = await savePropertyWithDossier(activeParcelNodeId, {
            label: subject.address,
            address: subject.address,
          });
          if (saved.kind !== "ok") {
            setSaveStatus({
              text:
                saved.kind === "sign-in"
                  ? "Sign in to save properties."
                  : "Could not save the property — try again.",
              tone: "amber",
            });
            return;
          }
        }
        const outcome = await saveChatToProperty({
          parcelNodeId: activeParcelNodeId,
          address: subject.address,
          turns: turns.map((t) => ({ role: t.role, content: t.content })),
          subject,
          // Multi-thread revisit: identify WHICH thread this is so it upserts
          // into the dossier's chatThreads list (revisit from My-properties).
          session: { id: session.id, title: session.title },
        });
        if (!mountedRef.current) return;
        switch (outcome.kind) {
          case "saved":
            setSaveStatus(
              outcome.summarized
                ? { text: "Saved to property with an AI summary.", tone: "muted" }
                : {
                    text: `Thread saved — no summary (${outcome.summaryNote ?? "summary generation failed"}).`,
                    tone: "muted",
                  },
            );
            return;
          case "not-saved":
            setSaveStatus({
              text: "This property isn't saved yet.",
              tone: "amber",
              offerSave: true,
            });
            return;
          case "sign-in":
            setSaveStatus({ text: "Sign in to save this chat.", tone: "amber" });
            return;
          case "unreachable":
            setSaveStatus({
              text: "Could not reach the saved-properties service.",
              tone: "amber",
            });
            return;
          case "error":
            setSaveStatus({ text: outcome.message, tone: "amber" });
            return;
        }
      } finally {
        setSaveBusy(false);
      }
    },
    [activeParcelNodeId, turns, saveBusy, briefStored, host, session.id, session.title],
  );

  // --- NEW CHAT / SWITCH / DELETE session handlers. ---

  const handleNewChat = useCallback(() => {
    setStored(startNewSession(sessionsState, new Date().toISOString()));
    setPhase({ kind: "idle" });
    setDraft("");
    setSaveStatus(null);
    setPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedRaw, setStored]);

  const handleSwitchSession = useCallback(
    (sessionId: string) => {
      setStored(switchSession(sessionsState, sessionId));
      setPhase({ kind: "idle" });
      setSaveStatus(null);
      setPickerOpen(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedRaw, setStored],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      setStored(deleteSession(sessionsState, sessionId, new Date().toISOString()));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedRaw, setStored],
  );

  // --- COPY a message to the clipboard (per-bubble affordance). ---

  const handleCopyMessage = useCallback(async (index: number, text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1200);
    } catch {
      // Clipboard blocked (permissions / insecure context) — silent; the
      // native select-and-copy still works on the rendered text.
    }
  }, []);

  // --- ATTACH a file as cited property context for THIS thread. ---

  const handleAttachFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setAttachError(null);
      setAttachBusy(true);
      try {
        const state = readSessionsState(storedRaw, new Date().toISOString());
        const current = selectActiveSession(state).attachments;
        const room = ATTACH_MAX_PER_THREAD - current.length;
        if (room <= 0) {
          setAttachError(`Up to ${ATTACH_MAX_PER_THREAD} attachments per chat.`);
          return;
        }
        const next: ChatAttachment[] = [...current];
        let firstError: string | null = null;
        for (const file of Array.from(files).slice(0, room)) {
          const result = await ingestAttachment(file);
          if (result.ok) next.push(result.attachment);
          else if (!firstError) firstError = result.error;
        }
        if (firstError) setAttachError(firstError);
        if (next.length !== current.length) {
          setStored(setActiveAttachments(state, next, new Date().toISOString()));
        }
      } finally {
        setAttachBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedRaw, setStored],
  );

  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      const state = readSessionsState(storedRaw, new Date().toISOString());
      const current = selectActiveSession(state).attachments;
      setStored(
        setActiveAttachments(
          state,
          current.filter((a) => a.id !== attachmentId),
          new Date().toISOString(),
        ),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storedRaw, setStored],
  );

  const allSessions = sessionsByRecency(sessionsState);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text || phase.kind === "sending") return;
    setDraft("");
    void send(text);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitDraft();
    }
  };

  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const CHAT_INPUT_MAX_ROWS = 6;

  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = Number.parseInt(getComputedStyle(el).lineHeight, 10) || 18;
    const maxHeight = lineHeight * CHAT_INPUT_MAX_ROWS;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [draft]);

  return (
    <div
      data-testid="chat-tool"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {/* SESSION BAR — new chat + the thread picker (all anchored to THIS
          property; the bar switches the conversation, never the anchor). */}
      <ChatSessionBar
        sessions={allSessions}
        activeId={session.id}
        pickerOpen={pickerOpen}
        disabled={phase.kind === "sending"}
        onNewChat={handleNewChat}
        onTogglePicker={() => setPickerOpen((o) => !o)}
        onSwitch={handleSwitchSession}
        onDelete={handleDeleteSession}
      />

      {/* THE THREAD (scrolls; the composer stays pinned below it). */}
      <div
        ref={threadRef}
        data-testid="chat-thread"
        className="pe-scroll"
        style={{ maxHeight: "52vh", overflowY: "auto", paddingRight: 2 }}
      >
        {turns.length === 0 && (
          <div data-testid="chat-starter">
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: MUTED }}>
              Ask about this property — answers cite the municipal-code atoms
              they rest on. Start with a question or a starter:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {INVESTOR_STARTER_PROMPTS.map((p) => (
                <Button
                  key={p.id}
                  variant="subtle"
                  dense
                  type="button"
                  data-testid={`chat-starter-chip-${p.id}`}
                  style={starterChipStyle}
                  disabled={phase.kind === "sending"}
                  onClick={() =>
                    void send(p.question, {
                      starterPromptId: p.id,
                      personaBucket: p.personaBucket,
                    })
                  }
                >
                  {p.chip}
                </Button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div
              key={i}
              className="ss-rise"
              data-ss-motion=""
              style={{
                margin: "0 0 10px",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              {/* The user's turn is a RIGHT-ALIGNED bubble whose one square
                  corner points back at the person who typed it. The answer
                  beneath it is plain text, not a bubble — so the two voices
                  are told apart by shape, not by an avatar. */}
              <p
                data-testid="chat-turn-user"
                style={{
                  margin: 0,
                  maxWidth: "85%",
                  padding: "7px 10px",
                  borderRadius: "10px 10px 4px 10px",
                  background: PE.blueBg,
                  color: PE.t2,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {turn.content}
              </p>
              <div style={{ marginTop: 3, textAlign: "right" }}>
                <CopyMessageButton
                  copied={copiedIndex === i}
                  onCopy={() => void handleCopyMessage(i, turn.content)}
                />
              </div>
            </div>
          ) : (
            <AssistantTurn
              key={i}
              turn={turn}
              turnIndex={i}
              parcelNodeId={activeParcelNodeId ?? ""}
              cardState={cardState}
              copied={copiedIndex === i}
              onCopy={() => void handleCopyMessage(i, turn.content)}
              onOpenCard={(turnIndex, did) =>
                setCardState((cur) => openCitationCard(cur, turnIndex, did))
              }
              onWalk={(did) => setCardState((cur) => pushLineage(cur, did))}
              onBack={() => setCardState((cur) => popLineage(cur))}
            />
          ),
        )}

        {/* Honest loading — a thinking line, never an optimistic fake answer. */}
        {phase.kind === "sending" && (
          <p
            data-testid="chat-loading"
            style={{
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontSize: 11.5,
              color: PE.t5,
            }}
          >
            <TypingDots label="Researching" />
            Researching…
          </p>
        )}

        {phase.kind === "notice" && (
          <div data-testid="chat-notice" style={{ margin: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11.5,
                color: phase.tone === "amber" ? AMBER : MUTED,
              }}
            >
              {phase.text}
            </p>
            {phase.detail && (
              <p
                data-testid="chat-notice-detail"
                style={{ margin: "3px 0 0", fontSize: 11.5, color: MUTED }}
              >
                {phase.detail}
              </p>
            )}
            {phase.retry && (
              <button
                type="button"
                data-testid="chat-retry"
                onClick={() => {
                  const r = phase.retry!;
                  void send(
                    r.message,
                    {
                      starterPromptId: r.starterPromptId,
                      personaBucket: r.personaBucket,
                    },
                    { isRetry: true },
                  );
                }}
                style={{
                  marginTop: 5,
                  fontSize: 11.5,
                  color: ACCENT,
                  background: "transparent",
                  border: "1px solid var(--brand-blue-border, rgba(59,130,246,0.4))",
                  borderRadius: 6,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      {/* WB6 — SAVE TO PROPERTY (visible once a thread exists). R1: the AI
          summary is PAID chat — not entitled → the button is a lock that
          opens the unified unlock flow (server 402 stays the belt). */}
      {turns.length > 0 && (
        <div
          data-testid="chat-save-row"
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <button
            type="button"
            data-testid="chat-save-to-property"
            data-locked={ent.locked ? "true" : "false"}
            disabled={saveBusy || phase.kind === "sending"}
            onClick={() => {
              if (ent.locked) {
                host.openPaywall(CHAT_SUMMARY_LOCK_MESSAGE);
                return;
              }
              void handleSaveToProperty();
            }}
            style={{
              fontSize: 11.5,
              color: ACCENT,
              background: "transparent",
              border: "1px solid var(--brand-blue-border, rgba(59,130,246,0.4))",
              borderRadius: 6,
              padding: "2px 8px",
              cursor: saveBusy ? "default" : "pointer",
              opacity: saveBusy ? 0.6 : 1,
            }}
          >
            {saveBusy
              ? "Saving…"
              : ent.locked
                ? "Save to property (unlock)"
                : "Save to property"}
          </button>
          {saveStatus && (
            <span
              data-testid="chat-save-status"
              style={{
                fontSize: 10,
                color: saveStatus.tone === "amber" ? AMBER : MUTED,
              }}
            >
              {saveStatus.text}
            </span>
          )}
          {saveStatus?.offerSave && (
            <Button
              variant="primary"
              dense
              type="button"
              data-testid="chat-save-property-first"
              disabled={saveBusy}
              onClick={() => void handleSaveToProperty({ savePropertyFirst: true })}
            >
              Save property &amp; attach chat
            </Button>
          )}
        </div>
      )}

      {/* R1 sign-in-first (signed-out): the free chat taste needs a FREE
          account (signed-in-free ruling) — say so up front; the map and
          inspect card stay anonymous. The composer stays; the server-401
          reactive path still answers if they try anyway. */}
      {ent.signedOut && (
        <div>
          <p
            data-testid="chat-sign-in-first"
            style={{ margin: 0, fontSize: 11.5, color: MUTED }}
          >
            Sign in free to chat — {ent.freeMessagesLimit} free messages on every
            property.
          </p>
          <div style={{ marginTop: 8 }}>
            <GoogleSignInButton
              size="sm"
              testId="chat-sign-in-first-link"
            />
          </div>
        </div>
      )}

      {/* R1 free-message meter — subtle, only while on the free allowance. */}
      {ent.locked && !chatWalled && (
        <p
          data-testid="chat-free-remaining"
          style={{ margin: 0, fontSize: 11.5, color: MUTED }}
        >
          {ent.freeMessagesLeft === 1
            ? "1 free message left on this property"
            : `${ent.freeMessagesLeft} free messages left on this property`}
        </p>
      )}

      {/* R1 THE WALL — free messages exhausted: the composer is replaced by
          the unified unlock flow (never a broken/empty state; the thread
          above stays readable). */}
      {chatWalled ? (
        <LockedToolPanel
          valueLine={CHAT_FREE_EXHAUSTED_MESSAGE}
          testId="chat-wall"
        />
      ) : (
      <>
      {/* ATTACHMENTS — this thread's private cited context (PDF / image /
          text). Readable text is passed to the AI as context; unreadable
          files attach as a named reference (honestly "not read"). Tenant-
          private — never pooled into the shared layer. */}
      <AttachmentChips attachments={attachments} onRemove={handleRemoveAttachment} />
      {attachError && (
        <p
          data-testid="chat-attach-error"
          style={{ margin: 0, fontSize: 10, color: AMBER }}
        >
          {attachError}
        </p>
      )}

      {/* THE COMPOSER — pinned at the dock bottom; Enter sends. */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          ref={fileInputRef}
          type="file"
          data-testid="chat-attach-input"
          accept=".pdf,image/*,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
          multiple
          style={{ display: "none" }}
          onChange={(e) => void handleAttachFiles(e.target.files)}
        />
        <button
          type="button"
          data-testid="chat-attach-button"
          aria-label="Attach a file as property context"
          title="Attach a PDF, image, or text file as context for this property"
          disabled={phase.kind === "sending" || attachBusy}
          onClick={() => fileInputRef.current?.click()}
          style={{
            fontSize: 13.5,
            lineHeight: 1,
            color: MUTED,
            background: "transparent",
            border: CHIP_BORDER,
            borderRadius: 6,
            padding: "5px 8px",
            cursor: phase.kind === "sending" || attachBusy ? "default" : "pointer",
            opacity: phase.kind === "sending" || attachBusy ? 0.55 : 1,
          }}
        >
          {attachBusy ? "…" : "📎"}
        </button>
        <TextArea
          ref={chatInputRef}
          rows={1}
          data-testid="chat-input"
          value={draft}
          placeholder="Ask about this property…"
          disabled={phase.kind === "sending"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="primary"
          dense
          type="button"
          data-testid="chat-send"
          onClick={submitDraft}
          disabled={phase.kind === "sending" || !draft.trim()}
        >
          Send
        </Button>
      </div>
      </>
      )}
    </div>
  );
}

function answerTurn(answer: ChatAnswer): ChatStoredTurn {
  return {
    role: "assistant",
    content: answer.message,
    refs: answer.refs,
    disclaimer: answer.disclaimer,
    confidence: answer.confidence,
    generatedAt: answer.generatedAt,
    method: answer.method,
  };
}
