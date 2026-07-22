/** Stable anonymous install id for GTM + billing seams (WDLL 25–26). */

const STORAGE_KEY = "empressa-pe-install-id";

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `pe-${crypto.randomUUID()}`;
  }
  return `pe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getInstallId(): string {
  if (typeof window === "undefined") return "pe-server";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const next = randomId();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}
