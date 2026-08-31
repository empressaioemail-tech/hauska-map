// P-87 CLAUDE SYNC — was `use-in-ai-tool.test.tsx`, a four-vendor sheet test.
//
// The vendor cut is asserted as ABSENCE, not just by deleting the old
// assertions. Deleting them would let ChatGPT, Cursor and Copilot rows creep
// back with nothing failing; asserting they are gone means the ruling has a
// control behind it.
//
// The two states are asserted from the CONNECTION FACT, both directions, so
// neither panel can be the one that always renders.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import {
  CLAUDE_CUSTOMIZE_CONNECTORS_URL,
  CLAUDE_SYNC_VALUE_LINE,
  CLAUDE_SYNC_VENDORS,
  ClaudeSyncBody,
  connectionFailureLine,
  SMART_SITE_CONNECT_HOST,
  SMART_SITE_CONNECT_URL,
  type ClaudeConnectionState,
} from "./ClaudeSyncTool";

const host: WorkbenchHostActions = { openPaywall: () => {} };
const noop = () => {};

const FORBIDDEN = [
  "Hauska",
  "Empressa",
  "MCP",
  "API key",
  "product key",
  "Cloud Run",
  "OAuth",
  "PKCE",
  "Bearer",
  "X-Hauska-Key",
];

/**
 * Strip style and class attributes before matching a vendor NAME.
 *
 * The first cut of the vendor-cut check matched /Cursor/i against raw markup
 * and fired on `cursor:pointer` in every inline style, which is a check
 * failing for a reason that has nothing to do with what it measures. Copy is
 * what this asserts on, so CSS is removed first.
 */
function visibleText(html: string): string {
  return html.replace(/ style="[^"]*"/g, "").replace(/ class="[^"]*"/g, "");
}

const CONNECTED: ClaudeConnectionState = {
  kind: "connected",
  connection: {
    client: "claude-ai",
    clientVersion: "0.1.0",
    firstSeenAt: "2026-08-31T11:00:00.000Z",
    lastSeenAt: "2026-08-31T11:55:00.000Z",
  },
};

function sheet(opts?: {
  connection?: ClaudeConnectionState;
  hasParcel?: boolean;
  subjectLabel?: string | null;
  onRecheck?: () => void;
}): string {
  return renderToStaticMarkup(
    <ClaudeSyncBody
      connection={opts?.connection ?? { kind: "not-connected" }}
      hasParcel={opts?.hasParcel ?? true}
      subjectLabel={opts?.subjectLabel ?? "1200 Chestnut St, Bastrop"}
      onSync={noop}
      onSyncDesktop={noop}
      syncPhase={{ kind: "idle" }}
      onRecheck={opts?.onRecheck}
      now={Date.parse("2026-08-31T12:00:00.000Z")}
    />,
  );
}

describe("the vendor cut (operator ruling 2026-08-31)", () => {
  it("advertises Claude and nothing else", () => {
    expect(CLAUDE_SYNC_VENDORS.map((r) => r.id)).toEqual(["claude"]);
    expect(CLAUDE_SYNC_VENDORS[0]?.status).toBe("connect");
  });

  it("renders no ChatGPT, Cursor or Copilot row in either state", () => {
    for (const html of [
      sheet({ connection: { kind: "not-connected" } }),
      sheet({ connection: CONNECTED }),
    ]) {
      const text = visibleText(html);
      expect(text).not.toMatch(/ChatGPT/i);
      expect(text).not.toMatch(/Copilot/i);
      expect(text).not.toMatch(/Cursor/i);
      expect(html).not.toContain("Coming soon");
      expect(html).not.toContain("Unavailable");
    }
  });
});

describe("state A — not connected", () => {
  it("shows the setup steps and the address, and NO sync control", () => {
    const html = sheet({ connection: { kind: "not-connected" } });
    expect(html).toContain('data-testid="claude-sync-setup"');
    expect(html).toContain('data-testid="claude-sync-steps"');
    expect(html).toContain('data-testid="claude-sync-copy-address"');
    expect(html).toContain(SMART_SITE_CONNECT_URL);
    expect(html).not.toContain('data-testid="claude-sync-push"');
    expect(html).not.toContain('data-testid="claude-sync-connected"');
  });

  it("shows setup for EVERY unknown, never a Sync button", () => {
    // The fail-closed direction. A read that 404s, 500s or times out resolves
    // to `unknown`, and `unknown` must never paint a control that does nothing.
    const unknown = { kind: "unknown", reason: "could not check" } as const;
    for (const connection of [unknown, { kind: "loading" } as const]) {
      expect(sheet({ connection })).not.toContain(
        'data-testid="claude-sync-push"',
      );
    }
    expect(sheet({ connection: unknown })).toContain(
      'data-testid="claude-sync-setup"',
    );
    expect(sheet({ connection: { kind: "loading" } })).toContain(
      'data-testid="claude-sync-loading"',
    );
  });

  it("SAYS the check failed instead of silently implying not-connected", () => {
    // The whole reason the dead-proxy bug survived a deploy: a read that
    // failed and a read that returned nothing painted the identical panel.
    // A failed read must be visible as a failure.
    const html = sheet({
      connection: {
        kind: "unknown",
        reason: "Smart Site could not check this account.",
      },
    });
    expect(html).toContain('data-testid="claude-sync-check-failed"');
    expect(html).toContain("Smart Site could not check this account.");

    // And an honest empty answer must NOT show that notice.
    const clean = sheet({ connection: { kind: "not-connected" } });
    expect(clean).not.toContain('data-testid="claude-sync-check-failed"');
  });

  it("never tells a signed-in user to sign in when the fault is ours", () => {
    // 403 from our own deep proxy is a misconfiguration, not a session
    // problem. Saying "sign in" there is the specific lie that hid this.
    expect(connectionFailureLine({ kind: "blocked" })).not.toMatch(/sign in/i);
    expect(connectionFailureLine({ kind: "blocked" })).toMatch(/our side/i);
    expect(connectionFailureLine({ kind: "sign-in" })).toMatch(/sign in/i);
  });

  it("offers NO way back when setup is the only state — there is nothing to go back to", () => {
    // The back control is bound to `forceSetup`, not rendered unconditionally.
    // A "Back to sync" button on a genuinely unconnected account would point
    // at a panel that cannot render.
    const html = sheet({ connection: { kind: "not-connected" } });
    expect(html).not.toContain('data-testid="claude-sync-setup-back"');
  });

  it("offers a MANUAL re-check, so the flip never depends only on a focus event", () => {
    // The operator connected Claude, came back, and the card still showed
    // setup. Focus/visibility now re-read, but neither fires in every window
    // arrangement, so someone who has just connected must be able to say so.
    const html = sheet({
      connection: { kind: "not-connected" },
      onRecheck: () => {},
    });
    expect(html).toContain('data-testid="claude-sync-recheck"');
    expect(html).toContain("Already connected? Check again");
  });

  it("carries three numbered steps, not a run-on paragraph", () => {
    const html = sheet({ connection: { kind: "not-connected" } });
    expect(html.match(/<li /g)?.length).toBe(3);
  });
});

describe("state B — connected", () => {
  it("leads with Sync and drops the setup steps", () => {
    const html = sheet({ connection: CONNECTED });
    expect(html).toContain('data-testid="claude-sync-connected"');
    expect(html).toContain('data-testid="claude-sync-push"');
    expect(html).toContain("Sync to Claude");
    expect(html).not.toContain('data-testid="claude-sync-steps"');
    expect(html).not.toContain('data-testid="claude-sync-copy-address"');
  });

  it("names the client and when it was last seen", () => {
    const html = sheet({ connection: CONNECTED });
    expect(html).toContain("claude-ai");
    expect(html).toContain("last seen 5 minutes ago");
  });

  it("says LAST SEEN, never last used — a handshake is not a tool call", () => {
    expect(sheet({ connection: CONNECTED })).not.toMatch(/last used/i);
  });

  it("shows the property it would push", () => {
    const html = sheet({ connection: CONNECTED });
    expect(html).toContain("1200 Chestnut St, Bastrop");
  });

  it("asks for a property before offering to push one", () => {
    const html = sheet({ connection: CONNECTED, hasParcel: false });
    expect(html).toContain('data-testid="claude-sync-need-parcel"');
    expect(html).not.toContain('data-testid="claude-sync-push"');
  });
});

describe("the share link is GONE from this card", () => {
  // Operator ruling 2026-08-31, reversing the earlier keep. Share is its own
  // rail bubble and this card is now one job: push the open property into
  // Claude. Asserted as ABSENCE so the block cannot drift back in, and across
  // BOTH states so neither panel can quietly carry it.
  it("renders no share control in either state", () => {
    for (const connection of [
      { kind: "not-connected" } as ClaudeConnectionState,
      CONNECTED,
    ]) {
      const html = sheet({ connection });
      expect(html).not.toContain('data-testid="claude-sync-share"');
      expect(html).not.toContain('data-testid="claude-sync-create-share"');
      expect(html).not.toContain('data-testid="claude-sync-copy-share"');
      expect(html).not.toMatch(/share link/i);
      expect(html).not.toMatch(/hand it to someone else/i);
    }
  });

  it("leaves Sync as the only primary action when connected", () => {
    const html = sheet({ connection: CONNECTED });
    expect(html).toContain('data-testid="claude-sync-push"');
    expect(html).not.toContain('data-testid="claude-sync-create-share"');
  });
});

describe("customer-facing strings only", () => {
  it("names no internal system in either state", () => {
    for (const connection of [
      { kind: "not-connected" } as ClaudeConnectionState,
      CONNECTED,
    ]) {
      const html = sheet({ connection });
      for (const term of FORBIDDEN) {
        expect(html, `${term} leaked into the sheet`).not.toContain(term);
      }
    }
  });

  it("publishes the customer hostname, never a Cloud Run hash", () => {
    expect(SMART_SITE_CONNECT_HOST).toBe("mcp.smartsite.cloud");
    expect(SMART_SITE_CONNECT_URL).toBe("https://mcp.smartsite.cloud/mcp");
    expect(SMART_SITE_CONNECT_URL.endsWith("/mcp")).toBe(true);
    expect(SMART_SITE_CONNECT_URL).not.toMatch(/\.run\.app|-uc\.a\./);
  });

  it("keeps the connectors deep link on the slug read off the address bar", () => {
    // Two earlier guesses landed on the wrong pane. This value was READ, not
    // inferred, and this test exists so a fourth guess cannot land quietly.
    expect(CLAUDE_CUSTOMIZE_CONNECTORS_URL).toBe(
      "https://claude.ai/new#settings/customize-connectors",
    );
  });
});

describe("Claude Sync in the dock", () => {
  it("is live, not property-scoped, and sits LAST, after Compare", () => {
    const def = WORKBENCH_TOOLS.find((t) => t.id === "use-in-ai");
    expect(def?.status).toBe("live");
    expect(def?.propertyScoped).toBe(false);
    expect(def?.label).toBe("Claude Sync");
    // Widens like every other dock. It carried expandable:false from when the
    // card was a vendor list of one-line rows.
    expect(def?.expandable).not.toBe(false);
    const ids = WORKBENCH_TOOLS.map((t) => t.id);
    // LAST in the rail, below Compare, by operator ruling 2026-08-31.
    expect(ids[ids.length - 1]).toBe("use-in-ai");
    expect(ids.indexOf("use-in-ai")).toBeGreaterThan(ids.indexOf("compare"));
  });

  it("keeps the `use-in-ai` id so saved dock layouts survive the rename", () => {
    // The label changed; the id is a persistence key and did not. Renaming it
    // would orphan every layout already in a user's localStorage.
    expect(WORKBENCH_TOOLS.some((t) => t.id === "use-in-ai")).toBe(true);
    expect(WORKBENCH_TOOLS.some((t) => t.id === "claude-sync")).toBe(false);
  });

  it("paints the rail glyph in the Claude token, not currentColor", () => {
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="use-in-ai"
        onOpenToolChange={noop}
        activeParcelNodeId={null}
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html).toContain('data-testid="claude-mark"');
    expect(html).toContain("var(--ss-claude)");
  });

  it("opens in the one shared dock with no active property", () => {
    const html = renderToStaticMarkup(
      <Workbench
        tools={WORKBENCH_TOOLS}
        openToolId="use-in-ai"
        onOpenToolChange={noop}
        activeParcelNodeId={null}
        host={host}
        store={createWorkbenchToolStateStore({ storage: null })}
      />,
    );
    expect(html).toContain('data-testid="workbench-dock"');
    expect(html).toContain('data-tool="use-in-ai"');
    expect(html).toContain('data-testid="claude-sync-tool"');
    expect(html).toContain("Claude Sync");
    expect(html).toContain(CLAUDE_SYNC_VALUE_LINE);
    expect(html).not.toContain('data-testid="dock-coming"');
  });
});
