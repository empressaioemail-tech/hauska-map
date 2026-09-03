// apps/property-explorer/src/lib/portalClient.ts
//
// A-062 — THE STRIPE BILLING PORTAL, THE HALF THE TERMS ALREADY PROMISED.
//
// `public/terms.html` says, verbatim: "You can cancel a paid plan through the
// Stripe billing flow in the product." Until this module there was no billing
// portal anywhere in this app — the Plan tab said "Not built" to the user's
// face while the legal page said the opposite. The product was honest and the
// terms were not, and the terms are the half that carries legal weight,
// because they are the document a customer is held to and holds us to.
//
// The ruling was to keep the promise and build the capability. This is the
// client half of that; `src/lib/pe-terms-cancellation.ts` is the check that
// keeps the two halves from drifting apart again.
//
// THE CONTRACT, from the server half in legacy-design-tools
// (`routes/propertyExplorer.ts`, `lib/pePaywallStripe.ts`):
//
//   POST api/property-explorer/v1/billing/portal
//   body { returnUrl }            <- REQUIRED. See RETURN URL below.
//   200 { ok: true, mode: "live", portalUrl, stripeConfigured }
//   400 { error: "customer_id_not_accepted" | "invalid_request"
//                | "return_url_not_allowed" }
//   401 no session reached the proxy
//   403 OUR deep proxy refused OUR path
//   409 { error: "no_billing_account", hasBillingAccount: false }
//   502 { error: "portal_failed" }   Stripe answered with an error
//   503 { error: "portal_unavailable" }  Stripe unconfigured on this deploy
//
// THERE IS NO CUSTOMER ID ON THIS WIRE, IN EITHER DIRECTION. The server
// resolves `pe_user_entitlements.stripe_customer_id` from the session and
// REFUSES a caller-supplied one with a named 400 rather than ignoring it. So
// this module must never acquire a customer id to send, and there is nothing
// here to send one with. If a future edit adds one, the server rejects the
// request outright — which is the point of a refusal over a silent ignore.
//
// RETURN URL. Sent EXPLICITLY from `window.location.origin`, the same way
// billingClient.ts already does for checkout. The server default was
// `peWebAppBaseUrl()`, which falls back to the hardcoded
// `https://property-explorer-xi.vercel.app` when PE_WEB_APP_BASE_URL is unset,
// and that would land a Smart Site customer on a stale Vercel host after
// cancelling their plan. The server now REQUIRES the field, so the stale
// default is unreachable rather than merely unlikely.
//
// SIX OUTCOMES THAT MUST NEVER MERGE — the same discipline unlockClient.ts and
// accountEntitlementClient.ts carry, for the same reason:
//
//   portal              a real Stripe portal URL to open
//   no-billing-account  signed in, never had a Stripe customer. The ORDINARY
//                       state of a free account. NOT an error, NOT "not built",
//                       and NOT a reason to show a broken control.
//   sign-in             401. No session. NOT "no billing account".
//   blocked             403. OUR deep proxy refused OUR path. OUR bug.
//   not-built           404 / 501. The route is not deployed here.
//   unavailable         503. Stripe is unconfigured on this deployment.
//   error               502, a transport failure, or a body off the contract.
//
// `blocked` is not hypothetical. api/spine-deep.ts checks the session cookie
// FIRST and the allowlist SECOND, so a signed-OUT probe returns 401 for every
// path and an unlisted path looks exactly like a listed one. Only a signed-IN
// request ever reveals the 403. That is how the `ai-connections` card shipped
// dead for every user on every account on 2026-08-31. The allowlist line for
// this path lives in the same change as this file, and
// `src/lib/proxy-allowlist.test.ts` pins it against the constant below rather
// than against a retyped string.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";

/**
 * The path, exported so the allowlist test compares the URL this module
 * actually builds against the server-side set, rather than comparing two
 * hand-transcribed copies of one string to each other.
 */
export const BILLING_PORTAL_PATH = "api/property-explorer/v1/billing/portal";

export const PORTAL_NO_BILLING_ACCOUNT_MESSAGE =
  "This account has no billing history yet, so there is no billing portal to open.";

export const PORTAL_UNAVAILABLE_MESSAGE =
  "The billing portal is temporarily unavailable. Nothing was changed — try again later.";

export const PORTAL_NOT_BUILT_MESSAGE =
  "The billing portal is not available on this deployment yet.";

export type BillingPortalOutcome =
  /** A real Stripe-hosted portal. The caller navigates to `portalUrl`. */
  | { kind: "portal"; portalUrl: string }
  /** Signed in, no Stripe customer. Ordinary and honest, never an error. */
  | { kind: "no-billing-account"; message: string }
  /** 401 — no session reached the proxy. Never rendered as "no plan". */
  | { kind: "sign-in" }
  /** 403 — our own deep proxy refused our own path. OUR bug. */
  | { kind: "blocked" }
  /** 404 / 501 — the route is not deployed here. Not "no billing account". */
  | { kind: "not-built"; message: string }
  /** 503 — Stripe is not configured on this deployment. */
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string };

/**
 * A portal URL must be Stripe's own host.
 *
 * The same rule `billingClient.isStripeCheckoutUrl` applies to checkout, for
 * the same reason: a same-origin "portal" URL would be a page that cancels
 * nothing while looking like it did, which is the exact defect this card
 * exists to close, one layer down. A 200 carrying a non-Stripe URL is an
 * error, never a portal.
 */
export function isStripeBillingPortalUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "billing.stripe.com" || hostname.endsWith(".stripe.com"))
    );
  } catch {
    return false;
  }
}

/**
 * The return destination, read from the live origin.
 *
 * NOT a constant and not a server default: on smartsite.cloud this is
 * smartsite.cloud, on a preview deployment it is that preview, and in a test
 * it is whatever the harness set. The server allowlists the host and REFUSES
 * an off-host value rather than rewriting it, so a wrong origin fails loudly
 * here instead of silently redirecting somebody after they cancel.
 */
export function billingPortalReturnUrl(): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://smartsite.cloud";
  return `${origin}/?billing=portal-return`;
}

/**
 * Open a Stripe Customer Portal session for the SIGNED-IN account.
 *
 * Sends no identity of any kind beyond the session cookie: the server reads
 * the customer from the session and refuses any customer id on the request.
 */
export async function startBillingPortal(
  deps: { fetchImpl?: typeof fetch; returnUrl?: string } = {},
): Promise<BillingPortalOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const returnUrl = deps.returnUrl ?? billingPortalReturnUrl();

  let res: Response;
  try {
    res = await fetchImpl(`${CORTEX_DEEP_PROXY_BASE}/${BILLING_PORTAL_PATH}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // returnUrl and NOTHING ELSE. The server schema is strict(), so an
      // extra key here is a 400 rather than a silently ignored field.
      body: JSON.stringify({ returnUrl }),
    });
  } catch {
    return { kind: "error", message: "Could not reach the billing service." };
  }

  if (res.status === 401) return { kind: "sign-in" };
  if (res.status === 403) return { kind: "blocked" };
  if (res.status === 404 || res.status === 501) {
    return { kind: "not-built", message: PORTAL_NOT_BUILT_MESSAGE };
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await res.json();
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // A body we cannot read is not a reason to invent an outcome. Fall
    // through with an empty record; the status still decides the kind.
  }

  if (res.status === 409 && body.error === "no_billing_account") {
    return {
      kind: "no-billing-account",
      message:
        typeof body.message === "string" && body.message.trim()
          ? body.message
          : PORTAL_NO_BILLING_ACCOUNT_MESSAGE,
    };
  }
  if (res.status === 503) {
    return { kind: "unavailable", message: PORTAL_UNAVAILABLE_MESSAGE };
  }

  if (!res.ok) {
    return {
      kind: "error",
      message:
        (typeof body.message === "string" && body.message.trim()) ||
        (typeof body.error === "string" && body.error.trim()) ||
        `Billing portal failed (${res.status}).`,
    };
  }

  const portalUrl = typeof body.portalUrl === "string" ? body.portalUrl.trim() : "";
  if (!portalUrl) {
    return { kind: "error", message: PORTAL_UNAVAILABLE_MESSAGE };
  }
  if (!isStripeBillingPortalUrl(portalUrl)) {
    // A 200 with a URL that is not Stripe's is a defect, not a portal. Refuse
    // rather than navigate somewhere that cannot cancel anything.
    return {
      kind: "error",
      message:
        "The billing portal could not be opened — the session URL was not from Stripe.",
    };
  }
  return { kind: "portal", portalUrl };
}
