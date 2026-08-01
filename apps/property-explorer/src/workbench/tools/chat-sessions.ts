// apps/property-explorer/src/workbench/tools/chat-sessions.ts
//
// W3 SESSIONS — the property-anchored MULTI-THREAD model. The chat is STILL
// tied to a property (the anchor never leaves): sessions are a LIST OF THREADS
// on the CURRENT property, each with its own transcript, timestamps, an
// auto-title (first user question) or an operator name, and its own private
// attachments. "New chat" starts a fresh session on the same property; the
// picker switches between them; opening one loads its transcript to continue.
//
// This module is PURE (no React, no I/O) so the session mechanics are unit
// tested directly. The chassis store (useDockToolState("chat")) persists the
// whole ChatSessionsState per property (localStorage), exactly as it persisted
// the single-thread ChatToolStoredState before — the shape is migrated
// forward on read so an existing saved single thread is never lost.

import type { ChatRef } from "./chat-citations";
import type { ChatAttachment } from "./chat-attach";

// ---------------------------------------------------------------------------
// Stored turn (unchanged shape — moved here so sessions + the tool share it).
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

// ---------------------------------------------------------------------------
// Session + state shapes.
// ---------------------------------------------------------------------------

export interface ChatSession {
  /** Stable id (dedupe + active pointer). */
  id: string;
  /** Auto-title (first user question, trimmed) or an operator-set name. */
  title: string | null;
  /** ISO — session creation. */
  createdAt: string;
  /** ISO — last turn appended (drives the picker's recency order). */
  updatedAt: string;
  turns: ChatStoredTurn[];
  /** Tenant-private attachments for THIS thread (never pooled). */
  attachments: ChatAttachment[];
}

export interface ChatSessionsState {
  version: 2;
  sessions: ChatSession[];
  activeSessionId: string;
}

/** Legacy single-thread stored shape (version 1 / pre-sessions). */
export interface LegacyChatStoredState {
  turns: ChatStoredTurn[];
}

// ---------------------------------------------------------------------------
// Title derivation — the first user turn, trimmed to a sane length. Absent
// (no user turn yet) → null (the UI renders "New chat").
// ---------------------------------------------------------------------------

export const SESSION_TITLE_MAX_CHARS = 60;

export function deriveSessionTitle(turns: ChatStoredTurn[]): string | null {
  const firstUser = turns.find((t) => t.role === "user");
  if (!firstUser) return null;
  const trimmed = firstUser.content.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > SESSION_TITLE_MAX_CHARS
    ? `${trimmed.slice(0, SESSION_TITLE_MAX_CHARS - 1)}…`
    : trimmed;
}

// ---------------------------------------------------------------------------
// Id generation — crypto.randomUUID when present, else a timestamp+random
// fallback (never collides in practice; ids are per-property-local anyway).
// ---------------------------------------------------------------------------

export function newSessionId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptySession(now: string, id: string = newSessionId()): ChatSession {
  return {
    id,
    title: null,
    createdAt: now,
    updatedAt: now,
    turns: [],
    attachments: [],
  };
}

/** A fresh single-session state (one empty thread, active). */
export function freshSessionsState(now: string): ChatSessionsState {
  const s = emptySession(now);
  return { version: 2, sessions: [s], activeSessionId: s.id };
}

// ---------------------------------------------------------------------------
// Defensive normalization — the chassis store round-trips through
// localStorage; a malformed / hostile / legacy payload must never throw and
// must always yield at least one active session.
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function sanitizeTurn(v: unknown): ChatStoredTurn | null {
  if (!isRecord(v)) return null;
  const role = v.role === "user" || v.role === "assistant" ? v.role : null;
  const content = typeof v.content === "string" ? v.content : null;
  if (!role || content == null) return null;
  const turn: ChatStoredTurn = { role, content };
  if (Array.isArray(v.refs)) turn.refs = v.refs as ChatRef[];
  if (typeof v.disclaimer === "string" || v.disclaimer === null) turn.disclaimer = v.disclaimer;
  if (typeof v.confidence === "number" || v.confidence === null) turn.confidence = v.confidence;
  if (typeof v.generatedAt === "string" || v.generatedAt === null) turn.generatedAt = v.generatedAt;
  if (typeof v.method === "string" || v.method === null) turn.method = v.method;
  return turn;
}

function sanitizeAttachment(v: unknown): ChatAttachment | null {
  if (!isRecord(v)) return null;
  const id = typeof v.id === "string" ? v.id : null;
  const name = typeof v.name === "string" ? v.name : null;
  const kind = v.kind === "pdf" || v.kind === "image" || v.kind === "text" ? v.kind : null;
  if (!id || !name || !kind) return null;
  return {
    id,
    name,
    kind,
    mimeType: typeof v.mimeType === "string" ? v.mimeType : "",
    sizeBytes: typeof v.sizeBytes === "number" && Number.isFinite(v.sizeBytes) ? v.sizeBytes : 0,
    extractedText: typeof v.extractedText === "string" ? v.extractedText : null,
    note: typeof v.note === "string" ? v.note : null,
    addedAt: typeof v.addedAt === "string" ? v.addedAt : "",
  };
}

function sanitizeSession(v: unknown, now: string): ChatSession | null {
  if (!isRecord(v)) return null;
  const id = typeof v.id === "string" && v.id.trim() ? v.id : null;
  if (!id) return null;
  const turns = Array.isArray(v.turns)
    ? v.turns.map(sanitizeTurn).filter((t): t is ChatStoredTurn => t !== null)
    : [];
  const attachments = Array.isArray(v.attachments)
    ? v.attachments.map(sanitizeAttachment).filter((a): a is ChatAttachment => a !== null)
    : [];
  const createdAt = typeof v.createdAt === "string" ? v.createdAt : now;
  return {
    id,
    title: typeof v.title === "string" && v.title.trim() ? v.title : deriveSessionTitle(turns),
    createdAt,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : createdAt,
    turns,
    attachments,
  };
}

/**
 * Read the chassis-stored value into a valid ChatSessionsState. Handles:
 *   - null / undefined            → a fresh single-session state
 *   - the legacy { turns } shape  → migrated into ONE session (nothing lost)
 *   - a v2 sessions state         → sanitized (bad sessions dropped)
 * Always returns at least one session with a resolvable activeSessionId.
 */
export function readSessionsState(
  stored: unknown,
  now: string,
): ChatSessionsState {
  if (!isRecord(stored)) return freshSessionsState(now);

  // Legacy single-thread payload → one session carrying its turns.
  if (Array.isArray(stored.turns) && !Array.isArray(stored.sessions)) {
    const turns = (stored.turns as unknown[])
      .map(sanitizeTurn)
      .filter((t): t is ChatStoredTurn => t !== null);
    const session = emptySession(now);
    session.turns = turns;
    session.title = deriveSessionTitle(turns);
    return { version: 2, sessions: [session], activeSessionId: session.id };
  }

  if (Array.isArray(stored.sessions)) {
    const sessions = stored.sessions
      .map((s) => sanitizeSession(s, now))
      .filter((s): s is ChatSession => s !== null);
    if (sessions.length === 0) return freshSessionsState(now);
    const activeId =
      typeof stored.activeSessionId === "string" &&
      sessions.some((s) => s.id === stored.activeSessionId)
        ? stored.activeSessionId
        : sessions[0].id;
    return { version: 2, sessions, activeSessionId: activeId };
  }

  return freshSessionsState(now);
}

// ---------------------------------------------------------------------------
// Selectors.
// ---------------------------------------------------------------------------

export function activeSession(state: ChatSessionsState): ChatSession {
  return (
    state.sessions.find((s) => s.id === state.activeSessionId) ?? state.sessions[0]
  );
}

/** Sessions ordered for the picker: most recently updated first. */
export function sessionsByRecency(state: ChatSessionsState): ChatSession[] {
  return [...state.sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Transitions — every one returns a NEW state (immutable), never mutates.
// ---------------------------------------------------------------------------

/**
 * Replace the ACTIVE session's turns (the send flow). Re-derives the title
 * from the turns when the session had none (first user turn names the thread)
 * and bumps updatedAt. Attachments are preserved.
 */
export function setActiveTurns(
  state: ChatSessionsState,
  turns: ChatStoredTurn[],
  now: string,
): ChatSessionsState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === state.activeSessionId
        ? {
            ...s,
            turns,
            title: s.title ?? deriveSessionTitle(turns),
            updatedAt: now,
          }
        : s,
    ),
  };
}

/**
 * NEW CHAT — a fresh empty session on the SAME property, made active. If the
 * current active session is already empty (no turns, no attachments) it is
 * REUSED rather than piling up blank threads.
 */
export function startNewSession(
  state: ChatSessionsState,
  now: string,
): ChatSessionsState {
  const current = activeSession(state);
  if (current && current.turns.length === 0 && current.attachments.length === 0) {
    return { ...state, activeSessionId: current.id };
  }
  const s = emptySession(now);
  return {
    ...state,
    sessions: [s, ...state.sessions],
    activeSessionId: s.id,
  };
}

/** SWITCH — make an existing session active (no-op if the id is unknown). */
export function switchSession(
  state: ChatSessionsState,
  sessionId: string,
): ChatSessionsState {
  if (!state.sessions.some((s) => s.id === sessionId)) return state;
  return { ...state, activeSessionId: sessionId };
}

/**
 * DELETE a session. Removing the active (or last) one keeps the invariant that
 * a state always has at least one active session: an emptied list gets a fresh
 * session; a removed-active picks the most recent survivor.
 */
export function deleteSession(
  state: ChatSessionsState,
  sessionId: string,
  now: string,
): ChatSessionsState {
  const remaining = state.sessions.filter((s) => s.id !== sessionId);
  if (remaining.length === 0) return freshSessionsState(now);
  const activeSessionId =
    state.activeSessionId === sessionId
      ? sessionsByRecency({ ...state, sessions: remaining })[0].id
      : state.activeSessionId;
  return { ...state, sessions: remaining, activeSessionId };
}

/** Rename a session (operator-set title; empty clears back to the auto-title). */
export function renameSession(
  state: ChatSessionsState,
  sessionId: string,
  title: string,
): ChatSessionsState {
  const clean = title.trim().slice(0, SESSION_TITLE_MAX_CHARS);
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === sessionId
        ? { ...s, title: clean ? clean : deriveSessionTitle(s.turns) }
        : s,
    ),
  };
}

/** Set the ACTIVE session's attachments (add/remove flow). Bumps updatedAt. */
export function setActiveAttachments(
  state: ChatSessionsState,
  attachments: ChatAttachment[],
  now: string,
): ChatSessionsState {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === state.activeSessionId ? { ...s, attachments, updatedAt: now } : s,
    ),
  };
}

/**
 * Adopt a saved dossier thread into the local sessions as the ACTIVE session
 * so the operator can CONTINUE it. If a session with the same id already
 * exists it is switched to (not duplicated); otherwise the thread is inserted
 * and made active. Attachments are not restored from the dossier (they are
 * tenant-private client context, not persisted server-side in v1).
 */
export function adoptThread(
  state: ChatSessionsState,
  thread: { id: string; title: string | null; turns: ChatStoredTurn[]; savedAt?: string },
  now: string,
): ChatSessionsState {
  const existing = state.sessions.find((s) => s.id === thread.id);
  if (existing) return { ...state, activeSessionId: thread.id };
  const session: ChatSession = {
    id: thread.id,
    title: thread.title ?? deriveSessionTitle(thread.turns),
    createdAt: thread.savedAt ?? now,
    updatedAt: now,
    turns: thread.turns,
    attachments: [],
  };
  return {
    ...state,
    sessions: [session, ...state.sessions],
    activeSessionId: session.id,
  };
}
