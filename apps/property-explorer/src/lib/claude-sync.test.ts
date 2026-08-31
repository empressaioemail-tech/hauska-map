// P-87 Claude Sync — the pure halves: the prompt, the two links, the read.

import { describe, expect, it } from "vitest";
import {
  CLAUDE_PROMPT_MAX,
  buildSyncPrompt,
  claudeDesktopChatUrl,
  claudeWebChatUrl,
  relativeSeen,
  subscribeConnectionRefresh,
} from "./claudeSync";
import { parseAiConnections } from "./aiConnectionClient";

const NODE = "48021-R123456";

describe("buildSyncPrompt", () => {
  it("always carries the parcel node id — the half get_smart_site needs", () => {
    expect(buildSyncPrompt({ parcelNodeId: NODE, label: null })).toContain(
      NODE,
    );
    expect(
      buildSyncPrompt({ parcelNodeId: NODE, label: "1200 Chestnut St" }),
    ).toContain(NODE);
  });

  it("includes a resolved label for human orientation", () => {
    expect(
      buildSyncPrompt({ parcelNodeId: NODE, label: "1200 Chestnut St" }),
    ).toContain("1200 Chestnut St");
  });

  it("OMITS an unresolved label rather than dressing the id up as an address", () => {
    const prompt = buildSyncPrompt({ parcelNodeId: NODE, label: null });
    // The id appears once, inside the parenthetical, never as a display name.
    expect(prompt).toContain(`(parcel node ${NODE})`);
    expect(prompt).not.toContain(`${NODE} (parcel node`);
  });

  it("does not print the id twice when the label IS the id", () => {
    // The card falls back to the node id as a label when nothing resolves.
    // That must not produce "48021-R123456 (parcel node 48021-R123456)".
    const prompt = buildSyncPrompt({ parcelNodeId: NODE, label: NODE });
    expect(prompt.split(NODE).length - 1).toBe(1);
  });

  it("stays inside the documented q ceiling", () => {
    const prompt = buildSyncPrompt({
      parcelNodeId: NODE,
      label: "x".repeat(40_000),
    });
    expect(prompt.length).toBeLessThanOrEqual(CLAUDE_PROMPT_MAX);
  });
});

describe("the two links", () => {
  it("web opens claude.ai and carries an encoded prompt", () => {
    const url = claudeWebChatUrl("open 1200 Chestnut St & tell me");
    expect(url.startsWith("https://claude.ai/new?q=")).toBe(true);
    expect(url).toContain("%26"); // & encoded, not left to split the query
    expect(url).not.toContain(" ");
  });

  it("desktop uses the DOCUMENTED claude:// scheme", () => {
    // https://claude.ai/new?q= is undocumented for prefill; claude:// is the
    // form Anthropic publishes. Do not collapse these two into one.
    const url = claudeDesktopChatUrl("hello there");
    expect(url.startsWith("claude://claude.ai/new?q=")).toBe(true);
  });
});

describe("relativeSeen", () => {
  const now = Date.parse("2026-08-31T12:00:00.000Z");

  it("reads recent, minutes, hours and days (NOT VACUOUS)", () => {
    expect(relativeSeen("2026-08-31T11:59:30.000Z", now)).toBe("just now");
    expect(relativeSeen("2026-08-31T11:55:00.000Z", now)).toBe("5 minutes ago");
    // Singular. This case is why the "just now" cutoff is 45s and not 90s:
    // at 90 nothing can round to 1 and the singular branch is unreachable.
    expect(relativeSeen("2026-08-31T11:59:00.000Z", now)).toBe("1 minute ago");
    expect(relativeSeen("2026-08-31T08:00:00.000Z", now)).toBe("4 hours ago");
    expect(relativeSeen("2026-08-25T12:00:00.000Z", now)).toBe("6 days ago");
  });

  it("returns null for an absent or unparseable stamp, never 'just now'", () => {
    // A missing timestamp must render as nothing. Painting it as "just now"
    // would invent a freshness the row does not carry.
    expect(relativeSeen(null, now)).toBeNull();
    expect(relativeSeen("not a date", now)).toBeNull();
    expect(relativeSeen("", now)).toBeNull();
  });
});

describe("parseAiConnections", () => {
  it("reads a well-formed body (NOT VACUOUS)", () => {
    const parsed = parseAiConnections({
      connections: [
        {
          client: "claude-ai",
          clientVersion: "0.1.0",
          firstSeenAt: "2026-08-30T00:00:00.000Z",
          lastSeenAt: "2026-08-31T00:00:00.000Z",
        },
      ],
      claude: {
        client: "claude-ai",
        clientVersion: null,
        firstSeenAt: null,
        lastSeenAt: null,
      },
    });
    expect(parsed?.connections).toHaveLength(1);
    expect(parsed?.claude?.client).toBe("claude-ai");
  });

  it("reports connected-to-nothing as an empty read, not a failure", () => {
    const parsed = parseAiConnections({ connections: [], claude: null });
    expect(parsed).toEqual({ connections: [], claude: null });
  });

  it("refuses a body with no connections array rather than defaulting to empty", () => {
    // An unreadable body and an empty account are different facts. Collapsing
    // them would render "not connected" on a broken response.
    expect(parseAiConnections(null)).toBeNull();
    expect(parseAiConnections({})).toBeNull();
    expect(parseAiConnections({ connections: "none" })).toBeNull();
  });

  it("drops a row with no client name instead of showing 'unknown'", () => {
    const parsed = parseAiConnections({
      connections: [{ client: "  " }, { client: "claude-ai" }],
      claude: null,
    });
    expect(parsed?.connections.map((c) => c.client)).toEqual(["claude-ai"]);
  });
});

describe("subscribeConnectionRefresh — the defect that shipped 2026-08-31", () => {
  // The card read the connection once on mount with [] deps and could never
  // read it again. Connect Claude, come back, and it still showed setup.
  // Collapsing the dock did not help either: the dock keeps its content
  // mounted. These tests exist so that wiring cannot go missing silently.
  function fakeTarget() {
    const handlers = new Map<string, Set<() => void>>();
    return {
      addEventListener(t: string, h: () => void) {
        if (!handlers.has(t)) handlers.set(t, new Set());
        handlers.get(t)!.add(h);
      },
      removeEventListener(t: string, h: () => void) {
        handlers.get(t)?.delete(h);
      },
      fire(t: string) {
        for (const h of [...(handlers.get(t) ?? [])]) h();
      },
      count(t: string) {
        return handlers.get(t)?.size ?? 0;
      },
    };
  }

  it("re-reads when the window regains focus (NOT VACUOUS)", () => {
    const win = fakeTarget();
    const doc = { ...fakeTarget(), visibilityState: "visible" };
    let runs = 0;
    subscribeConnectionRefresh(() => runs++, win, doc as never);
    expect(runs).toBe(0);
    win.fire("focus");
    expect(runs).toBe(1);
    win.fire("focus");
    expect(runs).toBe(2);
  });

  it("re-reads when the tab becomes visible", () => {
    const win = fakeTarget();
    const doc = Object.assign(fakeTarget(), { visibilityState: "visible" });
    let runs = 0;
    subscribeConnectionRefresh(() => runs++, win, doc as never);
    doc.fire("visibilitychange");
    expect(runs).toBe(1);
  });

  it("does NOT re-read when the document is hidden", () => {
    // A background tab waking up is not a user coming back to look.
    const win = fakeTarget();
    const doc = Object.assign(fakeTarget(), { visibilityState: "hidden" });
    let runs = 0;
    subscribeConnectionRefresh(() => runs++, win, doc as never);
    doc.fire("visibilitychange");
    expect(runs).toBe(0);
  });

  it("unsubscribes both listeners, so a closed card stops polling the account", () => {
    const win = fakeTarget();
    const doc = Object.assign(fakeTarget(), { visibilityState: "visible" });
    let runs = 0;
    const off = subscribeConnectionRefresh(() => runs++, win, doc as never);
    expect(win.count("focus")).toBe(1);
    expect(doc.count("visibilitychange")).toBe(1);
    off();
    expect(win.count("focus")).toBe(0);
    expect(doc.count("visibilitychange")).toBe(0);
    win.fire("focus");
    doc.fire("visibilitychange");
    expect(runs).toBe(0);
  });
});
