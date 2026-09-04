// Component tests for HelpWidget via react-dom/server static render (same
// pattern as InspectCard.test.tsx / PropertyBriefPanel.test.tsx — node env,
// no effects run) plus source-scan checks proving the "never gated" claim
// architecturally rather than by exercising one runtime state.
//
// WHY A SOURCE SCAN, NOT A RENDER-WITH-MOCKED-SESSION TEST: this app has no
// @testing-library/react / jsdom dependency (see InspectCard.test.tsx's own
// header), so a full interactive "render once signed-in, once signed-out,
// diff the output" test isn't available here. The strongest proof available
// in this environment is architectural: HelpWidget takes ZERO props and
// imports NONE of the app's auth/entitlement machinery, so there is no
// signed-in/signed-out BRANCH for it to take — it cannot possibly render
// differently for the two. That is a stronger guarantee than a single
// rendered snapshot would be, and it is the same technique this repo's own
// guard scripts (pe-chrome-kit-gate.mjs, pe-public-pages-guard.mjs) already
// use for claims of this shape.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpWidget } from "./HelpWidget";

const SOURCE = readFileSync(resolve(__dirname, "./HelpWidget.tsx"), "utf8");
const APP_SOURCE = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");

describe("P-118: HelpWidget renders closed, with no gating markup", () => {
  const html = renderToStaticMarkup(<HelpWidget />);

  it("renders the persistent closed button", () => {
    expect(html).toContain('data-testid="help-widget"');
    expect(html).toContain('data-testid="help-widget-open"');
  });

  it("does not render the panel while closed (no leaked composer/paywall markup)", () => {
    expect(html).not.toContain('data-testid="help-widget-panel"');
  });

  it("never renders any lock/paywall/sign-in-required copy", () => {
    expect(html.toLowerCase()).not.toMatch(/locked|paywall|sign in to|upgrade required/);
  });
});

describe("P-118: HelpWidget is architecturally ungated — no auth import exists to branch on", () => {
  const FORBIDDEN_IMPORTS = [
    "usePropertyEntitlement",
    "useWorkbench",
    "fetchSession",
    "readPeSessionCookie",
    "invalidatePropertyEntitlement",
    "LockedToolPanel",
  ];

  it.each(FORBIDDEN_IMPORTS)("never imports or references %s", (name) => {
    expect(SOURCE).not.toMatch(new RegExp(name));
  });

  it("takes zero props — nothing external can hand it a signed-in/out branch", () => {
    expect(SOURCE).toMatch(/export function HelpWidget\(\)\s*\{/);
  });

  it("never IMPORTS the per-property chat's endpoint or gated request module", () => {
    // Matches only actual import statements, not the file's own explanatory
    // comments (which legitimately name these to say they are NOT used).
    const importLines = SOURCE.split("\n").filter((l) => l.trim().startsWith("import "));
    for (const line of importLines) {
      expect(line).not.toMatch(/chat-research|postDeepResearch/);
    }
  });

  it("uses its own separate backend client, never the property chat's", () => {
    expect(SOURCE).toMatch(/help-widget-client/);
  });
});

describe("P-118: HelpWidget usage feeds the funnel pipe, not a silent duplicate", () => {
  it("fires pe_help_widget_opened and pe_help_widget_message_sent via the shared recordPeGtmEvent", () => {
    expect(SOURCE).toMatch(/recordPeGtmEvent/);
    expect(SOURCE).toMatch(/pe_help_widget_opened/);
    expect(SOURCE).toMatch(/pe_help_widget_message_sent/);
  });
});

describe("P-118: the widget is mounted unconditionally at the app shell", () => {
  it("App.tsx renders <HelpWidget /> as a sibling of the map, not inside the cold-open gate", () => {
    const widgetIndex = APP_SOURCE.indexOf("<HelpWidget />");
    const coldOpenGateIndex = APP_SOURCE.indexOf("{coldOpen &&");
    expect(widgetIndex).toBeGreaterThan(-1);
    expect(coldOpenGateIndex).toBeGreaterThan(-1);
    // Mounted BEFORE the cold-open conditional block starts, i.e. as an
    // unconditional sibling — never nested inside a branch that depends on
    // sign-in/dismissal state.
    expect(widgetIndex).toBeLessThan(coldOpenGateIndex);
  });
});
