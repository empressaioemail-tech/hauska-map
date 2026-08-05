// apps/property-explorer/src/lib/claimClient.ts
//
// WDLL item 6 — ANONYMOUS → AUTHENTICATED CLAIM. Fires once, right after a
// successful sign-in (App.tsx's `?signed_in=1` handler), so nothing anonymous
// orphans on the auth flip:
//
//   1. POST claim-session with X-Hauska-Install-Id — claims this browser's
//      anonymous install history (GTM events, prior anonymous activity) onto
//      the newly authenticated user.
//   2. POST claim-local-state with whatever LOCAL-ONLY data exists — today
//      that is the workbench per-property tool state
//      (pe:workbench:tool-state:v1; chat threads, notes, drawings all persist
//      through that one store, see workbench/tool-state-store.ts). PE has no
//      anonymous saved-property queue (saving a property already requires an
//      authenticated session), so `savedProperties` is sent empty — an
//      honest reflection of what actually exists locally, not a fabricated
//      queue.
//   3. Invalidate the entitlement cache so the freshly-claimed/authenticated
//      state is what every bubble reads next.
//
// ASSUMED WA1 CONTRACT (cortex builds in parallel — coordinate before merge):
//   POST api/property-explorer/v1/claim-session
//     headers: X-Hauska-Install-Id, credentials: include (session cookie)
//     body: { installId }
//   POST api/property-explorer/v1/claim-local-state
//     credentials: include
//     body: { savedProperties: [], workbenchToolState?: <persisted shape> }
// Both routes are on the PE deep-proxy POST allowlist (api/spine-deep.ts).
//
// FEATURE-DETECT: a cortex build without these routes yet (404/403 — WA1 not
// merged) is a silent no-op — sign-in still succeeds; the claim simply runs
// again on the next sign-in once the routes are live. A network error is
// equally non-blocking: local state stays in localStorage for the next
// attempt, nothing is lost.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";
import { getInstallId } from "./installId";
import { invalidatePropertyEntitlement } from "./entitlementClient";
import { WORKBENCH_TOOL_STATE_STORAGE_KEY } from "../workbench/tool-state-store";

export type ClaimStepOutcome = "claimed" | "not-available" | "sign-in" | "unreachable";

export interface ClaimOnSignInResult {
  installClaim: ClaimStepOutcome;
  localStateClaim: ClaimStepOutcome | "nothing-to-claim";
}

export interface ClaimOnSignInOpts {
  /** Defaults to `getInstallId()` (real browser storage). Test seam. */
  installId?: string;
  /**
   * Defaults to reading `pe:workbench:tool-state:v1` from localStorage. Pass
   * explicitly (including `null`) in tests — sidesteps the `window`
   * dependency the browser default relies on.
   */
  workbenchToolState?: unknown;
}

function readLocalWorkbenchState(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WORKBENCH_TOOL_STATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function claimInstallHistory(
  fetchImpl: typeof fetch,
  installId: string,
): Promise<ClaimStepOutcome> {
  try {
    const res = await fetchImpl(
      `${CORTEX_DEEP_PROXY_BASE}/api/property-explorer/v1/claim-session`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Hauska-Install-Id": installId,
        },
        body: JSON.stringify({ installId }),
      },
    );
    if (res.status === 401) return "sign-in";
    if (res.status === 404 || res.status === 403) return "not-available";
    return res.ok ? "claimed" : "not-available";
  } catch {
    return "unreachable";
  }
}

async function claimLocalState(
  fetchImpl: typeof fetch,
  workbenchToolState: unknown,
): Promise<ClaimStepOutcome> {
  try {
    const res = await fetchImpl(
      `${CORTEX_DEEP_PROXY_BASE}/api/property-explorer/v1/claim-local-state`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedProperties: [], workbenchToolState }),
      },
    );
    if (res.status === 401) return "sign-in";
    if (res.status === 404 || res.status === 403) return "not-available";
    return res.ok ? "claimed" : "not-available";
  } catch {
    return "unreachable";
  }
}

/**
 * Runs the full claim sequence once. Never throws — every step degrades to
 * an honest outcome so a claim failure NEVER blocks or reverts a successful
 * sign-in. Always invalidates the entitlement cache at the end so bubbles
 * re-read fresh state regardless of what the claim itself accomplished.
 */
export async function claimAnonymousStateOnSignIn(
  fetchImpl: typeof fetch = fetch,
  opts: ClaimOnSignInOpts = {},
): Promise<ClaimOnSignInResult> {
  const installId = opts.installId ?? getInstallId();
  const installClaim = await claimInstallHistory(fetchImpl, installId);

  const localState =
    "workbenchToolState" in opts ? opts.workbenchToolState : readLocalWorkbenchState();
  const localStateClaim: ClaimStepOutcome | "nothing-to-claim" =
    localState === null || localState === undefined
      ? "nothing-to-claim"
      : await claimLocalState(fetchImpl, localState);

  invalidatePropertyEntitlement();

  return { installClaim, localStateClaim };
}
