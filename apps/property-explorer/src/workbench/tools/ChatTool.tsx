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
//   - Assistant answers render as plain-text paragraphs (consumer mode — the
//     server strips [n] markers) with a chip row from the response citations;
//     tapping a chip expands an in-thread detail card (label + snippet +
//     freshness) from LOCAL data — no network fetch, no innerHTML.
//   - Honest states: loading is "Researching…" (never an optimistic fake
//     answer); 401 sign-in notice; 402 opens the PaywallGate + records
//     pe_paywall_hit; 400/404 "could not scope" with the server's message in
//     muted text; 5xx / network offer Try again. Notices are transient —
//     never persisted into the thread.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import type { BriefToolStoredState } from "./BriefTool";
import {
  buildChatSubjectFromFacets,
  chatOutcomeNotice,
  CHAT_PAYWALL_MESSAGE,
  getChatPropertyFacets,
  INVESTOR_STARTER_PROMPTS,
  runChatTurn,
  type ChatAnswer,
  type ChatTurn,
} from "./chat-research";
import {
  deriveChipFreshness,
  freshnessTitle,
  type ChatRef,
} from "./chat-citations";
import { saveChatToProperty } from "./chat-dossier";
import { savePropertyWithDossier } from "../../lib/savedPropertiesClient";

const TEXT = "#e5e7eb";
const MUTED = "#9aa6b2";
const ACCENT = "#7dd3fc";
const AMBER = "#fcd34d";
const CHIP_BORDER = "1px solid rgba(154,166,178,0.35)";
const USER_BG = "rgba(125,211,252,0.12)";
const DETAIL_BG = "rgba(154,166,178,0.10)";

// ---------------------------------------------------------------------------
// Stored (per-property, JSON-serializable) thread state.
// ---------------------------------------------------------------------------

export interface ChatStoredTurn {
  role: "user" | "assistant";
  /** Plain text — rendered AND sent upstream as the history window. */
  content: string;
  /** Assistant-only: normalized citation refs backing the chip row. */
  refs?: ChatRef[];
  disclaimer?: string | null;
  confidence?: number | null;
  generatedAt?: string | null;
  method?: string | null;
}

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

/** Pure chip-expand toggle (extension wireInlineAtomExpand semantics: tapping
 *  the expanded chip collapses it; tapping another replaces the detail). */
export function nextExpandedDid(
  current: string | null,
  tapped: string,
): string | null {
  return current === tapped ? null : tapped;
}

// ---------------------------------------------------------------------------
// Citation chips + in-thread expand (presentational; state lives in the turn).
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
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        color: outdated ? AMBER : MUTED,
        border: `1px solid ${outdated ? "rgba(252,211,77,0.5)" : "rgba(154,166,178,0.4)"}`,
        borderRadius: 3,
        padding: "0 3px",
        marginLeft: 4,
      }}
    >
      {outdated ? "Outdated" : "Current"}
    </span>
  );
}

/**
 * Chip row + the ONE expanded in-thread detail card (enrichAssistantHtml +
 * wireInlineAtomExpand ported as components). Expansion reads the LOCAL ref —
 * no network fetch on tap.
 */
export function ChatCitationChips({
  refs,
  expandedDid,
  onToggle,
}: {
  refs: ChatRef[];
  expandedDid: string | null;
  onToggle: (did: string) => void;
}) {
  if (refs.length === 0) return null;
  const expanded = expandedDid
    ? (refs.find((r) => r.did === expandedDid) ?? null)
    : null;
  return (
    <div data-testid="chat-citations" style={{ marginTop: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {refs.map((r) => {
          const isOpen = r.did === expandedDid;
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
                fontSize: 10.5,
                color: isOpen ? "#0b0f14" : ACCENT,
                background: isOpen ? ACCENT : "transparent",
                border: `1px solid ${isOpen ? ACCENT : "rgba(125,211,252,0.45)"}`,
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
      {expanded && (
        <div
          data-testid="chat-citation-detail"
          style={{
            marginTop: 5,
            padding: "6px 8px",
            borderRadius: 6,
            background: DETAIL_BG,
            border: CHIP_BORDER,
          }}
        >
          <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: TEXT }}>
            {expanded.label}
            <FreshnessBadge chatRef={expanded} />
          </p>
          {expanded.snippet ? (
            <p style={{ margin: "3px 0 0", fontSize: 10.5, color: TEXT }}>
              {expanded.snippet.slice(0, 480)}
            </p>
          ) : (
            <p style={{ margin: "3px 0 0", fontSize: 10.5, color: MUTED }}>
              No excerpt for this source — open the property brief for full
              code context.
            </p>
          )}
          <code
            style={{
              display: "block",
              marginTop: 4,
              fontSize: 9.5,
              color: MUTED,
              wordBreak: "break-all",
            }}
          >
            {expanded.did}
          </code>
        </div>
      )}
    </div>
  );
}

function AssistantTurn({ turn }: { turn: ChatStoredTurn }) {
  const [expandedDid, setExpandedDid] = useState<string | null>(null);
  const paragraphs = turn.content.split(/\n{2,}|\n/).filter((p) => p.trim());
  return (
    <div data-testid="chat-turn-assistant" style={{ marginBottom: 10 }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : "6px 0 0", color: TEXT }}>
          {p}
        </p>
      ))}
      <ChatCitationChips
        refs={turn.refs ?? []}
        expandedDid={expandedDid}
        onToggle={(did) => setExpandedDid((cur) => nextExpandedDid(cur, did))}
      />
      {turn.disclaimer ? (
        <p
          data-testid="chat-disclaimer"
          style={{ margin: "5px 0 0", fontSize: 10, color: MUTED }}
        >
          {turn.disclaimer}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The tool.
// ---------------------------------------------------------------------------

const starterChipStyle: CSSProperties = {
  fontSize: 11,
  color: TEXT,
  background: "transparent",
  border: CHIP_BORDER,
  borderRadius: 12,
  padding: "3px 9px",
  cursor: "pointer",
  textAlign: "left",
};

export function ChatTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [stored, setStored] = useDockToolState<ChatToolStoredState>("chat");
  // Read-only view of the BRIEF tool's stored state for the SAME property —
  // the chassis store is shared, keyed (property, toolId). Fuels areaContext.
  const [briefStored] = useDockToolState<BriefToolStoredState>("brief");
  const [phase, setPhase] = useState<ChatPhase>({ kind: "idle" });
  const [draft, setDraft] = useState("");
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

  const turns = stored?.turns ?? [];

  // Save-status is per property — switching the active property resets it.
  useEffect(() => {
    setSaveStatus(null);
  }, [activeParcelNodeId]);

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

      const priorTurns = stored?.turns ?? [];
      // History = turns BEFORE this message (the question rides as `message`;
      // the builder windows to the last 8).
      const history: ChatTurn[] = priorTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      // The user's turn persists immediately (a retry re-sends the SAME
      // already-persisted turn — never a duplicate bubble).
      const withUser: ChatStoredTurn[] = opts.isRetry
        ? priorTurns
        : [...priorTurns, { role: "user", content: message }];
      if (!opts.isRetry) setStored({ turns: withUser });
      setPhase({ kind: "sending" });

      // SELF-SUFFICIENT context: the chat sources the property's BAKED FACETS
      // itself (fetched once per property, module-cached) — zoning, setbacks,
      // envelope, situs address — so answers know the property even when the
      // Brief tool was never opened. The stored brief supplements when present.
      const facets = await getChatPropertyFacets(activeParcelNodeId);
      const subject = buildChatSubjectFromFacets(
        activeParcelNodeId,
        facets,
        briefStored?.brief ?? null,
        host.getActivePropertyAddress?.() ?? null,
      );
      const outcome = await runChatTurn({
        message,
        history: opts.isRetry ? history.slice(0, -1) : history,
        subject,
        starterPromptId: meta.starterPromptId,
        personaBucket: meta.personaBucket,
      });

      if (outcome.kind === "answer") {
        // Persist even if the dock closed mid-flight — setStored is bound to
        // the property this send STARTED for and the store outlives the mount.
        setStored({ turns: [...withUser, answerTurn(outcome.answer)] });
        if (mountedRef.current) setPhase({ kind: "idle" });
        return;
      }

      if (outcome.kind === "paywall") {
        void recordPeGtmEvent({
          eventType: "pe_paywall_hit",
          parcelNodeId: activeParcelNodeId,
        });
        host.openPaywall(CHAT_PAYWALL_MESSAGE);
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
    [activeParcelNodeId, stored, briefStored, host, setStored],
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
        const subject = buildChatSubjectFromFacets(
          activeParcelNodeId,
          facets,
          briefStored?.brief ?? null,
          host.getActivePropertyAddress?.() ?? null,
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
    [activeParcelNodeId, turns, saveBusy, briefStored, host],
  );

  const submitDraft = () => {
    const text = draft.trim();
    if (!text || phase.kind === "sending") return;
    setDraft("");
    void send(text);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitDraft();
    }
  };

  return (
    <div
      data-testid="chat-tool"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {/* THE THREAD (scrolls; the composer stays pinned below it). */}
      <div
        ref={threadRef}
        data-testid="chat-thread"
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
                <button
                  key={p.id}
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
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <p
              key={i}
              data-testid="chat-turn-user"
              style={{
                margin: "0 0 8px",
                padding: "5px 8px",
                borderRadius: 6,
                background: USER_BG,
                color: TEXT,
              }}
            >
              {turn.content}
            </p>
          ) : (
            <AssistantTurn key={i} turn={turn} />
          ),
        )}

        {/* Honest loading — a thinking line, never an optimistic fake answer. */}
        {phase.kind === "sending" && (
          <p
            data-testid="chat-loading"
            style={{ margin: 0, fontSize: 11.5, color: MUTED, fontStyle: "italic" }}
          >
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
                style={{ margin: "3px 0 0", fontSize: 10.5, color: MUTED }}
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
                  fontSize: 10.5,
                  color: ACCENT,
                  background: "transparent",
                  border: "1px solid rgba(125,211,252,0.45)",
                  borderRadius: 5,
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

      {/* WB6 — SAVE TO PROPERTY (visible once a thread exists). */}
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
            disabled={saveBusy || phase.kind === "sending"}
            onClick={() => void handleSaveToProperty()}
            style={{
              fontSize: 10.5,
              color: ACCENT,
              background: "transparent",
              border: "1px solid rgba(125,211,252,0.45)",
              borderRadius: 5,
              padding: "2px 8px",
              cursor: saveBusy ? "default" : "pointer",
              opacity: saveBusy ? 0.6 : 1,
            }}
          >
            {saveBusy ? "Saving…" : "Save to property"}
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
            <button
              type="button"
              data-testid="chat-save-property-first"
              disabled={saveBusy}
              onClick={() => void handleSaveToProperty({ savePropertyFirst: true })}
              style={{
                fontSize: 10.5,
                color: "#0b0f14",
                background: ACCENT,
                border: `1px solid ${ACCENT}`,
                borderRadius: 5,
                padding: "2px 8px",
                cursor: saveBusy ? "default" : "pointer",
              }}
            >
              Save property &amp; attach chat
            </button>
          )}
        </div>
      )}

      {/* THE COMPOSER — pinned at the dock bottom; Enter sends. */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          data-testid="chat-input"
          value={draft}
          placeholder="Ask about this property…"
          disabled={phase.kind === "sending"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11.5,
            color: TEXT,
            background: "rgba(154,166,178,0.08)",
            border: CHIP_BORDER,
            borderRadius: 6,
            padding: "6px 8px",
            outline: "none",
          }}
        />
        <button
          type="button"
          data-testid="chat-send"
          onClick={submitDraft}
          disabled={phase.kind === "sending" || !draft.trim()}
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "#0b0f14",
            background: ACCENT,
            border: `1px solid ${ACCENT}`,
            borderRadius: 6,
            padding: "5px 10px",
            cursor: phase.kind === "sending" ? "default" : "pointer",
            opacity: phase.kind === "sending" || !draft.trim() ? 0.55 : 1,
          }}
        >
          Send
        </button>
      </div>
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
