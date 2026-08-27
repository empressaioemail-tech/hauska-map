// Share-link LANDING resolution — pure logic for "does this page load land in
// share-funnel mode, and with which token / grant?".
//
// Two URL shapes (P-86):
//   /share#<token>     — human HMAC (hash never reaches the server)
//   /s/{grantId}       — resolvable grant id (minted `url`; models fetch this)
//
// W2.1: a signed-out human opening the minted /s/{grantId} URL must land in
// the FULL map app on that property. Browser navigations 302 to
// /share?g={grantId}; this resolver also accepts /s/{uuid} if the SPA ever
// sees that path, plus /share?g= after the redirect.
//
// SIGN-IN ROUND-TRIP: the OIDC callback redirects to /?signed_in=1 — a full
// redirect chain that loses the /share#<token> fragment (hashes never reach
// the server). So the share landing STASHES its token or grant in
// sessionStorage and the post-sign-in load CONSUMES it.

import {
  isShareGrantId,
  isBrowserShareNavigation,
  shareAppLandingPath,
} from "../../api/_lib/pe-share-grant-id.js";

export { isBrowserShareNavigation, shareAppLandingPath };

/** Token from a /share URL: fragment first (canonical), ?token= fallback. */
export function shareTokenFromLocation(loc: {
  hash: string;
  search: string;
}): string | null {
  const hash = loc.hash.startsWith("#") ? loc.hash.slice(1) : loc.hash;
  if (hash.trim()) return hash.trim();
  const token = new URLSearchParams(loc.search).get("token")?.trim();
  return token || null;
}

export function shareGrantIdFromLocation(loc: {
  pathname: string;
  search: string;
}): string | null {
  const path = loc.pathname.replace(/\/+$/, "");
  const fromPath = path.match(/^\/s\/([^/]+)$/);
  if (fromPath && isShareGrantId(fromPath[1])) return fromPath[1];
  const params = new URLSearchParams(loc.search);
  const fromQuery = params.get("g")?.trim() || params.get("grant")?.trim();
  return fromQuery && isShareGrantId(fromQuery) ? fromQuery : null;
}

/** True when the pathname is the /share route (trailing slashes tolerated). */
export function isSharePath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/share";
}

/** True when the pathname is a grant-id share URL. */
export function isShareGrantPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  const match = path.match(/^\/s\/([^/]+)$/);
  return !!match && isShareGrantId(match[1]);
}

export const SHARE_FUNNEL_STASH_KEY = "pe_share_funnel_token";
export const SHARE_FUNNEL_GRANT_STASH_KEY = "pe_share_funnel_grant";

/** The storage seam (sessionStorage in the app; injectable for tests). */
export interface ShareStash {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ShareLanding {
  /** HMAC share token, or null when this landing is grant-id only. */
  token: string | null;
  /** Grant row id from /s/{id} or /share?g=, or null for HMAC-only landings. */
  grantId: string | null;
  /** True when this landing was restored from the post-sign-in stash. */
  restored: boolean;
}

/**
 * Decide whether THIS page load is a share landing.
 *   - /s/{grantId} → share landing (grant id stashed for sign-in restore).
 *   - /share (token and/or grant) → share landing; stash what is present.
 *   - /?signed_in=1 with a stashed token or grant → restored share landing.
 *   - anything else → null (the normal map app).
 * Storage failures degrade honestly: the landing still resolves.
 */
export function resolveShareLanding(
  loc: { pathname: string; hash: string; search: string },
  stash: ShareStash | null,
): ShareLanding | null {
  const grantId = shareGrantIdFromLocation(loc);
  if (isShareGrantPath(loc.pathname) || (isSharePath(loc.pathname) && grantId)) {
    const token = isSharePath(loc.pathname) ? shareTokenFromLocation(loc) : null;
    try {
      if (grantId) stash?.setItem(SHARE_FUNNEL_GRANT_STASH_KEY, grantId);
      if (token) stash?.setItem(SHARE_FUNNEL_STASH_KEY, token);
    } catch {
      /* honest degrade — restore-after-sign-in unavailable */
    }
    return { token, grantId, restored: false };
  }
  if (isSharePath(loc.pathname)) {
    const token = shareTokenFromLocation(loc);
    if (token) {
      try {
        stash?.setItem(SHARE_FUNNEL_STASH_KEY, token);
      } catch {
        /* honest degrade */
      }
    }
    return { token, grantId: null, restored: false };
  }
  if (new URLSearchParams(loc.search).get("signed_in") === "1" && stash) {
    let token: string | null = null;
    let restoredGrant: string | null = null;
    try {
      token = stash.getItem(SHARE_FUNNEL_STASH_KEY);
      restoredGrant = stash.getItem(SHARE_FUNNEL_GRANT_STASH_KEY);
      if (token) stash.removeItem(SHARE_FUNNEL_STASH_KEY);
      if (restoredGrant) stash.removeItem(SHARE_FUNNEL_GRANT_STASH_KEY);
    } catch {
      token = null;
      restoredGrant = null;
    }
    const grant =
      restoredGrant && isShareGrantId(restoredGrant) ? restoredGrant : null;
    if (token?.trim() || grant) {
      return { token: token?.trim() || null, grantId: grant, restored: true };
    }
  }
  return null;
}

/** The app's default stash — sessionStorage when usable, else null. */
export function defaultShareStash(): ShareStash | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}
