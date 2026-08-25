/**
 * Property Explorer billing checkout seam (WDLL 26).
 */

import { CORTEX_PROXY_BASE } from "./config";
import { getInstallId } from "./installId";
import { CORTEX_DEEP_PROXY_BASE } from "./auth";
import { PE_PRICING, type PeCheckoutInterval } from "./pricing";

export const CHECKOUT_NO_SESSION_MESSAGE =
  "Checkout did not return a payment session. Nothing was charged.";

export type PeCheckoutResult = {
  ok: boolean;
  mode?: "live" | "simulated";
  checkoutUrl?: string;
  clientSecret?: string;
  publishableKey?: string;
  sessionId?: string;
  stripeConfigured?: boolean;
  honestNote?: string;
  message?: string;
};

/** The three purchasable subscription tiers (locked ladder, 2026-08-10). */
export type PeCheckoutTier = "solo" | "studio" | "team";

/** Cortex billing enum — not the UI toggle ("annual" / "monthly"). */
export type { PeCheckoutInterval };

export const CHECKOUT_UNAVAILABLE_MESSAGE =
  "Checkout is temporarily unavailable — the payment configuration on the server is incomplete. Nothing was charged; try again later.";

export async function startPeCheckout(input: {
  /** REQUIRED: the tier the user actually clicked — a tierless body would
   *  default to Solo on cortex, which is the audit defect (a Studio click
   *  charging the Solo price). */
  tier: PeCheckoutTier;
  /** REQUIRED: cortex enum. Omitted interval defaults to month on cortex,
   *  which is the A1 defect (an annual Studio click charging monthly). */
  interval: PeCheckoutInterval;
  /** Team only: TOTAL desired seats (base covers 10, +$25/mo each above).
   *  Omitted from the body when undefined — cortex 400s seats on non-team.
   *  Annual Team is capped at PE_PRICING.team.baseSeats on the wire. */
  seats?: number;
  parcelNodeId?: string | null;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<PeCheckoutResult> {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://property-explorer.vercel.app";
  const returnUrl =
    input.successUrl ??
    `${origin}/?checkout=success${
      input.parcelNodeId
        ? `&parcelNodeId=${encodeURIComponent(input.parcelNodeId)}`
        : ""
    }`;
  const successUrl = returnUrl;
  const cancelUrl = input.cancelUrl ?? `${origin}/?checkout=cancel`;

  // User-authenticated Pro subscription checkout (WDLL item 1). The legacy
  // install-scoped brokerage seam only updates brokerage_wallets — PE gates
  // read pe_user_entitlements, so Pro checkout MUST go through the signed-in
  // deep proxy route that carries pe_user_id in Stripe metadata.
  if (input.interval !== "month" && input.interval !== "year") {
    return {
      ok: false,
      message: "Checkout interval is required (month or year).",
    };
  }

  const seatsOnWire =
    input.seats === undefined
      ? undefined
      : input.interval === "year"
        ? Math.min(input.seats, PE_PRICING.team.baseSeats)
        : input.seats;

  try {
    const res = await fetch(
      `${CORTEX_DEEP_PROXY_BASE}/api/property-explorer/v1/billing/checkout`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Hauska-Install-Id": getInstallId(),
        },
        body: JSON.stringify({
          tier: input.tier,
          interval: input.interval,
          ...(seatsOnWire !== undefined ? { seats: seatsOnWire } : {}),
          uiMode: "custom",
          returnUrl,
          successUrl,
          cancelUrl,
        }),
      },
    );
    if (res.status === 404 || res.status === 403) {
      // FEATURE-DETECT: fall back to install-scoped seam until WA1 is live.
      return startPeCheckoutInstallScoped({ successUrl, cancelUrl });
    }
    const json = (await res.json()) as PeCheckoutResult & {
      error?: string;
      message?: string;
      clientSecret?: string;
      publishableKey?: string;
    };
    if (res.status === 503 && json.error === "checkout_unavailable") {
      // Honest refusal: the requested tier's price is unconfigured on cortex.
      // NEVER retried as another tier, never routed to the legacy fallback.
      return { ok: false, message: CHECKOUT_UNAVAILABLE_MESSAGE };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: json.message ?? json.error ?? `checkout failed (${res.status})`,
      };
    }
    return resolveCustomOrHostedCheckout(json);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Legacy install-scoped checkout — retained for feature-detect fallback only. */
async function startPeCheckoutInstallScoped(input: {
  successUrl: string;
  cancelUrl: string;
}): Promise<PeCheckoutResult> {
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
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
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

/** @deprecated use startPeCheckout — callers must now pass an explicit tier
 *  (the retired "Pro" framing maps to Solo; pass `tier: "solo"`). */
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

/** Property unlock redirects must land on Stripe Checkout — never a same-origin success URL. */
export function isStripeCheckoutUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "checkout.stripe.com" || hostname.endsWith(".stripe.com"))
    );
  } catch {
    return false;
  }
}

function readSecret(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readHostedCheckoutUrl(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Custom-path success is clientSecret. Hosted checkoutUrl remains a fallback
 * (WDLL item 3) until PE mounts. 200 with neither is an honest error.
 */
export function resolveCustomOrHostedCheckout(json: {
  mode?: "live" | "simulated";
  checkoutUrl?: string;
  clientSecret?: string;
  publishableKey?: string;
  sessionId?: string;
  stripeConfigured?: boolean;
  honestNote?: string;
  message?: string;
}): PeCheckoutResult {
  const clientSecret = readSecret(json.clientSecret);
  const publishableKey = readSecret(json.publishableKey);
  const hosted = readHostedCheckoutUrl(json.checkoutUrl);
  if (clientSecret) {
    return {
      ok: true,
      mode: json.mode,
      clientSecret,
      publishableKey,
      sessionId: json.sessionId,
      stripeConfigured: json.stripeConfigured,
      honestNote: json.honestNote,
      ...(hosted && isStripeCheckoutUrl(hosted) ? { checkoutUrl: hosted } : {}),
    };
  }
  if (hosted && isStripeCheckoutUrl(hosted)) {
    return {
      ok: true,
      mode: json.mode,
      checkoutUrl: hosted,
      sessionId: json.sessionId,
      stripeConfigured: json.stripeConfigured,
      honestNote: json.honestNote,
    };
  }
  return { ok: false, message: json.message ?? CHECKOUT_NO_SESSION_MESSAGE };
}

export type PropertyUnlockResult =
  /** TEST SEAM ONLY — a real server-side dev-bypass unlock landed. */
  | { kind: "unlocked"; mode: "dev-bypass" }
  /** Custom clientSecret and/or hosted Stripe Checkout URL. */
  | {
      kind: "checkout";
      checkoutUrl?: string;
      clientSecret?: string;
      publishableKey?: string;
      sessionId?: string;
    }
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
          uiMode: "custom",
          returnUrl:
            deps.successUrl ??
            `${origin}/?checkout=success&parcelNodeId=${encodeURIComponent(parcelNodeId)}`,
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
      clientSecret?: string;
      publishableKey?: string;
      sessionId?: string;
      unlocked?: boolean;
      mode?: string;
      message?: string;
      error?: string;
    };
    // A checkout route must never grant an instant unlock — payment completes on Stripe.
    if (res.ok && body.unlocked === true) {
      return { kind: "coming", message: PROPERTY_UNLOCK_COMING_MESSAGE };
    }
    if (res.ok) {
      const clientSecret = readSecret(body.clientSecret);
      const publishableKey = readSecret(body.publishableKey);
      const hosted = readHostedCheckoutUrl(body.checkoutUrl);
      if (clientSecret) {
        return {
          kind: "checkout",
          clientSecret,
          publishableKey,
          sessionId: body.sessionId,
          ...(hosted && isStripeCheckoutUrl(hosted) ? { checkoutUrl: hosted } : {}),
        };
      }
      if (hosted) {
        if (!isStripeCheckoutUrl(hosted)) {
          return {
            kind: "error",
            message:
              "Checkout could not be started — payment session URL was not from Stripe.",
          };
        }
        return { kind: "checkout", checkoutUrl: hosted, sessionId: body.sessionId };
      }
      return { kind: "error", message: body.message ?? CHECKOUT_NO_SESSION_MESSAGE };
    }
    if (!res.ok) {
      return {
        kind: "error",
        message: body.message ?? body.error ?? `Unlock checkout failed (${res.status}).`,
      };
    }
    return { kind: "error", message: CHECKOUT_NO_SESSION_MESSAGE };
  } catch (err) {
    return { kind: "error", message: (err as Error).message };
  }
}
