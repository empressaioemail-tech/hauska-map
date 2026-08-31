// apps/property-explorer/src/lib/nextAction.ts
//
// P-98 — THE NEXT-ACTION LADDER. Pure: account state in, one action or
// NOTHING out. No React, no fetch, no DOM, no clock. Every test lives here.
//
// THE ACCEPTANCE TEST IS THAT THIS CAN RETURN NULL.
//
//   An account with nothing to do gets an empty rail. A next-action surface
//   that always finds something to sell is an ad slot, and the panel this
//   first mounts in already declares that nothing in it is a control that
//   does nothing. A reachable empty state is what makes the non-empty state
//   trustworthy. If the ladder cannot return zero for a plausible account,
//   it is wrong — so nextAction.test.ts opens with the null case, and the
//   null case is a real account (signed in, connected, paid annual Studio,
//   no expiring unlock), not a contrived one.
//
// ONE ACTION PER CONTEXT, NEVER A LIST. Five suggestions is a nag; one is a
// recommendation. Each context returns at most one action by CONSTRUCTION —
// a single expression of `??`-chained rungs, so "two rungs both fired" is not
// a state this function can be in.
//
// CAPABILITY FIRST. Every headline names what you GET. No price and no plan
// name appears in any string below: where an action genuinely is a purchase,
// the number lives in the checkout, because a plan is never priced in two
// places. The one duration that does appear is read from PE_PRICING rather
// than typed here, for the same reason.
//
// NOTHING IS PROPOSED ON UNREAD STATE. Every input that can be unknown is a
// discriminated union with an explicit `unread` arm, never a boolean with a
// default and never a nullable that a caller could forget. An action shown
// on guessed state is the same defect class as an unearned confidence
// number, so an unread input SUPPRESSES its rung rather than assuming the
// convenient value.
//
// WHERE THIS DELIBERATELY DISAGREES WITH aiConnectionClient. That module
// states "EVERY UNKNOWN RESOLVES TOWARD SETUP" and the Claude Sync CARD
// renders its setup panel on a 403, a 404 and a 500 alike. That is right for
// a card whose job is disclosure: showing someone how to connect costs them
// nothing. It is wrong for a rail whose job is to propose a step off read
// state. So the two surfaces resolve an unknown in OPPOSITE directions, on
// purpose, and this paragraph is why.

import { PE_PRICING } from "./pricing";

// ---------------------------------------------------------------------------
// The action
// ---------------------------------------------------------------------------

/**
 * Where the rail is asking from. These are ACCOUNT concepts, not Settings
 * concepts — any surface that knows which of the four the user is looking at
 * can ask. The component that renders the result knows nothing about
 * Settings, and neither does this file.
 */
export type NextActionContext = "account" | "plan" | "connections" | "team";

/**
 * THE FIVE ACTION IDS, AND THEY ARE A SERVER CONTRACT.
 *
 * POST api/property-explorer/v1/activation-events REFUSES with 400 on any
 * action_id outside this set. Because a failed event is dropped silently (by
 * design — instrumentation must never block a user), a wrong string here does
 * not error anywhere: it loses every event for that rung, permanently and
 * invisibly. That makes this list the one place in the ladder where a typo is
 * unrecoverable by observation, so:
 *
 *   - the list is the SOURCE and the union is derived from it, not the other
 *     way round, so the two cannot drift;
 *   - nextAction.test.ts pins all five strings literally against the server's
 *     documented set, which is the control that actually fails when a rung is
 *     renamed. There is nothing else that would.
 *
 * They map one-to-one onto ladder v1: five rungs, five ids, no orphan either
 * way. Never derived from copy — an id that moved when a headline was
 * reworded would silently split its own funnel.
 */
export const NEXT_ACTION_IDS = [
  /** Account and Connections, when Claude is not connected. */
  "connect_claude",
  /** Plan, an active unlock nearing expiry. The highest-priority rung. */
  "unlock_expiring",
  /** Plan, free account with free messages nearly exhausted. */
  "property_unlock",
  /** Plan, paid MONTHLY on solo or studio. */
  "annual_upgrade",
  /** Team, team tier with unused seats. */
  "team_invite",
] as const;

export type NextActionId = (typeof NEXT_ACTION_IDS)[number];

export interface NextAction {
  id: NextActionId;
  /** The context this was computed for. Carried so the event can say where. */
  context: NextActionContext;
  /** What you GET. Never a price, never a plan name. */
  headline: string;
  /** One supporting line, or null when the headline says it all. */
  detail: string | null;
  /** The control's label. */
  ctaLabel: string;
}

// ---------------------------------------------------------------------------
// The inputs. Every one of them can be UNREAD, and unread is a kind.
// ---------------------------------------------------------------------------

/**
 * Whether Claude is connected to this account.
 *
 * `unread` covers signed-out, our own proxy refusing the path (403), the
 * endpoint not being deployed (404), a 500 and a network failure. The rail
 * does not need to tell those apart because it treats all of them the same
 * way — it proposes nothing. The CARD does need to tell them apart and does.
 */
export type ClaudeRead =
  | { kind: "read"; connected: boolean }
  | { kind: "unread" };

export type BillingInterval = "monthly" | "annual";

export type PlanTier = "solo" | "studio" | "team";

/**
 * What the entitlement wire said about this account.
 *
 * The nullable fields inside the `read` arm are NOT laziness: the read
 * genuinely landed and the field genuinely is not on the wire.
 *
 *   billingInterval — no client read exists anywhere in this app today. The
 *     Plan tab renders "Billing interval: Not read" for exactly this reason.
 *     Until `/entitlement` carries it, this is null and the annual rung
 *     cannot fire. That is a STARVED rung, declared here rather than papered
 *     over by inferring monthly from the absence of evidence.
 *
 *   freeMessagesLeft — the free-message counters live inside the response's
 *     per-PROPERTY block, so an account-level read has none. Null suppresses
 *     the unlock rung.
 */
export type EntitlementRead =
  | {
      kind: "read";
      tier: "free" | "paid";
      subscriptionTier: PlanTier | null;
      billingInterval: BillingInterval | null;
      freeMessagesLeft: number | null;
    }
  | { kind: "unread" };

/** One active property unlock, exactly as the server reported it. */
export interface AccountUnlock {
  parcelNodeId: string;
  /**
   * ISO instant the unlock lapses, or NULL FOR AN UNBOUNDED UNLOCK.
   *
   * NULL IS NOT EXPIRED AND IT IS NOT EXPIRING. It is an active unlock with
   * no end date, and it is the single most dangerous field on this contract:
   * a nullable timestamp read as a zero would produce "less than a day left"
   * on an unlock that never lapses, which is a lapse warning invented out of
   * an absence. Every path that touches this treats null as "no expiry to
   * count", never as a date.
   */
  expiresAt: string | null;
}

/**
 * The account-wide unlock read.
 *
 * `not-built`, `blocked` and `error` are SEPARATE KINDS and none may collapse
 * into "this account has no unlocks". A 404 is "the route is not deployed", a
 * 403 is "we refused our own path", a 500 is "the server could not answer",
 * and an empty `read` is "there are none". Rendering any of the first three
 * as the fourth is how a dead card shipped to every user on 2026-08-31.
 *
 * The route fails LOUD — 401 signed out, 500 `unlocks_unavailable` on error,
 * never an empty list to mean failure — so an empty `read` genuinely means
 * nothing is unlocked and may be trusted as such.
 *
 * `asOf` IS THE CLOCK, and it lives inside the read rather than beside it.
 * The server stamps the instant it computed the list, and the expiries in
 * that list are only meaningful against it. Reading them against the browser
 * clock would be two derivations of "now" that quietly disagree — a skewed
 * or wrong client clock would move the rail's answer without moving the
 * server's. Because the clock and the data arrive together, they cannot.
 */
export type UnlocksRead =
  | { kind: "read"; asOf: Date; unlocks: AccountUnlock[] }
  /** Route not deployed (404). NOT "no unlocks". */
  | { kind: "not-built" }
  /** Our own deep proxy refused the path (403). NOT a fact about the account. */
  | { kind: "blocked" }
  /** The server answered and could not compute (500). NOT "no unlocks". */
  | { kind: "error" }
  /** Not attempted, still in flight, or signed out. */
  | { kind: "unread" };

/** Seat arithmetic, already computed by the roster client. */
export type SeatsRead =
  | { kind: "read"; seatsRemaining: number; viewerIsOwner: boolean }
  | { kind: "unread" };

export interface AccountLadderState {
  /**
   * A session was read AND is authenticated. A session that has not been read
   * yet is `false` here — the caller collapses "unknown" into "not signed in"
   * because both mean the same thing to this ladder: propose nothing.
   */
  authenticated: boolean;
  claude: ClaudeRead;
  entitlement: EntitlementRead;
  unlocks: UnlocksRead;
  seats: SeatsRead;
  // THERE IS NO `now` ON THIS STATE, deliberately. The only rung that needs a
  // clock is the expiring-unlock rung, and its clock is the `asOf` the server
  // stamped on the same response as the expiries. A second, caller-supplied
  // clock would be a second source of truth about the present moment, free to
  // disagree with the one the expiries were computed against. This module
  // never calls Date.now() and never accepts a substitute for asOf.
}

// ---------------------------------------------------------------------------
// Thresholds. Named, exported, and testable rather than inline magic.
// ---------------------------------------------------------------------------

/**
 * How close to lapsing an unlock must be before the rail raises it. An unlock
 * runs PE_PRICING.property.durationDays, so a window of a whole week is the
 * last quarter of its life and not a permanent nag from day one.
 */
export const EXPIRING_UNLOCK_WINDOW_DAYS = 7;

/**
 * "Nearly exhausted" for free messages: one or none left. Two of three left
 * is not nearly exhausted, and a rail that says so on the first message is
 * the ad slot this design refuses to be.
 */
export const FREE_MESSAGES_NEARLY_EXHAUSTED_AT = 1;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Fractional days from `now` until `iso`. Null when the string is not a date
 * we can read — an unparseable timestamp is a refusal, never a zero. A zero
 * would read as "lapses today" and put an action in front of someone on the
 * strength of a malformed field.
 */
export function daysUntil(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (t - now.getTime()) / MS_PER_DAY;
}

/**
 * The unlock that lapses soonest inside the window, or null.
 *
 * THREE KINDS OF ROW ARE SKIPPED, for three different reasons:
 *
 *   expiresAt === null   An UNBOUNDED unlock. It never lapses, so it is never
 *                        expiring. Treating null as a date is how an absence
 *                        becomes a fabricated deadline.
 *   unparseable          A refusal, never a zero. A zero reads as "less than
 *                        a day left" and puts a warning in front of someone
 *                        on the strength of a malformed field.
 *   already past         Gone, not expiring; "extend" is the wrong verb.
 *
 * Ties break on the earlier instant, then on parcel id, so the choice is
 * stable across reads rather than dependent on server ordering.
 */
export function soonestExpiringUnlock(
  unlocks: readonly AccountUnlock[],
  asOf: Date,
  windowDays: number = EXPIRING_UNLOCK_WINDOW_DAYS,
): AccountUnlock | null {
  let best: AccountUnlock | null = null;
  let bestDays = Number.POSITIVE_INFINITY;
  for (const u of unlocks) {
    if (u.expiresAt === null) continue;
    const d = daysUntil(u.expiresAt, asOf);
    if (d === null) continue;
    if (d < 0 || d > windowDays) continue;
    if (d < bestDays || (d === bestDays && best !== null && u.parcelNodeId < best.parcelNodeId)) {
      best = u;
      bestDays = d;
    }
  }
  return best;
}

/**
 * How the remaining time is SAID.
 *
 * NOT "today" OR "tomorrow", and the first draft of this function said both.
 * An expiry is a UTC instant and this module does not know the viewer's
 * timezone, so a calendar word is a claim about a fact nobody read — the same
 * defect one level down from proposing an action on unread state. A duration
 * is derivable from what we have; a calendar day is not.
 *
 * It also rounds DOWN. "About 3 days" with 3.5 remaining understates, which
 * is the safe direction for a lapse warning; rounding up would tell someone
 * they have four days when they have three and a half.
 */
function lapseLine(daysLeft: number): string {
  if (daysLeft < 1) return "Less than a day left on it.";
  if (daysLeft < 2) return "About a day left on it.";
  return `About ${Math.floor(daysLeft)} days left on it.`;
}

// ---------------------------------------------------------------------------
// The rungs. Each returns its action or null; none of them looks at another.
// ---------------------------------------------------------------------------

function connectClaudeRung(
  state: AccountLadderState,
  context: NextActionContext,
): NextAction | null {
  // Unread suppresses. See the header note on why this diverges from the card.
  if (state.claude.kind !== "read") return null;
  if (state.claude.connected) return null;
  return {
    id: "connect_claude",
    context,
    headline: "Ask Claude about the properties on this account",
    detail:
      "Connected, Claude reads your saved properties and the reports you have run. Nothing else about the account changes.",
    ctaLabel: "Connect Claude",
  };
}

function expiringUnlockRung(state: AccountLadderState): NextAction | null {
  // A 404, a 403 and a 500 all land here and are refused, which is the whole
  // point of them being their own kinds upstream: none may read as "nothing
  // to do". Only a clean read carries a clock and a list.
  if (state.unlocks.kind !== "read") return null;
  const { asOf, unlocks } = state.unlocks;
  const soonest = soonestExpiringUnlock(unlocks, asOf);
  if (!soonest || soonest.expiresAt === null) return null;
  // soonestExpiringUnlock already refused a null, an unparseable and a lapsed
  // expiry, so this cannot be null and cannot be negative. The clamp is belt,
  // not a default: a default here would invent a duration.
  const days = Math.max(0, daysUntil(soonest.expiresAt, asOf) ?? 0);
  return {
    id: "unlock_expiring",
    context: "plan",
    // NO PROPERTY NAME. The route's shape carries no human label for the
    // parcel, and a raw `48021:34137` in a sentence is not a label, it is a
    // leak. Naming the property would mean synthesising one.
    headline: "Keep every report on the property you unlocked",
    detail: lapseLine(days),
    ctaLabel: "Extend the unlock",
  };
}

function unlockPropertyRung(state: AccountLadderState): NextAction | null {
  const e = state.entitlement;
  if (e.kind !== "read") return null;
  if (e.tier !== "free") return null;
  // Null is "we did not read a count", NOT "zero left". Suppress.
  if (e.freeMessagesLeft === null) return null;
  if (e.freeMessagesLeft > FREE_MESSAGES_NEARLY_EXHAUSTED_AT) return null;
  return {
    id: "property_unlock",
    context: "plan",
    headline: "Open every report on one property",
    detail: `An unlock covers the reports and unlimited questions on that property for ${PE_PRICING.property.durationDays} days.`,
    ctaLabel: "Unlock a property",
  };
}

function switchToAnnualRung(state: AccountLadderState): NextAction | null {
  const e = state.entitlement;
  if (e.kind !== "read") return null;
  if (e.tier !== "paid") return null;
  // TEAM IS EXCLUDED ON PURPOSE, not by oversight. Annual Team is capped at
  // the base seat count on the wire (billingClient caps `seats` on a year
  // interval), so proposing annual to a Team account with expansion seats
  // would be proposing that they lose seats. That is a different decision
  // with a real cost and it is not this rung's to make.
  if (e.subscriptionTier !== "solo" && e.subscriptionTier !== "studio") return null;
  // STARVED TODAY, DELIBERATELY. Nothing reads a billing interval, so this is
  // null and the rung never fires. Inferring "monthly" from a missing field
  // would put an upgrade in front of somebody who already switched.
  if (e.billingInterval !== "monthly") return null;
  return {
    id: "annual_upgrade",
    context: "plan",
    headline: "Two months free on this plan",
    detail: "Same plan, same access, billed once a year instead of monthly.",
    ctaLabel: "Switch to annual",
  };
}

function inviteTeammateRung(state: AccountLadderState): NextAction | null {
  const e = state.entitlement;
  if (e.kind !== "read") return null;
  if (e.tier !== "paid") return null;
  // THE GUARD. Any tier other than team gets NOTHING here. Pushing a team
  // plan at a solo user is the nag version of this rail, and it is the one
  // failure mode the ruling named by name.
  if (e.subscriptionTier !== "team") return null;
  if (state.seats.kind !== "read") return null;
  // An unknown seat count is not permission; teamClient.canInvite already
  // refuses on it, and a non-owner cannot invite at all.
  if (!state.seats.viewerIsOwner) return null;
  if (state.seats.seatsRemaining <= 0) return null;
  const n = state.seats.seatsRemaining;
  return {
    id: "team_invite",
    context: "team",
    headline: "Put the rest of the firm on this account",
    detail:
      n === 1
        ? "One seat here is paid for and unused."
        : `${n} seats here are paid for and unused.`,
    ctaLabel: "Invite a teammate",
  };
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/**
 * The one entry point. Returns the single highest step for this context, or
 * null when the account has nothing to do there.
 *
 * The rungs are ordered by intent, highest first. An expiring unlock is the
 * strongest signal in the whole set — the person already paid for this
 * property and is about to lose it — so it outranks everything else on Plan.
 */
export function nextAction(
  context: NextActionContext,
  state: AccountLadderState,
): NextAction | null {
  // Not signed in means no account state was read and none can be. There is
  // no sign-in rung: a state-derived step needs state.
  if (!state.authenticated) return null;

  switch (context) {
    case "account":
    case "connections":
      return connectClaudeRung(state, context);
    case "plan":
      return (
        expiringUnlockRung(state) ??
        unlockPropertyRung(state) ??
        switchToAnnualRung(state)
      );
    case "team":
      return inviteTeammateRung(state);
  }
}
