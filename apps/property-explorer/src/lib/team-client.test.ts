import { describe, expect, it, vi } from "vitest";
import {
  canActOn,
  canInvite,
  isLastOwner,
  joinedOwnerCount,
  parseRoster,
  seatCounts,
  sendTeamInvite,
  TEAM_INVITE_NOT_BUILT_MESSAGE,
  TEAM_INVITE_PATH,
  type TeamRoster,
} from "./teamClient";

// SEAT ARITHMETIC GATES PAID CAPACITY, so it is pinned rather than trusted.
// The failure this file exists to prevent is over-allocation: counting only
// accepted members, so an account with outstanding invitations invites past
// what it bought.

const roster = (over: Partial<TeamRoster> = {}): TeamRoster => ({
  members: [],
  seatsPurchased: 12,
  viewerRole: "owner",
  viewerEmail: "you@firm.com",
  ...over,
});

const m = (
  email: string,
  role: "owner" | "member",
  status: "joined" | "invited" = "joined",
) => ({ email, role, status, at: null });

describe("parseRoster — a guessed role is worse than a missing row", () => {
  it("reads a well-formed payload", () => {
    const r = parseRoster({
      members: [{ email: "a@x.com", role: "owner", status: "joined", at: "2026-03-04" }],
      seatsPurchased: 12,
      viewerEmail: "a@x.com",
    });
    expect(r?.members).toHaveLength(1);
    expect(r?.viewerRole).toBe("owner");
  });

  it("DROPS a row with an unresolvable role rather than defaulting it", () => {
    // Roles gate billing and invitations. A member silently defaulted to
    // "member" is a fabricated permission claim.
    const r = parseRoster({
      members: [
        { email: "a@x.com", role: "owner", status: "joined" },
        { email: "b@x.com", role: "administrator", status: "joined" },
        { email: "", role: "member", status: "joined" },
      ],
      seatsPurchased: 3,
    });
    expect(r?.members.map((x) => x.email)).toEqual(["a@x.com"]);
  });

  it("leaves seatsPurchased NULL when absent — not zero", () => {
    // Zero seats is a fact. Unknown seats is not, and the two must not merge.
    const r = parseRoster({ members: [] });
    expect(r?.seatsPurchased).toBeNull();
  });

  it("refuses a payload that is not a roster", () => {
    expect(parseRoster(null)).toBeNull();
    expect(parseRoster({})).toBeNull();
    expect(parseRoster({ members: "nope" })).toBeNull();
  });
});

describe("seatCounts — an invitation holds a seat", () => {
  it("counts invited AND accepted against the purchase", () => {
    // THE OVER-ALLOCATION BUG, pinned. Counting only accepted would report 3
    // used and invite past the purchase.
    const c = seatCounts(
      roster({
        members: [
          m("a@x.com", "owner"),
          m("b@x.com", "member"),
          m("c@x.com", "member"),
          m("d@x.com", "member", "invited"),
        ],
      }),
    );
    expect(c.accepted).toBe(3);
    expect(c.invited).toBe(1);
    expect(c.used).toBe(4);
    expect(c.remaining).toBe(8);
  });

  it("remaining is NULL when the purchase is unknown, never a number", () => {
    const c = seatCounts(roster({ seatsPurchased: null, members: [m("a@x.com", "owner")] }));
    expect(c.remaining).toBeNull();
    expect(c.used).toBe(1);
  });
});

describe("canInvite — refuses rather than over-allocating", () => {
  it("allows an owner with seats left", () => {
    const r = roster({ members: [m("a@x.com", "owner")] });
    expect(canInvite(seatCounts(r), "owner")).toBe(true);
  });

  it("REFUSES at capacity", () => {
    const r = roster({
      seatsPurchased: 2,
      members: [m("a@x.com", "owner"), m("b@x.com", "member", "invited")],
    });
    expect(seatCounts(r).remaining).toBe(0);
    expect(canInvite(seatCounts(r), "owner")).toBe(false);
  });

  it("REFUSES when the seat count is unknown — absence is not permission", () => {
    const r = roster({ seatsPurchased: null, members: [m("a@x.com", "owner")] });
    expect(canInvite(seatCounts(r), "owner")).toBe(false);
  });

  it("refuses a member regardless of seats", () => {
    const r = roster({ members: [m("a@x.com", "owner")] });
    expect(canInvite(seatCounts(r), "member")).toBe(false);
    expect(canInvite(seatCounts(r), null)).toBe(false);
  });
});

describe("last owner — the account must never be orphaned", () => {
  it("counts only JOINED owners; an invited owner cannot act yet", () => {
    const r = roster({
      members: [m("a@x.com", "owner"), m("b@x.com", "owner", "invited")],
    });
    expect(joinedOwnerCount(r)).toBe(1);
    expect(isLastOwner(r, r.members[0])).toBe(true);
  });

  it("is not the last owner when a second has joined", () => {
    const r = roster({ members: [m("a@x.com", "owner"), m("b@x.com", "owner")] });
    expect(isLastOwner(r, r.members[0])).toBe(false);
  });
});

describe("canActOn — you cannot remove yourself or the last owner", () => {
  const r = roster({
    members: [m("you@firm.com", "owner"), m("b@firm.com", "owner"), m("c@firm.com", "member")],
  });

  it("an owner may act on another member", () => {
    expect(canActOn(r, r.members[2], "owner", "you@firm.com")).toBe(true);
  });

  it("never on yourself", () => {
    expect(canActOn(r, r.members[0], "owner", "you@firm.com")).toBe(false);
  });

  it("never on the last owner", () => {
    const solo = roster({ members: [m("solo@firm.com", "owner")] });
    expect(canActOn(solo, solo.members[0], "owner", "other@firm.com")).toBe(false);
  });

  it("a member may act on nobody", () => {
    expect(canActOn(r, r.members[2], "member", "c@firm.com")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P-130 — sendTeamInvite, the write half. Same "outcomes must never merge"
// discipline portal-client.test.ts pins for startBillingPortal: sign-in,
// blocked and not-built each say something different from a genuine
// server-side refusal, and none of them may collapse into "error".
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function recordingFetch(res: Response | (() => Response)) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return typeof res === "function" ? res() : res;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("sendTeamInvite — what goes on the wire", () => {
  it("posts to the allowlisted path with credentials and ONLY {email, role}", async () => {
    const { impl, calls } = recordingFetch(
      jsonResponse(201, { email: "new@firm.com", role: "member", status: "invited" }),
    );
    await sendTeamInvite("new@firm.com", "member", impl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(TEAM_INVITE_PATH);
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.credentials).toBe("include");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      email: "new@firm.com",
      role: "member",
    });
  });

  it("carries the role the caller chose, owner included", async () => {
    const { impl, calls } = recordingFetch(jsonResponse(201, {}));
    await sendTeamInvite("co-owner@firm.com", "owner", impl);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      email: "co-owner@firm.com",
      role: "owner",
    });
  });
});

describe("sendTeamInvite — the outcomes must never merge", () => {
  it("201 is sent", async () => {
    const { impl } = recordingFetch(
      jsonResponse(201, { email: "a@x.com", role: "member", status: "invited" }),
    );
    expect(await sendTeamInvite("a@x.com", "member", impl)).toEqual({ kind: "sent" });
  });

  it("400 invalid_email is its OWN outcome, not a generic error", async () => {
    const { impl } = recordingFetch(jsonResponse(400, { error: "invalid_email" }));
    const out = await sendTeamInvite("not-an-email", "member", impl);
    expect(out.kind).toBe("invalid-email");
  });

  it("400 invalid_role is its OWN outcome, not a generic error", async () => {
    const { impl } = recordingFetch(jsonResponse(400, { error: "invalid_role" }));
    const out = await sendTeamInvite("a@x.com", "member", impl);
    expect(out.kind).toBe("invalid-role");
  });

  it("an UNNAMED 400 is a generic error, never fabricated as one of the two named ones", async () => {
    const { impl } = recordingFetch(jsonResponse(400, { error: "seat_limit_reached" }));
    const out = await sendTeamInvite("a@x.com", "member", impl);
    expect(out.kind).toBe("error");
    expect(out.kind === "error" && out.message).toBe("seat_limit_reached");
  });

  it("401 is sign-in, never read as an invalid email", async () => {
    const { impl } = recordingFetch(jsonResponse(401, { error: "authentication_required" }));
    expect((await sendTeamInvite("a@x.com", "member", impl)).kind).toBe("sign-in");
  });

  it("403 is blocked — OUR proxy refusing OUR path, never a user fact", async () => {
    // Reachable, not hypothetical: api/spine-deep.ts returns exactly 403 for
    // any path failing isDeepPathAllowed, the same failure mode the P-130
    // allowlist entry in deep-allowlist.ts exists to close.
    const { impl } = recordingFetch(jsonResponse(403, {}));
    expect((await sendTeamInvite("a@x.com", "member", impl)).kind).toBe("blocked");
  });

  it("404 and 501 are not-built, carrying the constant message", async () => {
    for (const status of [404, 501]) {
      const { impl } = recordingFetch(jsonResponse(status, {}));
      const out = await sendTeamInvite("a@x.com", "member", impl);
      expect(out.kind).toBe("not-built");
      expect(out.kind === "not-built" && out.message).toBe(TEAM_INVITE_NOT_BUILT_MESSAGE);
    }
  });

  it("500 is an error carrying the server's message", async () => {
    const { impl } = recordingFetch(jsonResponse(500, { error: "internal", message: "roster write failed" }));
    const out = await sendTeamInvite("a@x.com", "member", impl);
    expect(out.kind).toBe("error");
    expect(out.kind === "error" && out.message).toBe("roster write failed");
  });

  it("a transport failure is an error, never a silent nothing", async () => {
    const impl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect((await sendTeamInvite("a@x.com", "member", impl)).kind).toBe("error");
  });

  it("an unreadable 201 body is still sent — the status decides, not the body", async () => {
    const impl = vi.fn(
      async () =>
        new Response("not json", { status: 201, headers: { "Content-Type": "text/plain" } }),
    ) as unknown as typeof fetch;
    expect((await sendTeamInvite("a@x.com", "member", impl)).kind).toBe("sent");
  });
});
