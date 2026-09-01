// P-98 — the next-action card.
//
// NO JSDOM IN THIS REPO, and that bounds what these can prove. Static markup
// pins cover what RENDERS. They cannot cover the `shown` effect or the click,
// because effects do not run under renderToStaticMarkup and there is no DOM
// to click in. The two instrumentation pins at the bottom are therefore
// FILE-SHAPED — they read the write path rather than run it — and they are
// labelled as such rather than dressed up as behavioural. The decision logic
// they guard is all in lib/nextAction.ts, which is pure and fully executed by
// its own suite.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextActionCard } from "./NextActionCard";
import type { NextAction } from "../lib/nextAction";

const ACTION: NextAction = {
  id: "connect_claude",
  context: "account",
  headline: "Ask Claude about the properties on this account",
  detail: "Connected, Claude reads your saved properties.",
  ctaLabel: "Connect Claude",
};

const render = (action: NextAction | null, note?: string) =>
  renderToStaticMarkup(
    <NextActionCard
      action={action}
      surface="settings"
      onAct={() => {}}
      note={note}
      emit={async () => ({ kind: "recorded" })}
    />,
  );

const codeOf = (file: string) =>
  readFileSync(resolve(__dirname, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("it renders NOTHING when there is nothing", () => {
  it("a null action produces empty markup — no placeholder, no heading", () => {
    // The empty rail is the state that makes the non-empty one trustworthy.
    // A "you're all set" card or a skeleton would be the ad slot wearing a
    // different hat: the slot would always be occupied.
    expect(render(null)).toBe("");
  });

  it("VIOLATION DIRECTION — the same component with an action is not empty", () => {
    expect(render(ACTION)).not.toBe("");
    expect(render(ACTION)).toContain('data-testid="next-action"');
  });
});

describe("it renders exactly one action", () => {
  const html = render(ACTION);

  it("carries the headline, the detail and the control label", () => {
    expect(html).toContain(ACTION.headline);
    expect(html).toContain(ACTION.detail);
    expect(html).toContain(ACTION.ctaLabel);
  });

  it("stamps the action id for the funnel, not the headline", () => {
    expect(html).toContain('data-action-id="connect_claude"');
  });

  it("renders ONE control, and it is the kit Button", () => {
    // The kit Button emits data-variant; a native <button> in chrome is a CI
    // failure under the chrome-kit gate. One occurrence, not a list of steps.
    expect((html.match(/data-testid="next-action-cta"/g) ?? []).length).toBe(1);
    expect(html).toContain('data-variant="primary"');
    expect((html.match(/data-testid="next-action"/g) ?? []).length).toBe(1);
  });

  it("omits the detail line when the action has none", () => {
    const bare = render({ ...ACTION, detail: null });
    expect(bare).toContain(ACTION.headline);
    expect(bare).not.toContain("Connected, Claude reads");
  });

  it("shows the host's note only when the host supplies one", () => {
    expect(html).not.toContain('data-testid="next-action-note"');
    expect(render(ACTION, "Address copied.")).toContain(
      'data-testid="next-action-note"',
    );
  });

  it("prices nothing — the number lives in the checkout", () => {
    expect(html).not.toMatch(/[$£€]/);
  });
});

describe("instrumentation wiring (FILE-SHAPED — no DOM harness exists here)", () => {
  const src = codeOf("NextActionCard.tsx");

  it("emits shown from an effect keyed on the action id, and acted from the click", () => {
    // Read the write path. This cannot prove the effect FIRES; it proves the
    // two call sites exist, carry the right event types, and that `shown` is
    // keyed on the id so a re-render does not double-count.
    expect(src).toMatch(/eventType:\s*"shown"[\s\S]{0,80}\}\);\s*\},\s*\[actionId,/);
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*\{[\s\S]{0,200}eventType:\s*"acted"/);
  });

  it("never awaits or branches on the event before running the action", () => {
    // A failed event must not block the action. `void` at both call sites and
    // no await anywhere in the component is what makes that true.
    expect(src).not.toMatch(/await\s+emit/);
    expect(src).toMatch(/void emit\(\{ eventType: "shown"/);
    expect(src).toMatch(/void emit\(\{ eventType: "acted"/);
  });

  it("knows nothing about Settings", () => {
    // Settings is the prototype mount, not the destination. If this file ever
    // names it, the component argument was not honoured.
    expect(src).not.toMatch(/Settings|onUpgrade|SettingsSection/);
  });
});
