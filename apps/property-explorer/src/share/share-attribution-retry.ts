// Durable retry for a share signup's attribution claim.
//
// claimShareAttribution (gtmClient.ts) is a fire-and-forget POST fired once,
// at the single moment a grant id and a fresh sign-in are both in hand
// (ShareFunnelApp.tsx, on the ?signed_in=1 return leg). That leg is one-shot
// by construction — the URL param is stripped immediately after use — so a
// single failed attempt (a cold BFF function, the entitlement-detail hop it
// depends on not yet resolving a just-created account, a network blip) had
// no way to ever be retried: the in-memory retry loop in claimShareAttribution
// covers a failure within that one page load, but not one that outlives it
// (the tab closes, the page navigates away) — that class of failure was a
// permanent, silent loss, matching the "drops every share attribution
// silently" defect this module exists to close.
//
// Fix: persist the pending claim to localStorage (survives a reload / the
// tab closing, unlike the sessionStorage grant-id stash that share-landing.ts
// already clears once) before attempting it, and clear it only once the
// server confirms the claim. Any later app boot — share landing or the
// normal map app — retries whatever is still pending. The server side is
// already idempotent by design (first-touch is the recipient's own primary
// key; P-100), so retrying a claim that already succeeded is a safe no-op.

const PENDING_SHARE_ATTRIBUTION_KEY = "pe_pending_share_attribution";

export interface PendingShareAttribution {
  grantId: string;
  surface: string;
}

function attributionStore(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPendingShareAttribution(v: unknown): v is PendingShareAttribution {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as PendingShareAttribution).grantId === "string" &&
    (v as PendingShareAttribution).grantId.trim().length > 0 &&
    typeof (v as PendingShareAttribution).surface === "string"
  );
}

/** Record a claim as pending BEFORE attempting it — storage failures degrade honestly. */
export function stashPendingShareAttribution(input: PendingShareAttribution): void {
  try {
    attributionStore()?.setItem(PENDING_SHARE_ATTRIBUTION_KEY, JSON.stringify(input));
  } catch {
    /* honest degrade — this load's own retries are still attempted */
  }
}

/** The pending claim from a prior attempt that never confirmed success, if any. */
export function readPendingShareAttribution(): PendingShareAttribution | null {
  try {
    const raw = attributionStore()?.getItem(PENDING_SHARE_ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPendingShareAttribution(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Clear the pending claim once the server has confirmed it. */
export function clearPendingShareAttribution(): void {
  try {
    attributionStore()?.removeItem(PENDING_SHARE_ATTRIBUTION_KEY);
  } catch {
    /* nothing to do — a failed removal just means it retries again next boot */
  }
}
