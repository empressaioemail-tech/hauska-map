/**
 * Property Explorer GTM client — consent + funnel events via pe-gtm BFF (WDLL 25).
 *
 * Must NOT call /api/spine/cortex/... — the anonymous browse gate returns 403 for
 * GTM paths (facets/envelope/map-data only). /api/pe-gtm attaches CORTEX_SERVICE_API_KEY
 * server-side and proxies to cortex /api/brokerage/v1/gtm/property-explorer/*.
 */

import { getInstallId } from "./installId";

/** Persona UI was removed from the inspect card (map UX cluster item 4). The
 *  optional wire field survives for backward compatibility with recorded
 *  events, but the app no longer sends it. */
export type Persona = "homeowner" | "investor" | "architect";

/**
 * P-100 item 2 — `share_created` and `share_viewed` are part of this funnel.
 *
 * They fire on the Smart Site share plane and carry the GRANT ROW ID, which
 * the server minted and handed to this client in the same response. The
 * matching server allowlist is `PROPERTY_EXPLORER_FUNNEL_EVENT_TYPES`; a type
 * missing from it is a 400, which is the correct direction and is why both
 * lists are edited together.
 *
 * The brokerage workspace surface emits the same two names for a different
 * subject. These carry `source_surface = 'property-explorer'` (stamped
 * server-side by the PE events route) and the readout reports the two
 * surfaces split rather than summed.
 *
 * WHY THE CLIENT AND NOT THE BFF. `gtm_events.install_id` is minted in this
 * browser and is what `gtm_consent` is keyed on. A server-side emit from
 * `/api/pe-share` or `/s/{grantId}` would have no install id to carry, and
 * inventing one would fabricate the very identity the consent record is
 * about. The known cost is stated where it falls: an agent that fetches
 * `/s/{id}?format=json` never runs this code, so `share_viewed` counts
 * BROWSER landings only. That exclusion travels with the number in the
 * readout rather than living here as a comment.
 */
export type PeFunnelEventType =
  | "pe_browse_started"
  | "pe_cold_open_dismissed"
  | "pe_signup_intent"
  | "pe_save_property"
  | "pe_research_clicked"
  | "pe_paywall_hit"
  | "pe_upgrade_started"
  | "share_created"
  | "share_viewed";

/** Milestones an account can reach for the first time (P-100 item 4). */
export type PeActivationMilestone =
  | "first_parcel_inspected"
  | "first_property_saved"
  | "first_report_opened";

let consentPromise: Promise<boolean> | null = null;

type PeGtmPath = "consent" | "events" | "share-attribution" | "account-activation";

async function postGtm<T>(path: PeGtmPath, body: unknown): Promise<T> {
  const res = await fetch(`/api/pe-gtm?path=${encodeURIComponent(path)}`, {
    method: "POST",
    // The attribution and activation paths need the PE session cookie: the
    // BFF resolves WHO is calling from it, server-side, because neither the
    // recipient's account id nor the sharer's may come from this browser.
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.message === "string"
        ? json.message
        : `GTM ${path} failed (${res.status})`,
    );
  }
  return json;
}

export async function ensurePeGtmConsent(): Promise<boolean> {
  if (consentPromise) return consentPromise;
  consentPromise = (async () => {
    try {
      await postGtm("consent", { installId: getInstallId() });
      return true;
    } catch {
      consentPromise = null;
      return false;
    }
  })();
  return consentPromise;
}

export async function recordPeGtmEvent(input: {
  eventType: PeFunnelEventType;
  persona?: Persona;
  parcelNodeId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const ok = await ensurePeGtmConsent();
  if (!ok) return;
  try {
    await postGtm("events", {
      installId: getInstallId(),
      eventType: input.eventType,
      personaInferred: input.persona,
      payload: {
        ...input.payload,
        parcelNodeId: input.parcelNodeId ?? null,
        persona: input.persona ?? null,
      },
    });
  } catch {
    /* funnel instrumentation must not break browse */
  }
}

/** @deprecated use recordPeGtmEvent */
export const recordPeEvent = recordPeGtmEvent;

/**
 * P-100 item 3 — claim the share this account arrived on.
 *
 * The ONLY thing this browser sends is the grant id, which it holds because
 * that id is in the URL it was handed. It does not say who shared and it does
 * not say who it is: the BFF resolves the recipient from the verified PE
 * session, and cortex resolves the sharer from the grant row. A body naming
 * a sharer is refused by the server with a 400, not stripped.
 *
 * Failure is swallowed for the same reason every other event here swallows
 * it: instrumentation must not break the app. The cost of that is real —
 * a dropped attribution is invisible from this side — which is why the
 * SERVER-side refusals are recorded and why first-touch is held by a primary
 * key rather than by this call arriving exactly once.
 */
export async function claimShareAttribution(input: {
  grantId: string;
  surface?: string;
}): Promise<{ ok: boolean }> {
  try {
    await postGtm("share-attribution", {
      grantId: input.grantId,
      surface: input.surface ?? "property-explorer",
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * P-100 item 4 — report that this account reached a milestone.
 *
 * Safe to call on every occurrence. Once-per-account is enforced by the
 * database's composite primary key, not by this call site remembering; a
 * re-fire returns the ORIGINAL timestamp and changes nothing. That is
 * deliberate: a client-side "have I already sent this" flag would be per
 * browser, and the milestone is per account.
 */
export async function recordPeActivationMilestone(
  milestone: PeActivationMilestone,
  surface = "property-explorer",
): Promise<void> {
  try {
    await postGtm("account-activation", { milestone, surface });
  } catch {
    /* activation instrumentation must not break the app */
  }
}
