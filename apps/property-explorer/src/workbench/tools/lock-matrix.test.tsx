// R1 PAYWALL — the PER-BUBBLE LOCK MATRIX (static-markup renders through the
// real Workbench + registry, entitlement primed via the module cache — the
// repo's component-test idiom: effects don't run, primed state is what
// renders).
//
// The paywall LINE under test:
//   free  = inspect card + map/layers (not in the dock — untouched here)
//   paid  = brief, chat (past the free messages), reports (site-plan), share
//   TERRAIN = PRO-ONLY (its lock offers ONLY the Pro choice)
//   chat  = 3 signed-in-free messages, subtle meter, wall at exhaustion,
//           "Save chat" (AI summary) follows entitlement
// States: anon / free signed-in (locked) / property-unlocked / pro / unknown.

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import {
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
  type PropertyEntitlementState,
} from "../../lib/entitlementClient";
import type { ChatToolStoredState } from "./ChatTool";

const PARCEL = "48021:123";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  getActivePropertyAddress: () => "123 Main St, Bastrop, TX",
  getActiveParcelFacts: () => ({ address: null, countyName: null }),
};
const noop = () => {};

function ent(
  overrides: Partial<PropertyEntitlementState>,
): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: true,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    ...overrides,
  };
}

const ANON = ent({ authenticated: false });
const FREE = ent({});
const FREE_EXHAUSTED = ent({ freeMessagesUsed: 3 });
const PROPERTY_UNLOCKED = ent({ propertyUnlocked: true });
const PRO = ent({ tier: "paid" });

function renderTool(
  toolId: string,
  opts: {
    store?: ReturnType<typeof createWorkbenchToolStateStore>;
  } = {},
): string {
  return renderToStaticMarkup(
    <Workbench
      tools={WORKBENCH_TOOLS}
      openToolId={toolId}
      onOpenToolChange={noop}
      activeParcelNodeId={PARCEL}
      host={host}
      store={opts.store ?? createWorkbenchToolStateStore({ storage: null })}
    />,
  );
}

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

describe("BRIEF bubble", () => {
  it("anon → sign-in-first (existing idiom), no unlock choices yet", () => {
    primePropertyEntitlement(PARCEL, ANON);
    const html = renderTool("brief");
    expect(html).toContain('data-testid="brief-locked-sign-in"');
    expect(html).not.toContain('data-testid="unlock-property-choice"');
  });

  it("free signed-in → LOCKED state with the unified two-choice flow (never broken/empty)", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("brief");
    expect(html).toContain('data-testid="brief-locked"');
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
  });

  it("property-unlocked → runs as today (no lock)", () => {
    primePropertyEntitlement(PARCEL, PROPERTY_UNLOCKED);
    const html = renderTool("brief");
    expect(html).not.toContain('data-testid="brief-locked"');
  });

  it("pro → runs as today", () => {
    primePropertyEntitlement(PARCEL, PRO);
    expect(renderTool("brief")).not.toContain('data-testid="brief-locked"');
  });

  it("entitlement unknown (no read yet) → runs as today — a missing read never hard-blocks", () => {
    expect(renderTool("brief")).not.toContain('data-testid="brief-locked"');
  });
});

describe("REPORTS bubble (site-plan per-property; TERRAIN Pro-only)", () => {
  it("anon → sign-in-first", () => {
    primePropertyEntitlement(PARCEL, ANON);
    expect(renderTool("reports")).toContain(
      'data-testid="reports-locked-sign-in"',
    );
  });

  it("free signed-in → LOCKED with both choices", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("reports");
    expect(html).toContain('data-testid="reports-locked"');
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
    // The whole tool is locked — no export sections behind the wall.
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
  });

  it("property-unlocked → site-plan runs; TERRAIN shows its PRO-ONLY lock (only the Pro choice)", () => {
    primePropertyEntitlement(PARCEL, PROPERTY_UNLOCKED);
    const html = renderTool("reports");
    expect(html).not.toContain('data-testid="reports-locked"');
    // Site-plan export section is live.
    expect(html).toContain("site-plan");
    // Terrain slot is the Pro-only lock: NO $15 choice inside it, and the
    // copy says terrain is not part of the single-property unlock.
    expect(html).toContain('data-testid="terrain-pro-lock"');
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
    expect(html).toContain("not part of the single-property unlock");
  });

  it("pro → the real terrain export section, no locks", () => {
    primePropertyEntitlement(PARCEL, PRO);
    const html = renderTool("reports");
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
  });

  it("entitlement unknown → sections render as today (reactive 402 belt)", () => {
    const html = renderTool("reports");
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
  });
});

describe("SHARE bubble (mint requires property entitlement)", () => {
  it("anon → sign-in-first", () => {
    primePropertyEntitlement(PARCEL, ANON);
    expect(renderTool("share")).toContain('data-testid="share-locked-sign-in"');
  });

  it("free signed-in → LOCKED with both choices (mint gate folded into per-property semantics)", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("share");
    expect(html).toContain('data-testid="share-locked"');
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).not.toContain('data-testid="share-create"');
  });

  it("property-unlocked → the create-link flow renders", () => {
    primePropertyEntitlement(PARCEL, PROPERTY_UNLOCKED);
    const html = renderTool("share");
    expect(html).not.toContain('data-testid="share-locked"');
    expect(html).toContain('data-testid="share-create"');
  });

  it("pro → the create-link flow renders", () => {
    primePropertyEntitlement(PARCEL, PRO);
    expect(renderTool("share")).toContain('data-testid="share-create"');
  });
});

describe("CHAT bubble (3 signed-in-free messages → wall)", () => {
  function storeWithThread(): ReturnType<typeof createWorkbenchToolStateStore> {
    const store = createWorkbenchToolStateStore({ storage: null });
    const thread: ChatToolStoredState = {
      turns: [
        { role: "user", content: "Can I add an ADU?" },
        { role: "assistant", content: "Likely yes." },
      ],
    };
    store.set(PARCEL, "chat", thread);
    return store;
  }

  it("anon → sign-in-first line (free messages need a FREE account); composer stays", () => {
    primePropertyEntitlement(PARCEL, ANON);
    const html = renderTool("chat");
    expect(html).toContain('data-testid="chat-sign-in-first"');
    expect(html).toContain('data-testid="chat-input"');
    expect(html).not.toContain('data-testid="chat-wall"');
  });

  it("free signed-in with messages left → subtle meter, composer live, NO wall", () => {
    primePropertyEntitlement(PARCEL, ent({ freeMessagesUsed: 1 }));
    const html = renderTool("chat");
    expect(html).toContain('data-testid="chat-free-remaining"');
    expect(html).toContain("2 free messages left on this property");
    expect(html).toContain('data-testid="chat-input"');
    expect(html).not.toContain('data-testid="chat-wall"');
  });

  it("meter uses the singular at 1 left", () => {
    primePropertyEntitlement(PARCEL, ent({ freeMessagesUsed: 2 }));
    expect(renderTool("chat")).toContain(
      "1 free message left on this property",
    );
  });

  it("free messages EXHAUSTED → the wall (unified flow) replaces the composer; thread stays readable", () => {
    primePropertyEntitlement(PARCEL, FREE_EXHAUSTED);
    const html = renderTool("chat", { store: storeWithThread() });
    expect(html).toContain('data-testid="chat-wall"');
    expect(html).toContain('data-testid="unlock-property-choice"');
    expect(html).toContain('data-testid="unlock-pro-choice"');
    expect(html).not.toContain('data-testid="chat-input"');
    // The thread above the wall is still there.
    expect(html).toContain("Can I add an ADU?");
  });

  it("free signed-in: the Save-chat (AI summary) action renders LOCKED", () => {
    primePropertyEntitlement(PARCEL, ent({ freeMessagesUsed: 1 }));
    const html = renderTool("chat", { store: storeWithThread() });
    expect(html).toContain('data-testid="chat-save-to-property"');
    expect(html).toContain('data-locked="true"');
    expect(html).toContain("Save to property (unlock)");
  });

  it("property-unlocked → unlimited: no meter, no wall, Save-chat unlocked", () => {
    primePropertyEntitlement(PARCEL, PROPERTY_UNLOCKED);
    const html = renderTool("chat", { store: storeWithThread() });
    expect(html).not.toContain('data-testid="chat-free-remaining"');
    expect(html).not.toContain('data-testid="chat-wall"');
    expect(html).toContain('data-locked="false"');
    expect(html).toContain('data-testid="chat-input"');
  });

  it("pro → unlimited, same as unlocked", () => {
    primePropertyEntitlement(PARCEL, PRO);
    const html = renderTool("chat");
    expect(html).not.toContain('data-testid="chat-free-remaining"');
    expect(html).not.toContain('data-testid="chat-wall"');
  });

  it("entitlement unknown → chat renders as today (reactive belt)", () => {
    const html = renderTool("chat");
    expect(html).toContain('data-testid="chat-input"');
    expect(html).not.toContain('data-testid="chat-wall"');
    expect(html).not.toContain('data-testid="chat-free-remaining"');
  });
});

describe("FREE tools stay free", () => {
  it("My Properties and Compare never render a lock", () => {
    primePropertyEntitlement(PARCEL, FREE);
    expect(renderTool("properties")).not.toContain("unlock-pro-choice");
    expect(renderTool("compare")).not.toContain("unlock-pro-choice");
  });
});
