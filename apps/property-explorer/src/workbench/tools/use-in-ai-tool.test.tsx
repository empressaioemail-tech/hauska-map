// P-87 items 15/16 — Use in your AI sheet. Claude and Cursor Connect live;
// ChatGPT Unavailable; Copilot Coming soon; no key / Cloud Run / product-key strings.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import {
  CLAUDE_CUSTOMIZE_CONNECTORS_URL,
  SMART_SITE_CONNECT_HOST,
  USE_IN_AI_VENDORS,
  USE_IN_YOUR_AI_VALUE_LINE,
  UseInYourAiBody,
} from "./UseInYourAiTool";

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

function sheet(opts?: {
  hasParcel?: boolean;
  shareUrl?: string | null;
}): string {
  return renderToStaticMarkup(
    <UseInYourAiBody
      hasParcel={opts?.hasParcel ?? true}
      shareUrl={opts?.shareUrl ?? null}
      sharePhase={{ kind: "idle" }}
      onCreateShare={noop}
      onCopyShare={noop}
    />,
  );
}

describe("Use in your AI vendor rows", () => {
  it("pins four vendors in Claude / ChatGPT / Cursor / Copilot order", () => {
    expect(USE_IN_AI_VENDORS.map((r) => r.id)).toEqual([
      "claude",
      "chatgpt",
      "cursor",
      "copilot",
    ]);
  });

  it("Claude and Cursor are Connect; Copilot is Coming soon; ChatGPT is Unavailable", () => {
    expect(USE_IN_AI_VENDORS.find((r) => r.id === "claude")?.status).toBe("connect");
    expect(USE_IN_AI_VENDORS.find((r) => r.id === "cursor")?.status).toBe("connect");
    expect(USE_IN_AI_VENDORS.find((r) => r.id === "copilot")?.statusLabel).toBe(
      "Coming soon",
    );
    expect(USE_IN_AI_VENDORS.find((r) => r.id === "chatgpt")?.status).toBe(
      "unavailable",
    );
    expect(USE_IN_AI_VENDORS.find((r) => r.id === "chatgpt")?.note).toMatch(
      /Business or Enterprise/,
    );
  });

  it("renders the lede, four rows, and Connect actions for Claude and Cursor", () => {
    const html = sheet();
    expect(html).toContain(USE_IN_YOUR_AI_VALUE_LINE);
    expect(html).toContain('data-testid="use-in-ai-row-claude"');
    expect(html).toContain('data-testid="use-in-ai-row-chatgpt"');
    expect(html).toContain('data-testid="use-in-ai-row-cursor"');
    expect(html).toContain('data-testid="use-in-ai-row-copilot"');
    expect(html).toContain('data-testid="use-in-ai-connect-claude"');
    expect(html).toContain('data-testid="use-in-ai-connect-cursor"');
    expect(html).toContain("Coming soon");
    expect(html).toContain("Unavailable");
    expect(html).toContain("ChatGPT needs a Business or Enterprise workspace");
    expect(html).toContain("Connect Claude or Cursor below");
  });

  it("exposes the Smart Site address hostname without forbidden substrate strings", () => {
    expect(SMART_SITE_CONNECT_HOST).toBe("mcp.smartsite.cloud");
  });

  it("uses Claude's hash-routed settings deep link, not a path that 404s to General", () => {
    // The two path forms BOTH land on the General pane. Claude's settings is a
    // modal with hash routing — `claude.ai/new#settings/general` is what the
    // product itself shows, observed directly. This pins the hash form.
    //
    // HONEST LIMIT: the `connectors` slug is inferred from that pattern and is
    // not confirmed against Claude's routing, which this test cannot reach. It
    // pins what we chose, not what an external authority verified.
    expect(CLAUDE_CUSTOMIZE_CONNECTORS_URL).toBe(
      "https://claude.ai/new#settings/connectors",
    );
    expect(CLAUDE_CUSTOMIZE_CONNECTORS_URL).toContain("#settings/");
    // The two forms known to land on the wrong pane.
    expect(CLAUDE_CUSTOMIZE_CONNECTORS_URL).not.toBe(
      "https://claude.ai/settings/customize/connectors",
    );
    expect(CLAUDE_CUSTOMIZE_CONNECTORS_URL).not.toBe(
      "https://claude.ai/settings/connectors",
    );
  });

  it("never prints a key, Cloud Run URL, or substrate brand on the sheet", () => {
    const html = sheet({
      shareUrl: "https://smartsite.cloud/s/c86a0001-0086-4086-a001-000000000001",
    });
    for (const word of FORBIDDEN) {
      expect(html).not.toContain(word);
    }
  });

  it("asks for a property when none is selected", () => {
    const html = sheet({ hasParcel: false });
    expect(html).toContain('data-testid="use-in-ai-need-parcel"');
    expect(html).not.toContain('data-testid="use-in-ai-create-share"');
  });

  it("offers the share-link mint when a property is selected and no link exists", () => {
    const html = sheet({ hasParcel: true, shareUrl: null });
    expect(html).toContain('data-testid="use-in-ai-create-share"');
    expect(html).toContain("Create a share link");
  });
});

describe("Use in your AI in the dock", () => {
  it("is live, not property-scoped, and sits before Compare", () => {
    const def = WORKBENCH_TOOLS.find((t) => t.id === "use-in-ai");
    expect(def?.status).toBe("live");
    expect(def?.propertyScoped).toBe(false);
    expect(def?.label).toBe("Use in your AI");
    const ids = WORKBENCH_TOOLS.map((t) => t.id);
    expect(ids.indexOf("use-in-ai")).toBe(ids.indexOf("share") + 1);
    expect(ids[ids.length - 1]).toBe("compare");
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
    expect(html).toContain('data-testid="use-in-ai-tool"');
    expect(html).toContain("Use in your AI");
    expect(html).not.toContain('data-testid="dock-coming"');
  });
});
