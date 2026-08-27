// R1 PAYWALL — the PER-BUBBLE LOCK MATRIX (static-markup renders through the
// real Workbench + registry, entitlement primed via the module cache — the
// repo's component-test idiom: effects don't run, primed state is what
// renders).
//
// The paywall LINE under test:
//   free  = inspect card + map/layers (not in the dock — untouched here)
//   paid  = brief, chat (past the free messages), reports (site-plan +
//           flood & drainage — FD2 folded the flood bubble in here), share
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
    subscriptionTier: null,
    devRole: false,
    entitlementSource: null,
    ...overrides,
  };
}

const ANON = ent({ authenticated: false });
const FREE = ent({});
const FREE_EXHAUSTED = ent({ freeMessagesUsed: 3 });
const PROPERTY_UNLOCKED = ent({ propertyUnlocked: true });
/** Legacy paid row — subscriptionTier null (stale cache / pre-ladder backend). */
const PRO = ent({ tier: "paid" });
const SOLO = ent({ tier: "paid", subscriptionTier: "solo" });
const STUDIO = ent({ tier: "paid", subscriptionTier: "studio" });
const TEAM = ent({ tier: "paid", subscriptionTier: "team" });
const DEV = ent({
  tier: "paid",
  devRole: true,
  entitlementSource: "dev",
});

function renderTool(
  toolId: string,
  opts: {
    store?: ReturnType<typeof createWorkbenchToolStateStore>;
    selectedDoc?: string;
  } = {},
): string {
  const store = opts.store ?? createWorkbenchToolStateStore({ storage: null });
  if (opts.selectedDoc) {
    store.set(PARCEL, "reports.selectedDoc", opts.selectedDoc);
  }
  return renderToStaticMarkup(
    <Workbench
      tools={WORKBENCH_TOOLS}
      openToolId={toolId}
      onOpenToolChange={noop}
      activeParcelNodeId={PARCEL}
      host={host}
      store={store}
    />,
  );
}

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

describe("BRIEF bubble", () => {
  it("anon → sign-in-first (existing idiom), no purchase surface yet", () => {
    primePropertyEntitlement(PARCEL, ANON);
    const html = renderTool("brief");
    expect(html).toContain('data-testid="brief-locked-sign-in"');
    expect(html).not.toContain('data-testid="view-pricing-button"');
  });

  it("free signed-in → LOCKED state: value line + View-pricing button, NO inline pricing (2026-08-24 ruling)", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("brief");
    expect(html).toContain('data-testid="brief-locked"');
    expect(html).toContain('data-testid="view-pricing-button"');
    // The dock never shows checkout buttons or price strings anymore.
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).not.toContain('data-testid="unlock-solo-choice"');
    expect(html).not.toContain("$49/mo");
    expect(html).not.toContain("$15");
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

describe("REPORTS bubble (Option D picker; TERRAIN Studio-only when selected)", () => {
  it("anon → sign-in-first", () => {
    primePropertyEntitlement(PARCEL, ANON);
    expect(renderTool("reports")).toContain(
      'data-testid="reports-locked-sign-in"',
    );
  });

  it("free signed-in → LOCKED: picker + View-pricing button, NO inline checkout", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("reports");
    expect(html).toContain('data-testid="reports-locked"');
    expect(html).toContain('data-testid="reports-doc-picker"');
    expect(html).toContain('data-testid="view-pricing-button"');
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).not.toContain('data-testid="unlock-solo-choice"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
    expect(html).not.toContain('data-testid="flood-drainage-section"');
  });

  it("property-unlocked → picker, not locked; flood runs only when selected", () => {
    primePropertyEntitlement(PARCEL, PROPERTY_UNLOCKED);
    const html = renderTool("reports");
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).toContain('data-testid="reports-doc-picker"');
    expect(html).toContain("Site plan");
    expect(html).not.toContain('data-testid="flood-run"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
  });

  it("property-unlocked + FLOOD selected → flood runs; terrain is not in the DOM", () => {
    primePropertyEntitlement(PARCEL, PROPERTY_UNLOCKED);
    const html = renderTool("reports", { selectedDoc: "FLOOD" });
    expect(html).toContain('data-testid="flood-drainage-section"');
    expect(html).toContain('data-testid="flood-run"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
  });

  it("property-unlocked + TERGLB selected → STUDIO-ONLY lock (View-pricing, no inline checkout)", () => {
    primePropertyEntitlement(PARCEL, PROPERTY_UNLOCKED);
    const html = renderTool("reports", { selectedDoc: "TERGLB" });
    expect(html).toContain('data-testid="terrain-pro-lock"');
    expect(html).toContain('data-testid="view-pricing-button"');
    expect(html).toContain("not part of the single-property unlock");
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).not.toContain('data-testid="unlock-studio-choice"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
  });

  it("STUDIO + TERGLB → the real terrain export section, no lock", () => {
    primePropertyEntitlement(PARCEL, STUDIO);
    const html = renderTool("reports", { selectedDoc: "TERGLB" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
    expect(html).toContain('data-testid="terrain-export-section"');
  });

  it("TEAM grants terrain too (everything in Studio)", () => {
    primePropertyEntitlement(PARCEL, TEAM);
    const html = renderTool("reports", { selectedDoc: "TERGLB" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
    expect(html).toContain('data-testid="terrain-export-section"');
  });

  it("SOLO subscriber: flood runs when selected; terrain gates CLOSED", () => {
    primePropertyEntitlement(PARCEL, SOLO);
    const flood = renderTool("reports", { selectedDoc: "FLOOD" });
    expect(flood).not.toContain('data-testid="reports-locked"');
    expect(flood).toContain('data-testid="flood-run"');
    const terrain = renderTool("reports", { selectedDoc: "TERGLB" });
    expect(terrain).toContain('data-testid="terrain-pro-lock"');
    expect(terrain).not.toContain('data-testid="terrain-export-section"');
  });

  it("solo subscriber: Records request is STUDIO-ONLY (View-pricing, no inline checkout)", () => {
    primePropertyEntitlement(PARCEL, SOLO);
    const html = renderTool("reports", { selectedDoc: "REC" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).toContain('data-testid="records-studio-lock"');
    expect(html).toContain('data-testid="view-pricing-button"');
    expect(html).not.toContain('data-testid="records-request-section"');
  });

  it("free signed-in without unlock → reports locked (Records request withheld at bubble)", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("reports", { selectedDoc: "REC" });
    expect(html).toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="records-request-section"');
  });

  it("devRole (tester account, no Stripe, no subscriptionTier) grants terrain", () => {
    primePropertyEntitlement(PARCEL, DEV);
    const html = renderTool("reports", { selectedDoc: "TERGLB" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
    expect(html).not.toContain('data-testid="view-pricing-button"');
    expect(html).toContain('data-testid="terrain-export-section"');
  });

  it("devRole clears every generatable report row (not coming-soon)", () => {
    primePropertyEntitlement(PARCEL, DEV);
    for (const docId of ["REC", "DOSS", "FLOOD", "SITEPLAN", "TERRAIN", "SPPDF", "TERGLB"]) {
      const html = renderTool("reports", { selectedDoc: docId });
      expect(html).not.toContain('data-testid="reports-locked"');
      expect(html).not.toContain('data-testid="terrain-pro-lock"');
      expect(html).not.toContain('data-testid="records-studio-lock"');
    }
  });

  it("FAIL CLOSED: a paid row with NO subscriptionTier gates terrain CLOSED", () => {
    primePropertyEntitlement(PARCEL, PRO);
    const html = renderTool("reports", { selectedDoc: "TERGLB" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).toContain('data-testid="terrain-pro-lock"');
    expect(html).not.toContain('data-testid="terrain-export-section"');
  });

  it("entitlement unknown → picker renders (reactive 402 belt, not a hard lock)", () => {
    const html = renderTool("reports");
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="terrain-pro-lock"');
    expect(html).toContain('data-testid="reports-doc-picker"');
  });
});

describe("RECORDS REQUEST bubble (Studio-only when selected — P-85 item 13)", () => {
  it("STUDIO → records-request-section visible, not studio-locked", () => {
    primePropertyEntitlement(PARCEL, STUDIO);
    const html = renderTool("reports", { selectedDoc: "REC" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="records-studio-lock"');
    expect(html).toContain('data-testid="records-request-section"');
  });

  it("TEAM → records-request-section visible, not studio-locked", () => {
    primePropertyEntitlement(PARCEL, TEAM);
    const html = renderTool("reports", { selectedDoc: "REC" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="records-studio-lock"');
    expect(html).toContain('data-testid="records-request-section"');
  });

  it("FREE signed-in → reports bubble locked; Records withheld (no section, no studio lock)", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("reports", { selectedDoc: "REC" });
    expect(html).toContain('data-testid="reports-locked"');
    expect(html).not.toContain('data-testid="records-request-section"');
    expect(html).not.toContain('data-testid="records-studio-lock"');
  });

  it("SOLO → studio lock on Records (LockedToolPanel, no request section)", () => {
    primePropertyEntitlement(PARCEL, SOLO);
    const html = renderTool("reports", { selectedDoc: "REC" });
    expect(html).not.toContain('data-testid="reports-locked"');
    expect(html).toContain('data-testid="records-studio-lock"');
    expect(html).toContain('data-testid="view-pricing-button"');
    expect(html).not.toContain('data-testid="records-request-section"');
  });

  it("anon → sign-in-first; Records withheld until authenticated", () => {
    primePropertyEntitlement(PARCEL, ANON);
    const html = renderTool("reports", { selectedDoc: "REC" });
    expect(html).toContain('data-testid="reports-locked-sign-in"');
    expect(html).not.toContain('data-testid="records-request-section"');
    expect(html).not.toContain('data-testid="records-studio-lock"');
  });
});

describe("SHARE bubble (free for signed-in users — acquisition channel)", () => {
  it("anon → sign-in-first", () => {
    primePropertyEntitlement(PARCEL, ANON);
    expect(renderTool("share")).toContain('data-testid="share-locked-sign-in"');
  });

  it("free signed-in → the create-link flow renders (share is free)", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("share");
    expect(html).not.toContain('data-testid="share-locked"');
    expect(html).toContain('data-testid="share-create"');
    expect(html).not.toContain('data-testid="view-pricing-button"');
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

describe("USE IN YOUR AI bubble (Connect live for Claude/Cursor, share mint secondary)", () => {
  it("anon → sign-in-first, no Connect", () => {
    primePropertyEntitlement(PARCEL, ANON);
    const html = renderTool("use-in-ai");
    expect(html).toContain('data-testid="use-in-ai-locked-sign-in"');
    expect(html).not.toContain('data-testid="use-in-ai-connect-claude"');
  });

  it("free signed-in → sheet + Connect for Claude/Cursor, no paywall", () => {
    primePropertyEntitlement(PARCEL, FREE);
    const html = renderTool("use-in-ai");
    expect(html).toContain('data-testid="use-in-ai-tool"');
    expect(html).toContain('data-testid="use-in-ai-create-share"');
    expect(html).toContain('data-testid="use-in-ai-connect-claude"');
    expect(html).toContain('data-testid="use-in-ai-connect-cursor"');
    expect(html).toContain("Coming soon");
    expect(html).not.toContain('data-testid="view-pricing-button"');
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

  it("free messages EXHAUSTED → the wall replaces the composer: value line + View-pricing button, NO inline checkout; thread stays readable", () => {
    primePropertyEntitlement(PARCEL, FREE_EXHAUSTED);
    const html = renderTool("chat", { store: storeWithThread() });
    expect(html).toContain('data-testid="chat-wall"');
    expect(html).toContain('data-testid="view-pricing-button"');
    expect(html).toContain("last free question");
    expect(html).not.toContain("3 of 3");
    expect(html).not.toContain("chats used");
    expect(html).not.toContain('data-testid="unlock-property-choice"');
    expect(html).not.toContain('data-testid="unlock-solo-choice"');
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
    expect(renderTool("properties")).not.toContain("view-pricing-button");
    expect(renderTool("compare")).not.toContain("view-pricing-button");
  });
});
