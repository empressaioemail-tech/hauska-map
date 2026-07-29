// Share-link LANDING resolution — pure logic for "does this page load land in
// share-funnel mode, and with which token?".
//
// The funnel (operator directive): /share#<token> no longer renders a
// standalone read-only page — it loads the FULL map app, flies to the shared
// property, docks the read-only analysis, and shows a persistent sign-up
// prompt. The URL shape is unchanged so existing links keep working.
//
// SIGN-IN ROUND-TRIP: the OIDC callback redirects to /?signed_in=1 — a full
// redirect chain that loses the /share#<token> fragment (hashes never reach
// the server). So the share landing STASHES its token in sessionStorage
// (per-tab, dies with the tab) and the post-sign-in load CONSUMES it, landing
// the now-signed-in user back on the shared property with the link still
// honored. Consume deletes the stash — later plain loads are the normal app.

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

/** True when the pathname is the /share route (trailing slashes tolerated). */
export function isSharePath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/share";
}

export const SHARE_FUNNEL_STASH_KEY = "pe_share_funnel_token";

/** The storage seam (sessionStorage in the app; injectable for tests). */
export interface ShareStash {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ShareLanding {
  /** The share token, or null for a /share load with no token (invalid path). */
  token: string | null;
  /** True when this landing was restored from the post-sign-in stash. */
  restored: boolean;
}

/**
 * Decide whether THIS page load is a share landing.
 *   - /share (any token state) → share landing; a real token is stashed so a
 *     sign-in round-trip can restore it; a missing token lands the map app
 *     with the honest invalid notice (never a dead-end page).
 *   - /?signed_in=1 with a stashed token → restored share landing (consumes
 *     the stash).
 *   - anything else → null (the normal map app).
 * Storage failures (private mode, quota) degrade honestly: the landing still
 * resolves, only the sign-in round-trip restore is lost.
 */
export function resolveShareLanding(
  loc: { pathname: string; hash: string; search: string },
  stash: ShareStash | null,
): ShareLanding | null {
  if (isSharePath(loc.pathname)) {
    const token = shareTokenFromLocation(loc);
    if (token) {
      try {
        stash?.setItem(SHARE_FUNNEL_STASH_KEY, token);
      } catch {
        /* honest degrade — restore-after-sign-in unavailable */
      }
    }
    return { token, restored: false };
  }
  if (new URLSearchParams(loc.search).get("signed_in") === "1" && stash) {
    let token: string | null = null;
    try {
      token = stash.getItem(SHARE_FUNNEL_STASH_KEY);
      if (token) stash.removeItem(SHARE_FUNNEL_STASH_KEY);
    } catch {
      token = null;
    }
    if (token?.trim()) return { token: token.trim(), restored: true };
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
