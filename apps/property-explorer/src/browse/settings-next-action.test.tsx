// P-98 — the Settings mount of the next-action rail.
//
// Settings is the PROTOTYPE mount, not the destination, so these pin the
// mount's contract rather than the ladder's logic (which is pure and lives in
// lib/nextAction.test.ts) or the card's rendering (components/
// NextActionCard.test.tsx).
//
// Static markup only, no jsdom, in this repo's house style. Effects do not run
// under renderToStaticMarkup, so what these render is the FIRST PAINT: every
// read still unread, and therefore an empty rail. That is the honest first
// frame and it is worth pinning — a rail that guessed an action before its
// reads landed would be proposing a step off a default.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsModal } from "./SettingsModal";

const noop = () => {};

const render = (section?: "account" | "plan" | "connections" | "team") =>
  renderToStaticMarkup(
    <SettingsModal onClose={noop} onUpgrade={noop} initialSection={section} />,
  );

const codeOf = (file: string) =>
  readFileSync(resolve(__dirname, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the rail is a next-action rail, not a designer's note", () => {
  it("the per-tab design prose is gone from every tab", () => {
    // Four sentences explaining the panel's own discipline used to occupy a
    // quarter of the modal on every tab.
    const gone = [
      "Identity and session only",
      "Pricing is never restated here",
      "A connection reads this account",
      "Settings never prices seats",
    ];
    for (const section of ["account", "plan", "connections", "team"] as const) {
      const html = render(section);
      for (const sentence of gone) {
        expect(html).not.toContain(sentence);
      }
    }
    expect(codeOf("SettingsModal.tsx")).not.toContain("SIDE_NOTE");
  });

  it("the rail exists and is EMPTY before any read has landed", () => {
    // No action is proposed off a default. Under static markup no effect has
    // run, so claude / unlocks / entitlement are all unread and the ladder
    // returns null — which is the state this whole card is built to reach.
    for (const section of ["account", "plan", "connections", "team"] as const) {
      const html = render(section);
      expect(html).toContain('data-testid="settings-next-action-rail"');
      expect(html).not.toContain('data-testid="next-action"');
      expect(html).not.toContain('data-testid="next-action-cta"');
    }
  });
});

describe("the honesty note did not simply vanish", () => {
  it("one line of it survives, at the BOTTOM of the rail, on every tab", () => {
    // The panel is still full of "Not read" and "Not built" rows and fixing
    // them was out of scope. Deleting the sentence that makes them read as
    // honest rather than broken, while the rows are still there, would make
    // the product look worse rather than cleaner.
    for (const section of ["account", "plan", "connections", "team"] as const) {
      const html = render(section);
      expect(html).toContain("names where it was read from");
      expect(html).toContain("Not read");
      expect(html).toContain("control that does nothing");
      // BELOW the action slot: the rail markup opens, then the note.
      const rail = html.indexOf('data-testid="settings-next-action-rail"');
      expect(rail).toBeGreaterThan(-1);
      expect(html.indexOf("names where it was read from")).toBeGreaterThan(rail);
    }
  });

  it("it is ONE line now, not the three-sentence footer", () => {
    const src = codeOf("SettingsModal.tsx");
    expect(src).not.toContain("A field with no");
    expect(src).toContain("a field with no");
  });
});

describe("the mount does not offer what it cannot run (FILE-SHAPED)", () => {
  // There is no DOM harness here and the tier state that would produce these
  // two actions is unreadable in this client anyway, so this reads the write
  // path. It is the check that stops a dead control shipping the day the
  // server half lands.
  const src = codeOf("SettingsModal.tsx");

  it("SETTINGS_RUNNABLE excludes team_invite and unlock_expiring, and includes the three it can run", () => {
    const set = src.match(/SETTINGS_RUNNABLE[\s\S]*?\]\);/)?.[0] ?? "";
    expect(set).toContain('"connect_claude"');
    expect(set).toContain('"property_unlock"');
    expect(set).toContain('"annual_upgrade"');
    // No invite write path exists anywhere in this client, and extending an
    // unlock through onUpgrade would open a checkout scoped to the MAP's
    // active parcel rather than the lapsing one.
    expect(set).not.toContain('"team_invite"');
    expect(set).not.toContain('"unlock_expiring"');
  });

  it("the render is gated on that set, so an unrunnable action renders nothing", () => {
    expect(src).toMatch(/SETTINGS_RUNNABLE\.has\(proposed\.id\)\s*\?\s*proposed\s*:\s*null/);
  });

  it("the surface name travels with every event", () => {
    expect(src).toContain('const NEXT_ACTION_SURFACE = "settings"');
    expect(src).toMatch(/surface=\{NEXT_ACTION_SURFACE\}/);
  });
});

describe("the mount reads, it does not guess", () => {
  const src = codeOf("SettingsModal.tsx");

  it("reuses fetchAiConnections — there is no second connection read", () => {
    expect(src).toContain("fetchAiConnections");
    expect(src).not.toContain("ai-connections");
  });

  it("only a CLEAN connection read becomes a fact", () => {
    // sign-in / blocked / not-built / error all stay unread here, which is the
    // opposite of what the Claude Sync CARD does with the same outcomes. The
    // card discloses; the rail proposes. Deliberate, and reasoned in
    // lib/nextAction.ts.
    expect(src).toMatch(
      /o\.kind === "ready"\s*\?\s*\{ kind: "read", connected: o\.claude !== null \}\s*:\s*\{ kind: "unread" \}/,
    );
  });

  it("keeps not-built, blocked and error apart from an empty unlock read", () => {
    // The route fails LOUD, so an empty list genuinely means nothing is
    // unlocked. That is only safe if the three failure kinds are carried
    // through as themselves rather than flattened into it.
    expect(src).toContain('{ kind: "not-built" }');
    expect(src).toContain('{ kind: "blocked" }');
    expect(src).toContain('{ kind: "error" }');
  });

  it("passes the server's asOf through and supplies NO clock of its own", () => {
    // The expiries and the clock they were computed against arrive in one
    // response. A browser clock here would be a second derivation of "now",
    // free to disagree with the server's, on the rung that tells someone how
    // long they have left.
    expect(src).toMatch(/kind: "read", asOf: o\.asOf, unlocks: o\.unlocks/);
    expect(src).not.toMatch(/now:\s*new Date\(\)/);
    expect(src).not.toContain("Date.now()");
  });

  it("never invents a billing interval", () => {
    // THIS TEST CHANGED WITH THE BEHAVIOUR, AND THE HALF THAT MATTERS DID NOT.
    //
    // It used to assert the literal `billingInterval: null` in this file,
    // because no client read an interval at all and the mount hard-coded the
    // absence. P-98b's account-level read removed that starvation, so the
    // literal is gone — pinning it would now be pinning the bug.
    //
    // The anti-invention half is preserved VERBATIM below: this file must
    // never contain a literal "monthly". What replaces the positive half is
    // stronger than the literal was, because it names the SOURCE: the mount
    // must derive its ladder input from the account read through the pure
    // exported bridge, which is where the null-is-not-monthly rule is tested
    // in both directions (lib/account-entitlement-client.test.ts).
    expect(src).not.toMatch(/billingInterval:\s*"monthly"/);
    expect(src).toContain("ladderEntitlementFromAccount(account)");
    // And the mount must not build an EntitlementRead by hand alongside it,
    // which is how a second, unreviewed path to the same rung would appear.
    expect(src).not.toMatch(/kind:\s*"read",\s*tier:/);
  });

  it("the Plan rows read from the ACCOUNT entitlement, not the per-property hook", () => {
    // Settings is account-scoped. Passing null into the PER-PROPERTY hook is
    // what shipped "Paid" to every anonymous account (commit b4add1b): the
    // hook returns a LOADING constant for a null id and the constant fell
    // through a ternary to its most generous branch. The per-property hook is
    // not weakened to fix that — it is simply not the reader this surface uses.
    expect(src).toContain("useAccountEntitlement()");
    expect(src).not.toContain("usePropertyEntitlement");
  });

  it("treats an unread session as not signed in", () => {
    expect(src).toContain("authenticated: authed === true");
  });
});
