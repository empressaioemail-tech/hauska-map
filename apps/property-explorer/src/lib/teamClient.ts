// TEAM ROSTER — the read, and the seat arithmetic.
//
// THE SERVER HALF DOES NOT EXIST YET. There is no members table, no
// invitations table, no seat read, and no /api/team/members endpoint anywhere
// in this repo. The design drop says so in its own provenance table
// ("TO BUILD"), and a grep confirms it.
//
// So this client calls the endpoint the server WILL expose and reports what it
// actually got. Today that is a 404, which resolves to `not-built`, and the UI
// renders the design's own "Not read" state. Nothing here fabricates a roster,
// and there are no fixture rows in shipped code — when the endpoint lands, the
// same UI lights up with no change.
//
// THE DISTINCTION THAT MATTERS, and the reason `not-built` is its own outcome:
// an EMPTY roster and an UNREADABLE roster are different facts. Empty means
// nobody is on this account. Unreadable means we do not know how many are. The
// design is explicit that a failed read "must never fall through to an empty
// list", so the two can never collapse into one state here either.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";

export type TeamRole = "owner" | "member";
export type TeamMemberStatus = "joined" | "invited";

export interface TeamMember {
  /** Identity as the server records it. Never synthesised client-side. */
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  /** ISO date. Join date for joined, sent date for invited. */
  at: string | null;
}

export interface TeamRoster {
  members: TeamMember[];
  /** Seats bought at checkout. Null when the server did not report one. */
  seatsPurchased: number | null;
  /** The viewer's own role, from their row. Null when it cannot be resolved. */
  viewerRole: TeamRole | null;
  viewerEmail: string | null;
}

export type TeamOutcome =
  | { kind: "ready"; roster: TeamRoster }
  /** No team service deployed yet. NOT an empty team. */
  | { kind: "not-built" }
  | { kind: "sign-in" }
  | { kind: "error"; message: string };

const TEAM_PATH = "api/property-explorer/v1/team/members";

function asRole(v: unknown): TeamRole | null {
  return v === "owner" || v === "member" ? v : null;
}

/**
 * Parse a roster payload. Any row whose role or email cannot be resolved is
 * DROPPED rather than defaulted — a member listed with a guessed role is worse
 * than a member not listed, because roles gate billing and invitations.
 */
export function parseRoster(body: unknown): TeamRoster | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.members)) return null;

  const members: TeamMember[] = [];
  for (const raw of b.members) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const email = typeof r.email === "string" ? r.email.trim() : "";
    const role = asRole(r.role);
    if (!email || !role) continue;
    members.push({
      email,
      role,
      status: r.status === "invited" ? "invited" : "joined",
      at: typeof r.at === "string" ? r.at : null,
    });
  }

  const seats = typeof b.seatsPurchased === "number" ? b.seatsPurchased : null;
  const viewerEmail = typeof b.viewerEmail === "string" ? b.viewerEmail : null;
  const viewerRow = viewerEmail
    ? members.find((m) => m.email === viewerEmail) ?? null
    : null;

  return {
    members,
    seatsPurchased: seats,
    viewerRole: asRole(b.viewerRole) ?? viewerRow?.role ?? null,
    viewerEmail,
  };
}

export async function fetchTeamRoster(
  fetchImpl: typeof fetch = fetch,
): Promise<TeamOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${CORTEX_DEEP_PROXY_BASE}/${TEAM_PATH}`, {
      credentials: "include",
    });
  } catch {
    return { kind: "error", message: "Could not reach the member service." };
  }
  if (res.status === 401) return { kind: "sign-in" };
  // 404 is the CURRENT state of the world: the endpoint is not deployed.
  if (res.status === 404 || res.status === 501) return { kind: "not-built" };
  if (!res.ok) {
    return { kind: "error", message: `Member service returned ${res.status}.` };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: "error", message: "Member service returned unreadable data." };
  }
  const roster = parseRoster(body);
  if (!roster) {
    return { kind: "error", message: "Member service returned an unknown shape." };
  }
  return { kind: "ready", roster };
}

// ---------------------------------------------------------------------------
// Seat arithmetic. Pure, because this repo proves rules through helpers rather
// than a DOM harness, and because getting it wrong over-allocates paid seats.
// ---------------------------------------------------------------------------

export interface SeatCounts {
  purchased: number | null;
  accepted: number;
  invited: number;
  used: number;
  /** Null when purchased is unknown — NOT zero. */
  remaining: number | null;
}

/**
 * AN INVITATION HOLDS A SEAT. It is consumed from the moment it is sent, not
 * when it is accepted, so an invited person is counted before they arrive.
 * Counting only accepted members is how an account over-allocates.
 */
export function seatCounts(roster: TeamRoster): SeatCounts {
  const accepted = roster.members.filter((m) => m.status === "joined").length;
  const invited = roster.members.filter((m) => m.status === "invited").length;
  const used = accepted + invited;
  return {
    purchased: roster.seatsPurchased,
    accepted,
    invited,
    used,
    remaining:
      roster.seatsPurchased === null ? null : roster.seatsPurchased - used,
  };
}

/**
 * May this account send another invitation?
 *
 * REFUSES when seats are unknown. The design's rule is that at capacity the
 * control refuses and says why rather than accepting and over-allocating; an
 * unknown seat count is not permission, it is the absence of permission.
 */
export function canInvite(counts: SeatCounts, viewerRole: TeamRole | null): boolean {
  if (viewerRole !== "owner") return false;
  if (counts.remaining === null) return false;
  return counts.remaining > 0;
}

/** Owners who have actually joined. An invited owner cannot yet act. */
export function joinedOwnerCount(roster: TeamRoster): number {
  return roster.members.filter(
    (m) => m.role === "owner" && m.status === "joined",
  ).length;
}

/**
 * The last owner is not removable and not demotable, or the account is
 * orphaned with nobody able to bill or invite.
 */
export function isLastOwner(roster: TeamRoster, member: TeamMember): boolean {
  return (
    member.role === "owner" &&
    member.status === "joined" &&
    joinedOwnerCount(roster) === 1
  );
}

/** Whether the viewer may act on this row at all. */
export function canActOn(
  roster: TeamRoster,
  member: TeamMember,
  viewerRole: TeamRole | null,
  viewerEmail: string | null,
): boolean {
  if (viewerRole !== "owner") return false;
  if (viewerEmail && member.email === viewerEmail) return false;
  if (isLastOwner(roster, member)) return false;
  return true;
}
