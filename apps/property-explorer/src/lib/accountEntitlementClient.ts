// apps/property-explorer/src/lib/accountEntitlementClient.ts
//
// P-98 — THE ACCOUNT-LEVEL ENTITLEMENT READ.
//
// WHY THIS EXISTS ALONGSIDE entitlementClient.ts RATHER THAN INSIDE IT.
// entitlementClient is PER PROPERTY: it is keyed by parcelNodeId, cached per
// parcel, and every paid bubble in the app reads it before running. Settings
// is account-scoped and has no parcel, and the day it passed `null` into that
// per-property hook it got the hook's LOADING constant back and rendered
// "Paid" to every account including anonymous (commit b4add1b). The fix is not
// to teach the per-property reader about a null parcel — it is a SECOND read
// that asks an account-level question. This is that read. Nothing here touches
// the per-property module, its cache, or its hook.
//
// THE CONTRACT, from the server lane in legacy-design-tools:
//
//   GET api/property-explorer/v1/entitlement          (NO parcelNodeId)
//   200 { accessTier, subscriptionTier, entitlementSource, devRole,
//         seatsPurchased, billingInterval }
//       — and the `property` block OMITTED ENTIRELY.
//   With a parcelNodeId the response is byte-identical to today, which is why
//   the per-property caller above is untouched.
//
//   billingInterval is "month" | "year" | null, and NULL MEANS UNKNOWN.
//   Nothing backfills it, so today's test-mode subscribers read null. That is
//   correct rather than a bug, and it is the single most important field in
//   this file: see THE ONE RULE below.
//
// ALLOWLIST. The path is already on api/_lib/deep-allowlist.ts (DEEP_GET_EXACT,
// first entry) because the per-property form uses the same path with a query
// string, and api/spine-deep.ts builds its allowlist key from the path
// segments only — the query never reaches the check. So the parcel-less form
// needs no new line. VERIFIED by reading both files rather than assumed;
// src/lib/proxy-allowlist.test.ts pins it against this module's own exported
// constant so the two independently authored halves cannot drift.
//
// THE ONE RULE: A NULL INTERVAL IS NOT MONTHLY.
//
//   parseBillingInterval below returns "month" ONLY for the literal string
//   "month". An absent key, an explicit null, a non-string, and any
//   unrecognised string ("monthly", "Month", "") all resolve to null. The
//   next-action ladder's annual rung then stays quiet, because offering
//   "switch to annual" to somebody already on annual is the failure that rung
//   would be judged on. There are TWO independent refusals on that path — this
//   parse, and nextAction.ts's `!== "month"` whitelist — and neither is
//   allowed to be relaxed on the strength of the other.
//
// FIVE OUTCOMES THAT MUST NEVER MERGE — the same discipline unlockClient.ts
// carries, for the same reason and against the same shipped defect:
//
//   ready        the server answered and we shaped it
//   sign-in      401. No session reached the proxy. NOT "a free account".
//   blocked      403. OUR OWN deep proxy refused OUR OWN path. Our bug.
//   not-built    404 / 501. The route is not deployed here. NOT "no plan".
//   error        500, an unreachable host, or a body that is not an object.
//
// api/spine-deep.ts checks the session cookie FIRST and the allowlist SECOND,
// so signed OUT every path returns 401 and an unlisted path is invisible; only
// a signed-IN request ever reveals a 403. That is why `blocked` is its own kind
// and why it is described as our defect rather than a fact about the account.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";
import type { BillingInterval, PlanTier } from "./nextAction";

/**
 * The path, exported so the allowlist test compares the URL this module
 * actually builds against the server-side set, rather than comparing two
 * hand-transcribed copies of the same string to each other.
 */
export const ACCOUNT_ENTITLEMENT_PATH = "api/property-explorer/v1/entitlement";

/** Paid or free, or NULL when the wire did not say. Null is not "free". */
export type AccessTier = "free" | "paid";

export interface AccountEntitlement {
  /** The server's own answer, not an inference from the presence of a token. */
  authenticated: boolean;
  /**
   * paid / free, or NULL FOR UNKNOWN.
   *
   * DELIBERATELY STRICTER THAN THE PER-PROPERTY PARSE. entitlementClient.ts
   * reads `body.tier === "paid" ? "paid" : "free"`, which turns an absent
   * field into a POSITIVE "free" — tolerable there because that module's
   * softFallback path is display-only and the server 402 stays the belt.
   * Here the value is printed in a row labelled "Access" on the account
   * console, so an absent field must read as unknown and print "Not read".
   *
   * BOTH KEYS ARE ACCEPTED. The sibling lane's contract names this field
   * `accessTier` (after pe_user_entitlements.access_tier); the route running
   * in production today emits `tier`. Reading only one of the two would make
   * this row wrong for whichever half of the deploy window we guessed against,
   * and the wrong direction is the flattering one. So: accessTier first, tier
   * second, and neither present is UNKNOWN rather than free.
   */
  accessTier: AccessTier | null;
  /** solo / studio / team, or null when free, unlock-only, or absent. */
  subscriptionTier: PlanTier | null;
  /** "stripe_sub", "stripe_promo", "stripe_unlock", "dev", or null. */
  entitlementSource: string | null;
  /** Server-granted internal role. A user-level grant, not a subscription. */
  devRole: boolean;
  /**
   * Seats bought at checkout, or null when unknown.
   *
   * PARSED AND WIRED TO NOTHING, on purpose. The Team tab already prints a
   * purchased-seat count derived from the roster read, and giving one row two
   * independently derived sources without a divergence test between them is
   * how two numbers that should agree start disagreeing on screen. The field
   * is shaped here because it is on the contract; consuming it is a separate
   * decision with a real check attached to it.
   */
  seatsPurchased: number | null;
  /**
   * "month" | "year" | null, and NULL MEANS UNKNOWN. Never defaulted,
   * never inferred, never widened. See THE ONE RULE in the header.
   */
  billingInterval: BillingInterval | null;
  /**
   * A statement about the WIRE: the 200 body carried no own property named
   * `billingInterval`, which is what a pre-contract server looks like.
   *
   * IT IS NEVER RENDERED AND NEVER DECIDES ANYTHING. A SECOND MECHANISM
   * PRODUCES THE SAME OBSERVATION: a deployed server that omits null-valued
   * keys from its JSON would also look pre-contract. That false positive costs
   * nothing here precisely because the flag drives no behaviour — pre-contract
   * and deployed-but-null render identically (Not read) and suppress the same
   * rung. It exists so a human debugging "why is the interval blank" can tell
   * the two apart in a console, not so the UI can.
   */
  preContract: boolean;
}

export type AccountEntitlementOutcome =
  | { kind: "ready"; account: AccountEntitlement }
  /** 401 — no session reached the proxy. Not "a free account". */
  | { kind: "sign-in" }
  /** 403 — our own deep proxy refused this path. OUR bug, never a user fact. */
  | { kind: "blocked" }
  /** 404 / 501 — the route is not deployed. Not "no plan". */
  | { kind: "not-built" }
  /** 500, an unreachable host, or a body that is not the contract. */
  | { kind: "error"; message: string };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * THE FIELD THIS WHOLE FILE IS ABOUT.
 *
 * Exactly two strings resolve, and they are the ones the column stores:
 * "month" and "year", Stripe's own recurring-interval grammar (operator
 * ruling 2026-08-31, P-98b -- one vocabulary end to end, no translation on
 * either side of the wire). Everything else is null, which means UNKNOWN and
 * suppresses the annual rung. In particular the PRODUCT words "monthly" and
 * "annual" do NOT resolve, and neither does "Month": a case-insensitive or
 * synonym match here would be a client deciding what the server meant, and
 * the two values differ by whether somebody is asked to pay differently.
 */
export function parseBillingInterval(v: unknown): BillingInterval | null {
  return v === "month" || v === "year" ? v : null;
}

/** solo / studio / team only. Anything else is null and gates Studio CLOSED. */
export function parsePlanTier(v: unknown): PlanTier | null {
  return v === "solo" || v === "studio" || v === "team" ? v : null;
}

/** paid / free only. Anything else — INCLUDING ABSENT — is null = unknown. */
export function parseAccessTier(v: unknown): AccessTier | null {
  return v === "paid" || v === "free" ? v : null;
}

/**
 * A non-negative integer seat count, or null.
 *
 * A negative count, a fractional one, a numeric string and NaN are all refused
 * rather than coerced. An invented seat number is a claim about somebody's
 * money, so an unreadable one is an absence.
 */
function parseSeats(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * Pure. Shape a 200 body, or null when it is not an object at all.
 *
 * NOTHING IS DEFAULTED TO A CONVENIENT VALUE. Every field that cannot be read
 * lands on null or false, and every null downstream renders "Not read" and
 * suppresses its rung. There is no arm of this function that guesses.
 */
export function parseAccountEntitlement(body: unknown): AccountEntitlement | null {
  const b = asRecord(body);
  if (!b) return null;
  // Legacy shape tolerance, matching entitlementClient.ts: some responses have
  // historically nested the same fields under `entitlement`.
  const legacy = asRecord(b.entitlement);
  const pick = (key: string): unknown =>
    b[key] !== undefined ? b[key] : legacy?.[key];

  const devRole = pick("devRole") === true;
  const sourceRaw = pick("entitlementSource");
  // accessTier is the contract name; tier is what production emits today.
  // Whichever is present wins, and neither present is UNKNOWN, not free.
  const accessTier =
    parseAccessTier(pick("accessTier")) ?? parseAccessTier(pick("tier"));
  // DEV ROLE READS AS TEAM, the same inference entitlementClient.ts makes and
  // for the same documented reason (the cortex contract states it, and live
  // /entitlement elevates tier without emitting subscriptionTier). It is
  // applied ONLY on an explicit devRole, so a legacy paid row with a missing
  // field still fail-closes to null.
  const parsedTier = parsePlanTier(pick("subscriptionTier"));
  const subscriptionTier = parsedTier ?? (devRole ? "team" : null);

  return {
    // Only an explicit false is unauthenticated: the route answers anonymous
    // callers too, and it says so in this field rather than by omission.
    authenticated: pick("authenticated") !== false,
    accessTier,
    subscriptionTier,
    entitlementSource: typeof sourceRaw === "string" ? sourceRaw : null,
    devRole,
    seatsPurchased: parseSeats(pick("seatsPurchased")),
    billingInterval: parseBillingInterval(pick("billingInterval")),
    preContract:
      !Object.prototype.hasOwnProperty.call(b, "billingInterval") &&
      !(legacy !== null &&
        Object.prototype.hasOwnProperty.call(legacy, "billingInterval")),
  };
}

/**
 * The account-level read. NO parcelNodeId — that is the whole point.
 *
 * Fails loud into distinct kinds and never invents an account state from a
 * transport failure.
 */
export async function fetchAccountEntitlement(
  fetchImpl: typeof fetch = fetch,
): Promise<AccountEntitlementOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${CORTEX_DEEP_PROXY_BASE}/${ACCOUNT_ENTITLEMENT_PATH}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return { kind: "error", message: "Could not reach the account service." };
  }
  if (res.status === 401) return { kind: "sign-in" };
  if (res.status === 403) return { kind: "blocked" };
  if (res.status === 404 || res.status === 501) return { kind: "not-built" };
  if (!res.ok) {
    return { kind: "error", message: `Account service returned ${res.status}.` };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: "error", message: "Account service returned unreadable data." };
  }
  const account = parseAccountEntitlement(body);
  if (!account) {
    return { kind: "error", message: "Account service returned an unknown shape." };
  }
  return { kind: "ready", account };
}
