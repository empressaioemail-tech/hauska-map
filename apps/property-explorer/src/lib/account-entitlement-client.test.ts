// P-98b — the ACCOUNT-LEVEL entitlement read, and the one rule it exists to
// protect: A NULL BILLING INTERVAL IS NOT MONTHLY.
//
// Everything here is exercised through an INJECTED fetch or a literal body, so
// each branch runs for real rather than being asserted from the source text.
//
// THE VIOLATION TESTS ARE THE POINT. The annual rung is judged on whether it
// ever proposes "switch to annual" to somebody already on annual, and the two
// ways that happens are (1) the parse widens an unknown into "month" and
// (2) the ladder admits something other than "month". Both directions are
// pinned below, and the end-to-end block pins the CHAIN rather than the two
// halves separately — a wire body in, an action or null out — because two
// individually correct halves can still be wired together wrong.

import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_ENTITLEMENT_PATH,
  fetchAccountEntitlement,
  parseAccessTier,
  parseAccountEntitlement,
  parseBillingInterval,
  parsePlanTier,
} from "./accountEntitlementClient";
import { ladderEntitlementFromAccount } from "./useAccountEntitlement";
import { nextAction, type AccountLadderState } from "./nextAction";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function statusOnly(status: number): Response {
  return new Response(null, { status });
}

// ---------------------------------------------------------------------------
// THE ONE RULE, at the parse.
// ---------------------------------------------------------------------------

describe("parseBillingInterval — only two strings resolve, everything else is UNKNOWN", () => {
  it("resolves the two literal values and nothing else", () => {
    expect(parseBillingInterval("month")).toBe("month");
    expect(parseBillingInterval("year")).toBe("year");
  });

  it("VIOLATION: no unknown value is ever widened into month", () => {
    // The failure this guards is a client deciding what the server meant on a
    // field that decides how somebody is billed. Case included: "Month" is
    // not "month", and a case-insensitive match here would be exactly the
    // kind of helpfulness that invents a fact.
    //
    // "monthly" and "annual" are in this list DELIBERATELY and are the reason
    // it was rewritten (P-98b, 2026-08-31). They are the retired product words
    // a translation layer used to put on this wire. Admitting them "for
    // compatibility" would rebuild the two-vocabulary bridge the ruling
    // deleted, and it would do it silently.
    for (const bad of [
      null,
      undefined,
      "",
      " ",
      "Month",
      "MONTH",
      "monthly",
      "annual",
      "yearly",
      "month ",
      0,
      1,
      true,
      {},
      [],
    ]) {
      expect(parseBillingInterval(bad)).toBeNull();
    }
  });
});

describe("parseAccessTier and parsePlanTier fail closed", () => {
  it("access tier resolves paid/free and NOTHING else — absent is UNKNOWN, not free", () => {
    expect(parseAccessTier("paid")).toBe("paid");
    expect(parseAccessTier("free")).toBe("free");
    for (const bad of [undefined, null, "", "Paid", "pro", "trial", 1, {}]) {
      expect(parseAccessTier(bad)).toBeNull();
    }
  });

  it("plan tier resolves the three ladder tiers and NOTHING else", () => {
    expect(parsePlanTier("solo")).toBe("solo");
    expect(parsePlanTier("studio")).toBe("studio");
    expect(parsePlanTier("team")).toBe("team");
    for (const bad of [undefined, null, "", "Solo", "enterprise", 2]) {
      expect(parsePlanTier(bad)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The body parse
// ---------------------------------------------------------------------------

describe("parseAccountEntitlement", () => {
  it("shapes the full contract block", () => {
    expect(
      parseAccountEntitlement({
        authenticated: true,
        accessTier: "paid",
        subscriptionTier: "studio",
        entitlementSource: "stripe_sub",
        devRole: false,
        seatsPurchased: 3,
        billingInterval: "month",
      }),
    ).toEqual({
      authenticated: true,
      accessTier: "paid",
      subscriptionTier: "studio",
      entitlementSource: "stripe_sub",
      devRole: false,
      seatsPurchased: 3,
      billingInterval: "month",
      preContract: false,
    });
  });

  it("accepts `tier` as well as `accessTier` — the deploy window has both", () => {
    // The sibling lane's contract names the field accessTier (after
    // pe_user_entitlements.access_tier); the route running in production today
    // emits `tier`. Reading only one would make the Access row wrong for one
    // half of the deploy window, and the wrong direction is the flattering one.
    expect(parseAccountEntitlement({ authenticated: true, tier: "paid" })?.accessTier).toBe(
      "paid",
    );
    expect(
      parseAccountEntitlement({ authenticated: true, accessTier: "paid" })?.accessTier,
    ).toBe("paid");
  });

  it("VIOLATION: an absent tier is UNKNOWN, never free", () => {
    // Deliberately stricter than the per-property parse in
    // entitlementClient.ts, which turns an absent field into a positive
    // "free". That is tolerable for a display-only soft path behind a server
    // 402; it is not tolerable for a row on the account console labelled
    // "Access".
    const parsed = parseAccountEntitlement({ authenticated: true });
    expect(parsed?.accessTier).toBeNull();
  });

  it("TODAY'S PRE-CONTRACT RESPONSE parses without inventing anything", () => {
    // Verbatim shape of what the deployed route returns for a parcel-less GET
    // (legacy-design-tools artifacts/api-server/src/routes/propertyExplorer.ts,
    // the `base` object): a 200, no property block, and none of the three new
    // account fields.
    const parsed = parseAccountEntitlement({
      authenticated: true,
      tier: "paid",
      tenantId: "t1",
      userId: "u1",
      devRole: false,
      entitlementSource: "stripe_sub",
    });
    expect(parsed).toEqual({
      authenticated: true,
      // Access CAN light up today. That is the honest partial win.
      accessTier: "paid",
      // These three cannot, and say so rather than being back-derived.
      subscriptionTier: null,
      seatsPurchased: null,
      billingInterval: null,
      entitlementSource: "stripe_sub",
      devRole: false,
      preContract: true,
    });
  });

  it("preContract is a statement about the WIRE, and an explicit null is NOT pre-contract", () => {
    // The distinction exists for a human reading a console, not for the UI:
    // both render "Not read" and both suppress the rung. It is recorded here
    // so the flag cannot quietly start meaning something else.
    expect(
      parseAccountEntitlement({ authenticated: true, tier: "free", billingInterval: null })
        ?.preContract,
    ).toBe(false);
    expect(
      parseAccountEntitlement({ authenticated: true, tier: "free" })?.preContract,
    ).toBe(true);
  });

  it("dev role reads as team, but ONLY on an explicit devRole", () => {
    expect(
      parseAccountEntitlement({ authenticated: true, tier: "paid", devRole: true })
        ?.subscriptionTier,
    ).toBe("team");
    // A legacy paid row with no subscriptionTier still fail-closes to null.
    expect(
      parseAccountEntitlement({ authenticated: true, tier: "paid" })?.subscriptionTier,
    ).toBeNull();
  });

  it("refuses a seat count it cannot read rather than coercing one", () => {
    for (const bad of [-1, 1.5, "3", NaN, null, undefined]) {
      expect(
        parseAccountEntitlement({ authenticated: true, seatsPurchased: bad })
          ?.seatsPurchased,
      ).toBeNull();
    }
    expect(
      parseAccountEntitlement({ authenticated: true, seatsPurchased: 0 })?.seatsPurchased,
    ).toBe(0);
  });

  it("a non-object body is unreadable, not an empty account", () => {
    for (const bad of [null, undefined, "ok", 7, []]) {
      expect(parseAccountEntitlement(bad)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// The transport outcomes
// ---------------------------------------------------------------------------

describe("fetchAccountEntitlement — five outcomes that must never merge", () => {
  it("calls the parcel-less path — no parcelNodeId anywhere in the URL", () => {
    const spy = vi.fn(async () => jsonResponse({ authenticated: true, tier: "free" }));
    return fetchAccountEntitlement(spy as unknown as typeof fetch).then(() => {
      const url = String(spy.mock.calls[0][0]);
      expect(url).toContain(ACCOUNT_ENTITLEMENT_PATH);
      expect(url).not.toContain("parcelNodeId");
      expect(url).not.toContain("?");
    });
  });

  it("401 sign-in, 403 blocked, 404/501 not-built, 500 error — and NONE is a free account", async () => {
    for (const [status, kind] of [
      [401, "sign-in"],
      [403, "blocked"],
      [404, "not-built"],
      [501, "not-built"],
      [500, "error"],
      [502, "error"],
    ] as const) {
      const out = await fetchAccountEntitlement(
        vi.fn(async () => statusOnly(status)) as unknown as typeof fetch,
      );
      expect(out.kind).toBe(kind);
      // The defect this guards: any of these rendering as a determination
      // about the account's plan.
      expect(out.kind).not.toBe("ready");
    }
  });

  it("an unreadable body is an error, not an empty account", async () => {
    const out = await fetchAccountEntitlement(
      vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch,
    );
    expect(out.kind).toBe("error");
  });

  it("a thrown fetch is an error and never rejects", async () => {
    const out = await fetchAccountEntitlement(
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    );
    expect(out.kind).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// The bridge into the ladder
// ---------------------------------------------------------------------------

describe("ladderEntitlementFromAccount — nothing but a clean, authenticated, tiered read becomes a fact", () => {
  it("an unresolved read is unread", () => {
    expect(ladderEntitlementFromAccount(null)).toEqual({ kind: "unread" });
  });

  it("every failure kind is unread — a 404 is not 'no subscription'", () => {
    for (const outcome of [
      { kind: "sign-in" },
      { kind: "blocked" },
      { kind: "not-built" },
      { kind: "error", message: "x" },
    ] as const) {
      expect(ladderEntitlementFromAccount(outcome)).toEqual({ kind: "unread" });
    }
  });

  it("a signed-out 200 is unread, and an unknown tier is unread", () => {
    const account = {
      authenticated: false,
      accessTier: "paid",
      subscriptionTier: "solo",
      entitlementSource: null,
      devRole: false,
      seatsPurchased: null,
      billingInterval: "month",
      preContract: false,
    } as const;
    expect(ladderEntitlementFromAccount({ kind: "ready", account })).toEqual({
      kind: "unread",
    });
    expect(
      ladderEntitlementFromAccount({
        kind: "ready",
        account: { ...account, authenticated: true, accessTier: null },
      }),
    ).toEqual({ kind: "unread" });
  });

  it("passes the interval STRAIGHT THROUGH, null included, and never supplies a free-message count", () => {
    for (const billingInterval of ["month", "year", null] as const) {
      expect(
        ladderEntitlementFromAccount({
          kind: "ready",
          account: {
            authenticated: true,
            accessTier: "paid",
            subscriptionTier: "solo",
            entitlementSource: null,
            devRole: false,
            seatsPurchased: null,
            billingInterval,
            preContract: false,
          },
        }),
      ).toEqual({
        kind: "read",
        tier: "paid",
        subscriptionTier: "solo",
        billingInterval,
        // The free-message counters live in the per-PROPERTY block, which an
        // account read does not have. Null suppresses the unlock rung.
        freeMessagesLeft: null,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// THE CHAIN. A wire body in, an action or null out.
// ---------------------------------------------------------------------------

describe("VERIFY BY VIOLATION — wire body to rung, in both directions", () => {
  /** Everything except the entitlement is quiet, so only that rung can speak. */
  function planStateFromBody(body: unknown): AccountLadderState {
    const account = parseAccountEntitlement(body);
    if (!account) throw new Error("fixture body did not parse");
    return {
      authenticated: true,
      claude: { kind: "read", connected: true },
      entitlement: ladderEntitlementFromAccount({ kind: "ready", account }),
      unlocks: { kind: "read", asOf: new Date("2026-09-01T00:00:00Z"), unlocks: [] },
      seats: { kind: "unread" },
    };
  }

  const paidSolo = (extra: Record<string, unknown>) => ({
    authenticated: true,
    accessTier: "paid",
    subscriptionTier: "solo",
    entitlementSource: "stripe_sub",
    devRole: false,
    ...extra,
  });

  it("MONTH DOES fire annual_upgrade — the rung is fed, not starved", () => {
    // If this ever goes null the card did not do its job: the whole point of
    // the account read is that this rung can now reach a user at all.
    const action = nextAction("plan", planStateFromBody(paidSolo({ billingInterval: "month" })));
    expect(action?.id).toBe("annual_upgrade");
  });

  it("ANNUAL does NOT fire it", () => {
    expect(
      nextAction("plan", planStateFromBody(paidSolo({ billingInterval: "year" }))),
    ).toBeNull();
  });

  it("an EXPLICIT NULL interval does NOT fire it", () => {
    expect(
      nextAction("plan", planStateFromBody(paidSolo({ billingInterval: null }))),
    ).toBeNull();
  });

  it("an ABSENT interval — today's pre-contract server — does NOT fire it", () => {
    expect(nextAction("plan", planStateFromBody(paidSolo({})))).toBeNull();
  });

  it("an UNRECOGNISED interval does NOT fire it", () => {
    for (const bad of ["Monthly", "yearly", "", 1, true]) {
      expect(
        nextAction("plan", planStateFromBody(paidSolo({ billingInterval: bad }))),
      ).toBeNull();
    }
  });

  it("NOT VACUOUS: the four negative cases differ from the positive one ONLY in the interval", () => {
    // Guards the shape of the block above. If some other field in the fixture
    // were suppressing the rung, every case here would return null and the
    // three negative assertions would pass for the wrong reason. The positive
    // case sharing every other field with them is what rules that out, and
    // this test states it rather than leaving it implied.
    const monthly = paidSolo({ billingInterval: "month" });
    const annual = paidSolo({ billingInterval: "year" });
    expect(Object.keys(monthly).sort()).toEqual(Object.keys(annual).sort());
    expect(nextAction("plan", planStateFromBody(monthly))).not.toBeNull();
    expect(nextAction("plan", planStateFromBody(annual))).toBeNull();
  });
});
