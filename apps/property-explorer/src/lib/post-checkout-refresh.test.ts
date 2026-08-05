// WDLL item 7 — post-checkout reconcile: clears the entitlement cache
// immediately, polls until paid/unlocked or an honest timeout, strips the
// `checkout` param either way. `reconcilePostCheckout` is the pure async
// core (every side effect injected) so this unit-tests without a DOM.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reconcilePostCheckout,
  readCheckoutParams,
} from "./usePostCheckoutRefresh";
import {
  primePropertyEntitlement,
  resetPropertyEntitlementsForTests,
  type PropertyEntitlementState,
} from "./entitlementClient";

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

function entitled(overrides: Partial<PropertyEntitlementState> = {}): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: true,
    tier: "paid",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    devRole: false,
    entitlementSource: "stripe_sub",
    ...overrides,
  };
}

function notYetPaid(): PropertyEntitlementState {
  return {
    status: "ready",
    authenticated: true,
    tier: "free",
    propertyUnlocked: false,
    freeMessagesUsed: 0,
    freeMessagesLimit: 3,
    softFallback: false,
    devRole: false,
    entitlementSource: null,
  };
}

describe("readCheckoutParams", () => {
  it("reads success + parcelNodeId from the query string", () => {
    expect(readCheckoutParams("?checkout=success&parcelNodeId=48021:1")).toEqual({
      success: true,
      parcelNodeId: "48021:1",
    });
  });

  it("no checkout param → not success", () => {
    expect(readCheckoutParams("?foo=bar")).toEqual({
      success: false,
      parcelNodeId: null,
    });
  });

  it("checkout=cancel → not success (only 'success' reconciles)", () => {
    expect(readCheckoutParams("?checkout=cancel")).toEqual({
      success: false,
      parcelNodeId: null,
    });
  });
});

describe("reconcilePostCheckout", () => {
  it("no ?checkout=success → idle, never touches the cache or the fetcher", async () => {
    const fetcher = vi.fn();
    const strip = vi.fn();
    const statuses: string[] = [];
    const result = await reconcilePostCheckout({
      search: "?foo=bar",
      fetcher,
      strip,
      onStatusChange: (s) => statuses.push(s),
    });
    expect(result).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();
    expect(strip).not.toHaveBeenCalled();
    expect(statuses).toEqual(["idle"]);
  });

  it("no parcelNodeId → clears the cache, confirms immediately, strips the param", async () => {
    primePropertyEntitlement("48021:1", entitled());
    const fetcher = vi.fn();
    const strip = vi.fn();
    const statuses: string[] = [];
    const result = await reconcilePostCheckout({
      search: "?checkout=success",
      fetcher,
      strip,
      onStatusChange: (s) => statuses.push(s),
    });
    expect(result).toBe("confirmed");
    expect(fetcher).not.toHaveBeenCalled();
    expect(strip).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["checking", "confirmed"]);
  });

  it("parcelNodeId + entitled on the FIRST read → confirms without polling further", async () => {
    const fetcher = vi.fn(async () => entitled());
    const strip = vi.fn();
    const result = await reconcilePostCheckout({
      search: "?checkout=success&parcelNodeId=48021:1",
      fetcher,
      strip,
      pollIntervalMs: 5,
      maxWaitMs: 1000,
      sleepImpl: async () => {},
    });
    expect(result).toBe("confirmed");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(strip).toHaveBeenCalledTimes(1);
  });

  it("polls until entitled (a slow webhook lands on the 3rd read)", async () => {
    let call = 0;
    const fetcher = vi.fn(async () => {
      call += 1;
      return call < 3 ? notYetPaid() : entitled();
    });
    const sleeps: number[] = [];
    const result = await reconcilePostCheckout({
      search: "?checkout=success&parcelNodeId=48021:1",
      fetcher,
      pollIntervalMs: 5,
      maxWaitMs: 1000,
      strip: vi.fn(),
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(result).toBe("confirmed");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([5, 5]);
  });

  it("honest timeout when the webhook never lands — never a silent infinite spinner", async () => {
    const fetcher = vi.fn(async () => notYetPaid());
    const strip = vi.fn();
    const statuses: string[] = [];
    let now = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
      now += 40; // advance past maxWaitMs quickly without real sleeping
      return now;
    });
    const result = await reconcilePostCheckout({
      search: "?checkout=success&parcelNodeId=48021:1",
      fetcher,
      strip,
      pollIntervalMs: 1,
      maxWaitMs: 30,
      sleepImpl: async () => {},
      onStatusChange: (s) => statuses.push(s),
    });
    nowSpy.mockRestore();
    expect(result).toBe("timeout");
    expect(strip).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["checking", "timeout"]);
  });

  it("unmount mid-poll (isCancelled true) stops without a final status transition", async () => {
    let cancelledFlag = false;
    const fetcher = vi.fn(async () => {
      cancelledFlag = true; // simulate unmount happening between reads
      return notYetPaid();
    });
    const strip = vi.fn();
    const result = await reconcilePostCheckout({
      search: "?checkout=success&parcelNodeId=48021:1",
      fetcher,
      strip,
      pollIntervalMs: 1,
      maxWaitMs: 1000,
      sleepImpl: async () => {},
      isCancelled: () => cancelledFlag,
    });
    expect(result).toBe("checking");
    expect(strip).not.toHaveBeenCalled();
  });
});
