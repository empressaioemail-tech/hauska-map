/**
 * Property Explorer billing checkout seam (WDLL 26).
 */

import { CORTEX_PROXY_BASE } from "./config";
import { getInstallId } from "./installId";
import { CORTEX_DEEP_PROXY_BASE } from "./auth";

export type PeCheckoutResult = {
  ok: boolean;
  mode?: "live" | "simulated";
  checkoutUrl?: string;
  sessionId?: string;
  stripeConfigured?: boolean;
  honestNote?: string;
  message?: string;
};

export async function startPeCheckout(input?: {
  parcelNodeId?: string | null;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<PeCheckoutResult> {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://property-explorer.vercel.app";
  try {
    const res = await fetch(
      `${CORTEX_PROXY_BASE}/brokerage/v1/property-explorer/billing/checkout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hauska-Install-Id": getInstallId(),
        },
        body: JSON.stringify({
          tier: "pro",
          parcelNodeId: input?.parcelNodeId ?? null,
          successUrl:
            input?.successUrl ??
            `${origin}/?checkout=success${
              input?.parcelNodeId
                ? `&parcelNodeId=${encodeURIComponent(input.parcelNodeId)}`
                : ""
            }`,
          cancelUrl: input?.cancelUrl ?? `${origin}/?checkout=cancel`,
        }),
      },
    );
    const json = (await res.json()) as PeCheckoutResult & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: json.message ?? json.error ?? `checkout failed (${res.status})`,
      };
    }
    return {
      ok: true,
      mode: json.mode,
      checkoutUrl: json.checkoutUrl,
      sessionId: json.sessionId,
      stripeConfigured: json.stripeConfigured,
      honestNote: json.honestNote,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** @deprecated use startPeCheckout */
export const startProCheckout = startPeCheckout;

// ---------------------------------------------------------------------------
// PER-PROPERTY $15 UNLOCK — WDLL item 3: a real, authenticated, user-scoped
// Stripe checkout (never a fake success):
//   - default (prod) path: POST the authenticated checkout route through the
//     deep proxy (session cookie, not the install-id header) → a Stripe
//     Checkout URL the caller redirects to. FEATURE-DETECT: a cortex build
//     without the route yet (404/403 — WA1 not merged) degrades to the
//     honest "purchase flow coming" state, never a fake unlock;
//   - `armed` is a TEST SEAM ONLY (never read from an env var / prod build —
//     WDLL item 5 removes the VITE_PE_DEV_UNLOCK production dependence; the
//     single entitlement source for internal access is now the server-side
//     `devRole` field on `/entitlement`, see entitlementClient.ts). Tests
//     inject `armed: true` directly to exercise the legacy dev-unlock route.
// ---------------------------------------------------------------------------

export const PROPERTY_UNLOCK_COMING_MESSAGE =
  "The property unlock purchase flow is coming — contact us and we'll unlock this property for you today.";

export type PropertyUnlockResult =
  /** TEST SEAM ONLY — a real server-side dev-bypass unlock landed. */
  | { kind: "unlocked"; mode: "dev-bypass" }
  /** Real Stripe Checkout session — caller redirects to `checkoutUrl`. */
  | { kind: "checkout"; checkoutUrl: string }
  /** Session expired/absent server-side — the deep proxy requires auth. */
  | { kind: "sign-in" }
  /** FEATURE-DETECT: cortex checkout route not live yet — honest, never fake. */
  | { kind: "coming"; message: string }
  | { kind: "error"; message: string };

export async function startPropertyUnlock(
  parcelNodeId: string,
  deps: {
    fetchImpl?: typeof fetch;
    /** TEST SEAM ONLY — never sourced from env/build config in production. */
    armed?: boolean;
    successUrl?: string;
    cancelUrl?: string;
  } = {},
): Promise<PropertyUnlockResult> {
  const armed = deps.armed ?? false;
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (armed) {
    // Legacy dev-bypass route — kept as a test seam / manual QA hook only.
    try {
      const res = await fetchImpl(
        `${CORTEX_DEEP_PROXY_BASE}/api/property-explorer/v1/entitlement/dev-unlock`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parcelNodeId }),
        },
      );
      if (res.ok) return { kind: "unlocked", mode: "dev-bypass" };
      if (res.status === 404 || res.status === 403) {
        return { kind: "coming", message: PROPERTY_UNLOCK_COMING_MESSAGE };
      }
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      return {
        kind: "error",
        message: body.message ?? body.error ?? `Unlock failed (${res.status}).`,
      };
    } catch (err) {
      return { kind: "error", message: (err as Error).message };
    }
  }

  // REAL CHECKOUT PATH — authenticated, user-scoped, $15 one-time unlock.
  //
  // ASSUMED WA1 CONTRACT (cortex builds in parallel — coordinate before
  // merge): POST api/property-explorer/v1/entitlement/checkout via the deep
  // proxy (session cookie), body { parcelNodeId, successUrl, cancelUrl } →
  // 200 { checkoutUrl, sessionId? }. A 404/403 (route not deployed yet)
  // feature-detects back to the honest "coming" state — never a fake
  // success. A 401 (no/expired session) surfaces as "sign-in" — the
  // property-unlock choice only renders once `usePropertyEntitlement`
  // reports `locked` (authenticated), so this is a defensive fallback for a
  // session that expired mid-flow, not the common path.
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://property-explorer.vercel.app";
  try {
    const res = await fetchImpl(
      `${CORTEX_DEEP_PROXY_BASE}/api/property-explorer/v1/entitlement/checkout`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcelNodeId,
          successUrl:
            deps.successUrl ??
            `${origin}/?checkout=success&parcelNodeId=${encodeURIComponent(parcelNodeId)}`,
          cancelUrl: deps.cancelUrl ?? `${origin}/?checkout=cancel`,
        }),
      },
    );
    if (res.status === 404 || res.status === 403) {
      // FEATURE-DETECT: WA1's authenticated checkout route isn't live yet.
      return { kind: "coming", message: PROPERTY_UNLOCK_COMING_MESSAGE };
    }
    if (res.status === 401) {
      return { kind: "sign-in" };
    }
    const body = (await res.json().catch(() => ({}))) as {
      checkoutUrl?: string;
      message?: string;
      error?: string;
    };
    if (res.ok && typeof body.checkoutUrl === "string" && body.checkoutUrl) {
      return { kind: "checkout", checkoutUrl: body.checkoutUrl };
    }
    if (!res.ok) {
      return {
        kind: "error",
        message: body.message ?? body.error ?? `Unlock checkout failed (${res.status}).`,
      };
    }
    // 200 without a checkoutUrl — treat as an incomplete/partial deploy,
    // never a fake success.
    return { kind: "coming", message: PROPERTY_UNLOCK_COMING_MESSAGE };
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
}
