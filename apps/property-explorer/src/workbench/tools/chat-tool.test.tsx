// W3 chat — dock-tool render tests (react-dom/server static markup, same
// pattern as workbench.test.tsx: effects don't run, so store-fed states are
// what render). Pins:
//   - chat is LIVE in the registry and renders in the ONE shared dock;
//   - empty thread → the verbatim investor starter chips + pinned composer;
//   - stored thread renders turns, citation chips, muted disclaimer;
//   - PER-PROPERTY persistence: thread follows the property, close/reopen
//     keeps it, switching property re-scopes to THAT property's thread;
//   - chip → in-thread expand mechanics (pure toggle + detail card render);
//   - freshness badge cases (current / outdated / unknown → no badge).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import {
  ChatCitationChips,
  FreshnessBadge,
  nextExpandedDid,
  type ChatToolStoredState,
} from "./ChatTool";
import type { ChatRef } from "./chat-citations";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  getActivePropertyAddress: () => "123 Main St, Bastrop, TX",
};
const noop = () => {};

function renderChat(opts: {
  activeParcelNodeId?: string | null;
  store?: ReturnType<typeof createWorkbenchToolStateStore>;
  open?: boolean;
}): string {
  return renderToStaticMarkup(
    <Workbench
      tools={WORKBENCH_TOOLS}
      openToolId={opts.open === false ? null : "chat"}
      onOpenToolChange={noop}
      activeParcelNodeId={
        opts.activeParcelNodeId === undefined ? "48021:123" : opts.activeParcelNodeId
      }
      host={host}
      store={opts.store ?? createWorkbenchToolStateStore({ storage: null })}
    />,
  );
}

function chatRef(overrides: Partial<ChatRef>): ChatRef {
  return {
    did: "did:hauska:code-section:bastrop-udc-4-2",
    entityType: "code-section",
    entityId: "bastrop-udc-4-2",
    label: "ADU standards",
    snippet: "Accessory dwelling units are permitted subject to…",
    edition: null,
    vintage: null,
    ...overrides,
  };
}

const THREAD: ChatToolStoredState = {
  turns: [
    { role: "user", content: "Can I add an ADU?" },
    {
      role: "assistant",
      content: "Likely yes, subject to P-2 standards.\n\nVerify with the city.",
      refs: [chatRef({})],
      disclaimer: "Not legal advice.",
      confidence: 0.75,
      generatedAt: "2026-07-29T00:00:00.000Z",
      method: "grok",
    },
  ],
};

describe("chat in the registry + dock", () => {
  it("chat is LIVE and renders inside the one shared dock", () => {
    expect(
      WORKBENCH_TOOLS.filter((t) => t.status === "live").map((t) => t.id),
    ).toEqual(["brief", "chat", "reports"]);
    const html = renderChat({});
    expect(html.match(/data-testid="workbench-dock"/g)).toHaveLength(1);
    expect(html).toContain('data-tool="chat"');
    expect(html).toContain('data-testid="chat-tool"');
    expect(html).not.toContain('data-testid="dock-coming"');
  });

  it("no active property → the chassis' honest select-first state, not the tool", () => {
    const html = renderChat({ activeParcelNodeId: null });
    expect(html).toContain('data-testid="dock-no-property"');
    expect(html).not.toContain('data-testid="chat-tool"');
  });
});

describe("empty thread — starter chips + pinned composer", () => {
  it("renders the five verbatim investor starter chips", () => {
    const html = renderChat({});
    expect(html).toContain('data-testid="chat-starter"');
    for (const id of ["unit_subdivide", "pencil", "killers", "rehab", "insurance"]) {
      expect(html).toContain(`data-testid="chat-starter-chip-${id}"`);
    }
    expect(html).toContain("Can I add a unit or subdivide?");
    expect(html).toContain("Does it pencil?");
    expect(html).toContain("What kills this deal?");
    expect(html).toContain("Rehab reality check");
    expect(html).toContain("Insurance and flood cost?");
  });

  it("composer is pinned and empty; no fake turns, no loading state", () => {
    const html = renderChat({});
    expect(html).toContain('data-testid="chat-input"');
    expect(html).toContain('data-testid="chat-send"');
    expect(html).not.toContain('data-testid="chat-turn-user"');
    expect(html).not.toContain('data-testid="chat-turn-assistant"');
    expect(html).not.toContain('data-testid="chat-loading"');
  });
});

describe("stored thread — turns, chips, disclaimer", () => {
  it("renders user + assistant turns with the citation chip row", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const html = renderChat({ store });
    expect(html).toContain('data-testid="chat-turn-user"');
    expect(html).toContain("Can I add an ADU?");
    expect(html).toContain('data-testid="chat-turn-assistant"');
    expect(html).toContain("Likely yes, subject to P-2 standards.");
    expect(html).toContain('data-testid="chat-citations"');
    expect(html).toContain('data-testid="chat-citation-chip"');
    expect(html).toContain("ADU standards");
    // Starter chips retire once the thread exists.
    expect(html).not.toContain('data-testid="chat-starter"');
  });

  it("disclaimer renders muted under the answer when present", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const html = renderChat({ store });
    expect(html).toMatch(
      /data-testid="chat-disclaimer"[^>]*>Not legal advice\./,
    );
    // No disclaimer → no disclaimer node.
    const bare = createWorkbenchToolStateStore({ storage: null });
    bare.set("48021:123", "chat", {
      turns: [{ role: "assistant", content: "hi" }],
    } satisfies ChatToolStoredState);
    expect(renderChat({ store: bare })).not.toContain(
      'data-testid="chat-disclaimer"',
    );
  });
});

describe("per-property persistent history (the chassis store owns it)", () => {
  it("close mid-conversation, reopen → the thread is still there", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const closed = renderChat({ store, open: false });
    expect(closed).not.toContain('data-testid="workbench-dock"');
    const reopened = renderChat({ store });
    expect(reopened).toContain("Likely yes, subject to P-2 standards.");
  });

  it("property switch → THAT property's thread (no bleed-through)", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    store.set("48491:999", "chat", {
      turns: [{ role: "user", content: "Flood risk here?" }],
    } satisfies ChatToolStoredState);
    const a = renderChat({ store, activeParcelNodeId: "48021:123" });
    expect(a).toContain("Can I add an ADU?");
    expect(a).not.toContain("Flood risk here?");
    const b = renderChat({ store, activeParcelNodeId: "48491:999" });
    expect(b).toContain("Flood risk here?");
    expect(b).not.toContain("Can I add an ADU?");
  });

  it("a property with no thread starts at the starter chips", () => {
    const store = createWorkbenchToolStateStore({ storage: null });
    store.set("48021:123", "chat", THREAD);
    const html = renderChat({ store, activeParcelNodeId: "48000:1" });
    expect(html).toContain('data-testid="chat-starter"');
    expect(html).not.toContain('data-testid="chat-turn-user"');
  });
});

describe("citation chip → in-thread expand (no network, local refs only)", () => {
  it("pure toggle: tap expands, tap again collapses, tap another replaces", () => {
    expect(nextExpandedDid(null, "did:a")).toBe("did:a");
    expect(nextExpandedDid("did:a", "did:a")).toBeNull();
    expect(nextExpandedDid("did:a", "did:b")).toBe("did:b");
  });

  it("collapsed: chips render, no detail card", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips refs={[chatRef({})]} expandedDid={null} onToggle={noop} />,
    );
    expect(html).toContain('data-testid="chat-citation-chip"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="chat-citation-detail"');
  });

  it("expanded: in-thread detail card with label, snippet excerpt, and did", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips
        refs={[chatRef({})]}
        expandedDid="did:hauska:code-section:bastrop-udc-4-2"
        onToggle={noop}
      />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-testid="chat-citation-detail"');
    expect(html).toContain("Accessory dwelling units are permitted subject to…");
    expect(html).toContain("did:hauska:code-section:bastrop-udc-4-2");
  });

  it("expanded ref without a snippet → honest no-excerpt copy, never a blank", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips
        refs={[chatRef({ snippet: null })]}
        expandedDid="did:hauska:code-section:bastrop-udc-4-2"
        onToggle={noop}
      />,
    );
    expect(html).toContain("No excerpt for this source");
  });

  it("no refs → no citation row at all", () => {
    const html = renderToStaticMarkup(
      <ChatCitationChips refs={[]} expandedDid={null} onToggle={noop} />,
    );
    expect(html).toBe("");
  });
});

describe("freshness badge on chips", () => {
  it("outdated edition → amber Outdated badge", () => {
    const html = renderToStaticMarkup(
      <FreshnessBadge chatRef={chatRef({ edition: "2018 IBC" })} />,
    );
    expect(html).toContain('data-fresh="outdated"');
    expect(html).toContain("Outdated");
  });

  it("current edition → Current badge", () => {
    const html = renderToStaticMarkup(
      <FreshnessBadge chatRef={chatRef({ label: "IBC 2024 §1013" })} />,
    );
    expect(html).toContain('data-fresh="current"');
    expect(html).toContain("Current");
  });

  it("unknown freshness → NO badge (no unearned claim)", () => {
    const html = renderToStaticMarkup(<FreshnessBadge chatRef={chatRef({})} />);
    expect(html).toBe("");
  });
});
