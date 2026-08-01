// W3 SESSIONS — the property-anchored multi-thread model. Pins:
//   - legacy { turns } migrates forward into ONE session (nothing lost);
//   - new/switch/delete/rename keep the invariant of one active session;
//   - "new chat" reuses an already-empty active session (no blank pile-up);
//   - title auto-derives from the first user question;
//   - malformed / hostile stored payloads never throw.

import { describe, expect, it } from "vitest";
import {
  activeSession,
  adoptThread,
  deleteSession,
  deriveSessionTitle,
  freshSessionsState,
  readSessionsState,
  renameSession,
  sessionsByRecency,
  setActiveAttachments,
  setActiveTurns,
  startNewSession,
  switchSession,
  type ChatSessionsState,
  type ChatStoredTurn,
} from "./chat-sessions";
import type { ChatAttachment } from "./chat-attach";

const T0 = "2026-08-01T00:00:00.000Z";
const T1 = "2026-08-01T01:00:00.000Z";
const T2 = "2026-08-01T02:00:00.000Z";

function userTurn(content: string): ChatStoredTurn {
  return { role: "user", content };
}

describe("deriveSessionTitle", () => {
  it("uses the first user question, trimmed + collapsed", () => {
    expect(
      deriveSessionTitle([userTurn("  Can I   add an ADU? "), { role: "assistant", content: "yes" }]),
    ).toBe("Can I add an ADU?");
  });
  it("null when there is no user turn yet", () => {
    expect(deriveSessionTitle([])).toBeNull();
    expect(deriveSessionTitle([{ role: "assistant", content: "hi" }])).toBeNull();
  });
  it("truncates very long questions with an ellipsis", () => {
    const long = "a".repeat(200);
    const title = deriveSessionTitle([userTurn(long)])!;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("readSessionsState — migration + defense", () => {
  it("null → a fresh single empty session", () => {
    const s = readSessionsState(null, T0);
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].turns).toEqual([]);
    expect(s.activeSessionId).toBe(s.sessions[0].id);
  });

  it("legacy { turns } → ONE session carrying the turns + derived title", () => {
    const legacy = {
      turns: [userTurn("Flood risk here?"), { role: "assistant", content: "Zone X." }],
    };
    const s = readSessionsState(legacy, T0);
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].turns).toHaveLength(2);
    expect(s.sessions[0].title).toBe("Flood risk here?");
    expect(s.sessions[0].attachments).toEqual([]);
  });

  it("a v2 state round-trips (sessions + active pointer preserved)", () => {
    const built: ChatSessionsState = {
      version: 2,
      sessions: [
        { id: "a", title: "A", createdAt: T0, updatedAt: T0, turns: [], attachments: [] },
        { id: "b", title: "B", createdAt: T1, updatedAt: T1, turns: [userTurn("q")], attachments: [] },
      ],
      activeSessionId: "b",
    };
    const s = readSessionsState(built, T2);
    expect(s.sessions.map((x) => x.id)).toEqual(["a", "b"]);
    expect(s.activeSessionId).toBe("b");
  });

  it("bad active pointer falls back to the first session", () => {
    const s = readSessionsState(
      { version: 2, sessions: [{ id: "a", turns: [] }], activeSessionId: "nope" },
      T0,
    );
    expect(s.activeSessionId).toBe("a");
  });

  it("hostile / malformed payload never throws, yields an active session", () => {
    for (const bad of [42, "x", [], { sessions: "no" }, { sessions: [null, 3] }]) {
      const s = readSessionsState(bad, T0);
      expect(s.sessions.length).toBeGreaterThanOrEqual(1);
      expect(activeSession(s)).toBeTruthy();
    }
  });
});

describe("setActiveTurns", () => {
  it("writes turns to the active session, derives the title, bumps updatedAt", () => {
    const s0 = freshSessionsState(T0);
    const s1 = setActiveTurns(s0, [userTurn("Setbacks?")], T1);
    const a = activeSession(s1);
    expect(a.turns).toHaveLength(1);
    expect(a.title).toBe("Setbacks?");
    expect(a.updatedAt).toBe(T1);
  });
  it("keeps an operator-set title even after more turns", () => {
    let s = freshSessionsState(T0);
    s = setActiveTurns(s, [userTurn("first")], T1);
    s = renameSession(s, s.activeSessionId, "My deal notes");
    s = setActiveTurns(s, [userTurn("first"), { role: "assistant", content: "x" }], T2);
    expect(activeSession(s).title).toBe("My deal notes");
  });
});

describe("startNewSession", () => {
  it("adds a fresh active session when the current one has content", () => {
    let s = freshSessionsState(T0);
    s = setActiveTurns(s, [userTurn("q1")], T1);
    const before = s.activeSessionId;
    s = startNewSession(s, T2);
    expect(s.sessions).toHaveLength(2);
    expect(s.activeSessionId).not.toBe(before);
    expect(activeSession(s).turns).toEqual([]);
  });
  it("REUSES an already-empty active session (no blank pile-up)", () => {
    const s0 = freshSessionsState(T0);
    const s1 = startNewSession(s0, T1);
    expect(s1.sessions).toHaveLength(1);
    expect(s1.activeSessionId).toBe(s0.activeSessionId);
  });
});

describe("switchSession / deleteSession / rename", () => {
  function twoSessions(): ChatSessionsState {
    let s = freshSessionsState(T0); // session A active
    s = setActiveTurns(s, [userTurn("A question")], T0);
    s = startNewSession(s, T1); // session B active
    s = setActiveTurns(s, [userTurn("B question")], T1);
    return s;
  }

  it("switch makes an existing session active; unknown id is a no-op", () => {
    const s = twoSessions();
    const first = s.sessions[s.sessions.length - 1].id; // A (appended first)
    const switched = switchSession(s, first);
    expect(switched.activeSessionId).toBe(first);
    expect(switchSession(s, "ghost")).toBe(s);
  });

  it("delete removes a session; deleting the active picks the recent survivor", () => {
    const s = twoSessions();
    const active = s.activeSessionId;
    const after = deleteSession(s, active, T2);
    expect(after.sessions.some((x) => x.id === active)).toBe(false);
    expect(after.sessions).toHaveLength(1);
    expect(activeSession(after)).toBeTruthy();
  });

  it("deleting the LAST session yields a fresh empty one (never zero)", () => {
    const s = freshSessionsState(T0);
    const after = deleteSession(s, s.activeSessionId, T1);
    expect(after.sessions).toHaveLength(1);
    expect(after.sessions[0].turns).toEqual([]);
  });

  it("rename sets an operator title; empty clears back to the auto-title", () => {
    let s = freshSessionsState(T0);
    s = setActiveTurns(s, [userTurn("auto title")], T0);
    s = renameSession(s, s.activeSessionId, "Renamed");
    expect(activeSession(s).title).toBe("Renamed");
    s = renameSession(s, s.activeSessionId, "   ");
    expect(activeSession(s).title).toBe("auto title");
  });
});

describe("sessionsByRecency", () => {
  it("orders most-recently-updated first", () => {
    let s = freshSessionsState(T0);
    s = setActiveTurns(s, [userTurn("old")], T0);
    s = startNewSession(s, T1);
    s = setActiveTurns(s, [userTurn("new")], T2);
    const order = sessionsByRecency(s).map((x) => x.title);
    expect(order[0]).toBe("new");
  });
});

describe("setActiveAttachments", () => {
  it("stores attachments on the active session only", () => {
    const att: ChatAttachment = {
      id: "att1",
      name: "survey.pdf",
      kind: "pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      extractedText: "rear setback 20 ft",
      note: null,
      addedAt: T0,
    };
    let s = freshSessionsState(T0);
    s = setActiveAttachments(s, [att], T1);
    expect(activeSession(s).attachments).toHaveLength(1);
    expect(activeSession(s).attachments[0].name).toBe("survey.pdf");
  });
});

describe("adoptThread — revisit a saved thread as the active session", () => {
  it("inserts + activates a thread not already present", () => {
    const s0 = freshSessionsState(T0);
    const s1 = adoptThread(
      s0,
      { id: "saved-1", title: "Saved chat", turns: [userTurn("prior")], savedAt: T0 },
      T1,
    );
    expect(s1.activeSessionId).toBe("saved-1");
    expect(activeSession(s1).turns).toHaveLength(1);
  });
  it("switches to (never duplicates) a thread already in the sessions", () => {
    let s = freshSessionsState(T0);
    s = setActiveTurns(s, [userTurn("q")], T0);
    const id = s.activeSessionId;
    s = startNewSession(s, T1);
    const after = adoptThread(s, { id, title: null, turns: [], savedAt: T0 }, T2);
    expect(after.sessions.filter((x) => x.id === id)).toHaveLength(1);
    expect(after.activeSessionId).toBe(id);
  });
});
