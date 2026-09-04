// @vitest-environment jsdom
//
// Regression test for the production white-screen crash: ReportsTool() used
// to place its `ent.signedOut && reportsTab === "mine"` early return BEFORE
// a useEffect further down the function body (the "carry the held pick"
// effect). A mounted ReportsTool that transitioned INTO ent.signedOut after
// its first render — e.g. a session lapsing, or the app-wide
// invalidatePropertyEntitlement() that usePostCheckoutRefresh.ts fires on
// every checkout return forcing every mounted usePropertyEntitlement
// subscriber to re-fetch — took the early return on a later render having
// called one fewer hook than the render before it. That is React invariant
// #300, "Rendered fewer hooks than expected... an accidental early return
// statement", and with no error boundary anywhere in this app (see
// components/AppErrorBoundary.tsx, added alongside this fix) it blanked the
// entire page.
//
// WHY THIS FILE IS jsdom (unlike reports-tool.test.tsx's renderToStaticMarkup
// pattern): the bug is a MISMATCH BETWEEN TWO RENDERS of the same mounted
// component instance. A single renderToStaticMarkup pass cannot exercise a
// transition at all — it only ever proves one render, never a re-render of
// the same fiber. Proving this regression (and that the fix holds) requires
// a real client reconciler: mount once in a non-signed-out state, force a
// SECOND render of the same instance into signedOut via the real
// entitlementClient cache/notify path, and assert nothing throws.

import { describe, expect, it, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Workbench } from "../Workbench";
import { WORKBENCH_TOOLS } from "../registry";
import { createWorkbenchToolStateStore } from "../tool-state-store";
import type { WorkbenchHostActions } from "../types";
import {
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
  type PropertyEntitlementState,
} from "../../lib/entitlementClient";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PARCEL_ID = "48021:123";

const host: WorkbenchHostActions = {
  openPaywall: () => {},
  getActiveParcelFacts: () => ({
    address: "714 Spring St, Bastrop, TX",
    countyName: "Bastrop",
  }),
};
const noop = () => {};

function authenticatedEntitlement(): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: true,
    tier: "paid",
    propertyUnlocked: true,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    subscriptionTier: "studio",
    devRole: false,
    entitlementSource: "stripe_sub",
  };
}

function signedOutEntitlement(): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: false,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    subscriptionTier: null,
    devRole: false,
    entitlementSource: null,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  resetPropertyEntitlementsForTests();
});

describe("ReportsTool — signed-out transition on an already-mounted instance", () => {
  it("does not crash (React #300) when ent.signedOut flips true on a live render, and shows the locked panel", () => {
    // First render: authenticated, so the normal picker/engine branch runs
    // and every hook in the function — including the useEffect that used to
    // sit AFTER the buggy early return — executes.
    primePropertyEntitlement(PARCEL_ID, authenticatedEntitlement());

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        <Workbench
          tools={WORKBENCH_TOOLS}
          openToolId="reports"
          onOpenToolChange={noop}
          activeParcelNodeId={PARCEL_ID}
          host={host}
          store={createWorkbenchToolStateStore({ storage: null })}
        />,
      );
    });

    expect(container.querySelector('[data-testid="reports-doc-picker"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reports-locked"]')).toBeNull();

    // SECOND render of the SAME mounted fiber: entitlement flips to signed
    // out (session lapse, or the global invalidatePropertyEntitlement() a
    // checkout return fires) and notify()s the subscribed
    // usePropertyEntitlement() -> useSyncExternalStore in ReportsTool,
    // forcing a re-render with ent.signedOut === true while reportsTab is
    // still its default "mine". This is exactly what threw #300 pre-fix —
    // wrapping it in act() means a thrown render error surfaces as a test
    // failure here, not swallowed.
    expect(() => {
      act(() => {
        primePropertyEntitlement(PARCEL_ID, signedOutEntitlement());
      });
    }).not.toThrow();

    // The tree is not blank, and it now honestly shows the sign-in-first
    // locked state (LockedToolPanel's signedOut branch, testId prefixed
    // "reports-locked") — the exact fallback the pre-fix crash replaced
    // with nothing at all.
    expect(container.innerHTML.trim().length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="reports-locked-sign-in"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reports-doc-picker"]')).toBeNull();
  });
});
