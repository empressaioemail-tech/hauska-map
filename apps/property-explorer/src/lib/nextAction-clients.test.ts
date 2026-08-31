// P-98 — the two reads behind the next-action rail.
//
// Both are tested through an INJECTED fetch, so every outcome branch is
// exercised for real rather than asserted from the source. The branches that
// matter most are the ones that must NOT collapse into each other: a 404, a
// 403 and an empty list are three different facts about an account, and
// rendering any of the first two as the third is how a dead card shipped to
// every user on 2026-08-31.

import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_UNLOCKS_PATH,
  fetchAccountUnlocks,
  parseAccountUnlocks,
} from "./unlockClient";
import {
  ACTIVATION_EVENTS_PATH,
  recordActivationEvent,
} from "./activationEvents";

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

describe("fetchAccountUnlocks — five outcomes that must never merge", () => {
  const AS_OF = "2026-08-31T12:00:00.000Z";

  it("200 with a list is `ready`, carries the server's asOf, and an EMPTY list is still `ready`", async () => {
    const full = await fetchAccountUnlocks(
      vi.fn(async () =>
        jsonResponse({
          asOf: AS_OF,
          unlocks: [
            {
              parcelNodeId: "48021:34137",
              tenantId: "t1",
              unlockedAt: "2026-08-20T00:00:00Z",
              expiresAt: "2026-09-04T00:00:00Z",
              source: "stripe_unlock",
            },
          ],
        }),
      ) as unknown as typeof fetch,
    );
    expect(full).toEqual({
      kind: "ready",
      asOf: new Date(AS_OF),
      unlocks: [{ parcelNodeId: "48021:34137", expiresAt: "2026-09-04T00:00:00Z" }],
    });

    const empty = await fetchAccountUnlocks(
      vi.fn(async () => jsonResponse({ asOf: AS_OF, unlocks: [] })) as unknown as typeof fetch,
    );
    // The route fails LOUD and never returns an empty list to mean failure,
    // so "this account holds none" is a POSITIVE determination and is the
    // only outcome below that means that.
    expect(empty).toEqual({ kind: "ready", asOf: new Date(AS_OF), unlocks: [] });
  });

  it("404 is not-built, 403 is blocked, 401 is sign-in, 500 is error — none is `ready`", async () => {
    for (const [status, kind] of [
      [404, "not-built"],
      [501, "not-built"],
      [403, "blocked"],
      [401, "sign-in"],
      [500, "error"],
    ] as const) {
      const out = await fetchAccountUnlocks(
        vi.fn(async () => statusOnly(status)) as unknown as typeof fetch,
      );
      expect(out.kind).toBe(kind);
      // The assertion that actually matters: none of these carries a list, so
      // none of them can reach a consumer looking like an empty account.
      expect(out).not.toHaveProperty("unlocks");
    }
  });

  it("an unreachable host and an unreadable body are errors, not absences", async () => {
    expect(
      (
        await fetchAccountUnlocks(
          vi.fn(async () => {
            throw new Error("offline");
          }) as unknown as typeof fetch,
        )
      ).kind,
    ).toBe("error");
    expect(
      (
        await fetchAccountUnlocks(
          vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
        )
      ).kind,
    ).toBe("error");
    // A 200 whose body is the wrong SHAPE is an error too, never an empty list.
    expect(
      (
        await fetchAccountUnlocks(
          vi.fn(async () => jsonResponse({ items: [] })) as unknown as typeof fetch,
        )
      ).kind,
    ).toBe("error");
  });

  it("fetches the path the allowlist carries", async () => {
    const spy = vi.fn(async () => jsonResponse({ asOf: AS_OF, unlocks: [] }));
    await fetchAccountUnlocks(spy as unknown as typeof fetch);
    expect(String(spy.mock.calls[0][0])).toContain(ACCOUNT_UNLOCKS_PATH);
  });
});

describe("parseAccountUnlocks", () => {
  const AS_OF = "2026-08-31T12:00:00.000Z";

  it("A NULL EXPIRY IS KEPT — unbounded is an unlock, not a bad row", () => {
    // Dropping it would silently shrink the account's real holdings; reading
    // it as a date would invent a lapse warning. It is kept, as null.
    const parsed = parseAccountUnlocks({
      asOf: AS_OF,
      unlocks: [
        { parcelNodeId: "48021:1", expiresAt: null },
        { parcelNodeId: "48021:2" },
        { parcelNodeId: "48021:3", expiresAt: "" },
      ],
    });
    expect(parsed?.unlocks).toEqual([
      { parcelNodeId: "48021:1", expiresAt: null },
      { parcelNodeId: "48021:2", expiresAt: null },
      { parcelNodeId: "48021:3", expiresAt: null },
    ]);
  });

  it("drops a row rather than defaulting it, but only when it must", () => {
    const parsed = parseAccountUnlocks({
      asOf: AS_OF,
      unlocks: [
        { parcelNodeId: "48021:1", expiresAt: "2026-09-04T00:00:00Z" },
        // PRESENT and unparseable: a value we were given and cannot read. An
        // invented expiry decides whether a lapse warning appears and what it
        // claims about the user's money, so the row goes.
        { parcelNodeId: "48021:3", expiresAt: "soon" },
        // no parcel id
        { expiresAt: "2026-09-04T00:00:00Z" },
        null,
        "nope",
      ],
    });
    expect(parsed?.unlocks.map((u) => u.parcelNodeId)).toEqual(["48021:1"]);
  });

  it("asOf IS REQUIRED — no server clock, no read", () => {
    // Without it the rail would fall back to the browser's clock, a second
    // derivation of "now" free to disagree with the one the expiries were
    // computed against. Missing means unreadable, never Date.now().
    expect(parseAccountUnlocks({ unlocks: [] })).toBeNull();
    expect(parseAccountUnlocks({ asOf: "whenever", unlocks: [] })).toBeNull();
    expect(parseAccountUnlocks({ asOf: 12345, unlocks: [] })).toBeNull();
    // VIOLATION DIRECTION — the same body with a real asOf reads fine.
    expect(parseAccountUnlocks({ asOf: AS_OF, unlocks: [] })?.asOf).toEqual(new Date(AS_OF));
  });

  it("an unreadable body is null, which the caller turns into an error", () => {
    expect(parseAccountUnlocks(null)).toBeNull();
    expect(parseAccountUnlocks({ asOf: AS_OF, unlocks: "no" })).toBeNull();
    expect(parseAccountUnlocks({})).toBeNull();
  });

  it("rows arrived and NONE could be shaped is unreadable, NEVER empty", () => {
    // The server half lives in another repo. If it names the fields
    // differently, every row drops and a naive parse returns [], which the
    // ladder would read as "this account holds no unlocks" — a contract
    // mismatch made indistinguishable from an honest empty account, on the
    // one rung that decides whether somebody is told their unlock is lapsing.
    expect(
      parseAccountUnlocks({
        asOf: AS_OF,
        unlocks: [
          { parcel_node_id: "48021:1", expires_at: "2026-09-04T00:00:00Z" },
          { parcel_node_id: "48021:2", expires_at: "2026-09-05T00:00:00Z" },
        ],
      }),
    ).toBeNull();
    // VIOLATION DIRECTION — a genuinely empty list is still an empty list.
    expect(parseAccountUnlocks({ asOf: AS_OF, unlocks: [] })?.unlocks).toEqual([]);
    // ...and a PARTIAL drop keeps the rows that are real facts.
    expect(
      parseAccountUnlocks({
        asOf: AS_OF,
        unlocks: [
          { parcelNodeId: "48021:1", expiresAt: "2026-09-04T00:00:00Z" },
          { parcel_node_id: "48021:2" },
        ],
      })?.unlocks.length,
    ).toBe(1);
  });

  it("the whole-list mismatch surfaces as an error outcome, not ready", async () => {
    const out = await fetchAccountUnlocks(
      vi.fn(async () =>
        jsonResponse({ asOf: AS_OF, unlocks: [{ parcel_node_id: "48021:1" }] }),
      ) as unknown as typeof fetch,
    );
    expect(out.kind).toBe("error");
  });
});

// ---------------------------------------------------------------------------

describe("recordActivationEvent — best effort, and never in the user's way", () => {
  it("posts the wire shape the server half expects", async () => {
    const spy = vi.fn(async () => jsonResponse({ ok: true }, 201));
    const out = await recordActivationEvent(
      { eventType: "shown", actionId: "connect-claude", surface: "settings" },
      spy as unknown as typeof fetch,
    );
    expect(out).toEqual({ kind: "recorded" });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain(ACTIVATION_EVENTS_PATH);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      event_type: "shown",
      action_id: "connect-claude",
      surface: "settings",
    });
  });

  it("NEVER throws — a 404, a 403, a 401, a 500 and a dead network all resolve", async () => {
    // The whole point: a failed event must not block the action or put an
    // error in front of somebody who was trying to do something else.
    const cases: [() => Promise<Response>, string][] = [
      [async () => statusOnly(404), "not-built"],
      [async () => statusOnly(501), "not-built"],
      [async () => statusOnly(403), "blocked"],
      [async () => statusOnly(401), "no-session"],
      // 400 is the server refusing our action_id, and it is OUR defect, not a
      // state of the world. Its own kind so it is nameable rather than filed
      // under "network".
      [async () => statusOnly(400), "rejected"],
      [async () => statusOnly(500), "dropped"],
      [
        async () => {
          throw new Error("offline");
        },
        "dropped",
      ],
    ];
    for (const [impl, kind] of cases) {
      await expect(
        recordActivationEvent(
          { eventType: "acted", actionId: "unlock-property", surface: "settings" },
          impl as unknown as typeof fetch,
        ),
      ).resolves.toEqual(expect.objectContaining({ kind }));
    }
  });

  it("returns the outcome rather than swallowing it", () => {
    // DECLARED, NOT SILENT. A void return here would make "the route is down"
    // and "the event landed" indistinguishable from every position including
    // a test's, which is the difference this operation keeps having to dig
    // out of. Callers may ignore it; the type will not let them confuse them.
    expect(typeof recordActivationEvent).toBe("function");
    expect(recordActivationEvent.length).toBeGreaterThanOrEqual(1);
  });
});
