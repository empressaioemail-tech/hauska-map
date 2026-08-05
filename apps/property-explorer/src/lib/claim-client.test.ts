// WDLL item 6 — anonymous → authenticated claim on sign-in. Every step
// degrades to an honest outcome; a claim failure never blocks or reverts a
// successful sign-in (see claimClient.ts). Deps (installId, local workbench
// state) are injected directly — this repo's tests run in a plain Node
// vitest environment (no jsdom/window), same idiom as tool-state-store.test.ts.

import { afterEach, describe, expect, it } from "vitest";
import { claimAnonymousStateOnSignIn } from "./claimClient";
import {
  primePropertyEntitlement,
  getPropertyEntitlementSnapshot,
  resetPropertyEntitlementsForTests,
} from "./entitlementClient";

afterEach(() => {
  resetPropertyEntitlementsForTests();
});

const INSTALL_ID = "pe-test-install-id-00000000";

describe("claimAnonymousStateOnSignIn", () => {
  it("claims install history + uploads local workbench state, invalidates the entitlement cache", async () => {
    primePropertyEntitlement("48021:1", {
      status: "ready",
      authenticated: true,
      tier: "free",
      propertyUnlocked: false,
      freeMessagesUsed: 0,
      freeMessagesLimit: 3,
      softFallback: false,
      devRole: false,
      entitlementSource: null,
    });

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const workbenchToolState = {
      v: 1,
      properties: { "48021:1": { touchedAt: 1, tools: {} } },
    };

    const result = await claimAnonymousStateOnSignIn(fetchImpl, {
      installId: INSTALL_ID,
      workbenchToolState,
    });

    expect(result.installClaim).toBe("claimed");
    expect(result.localStateClaim).toBe("claimed");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(
      "/api/spine-deep/api/property-explorer/v1/claim-session",
    );
    expect(calls[0]!.init.credentials).toBe("include");
    expect((calls[0]!.init.headers as Record<string, string>)["X-Hauska-Install-Id"]).toBe(
      INSTALL_ID,
    );
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ installId: INSTALL_ID });

    expect(calls[1]!.url).toBe(
      "/api/spine-deep/api/property-explorer/v1/claim-local-state",
    );
    expect(calls[1]!.init.credentials).toBe("include");
    const body = JSON.parse(String(calls[1]!.init.body)) as Record<string, unknown>;
    expect(body.savedProperties).toEqual([]);
    expect(body.workbenchToolState).toEqual(workbenchToolState);

    // Cache invalidated — the earlier primed read is gone.
    expect(getPropertyEntitlementSnapshot("48021:1")).toBeNull();
  });

  it("no local workbench state → skips the claim-local-state POST entirely (honest: nothing to claim)", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const result = await claimAnonymousStateOnSignIn(fetchImpl, {
      installId: INSTALL_ID,
      workbenchToolState: null,
    });

    expect(result.installClaim).toBe("claimed");
    expect(result.localStateClaim).toBe("nothing-to-claim");
    expect(calls).toEqual([
      "/api/spine-deep/api/property-explorer/v1/claim-session",
    ]);
  });

  it("FEATURE-DETECT: cortex without the claim routes yet (404) → not-available, never blocks", async () => {
    const fetchImpl = (async () => {
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const result = await claimAnonymousStateOnSignIn(fetchImpl, {
      installId: INSTALL_ID,
      workbenchToolState: null,
    });

    expect(result.installClaim).toBe("not-available");
  });

  it("401 (no/expired session) → sign-in, never blocks", async () => {
    const fetchImpl = (async () => {
      return { ok: false, status: 401, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const result = await claimAnonymousStateOnSignIn(fetchImpl, {
      installId: INSTALL_ID,
      workbenchToolState: null,
    });

    expect(result.installClaim).toBe("sign-in");
  });

  it("network error → unreachable, never throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const result = await claimAnonymousStateOnSignIn(fetchImpl, {
      installId: INSTALL_ID,
      workbenchToolState: null,
    });

    expect(result.installClaim).toBe("unreachable");
  });

  it("a claim-local-state failure never reverts the install claim outcome", async () => {
    const fetchImpl = (async (url: RequestInfo | URL) => {
      if (String(url).includes("claim-local-state")) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as typeof fetch;

    const result = await claimAnonymousStateOnSignIn(fetchImpl, {
      installId: INSTALL_ID,
      workbenchToolState: { v: 1, properties: {} },
    });

    expect(result.installClaim).toBe("claimed");
    expect(result.localStateClaim).toBe("not-available");
  });
});
