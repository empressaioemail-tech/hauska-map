/**
 * A-062 — the billing portal client.
 *
 * SEVEN OUTCOMES THAT MUST NEVER MERGE, and the reason each is separate is
 * that they say different things to a customer who is trying to stop paying
 * us. Collapsing "you have never been billed" into "something went wrong" is
 * how a cancel button starts reading as broken.
 *
 * The strongest assertion in this file is the one about what is NOT sent: the
 * server refuses a caller-supplied customer id, so this client must never
 * acquire one to send. A test that only checks the happy path would pass just
 * as well if somebody added one.
 */

import { describe, expect, it, vi } from "vitest";
import {
  BILLING_PORTAL_PATH,
  PORTAL_NOT_BUILT_MESSAGE,
  PORTAL_UNAVAILABLE_MESSAGE,
  billingPortalReturnUrl,
  isStripeBillingPortalUrl,
  startBillingPortal,
} from "./portalClient";

const RETURN_URL = "https://smartsite.cloud/?billing=portal-return";
const STRIPE_PORTAL = "https://billing.stripe.com/p/session/test_abc";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Records every request so the test can assert what was NOT on the wire. */
function recordingFetch(res: Response | (() => Response)) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return typeof res === "function" ? res() : res;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("what goes on the wire", () => {
  it("posts to the allowlisted path with credentials and ONLY a returnUrl", async () => {
    const { impl, calls } = recordingFetch(
      jsonResponse(200, { ok: true, mode: "live", portalUrl: STRIPE_PORTAL }),
    );
    await startBillingPortal({ fetchImpl: impl, returnUrl: RETURN_URL });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(BILLING_PORTAL_PATH);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.credentials).toBe("include");

    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ returnUrl: RETURN_URL });
  });

  it("VIOLATION: NO customer id of any spelling is ever sent", async () => {
    // The server refuses a supplied customer id with a named 400, so a client
    // that ever sends one would break every portal open. Asserted on the
    // serialised body rather than on the object, so a nested one is caught.
    const { impl, calls } = recordingFetch(
      jsonResponse(200, { ok: true, mode: "live", portalUrl: STRIPE_PORTAL }),
    );
    await startBillingPortal({ fetchImpl: impl, returnUrl: RETURN_URL });
    const raw = String(calls[0].init?.body).toLowerCase();
    for (const spelling of [
      "customer",
      "customerid",
      "customer_id",
      "stripecustomerid",
      "cus_",
    ]) {
      expect(raw).not.toContain(spelling);
    }
  });

  it("the return URL is EXPLICIT and origin-derived, never the stale Vercel host", async () => {
    // The server has no default; the hardcoded https://property-explorer-xi
    // .vercel.app default on the checkout path is what this replaces.
    const url = billingPortalReturnUrl();
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain("billing=portal-return");
    expect(url).not.toContain("property-explorer-xi.vercel.app");
  });
});

describe("the seven outcomes", () => {
  it("200 with a Stripe URL is a portal", async () => {
    const { impl } = recordingFetch(
      jsonResponse(200, { ok: true, mode: "live", portalUrl: STRIPE_PORTAL }),
    );
    expect(await startBillingPortal({ fetchImpl: impl })).toEqual({
      kind: "portal",
      portalUrl: STRIPE_PORTAL,
    });
  });

  it("409 no_billing_account is its OWN outcome, carrying the server's words", async () => {
    const { impl } = recordingFetch(
      jsonResponse(409, {
        error: "no_billing_account",
        hasBillingAccount: false,
        message: "This account has no billing history, so there is no Stripe billing portal to open.",
      }),
    );
    const out = await startBillingPortal({ fetchImpl: impl });
    expect(out.kind).toBe("no-billing-account");
    expect(out.kind === "no-billing-account" && out.message).toMatch(
      /no billing history/i,
    );
  });

  it("401 is sign-in, and is NEVER read as 'no billing account'", async () => {
    const { impl } = recordingFetch(jsonResponse(401, { error: "authentication_required" }));
    expect((await startBillingPortal({ fetchImpl: impl })).kind).toBe("sign-in");
  });

  it("403 is blocked — OUR proxy refusing OUR path, never a user fact", async () => {
    // Reachable, not hypothetical: api/spine-deep.ts returns exactly 403 for
    // any path failing isDeepPathAllowed, and a signed-out probe cannot see it
    // because the cookie check runs first.
    const { impl } = recordingFetch(jsonResponse(403, {}));
    expect((await startBillingPortal({ fetchImpl: impl })).kind).toBe("blocked");
  });

  it("404 and 501 are not-built, not 'no billing account'", async () => {
    for (const status of [404, 501]) {
      const { impl } = recordingFetch(jsonResponse(status, {}));
      const out = await startBillingPortal({ fetchImpl: impl });
      expect(out.kind).toBe("not-built");
      expect(out.kind === "not-built" && out.message).toBe(PORTAL_NOT_BUILT_MESSAGE);
    }
  });

  it("503 is unavailable — Stripe unconfigured on this deployment", async () => {
    const { impl } = recordingFetch(jsonResponse(503, { error: "portal_unavailable" }));
    const out = await startBillingPortal({ fetchImpl: impl });
    expect(out.kind).toBe("unavailable");
    expect(out.kind === "unavailable" && out.message).toBe(PORTAL_UNAVAILABLE_MESSAGE);
  });

  it("502 is an error carrying the server's message", async () => {
    const { impl } = recordingFetch(
      jsonResponse(502, { error: "portal_failed", message: "No configuration provided" }),
    );
    const out = await startBillingPortal({ fetchImpl: impl });
    expect(out.kind).toBe("error");
    expect(out.kind === "error" && out.message).toBe("No configuration provided");
  });

  it("a transport failure is an error, never a silent nothing", async () => {
    const impl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const out = await startBillingPortal({ fetchImpl: impl });
    expect(out.kind).toBe("error");
  });
});

describe("VIOLATION — a 200 that is not really a portal", () => {
  it("refuses a same-origin 'portal' URL", async () => {
    // A URL that is not Stripe's cancels nothing while looking like it did,
    // which is this card's own defect one layer down.
    const { impl } = recordingFetch(
      jsonResponse(200, { ok: true, portalUrl: "https://smartsite.cloud/fake-portal" }),
    );
    const out = await startBillingPortal({ fetchImpl: impl });
    expect(out.kind).toBe("error");
    expect(out.kind === "error" && out.message).toMatch(/not from Stripe/i);
  });

  it("refuses a 200 with no portalUrl at all", async () => {
    const { impl } = recordingFetch(jsonResponse(200, { ok: true }));
    expect((await startBillingPortal({ fetchImpl: impl })).kind).toBe("error");
  });

  it("refuses an unreadable 200 body rather than inventing a portal", async () => {
    const { impl } = recordingFetch(
      new Response("<html>gateway</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    expect((await startBillingPortal({ fetchImpl: impl })).kind).toBe("error");
  });

  it("the Stripe-host predicate IS NOT VACUOUS, in both directions", () => {
    expect(isStripeBillingPortalUrl(STRIPE_PORTAL)).toBe(true);
    expect(isStripeBillingPortalUrl("https://billing.stripe.com/p/session/x")).toBe(true);
    expect(isStripeBillingPortalUrl("http://billing.stripe.com/p/session/x")).toBe(false);
    expect(isStripeBillingPortalUrl("https://smartsite.cloud/")).toBe(false);
    expect(isStripeBillingPortalUrl("https://stripe.com.evil.com/")).toBe(false);
    expect(isStripeBillingPortalUrl("javascript:alert(1)")).toBe(false);
    expect(isStripeBillingPortalUrl("")).toBe(false);
  });
});
