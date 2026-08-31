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
  shareUrl?: string | null;
  subjectLabel?: string | null;
}): string {
  return renderToStaticMarkup(
    <ClaudeSyncBody
      connection={opts?.connection ?? { kind: "not-connected" }}
      hasParcel={opts?.hasParcel ?? true}
      subjectLabel={opts?.subjectLabel ?? "1200 Chestnut St, Bastrop"}
      shareUrl={opts?.shareUrl ?? null}
      sharePhase={{ kind: "idle" }}
      onCreateShare={noop}
      onCopyShare={noop}
      onSync={noop}
      onSyncDesktop={noop}
      syncPhase={{ kind: "idle" }}
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
    for (const kind of ["unknown", "loading"] as const) {
      const html = sheet({ connection: { kind } });
      expect(html).not.toContain('data-testid="claude-sync-push"');
    }
    expect(sheet({ connection: { kind: "unknown" } })).toContain(
      'data-testid="claude-sync-setup"',
    );
    expect(sheet({ connection: { kind: "loading" } })).toContain(
      'data-testid="claude-sync-loading"',
    );
  });

  it("offers NO way back when setup is the only state — there is nothing to go back to", () => {
    // The back control is bound to `forceSetup`, not rendered unconditionally.
    // A "Back to sync" button on a genuinely unconnected account would point
    // at a panel that cannot render.
    const html = sheet({ connection: { kind: "not-connected" } });
    expect(html).not.toContain('data-testid="claude-sync-setup-back"');
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

describe("the share link stays, as a different job", () => {
  it("renders below the Claude flow in both states", () => {
    for (const connection of [
      { kind: "not-connected" } as ClaudeConnectionState,
      CONNECTED,
    ]) {
      const html = sheet({ connection });
      expect(html).toContain('data-testid="claude-sync-share"');
      expect(html).toContain('data-testid="claude-sync-create-share"');
    }
  });

  it("shows the minted link when there is one", () => {
    const html = sheet({ shareUrl: "https://smartsite.cloud/s/abc123" });
    expect(html).toContain('data-testid="claude-sync-share-url"');
    expect(html).toContain("https://smartsite.cloud/s/abc123");
    expect(html).not.toContain('data-testid="claude-sync-create-share"');
  });

  it("needs a property before it can mint", () => {
    const html = sheet({ hasParcel: false });
    expect(html).toContain('data-testid="claude-sync-share-need-parcel"');
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
  it("is live, not property-scoped, and sits before Compare", () => {
    const def = WORKBENCH_TOOLS.find((t) => t.id === "use-in-ai");
    expect(def?.status).toBe("live");
    expect(def?.propertyScoped).toBe(false);
    expect(def?.label).toBe("Claude Sync");
    const ids = WORKBENCH_TOOLS.map((t) => t.id);
    expect(ids.indexOf("use-in-ai")).toBe(ids.indexOf("share") + 1);
    expect(ids[ids.length - 1]).toBe("compare");
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
