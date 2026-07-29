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
          successUrl: input?.successUrl ?? `${origin}/?checkout=success`,
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
// PER-PROPERTY $15 UNLOCK — the stub seam. CHECKOUT WIRING FOLLOWS in the
// payments wave; until then this seam NEVER fakes success:
//   - in a dev-bypass environment (VITE_PE_DEV_UNLOCK=1) it may hit the
//     cortex dev-unlock through the deep proxy (feature-detected: an older
//     backend without the route degrades to the honest "coming" state);
//   - in prod it returns the honest "purchase flow coming — contact us" state.
// ---------------------------------------------------------------------------

export const PROPERTY_UNLOCK_COMING_MESSAGE =
  "The property unlock purchase flow is coming — contact us and we'll unlock this property for you today.";

export type PropertyUnlockResult =
  /** DEV-BYPASS ONLY — a real server-side unlock landed (never simulated). */
  | { kind: "unlocked"; mode: "dev-bypass" }
  /** The honest pre-payments state — checkout wiring follows. */
  | { kind: "coming"; message: string }
  | { kind: "error"; message: string };

function devUnlockArmed(): boolean {
  try {
    return import.meta.env?.VITE_PE_DEV_UNLOCK === "1";
  } catch {
    return false;
  }
}

export async function startPropertyUnlock(
  parcelNodeId: string,
  deps: { fetchImpl?: typeof fetch; armed?: boolean } = {},
): Promise<PropertyUnlockResult> {
  const armed = deps.armed ?? devUnlockArmed();
  if (!armed) {
    return { kind: "coming", message: PROPERTY_UNLOCK_COMING_MESSAGE };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
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
      // FEATURE-DETECT: backend without the dev-unlock route — honest coming.
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
