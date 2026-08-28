import { describe, expect, it } from "vitest";
import {
  canActOn,
  canInvite,
  isLastOwner,
  joinedOwnerCount,
  parseRoster,
  seatCounts,
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
