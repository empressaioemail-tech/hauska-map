/**
 * Bundle marker contract (Gate 8 / P-92).
 *
 * Vite define falls back to UNSTAMPED when neither VERCEL_GIT_COMMIT_SHA nor
 * HAUSKA_BUILD_SHA is set. UNSTAMPED is a hard fail, never a skip.
 */

export const HAUSKA_UNSTAMPED = "UNSTAMPED";

export function resolveHauskaBuildStamp(env: {
  VERCEL_GIT_COMMIT_SHA?: string;
  HAUSKA_BUILD_SHA?: string;
}): string {
  return env.VERCEL_GIT_COMMIT_SHA || env.HAUSKA_BUILD_SHA || HAUSKA_UNSTAMPED;
}

export function assertHauskaBuildStamped(stamp: string): string {
  if (!stamp || stamp === HAUSKA_UNSTAMPED) {
    throw new Error("UNSTAMPED");
  }
  return stamp;
}
