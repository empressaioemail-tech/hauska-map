// apps/property-explorer/src/lib/unlockClient.ts
//
// P-98 — THE ACCOUNT-WIDE UNLOCK READ.
//
// peEntitlement filters unlocks by parcelNodeId, one parcel at a time, so
// there is no way to ask "what does this account currently hold". The rail's
// strongest rung — the unlock that is about to lapse — needs exactly that,
// which is why the read is in scope rather than deferred.
//
// THE CONTRACT, from the server lane in legacy-design-tools:
//
//   GET api/property-explorer/v1/entitlement/unlocks
//   200 { asOf, unlocks: [{ parcelNodeId, tenantId, unlockedAt, expiresAt,
//                           source }] }
//   401 signed out
//   500 { error: "unlocks_unavailable" }
//
//   The route FAILS LOUD: it never returns an empty list to mean failure. So
//   an empty `unlocks` genuinely means "nothing unlocked" and the rail may
//   treat it as such. That is a property of THIS route and it is why the
//   empty case is trusted here and not elsewhere.
//
// FIVE OUTCOMES THAT MUST NEVER MERGE:
//
//   ready + []   there are no unlocks on this account
//   not-built    we cannot see (404 — the route is not deployed here yet)
//   blocked      WE refused OUR OWN path (403 — the deep-proxy allowlist)
//   sign-in      no session reached the proxy (401)
//   error        the server answered and could not compute (500), or the body
//                did not match the contract
//
// The `blocked` one has already cost this product a shipped defect.
// api/spine-deep.ts checks the session cookie FIRST and the allowlist SECOND,
// so signed OUT every path returns 401 and an unlisted path looks exactly
// like a listed one; only a signed-IN request reveals the 403. On 2026-08-31
// that made a card read "not connected" for every user on every account. The
// server lane confirmed legacy-design-tools has no allowlist of its own, so
// the ENTIRE 403 risk for this route is on this side of the wire: the path is
// on api/_lib/deep-allowlist.ts and src/lib/proxy-allowlist.test.ts asserts
// it against this module's own exported constant.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";
import type { AccountUnlock } from "./nextAction";

export const ACCOUNT_UNLOCKS_PATH = "api/property-explorer/v1/entitlement/unlocks";

export type AccountUnlocksOutcome =
  /** `asOf` is the server's clock for these expiries. See nextAction.ts. */
  | { kind: "ready"; asOf: Date; unlocks: AccountUnlock[] }
  /** 401 — no session reached the proxy. Not "no unlocks". */
  | { kind: "sign-in" }
  /** 403 — our own deep proxy refused this path. OUR bug, never a user fact. */
  | { kind: "blocked" }
  /** 404 / 501 — the route is not deployed. Not "no unlocks". */
  | { kind: "not-built" }
  /** 500, an unreachable host, or a body that is not the contract. */
  | { kind: "error"; message: string };

/**
 * Shape one row, or DROP it.
 *
 * `parcelNodeId` is required. `expiresAt` IS NOT: the contract allows null,
 * and null means an UNBOUNDED active unlock rather than an expired or
 * malformed one. So an absent, null, or empty expiry parses to null and the
 * row survives; only an expiry that is PRESENT AND UNPARSEABLE drops the row,
 * because that is a value we were given and cannot read, which is different
 * from a value we were correctly told does not exist.
 *
 * Nothing here is defaulted. An invented expiry is the worst field on this
 * contract to guess at: it decides whether a lapse warning appears and what
 * it claims about the user's money.
 */
function parseUnlock(raw: unknown): AccountUnlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const parcelNodeId =
    typeof r.parcelNodeId === "string" ? r.parcelNodeId.trim() : "";
  if (!parcelNodeId) return null;

  if (r.expiresAt === null || r.expiresAt === undefined) {
    return { parcelNodeId, expiresAt: null };
  }
  if (typeof r.expiresAt !== "string") return null;
  const expiresAt = r.expiresAt.trim();
  if (!expiresAt) return { parcelNodeId, expiresAt: null };
  if (!Number.isFinite(Date.parse(expiresAt))) return null;
  return { parcelNodeId, expiresAt };
}

export interface AccountUnlocksBody {
  asOf: Date;
  unlocks: AccountUnlock[];
}

/**
 * Pure. Shape a response body, or null when it is unreadable.
 *
 * `asOf` IS REQUIRED. It is the clock the expiries were computed against, and
 * without it the rail would have to fall back to the browser's clock — a
 * second derivation of "now" that is free to disagree with the server's. A
 * missing or unparseable `asOf` is therefore a contract violation and fails
 * loudly here, rather than being silently replaced by Date.now().
 *
 * AN EMPTY RESULT IS NOT AN ABSENCE, and this is where that bites. The server
 * half is written in another repo, so the field names above are a CONTRACT,
 * not an observation. If the rows arrive under different keys, every row is
 * dropped and a naive parse returns `[]`, which the ladder would read as
 * "this account holds no unlocks" and go quiet. A contract mismatch would
 * then be indistinguishable from an honest empty account, on the exact rung
 * that decides whether someone is told their unlock is lapsing. So: rows
 * arrived and NONE could be shaped is unreadable, not empty. A PARTIAL drop
 * still keeps the good rows — the same treatment teamClient.parseRoster gives
 * a member row it cannot resolve — because those rows are real facts.
 */
export function parseAccountUnlocks(body: unknown): AccountUnlocksBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.asOf !== "string") return null;
  const asOfMs = Date.parse(b.asOf);
  if (!Number.isFinite(asOfMs)) return null;
  if (!Array.isArray(b.unlocks)) return null;
  const shaped = b.unlocks
    .map(parseUnlock)
    .filter((u): u is AccountUnlock => u !== null);
  if (b.unlocks.length > 0 && shaped.length === 0) return null;
  return { asOf: new Date(asOfMs), unlocks: shaped };
}

export async function fetchAccountUnlocks(
  fetchImpl: typeof fetch = fetch,
): Promise<AccountUnlocksOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${CORTEX_DEEP_PROXY_BASE}/${ACCOUNT_UNLOCKS_PATH}`, {
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
  const parsed = parseAccountUnlocks(body);
  if (!parsed) {
    return { kind: "error", message: "Account service returned an unknown shape." };
  }
  return { kind: "ready", asOf: parsed.asOf, unlocks: parsed.unlocks };
}
