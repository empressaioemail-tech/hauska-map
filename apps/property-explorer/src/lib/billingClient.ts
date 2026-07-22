/**
 * Property Explorer billing checkout seam (WDLL 26).
 */

import { CORTEX_PROXY_BASE } from "./config";
import { getInstallId } from "./installId";

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
