// P-98 — the next-action ladder.
//
// THE FIRST DESCRIBE IS THE ACCEPTANCE TEST and it is written as the dispatch
// demanded: the null case first. A ladder that cannot return nothing is an ad
// slot, so the thing proven before anything else is that a real, fully-read,
// perfectly-ordinary account gets NOTHING on all four contexts.
//
// EVERY CHECK BELOW IS VERIFIED BY VIOLATION IN BOTH DIRECTIONS, and the
// violation is always ONE MUTATED FIELD of the SAME state object. That is the
// difference between proving which predicate is load-bearing and merely
// asserting the negative of the positive with an unrelated fixture: if the
// null in `quietAccount()` came from the function being a stub, flipping one
// field would not produce an action, and every "violation direction" test
// below would fail.

import { describe, expect, it } from "vitest";
import {
  EXPIRING_UNLOCK_WINDOW_DAYS,
  FREE_MESSAGES_NEARLY_EXHAUSTED_AT,
  NEXT_ACTION_IDS,
  daysUntil,
  nextAction,
  soonestExpiringUnlock,
  type AccountLadderState,
  type AccountUnlock,
  type NextActionContext,
} from "./nextAction";

const NOW = new Date("2026-08-31T12:00:00.000Z");
const CONTEXTS: NextActionContext[] = ["account", "plan", "connections", "team"];

/** An ISO instant `days` from NOW. Fractions allowed. */
function inDays(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

/**
 * An unlock `days` from NOW. `days === null` builds an UNBOUNDED unlock —
 * the contract's nullable expiry, which means "active, no end date" and must
 * never be read as expired or as expiring.
 */
function unlock(days: number | null, parcel = "48021:34137"): AccountUnlock {
  return { parcelNodeId: parcel, expiresAt: days === null ? null : inDays(days) };
}

/** A clean unlock read. `asOf` is the SERVER's clock and lives inside it. */
function unlocksRead(unlocks: AccountUnlock[], asOf: Date = NOW) {
  return { kind: "read", asOf, unlocks } as const;
}

/**
 * A REAL ACCOUNT WITH NOTHING TO DO, and — this is the load-bearing part —
 * every single input READ. Signed in, Claude connected, paid annual Studio,
 * free-message count known, unlock list read and empty, seats read and full.
 *
 * Nothing here is null because we did not look. That is what makes the empty
 * rail an honest state rather than an artefact of missing wiring.
 */
function quietAccount(overrides: Partial<AccountLadderState> = {}): AccountLadderState {
  return {
    authenticated: true,
    claude: { kind: "read", connected: true },
    entitlement: {
      kind: "read",
      tier: "paid",
      subscriptionTier: "studio",
      billingInterval: "annual",
      freeMessagesLeft: 3,
    },
    unlocks: unlocksRead([]),
    seats: { kind: "read", seatsRemaining: 0, viewerIsOwner: true },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("THE FIVE ACTION IDS ARE A SERVER CONTRACT", () => {
  // WHY THIS IS THE MOST LOAD-BEARING TEST IN THE FILE.
  //
  // POST api/property-explorer/v1/activation-events refuses with 400 on any
  // action_id outside these five, and a failed activation event is dropped
  // silently by design (instrumentation must never block a user). So a
  // renamed rung does not error, does not warn, and does not show up on any
  // surface — it just loses every event for that rung, forever. Nothing else
  // in this codebase would catch it. Literal strings on purpose: deriving
  // them from the module under test would make this pass on any rename.
  const SERVER_ACTION_IDS = [
    "connect_claude",
    "unlock_expiring",
    "property_unlock",
    "annual_upgrade",
    "team_invite",
  ];

  it("the exported list is exactly the set the server accepts, in one piece", () => {
    expect([...NEXT_ACTION_IDS]).toEqual(SERVER_ACTION_IDS);
  });

  it("every rung PRODUCES one of them — no orphan id, no orphan rung", () => {
    // The list agreeing with the server is not enough on its own: a rung
    // could still emit a string that is in the type but not the one meant for
    // it. This walks the ladder and collects what it actually returns.
    const produced = [
      nextAction("account", quietAccount({ claude: { kind: "read", connected: false } })),
      nextAction("plan", quietAccount({ unlocks: unlocksRead([unlock(2)]) })),
      nextAction(
        "plan",
        quietAccount({
          entitlement: {
            kind: "read",
            tier: "free",
            subscriptionTier: null,
            billingInterval: null,
            freeMessagesLeft: 0,
          },
        }),
      ),
      nextAction(
        "plan",
        quietAccount({
          entitlement: {
            kind: "read",
            tier: "paid",
            subscriptionTier: "solo",
            billingInterval: "monthly",
            freeMessagesLeft: 3,
          },
        }),
      ),
      nextAction(
        "team",
        quietAccount({
          entitlement: {
            kind: "read",
            tier: "paid",
            subscriptionTier: "team",
            billingInterval: "annual",
            freeMessagesLeft: 3,
          },
          seats: { kind: "read", seatsRemaining: 2, viewerIsOwner: true },
        }),
      ),
    ].map((a) => a?.id ?? null);

    // One id per rung, in ladder order, and none of them null.
    expect(produced).toEqual(SERVER_ACTION_IDS);
    expect([...new Set(produced)]).toHaveLength(SERVER_ACTION_IDS.length);
  });
});

describe("THE LADDER CAN RETURN NOTHING (the acceptance test)", () => {
  it("a fully-read account with nothing to do gets nothing, on every context", () => {
    const state = quietAccount();
    for (const context of CONTEXTS) {
      expect(nextAction(context, state)).toBeNull();
    }
  });

  it("VIOLATION DIRECTION — the same state with ONE field flipped is not empty", () => {
    // If the null above were vacuous (a stub, an unreachable ladder, an input
    // shape nothing can satisfy), none of these could fire. Each mutates
    // exactly one field of quietAccount().
    expect(
      nextAction("account", quietAccount({ claude: { kind: "read", connected: false } }))?.id,
    ).toBe("connect_claude");

    expect(
      nextAction(
        "plan",
        quietAccount({ unlocks: unlocksRead([unlock(3)]) }),
      )?.id,
    ).toBe("unlock_expiring");

    expect(
      nextAction(
        "team",
        quietAccount({
          entitlement: {
            kind: "read",
            tier: "paid",
            subscriptionTier: "team",
            billingInterval: "annual",
            freeMessagesLeft: 3,
          },
          seats: { kind: "read", seatsRemaining: 2, viewerIsOwner: true },
        }),
      )?.id,
    ).toBe("team_invite");
  });
});

describe("ONE ACTION PER CONTEXT, never a list", () => {
  /** Satisfies the expiring-unlock rung AND the annual rung simultaneously. */
  const twoRungs = quietAccount({
    unlocks: unlocksRead([unlock(3)]),
    entitlement: {
      kind: "read",
      tier: "paid",
      subscriptionTier: "solo",
      billingInterval: "monthly",
      freeMessagesLeft: 3,
    },
  });

  it("a state satisfying two rungs returns the HIGHER one, not both", () => {
    const action = nextAction("plan", twoRungs);
    expect(action).not.toBeNull();
    expect(Array.isArray(action)).toBe(false);
    expect(action?.id).toBe("unlock_expiring");
  });

  it("VIOLATION DIRECTION — the lower rung really was satisfied", () => {
    // Without this the test above proves nothing: "returns the higher one"
    // is indistinguishable from "the lower one never matched". Remove ONLY
    // the unlock read and the same account yields the annual action.
    const action = nextAction("plan", { ...twoRungs, unlocks: unlocksRead([]) });
    expect(action?.id).toBe("annual_upgrade");
  });

  it("three satisfiable plan rungs still return exactly one", () => {
    const three = quietAccount({
      unlocks: unlocksRead([unlock(1)]),
      entitlement: {
        kind: "read",
        tier: "free",
        subscriptionTier: null,
        billingInterval: null,
        freeMessagesLeft: 0,
      },
    });
    expect(nextAction("plan", three)?.id).toBe("unlock_expiring");
    // ...and the middle rung is genuinely live underneath it.
    expect(
      nextAction("plan", { ...three, unlocks: unlocksRead([]) })?.id,
    ).toBe("property_unlock");
  });
});

describe("THE TEAM GUARD — a solo user is never offered invite", () => {
  const seats = { kind: "read", seatsRemaining: 2, viewerIsOwner: true } as const;

  const withTier = (subscriptionTier: "solo" | "studio" | "team" | null, tier: "free" | "paid" = "paid") =>
    quietAccount({
      entitlement: {
        kind: "read",
        tier,
        subscriptionTier,
        billingInterval: "annual",
        freeMessagesLeft: 3,
      },
      seats,
    });

  it("solo, studio, an unknown tier and free all get NOTHING on Team", () => {
    expect(nextAction("team", withTier("solo"))).toBeNull();
    expect(nextAction("team", withTier("studio"))).toBeNull();
    expect(nextAction("team", withTier(null))).toBeNull();
    expect(nextAction("team", withTier(null, "free"))).toBeNull();
  });

  it("VIOLATION DIRECTION — the TIER is what refused, not the seat arithmetic", () => {
    // Identical seats. Only the tier moves. If the guard were absent, the
    // solo case above would already have returned invite.
    expect(nextAction("team", withTier("team"))?.id).toBe("team_invite");
  });

  it("a team account with no seats left, or a non-owner, still gets nothing", () => {
    const team = withTier("team");
    expect(
      nextAction("team", {
        ...team,
        seats: { kind: "read", seatsRemaining: 0, viewerIsOwner: true },
      }),
    ).toBeNull();
    expect(
      nextAction("team", {
        ...team,
        seats: { kind: "read", seatsRemaining: 2, viewerIsOwner: false },
      }),
    ).toBeNull();
  });

  it("an UNREAD seat count is not permission", () => {
    // teamClient.canInvite refuses on an unknown seat count for the same
    // reason: unknown is the absence of permission, not permission.
    expect(nextAction("team", { ...withTier("team"), seats: { kind: "unread" } })).toBeNull();
  });
});

describe("nothing is proposed on unread state", () => {
  it("a signed-out account gets nothing, however loud the rest of the state is", () => {
    const loud = quietAccount({
      authenticated: false,
      claude: { kind: "read", connected: false },
      unlocks: unlocksRead([unlock(1)]),
      entitlement: {
        kind: "read",
        tier: "paid",
        subscriptionTier: "team",
        billingInterval: "monthly",
        freeMessagesLeft: 0,
      },
      seats: { kind: "read", seatsRemaining: 3, viewerIsOwner: true },
    });
    for (const context of CONTEXTS) {
      expect(nextAction(context, loud)).toBeNull();
    }
    // VIOLATION DIRECTION: the only thing refusing was the session.
    expect(nextAction("plan", { ...loud, authenticated: true })?.id).toBe(
      "unlock_expiring",
    );
  });

  it("an unread Claude connection proposes nothing, where an unconnected one proposes Connect", () => {
    expect(nextAction("account", quietAccount({ claude: { kind: "unread" } }))).toBeNull();
    expect(
      nextAction("connections", quietAccount({ claude: { kind: "unread" } })),
    ).toBeNull();
    // VIOLATION DIRECTION.
    expect(
      nextAction("connections", quietAccount({ claude: { kind: "read", connected: false } }))?.id,
    ).toBe("connect_claude");
  });

  it("an unread entitlement suppresses every plan and team rung", () => {
    const unread = quietAccount({
      entitlement: { kind: "unread" },
      seats: { kind: "read", seatsRemaining: 4, viewerIsOwner: true },
    });
    expect(nextAction("plan", unread)).toBeNull();
    expect(nextAction("team", unread)).toBeNull();
  });
});

describe("a 404 is NOT 'you have nothing to do'", () => {
  // The distinction that shipped a dead card on 2026-08-31 when it was
  // missing. `not-built` (route not deployed) and `blocked` (our own proxy
  // refused the path) are separate kinds from an empty read, and the ladder
  // reads the KIND rather than the length of a list.
  const expiring: AccountUnlock[] = [unlock(2)];

  it("the same account yields the unlock when READ and nothing on 404, 403 or 500", () => {
    expect(nextAction("plan", quietAccount({ unlocks: unlocksRead(expiring) }))?.id).toBe(
      "unlock_expiring",
    );
    for (const kind of ["not-built", "blocked", "error", "unread"] as const) {
      expect(nextAction("plan", quietAccount({ unlocks: { kind } }))).toBeNull();
    }
  });

  it("an EMPTY read is a different input from every failure kind", () => {
    // The route fails LOUD — 401 signed out, 500 unlocks_unavailable, never
    // an empty list to mean failure — so `read` with [] genuinely means
    // "nothing unlocked" and is the only one of these that does. The type is
    // what enforces that: `read` is the only arm carrying a list at all, so a
    // failure cannot be handed to a consumer as an empty one.
    const empty = quietAccount({ unlocks: unlocksRead([]) });
    expect(empty.unlocks).toHaveProperty("unlocks");
    for (const kind of ["not-built", "blocked", "error", "unread"] as const) {
      expect(quietAccount({ unlocks: { kind } }).unlocks).not.toHaveProperty("unlocks");
    }
  });

  it("an unreadable unlock list does not block a LOWER plan rung", () => {
    // Not knowing about unlocks is not a reason to go silent about the rest
    // of the account. The rung is skipped; the ladder continues.
    const freeAndSpent = quietAccount({
      unlocks: { kind: "not-built" },
      entitlement: {
        kind: "read",
        tier: "free",
        subscriptionTier: null,
        billingInterval: null,
        freeMessagesLeft: 0,
      },
    });
    expect(nextAction("plan", freeAndSpent)?.id).toBe("property_unlock");
  });
});

describe("the expiring-unlock rung", () => {
  const withUnlocks = (u: AccountUnlock[], asOf: Date = NOW) =>
    quietAccount({ unlocks: unlocksRead(u, asOf) });

  it("fires inside the window and refuses outside it", () => {
    expect(nextAction("plan", withUnlocks([unlock(EXPIRING_UNLOCK_WINDOW_DAYS - 0.1)]))?.id).toBe(
      "unlock_expiring",
    );
    expect(nextAction("plan", withUnlocks([unlock(EXPIRING_UNLOCK_WINDOW_DAYS + 0.1)]))).toBeNull();
  });

  it("an ALREADY LAPSED unlock is not an expiring one", () => {
    // "Extend" is the wrong verb for something already gone, and a negative
    // day count would render as "lapses today".
    expect(nextAction("plan", withUnlocks([unlock(-0.5)]))).toBeNull();
    // VIOLATION DIRECTION: the same unlock, still alive, does fire.
    expect(nextAction("plan", withUnlocks([unlock(0.5)]))?.id).toBe("unlock_expiring");
  });

  it("an unparseable expiry is refused, never treated as zero days", () => {
    const bad: AccountUnlock = { parcelNodeId: "48021:1", expiresAt: "soon" };
    expect(nextAction("plan", withUnlocks([bad]))).toBeNull();
    expect(daysUntil("soon", NOW)).toBeNull();
  });

  it("picks the soonest of several, and never names the property", () => {
    const action = nextAction(
      "plan",
      withUnlocks([unlock(5, "48021:2"), unlock(1, "48021:3"), unlock(4, "48021:4")]),
    );
    expect(action?.id).toBe("unlock_expiring");
    expect(action?.detail).toBe("About a day left on it.");
    // The route's shape carries no human label for the parcel, so the copy
    // says "the property you unlocked". A raw 48021:34137 in a sentence is
    // not a label, it is a leak — and synthesising one would be worse.
    expect(action?.headline).not.toContain("48021");
    expect(action?.headline).toContain("the property you unlocked");
    expect(soonestExpiringUnlock([unlock(5, "a"), unlock(1, "b")], NOW)?.parcelNodeId).toBe(
      "b",
    );
  });

  it("A NULL EXPIRY IS UNBOUNDED, not expired and not expiring", () => {
    // The contract allows expiresAt: null and it means an active unlock with
    // no end date. Reading it as a zero would produce "less than a day left"
    // on an unlock that never lapses — a lapse warning invented out of an
    // absence, which is the worst thing this rung could do.
    expect(nextAction("plan", withUnlocks([unlock(null)]))).toBeNull();
    expect(soonestExpiringUnlock([unlock(null)], NOW)).toBeNull();
    // VIOLATION DIRECTION — the same row with a real near expiry does fire.
    expect(nextAction("plan", withUnlocks([unlock(2)]))?.id).toBe("unlock_expiring");
    // ...and an unbounded unlock does not mask a bounded one beside it.
    expect(
      nextAction("plan", withUnlocks([unlock(null, "48021:1"), unlock(2, "48021:2")]))?.id,
    ).toBe("unlock_expiring");
  });

  it("the CLOCK is the server's asOf, not the caller's", () => {
    // Same list, two different server clocks. If this module reached for its
    // own "now", the answer would not move with asOf and one of these would
    // be wrong. The expiries and the clock arrive in the same response
    // precisely so they cannot disagree.
    const expiry = [unlock(3)];
    expect(nextAction("plan", withUnlocks(expiry, NOW))?.id).toBe("unlock_expiring");
    // A server clock 30 days later: the same unlock has long since lapsed.
    const later = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(nextAction("plan", withUnlocks(expiry, later))).toBeNull();
    // A server clock 30 days earlier: the same unlock is outside the window.
    const earlier = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(nextAction("plan", withUnlocks(expiry, earlier))).toBeNull();
  });

  it("says a DURATION, never a calendar day, and rounds down", () => {
    // An expiry is a UTC instant and this module does not know the viewer's
    // timezone, so "today" and "tomorrow" are claims about a fact nobody
    // read. The first draft said both and this test is what caught it.
    expect(nextAction("plan", withUnlocks([unlock(0.2)]))?.detail).toBe(
      "Less than a day left on it.",
    );
    expect(nextAction("plan", withUnlocks([unlock(1)]))?.detail).toBe(
      "About a day left on it.",
    );
    // 3.5 remaining reads as 3, never 4: understating is the safe direction.
    expect(nextAction("plan", withUnlocks([unlock(3.5)]))?.detail).toBe(
      "About 3 days left on it.",
    );
    for (const a of [unlock(0.2), unlock(1), unlock(3.5), unlock(6.9)]) {
      expect(nextAction("plan", withUnlocks([a]))?.detail).not.toMatch(
        /\b(today|tomorrow)\b/i,
      );
    }
  });

  it("soonestExpiringUnlock is stable across a tie", () => {
    const a = unlock(2, "48021:9");
    const b = unlock(2, "48021:1");
    expect(soonestExpiringUnlock([a, b], NOW)?.parcelNodeId).toBe("48021:1");
    expect(soonestExpiringUnlock([b, a], NOW)?.parcelNodeId).toBe("48021:1");
  });
});

describe("the property-unlock rung", () => {
  const free = (freeMessagesLeft: number | null) =>
    quietAccount({
      entitlement: {
        kind: "read",
        tier: "free",
        subscriptionTier: null,
        billingInterval: null,
        freeMessagesLeft,
      },
    });

  it("fires only when the free messages are NEARLY exhausted", () => {
    expect(nextAction("plan", free(FREE_MESSAGES_NEARLY_EXHAUSTED_AT + 1))).toBeNull();
    expect(nextAction("plan", free(FREE_MESSAGES_NEARLY_EXHAUSTED_AT))?.id).toBe(
      "property_unlock",
    );
    expect(nextAction("plan", free(0))?.id).toBe("property_unlock");
  });

  it("an UNREAD message count is not a spent one", () => {
    // null here means the wire carried no counter, not that zero remain.
    expect(nextAction("plan", free(null))).toBeNull();
  });

  it("a paid account is never offered the on-ramp", () => {
    expect(
      nextAction(
        "plan",
        quietAccount({
          entitlement: {
            kind: "read",
            tier: "paid",
            subscriptionTier: "solo",
            billingInterval: "annual",
            freeMessagesLeft: 0,
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("the annual rung", () => {
  const paid = (
    subscriptionTier: "solo" | "studio" | "team",
    billingInterval: "monthly" | "annual" | null,
  ) =>
    quietAccount({
      entitlement: {
        kind: "read",
        tier: "paid",
        subscriptionTier,
        billingInterval,
        freeMessagesLeft: 3,
      },
    });

  it("fires for monthly solo and monthly studio", () => {
    expect(nextAction("plan", paid("solo", "monthly"))?.id).toBe("annual_upgrade");
    expect(nextAction("plan", paid("studio", "monthly"))?.id).toBe("annual_upgrade");
  });

  it("does NOT fire for an account already on annual", () => {
    expect(nextAction("plan", paid("solo", "annual"))).toBeNull();
  });

  it("does NOT fire when the interval is UNKNOWN — and unknown is now a live state, not a starved one", () => {
    // This pin used to read "the STARVED state today", because no client read
    // a billing interval at all. P-98b's account-level read landed and the
    // rung is now fed — which makes this assertion MORE load-bearing, not
    // less. Null no longer means "we never look"; it means the server told us
    // nothing, and nothing backfills the column, so a real test-mode
    // subscriber reads null. Inferring monthly from that would push an upgrade
    // at somebody already on annual.
    expect(nextAction("plan", paid("solo", null))).toBeNull();
    expect(nextAction("plan", paid("studio", null))).toBeNull();
  });

  it("does NOT fire for Team, whose annual plan is seat-capped", () => {
    expect(nextAction("plan", paid("team", "monthly"))).toBeNull();
  });
});

describe("capability-first copy law", () => {
  /** Every action the ladder can produce, gathered from live states. */
  const all = [
    nextAction("account", quietAccount({ claude: { kind: "read", connected: false } })),
    nextAction("plan", quietAccount({ unlocks: unlocksRead([unlock(2)]) })),
    nextAction(
      "plan",
      quietAccount({
        entitlement: {
          kind: "read",
          tier: "free",
          subscriptionTier: null,
          billingInterval: null,
          freeMessagesLeft: 0,
        },
      }),
    ),
    nextAction(
      "plan",
      quietAccount({
        entitlement: {
          kind: "read",
          tier: "paid",
          subscriptionTier: "solo",
          billingInterval: "monthly",
          freeMessagesLeft: 3,
        },
      }),
    ),
    nextAction(
      "team",
      quietAccount({
        entitlement: {
          kind: "read",
          tier: "paid",
          subscriptionTier: "team",
          billingInterval: "annual",
          freeMessagesLeft: 3,
        },
        seats: { kind: "read", seatsRemaining: 2, viewerIsOwner: true },
      }),
    ),
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  it("gathered every rung, so this law is not tested on an empty set", () => {
    expect(all).toHaveLength(5);
  });

  it("no action names a price", () => {
    for (const a of all) {
      const text = `${a.headline} ${a.detail ?? ""} ${a.ctaLabel}`;
      expect(text).not.toMatch(/[$£€]/);
      expect(text).not.toMatch(/\b\d+\s*(?:\/\s*)?(?:mo|month|yr|year)\b/i);
    }
  });

  it("no action names a plan", () => {
    for (const a of all) {
      const text = `${a.headline} ${a.detail ?? ""} ${a.ctaLabel}`;
      expect(text).not.toMatch(/\b(solo|studio|team|pro|premium|upgrade)\b/i);
    }
  });

  it("every action carries a control label and its own context", () => {
    for (const a of all) {
      expect(a.ctaLabel.length).toBeGreaterThan(0);
      expect(a.headline.length).toBeGreaterThan(0);
      expect(CONTEXTS).toContain(a.context);
    }
  });
});
