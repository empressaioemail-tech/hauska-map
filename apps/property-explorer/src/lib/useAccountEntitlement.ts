// apps/property-explorer/src/lib/useAccountEntitlement.ts
//
// P-98 — the ACCOUNT-LEVEL entitlement hook. The sibling of
// usePropertyEntitlement, never a replacement for it.
//
// THE TWO READS ARE DIFFERENT QUESTIONS AND MUST STAY TWO HOOKS.
//
//   usePropertyEntitlement(parcelNodeId)  "may this PROPERTY's paid bubbles
//                                         run" — cached per parcel, read by
//                                         every paid bubble before it fires,
//                                         and it returns a LOADING constant
//                                         for a null id ON PURPOSE.
//   useAccountEntitlement()               "what plan is this ACCOUNT on" —
//                                         no parcel, one read, used by the
//                                         account console and the rail.
//
// Widening the first to answer the second is exactly the move that shipped
// "Paid" to every anonymous account (commit b4add1b): Settings passed null,
// got the LOADING constant, and the constant's locked:false / signedOut:false
// fell through a ternary to its most generous branch. So this file adds a
// read; it does not touch that one.
//
// NO MODULE CACHE, DELIBERATELY. entitlementClient keeps one because a dozen
// bubbles read the same parcel on every dock open. This read has one consumer
// per mounted account surface, and the surface is a modal that mounts when it
// opens — so reopening Settings after a checkout gets fresh state for free.
// A cache here would need an invalidation hook wired into the post-checkout
// reconcile, and an invalidation nobody calls is a dormant mechanism. The
// cheaper honest answer is one fetch per mount. This is the same idiom the
// modal already uses for fetchAiConnections, fetchTeamRoster and
// fetchAccountUnlocks.

import { useEffect, useState } from "react";
import {
  fetchAccountEntitlement,
  type AccountEntitlementOutcome,
} from "./accountEntitlementClient";

/**
 * `null` while the read is in flight — and IN FLIGHT IS NOT AN OUTCOME.
 *
 * It is deliberately not folded into the outcome union: every member of that
 * union is something the server (or our own proxy) told us, and "we have not
 * asked yet" is not. Callers that must distinguish an unresolved read from a
 * failed one — the Access row does, because an unresolved read says "Not read"
 * and so does a failed one, but for different reasons — get to.
 */
export type AccountEntitlementRead = AccountEntitlementOutcome | null;

/**
 * One read per mount. `fetcher` is injectable so a caller (or a test) can
 * supply the outcome without a network; production passes nothing.
 */
export function useAccountEntitlement(
  fetcher: () => Promise<AccountEntitlementOutcome> = fetchAccountEntitlement,
): AccountEntitlementRead {
  const [read, setRead] = useState<AccountEntitlementRead>(null);

  useEffect(() => {
    let cancelled = false;
    void fetcher().then((o) => {
      if (!cancelled) setRead(o);
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  return read;
}

/**
 * The `EntitlementRead` the ladder wants, derived from the account read.
 *
 * PURE, EXPORTED AND TESTED SEPARATELY FROM THE COMPONENT, because this is
 * where the rule that matters actually lives on the client side: it is the
 * only place a wire value becomes a ladder input, and it is where an
 * "unknown means monthly" bug would be written if anyone ever wrote one.
 *
 * THREE THINGS IT REFUSES TO DO:
 *
 *   1. It never turns a non-ready outcome into a fact. sign-in, blocked,
 *      not-built, error and an unresolved read all become `unread`, and the
 *      ladder proposes nothing on unread.
 *   2. It never turns an unknown accessTier into "free". A free tier is a
 *      POSITIVE determination that unlocks the property_unlock rung; an
 *      unknown one must not.
 *   3. It never turns a null billingInterval into "monthly". It passes the
 *      null straight through, and nextAction.ts's whitelist refuses it again.
 *
 * freeMessagesLeft is ALWAYS null here and that is the contract, not a gap in
 * this function: the free-message counters live inside the response's
 * per-PROPERTY block, which an account-level read does not have. So
 * property_unlock stays suppressed on account surfaces. nextAction.ts says the
 * same thing in its own words on the EntitlementRead type.
 */
export function ladderEntitlementFromAccount(
  read: AccountEntitlementRead,
): import("./nextAction").EntitlementRead {
  if (read === null || read.kind !== "ready") return { kind: "unread" };
  const { account } = read;
  // Signed out is not an account state to reason about. The server answers
  // anonymous callers, so this can be reached with a 200.
  if (!account.authenticated) return { kind: "unread" };
  // UNKNOWN TIER SUPPRESSES. "free" gates the unlock rung and "paid" gates the
  // annual and invite rungs; a null must do neither, so there is no arm here
  // that picks one.
  if (account.accessTier === null) return { kind: "unread" };
  return {
    kind: "read",
    tier: account.accessTier,
    subscriptionTier: account.subscriptionTier,
    // STRAIGHT THROUGH. Null stays null all the way to the rung.
    billingInterval: account.billingInterval,
    // No per-property block on an account read — see the note above.
    freeMessagesLeft: null,
  };
}
