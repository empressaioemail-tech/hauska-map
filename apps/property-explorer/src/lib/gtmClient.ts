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

export type PeFunnelEventType =
  | "pe_browse_started"
  | "pe_cold_open_dismissed"
  | "pe_signup_intent"
  | "pe_save_property"
  | "pe_research_clicked"
  | "pe_paywall_hit"
  | "pe_upgrade_started";

let consentPromise: Promise<boolean> | null = null;

async function postGtm<T>(
  path: "consent" | "events",
  body: unknown,
): Promise<T> {
  const res = await fetch(`/api/pe-gtm?path=${encodeURIComponent(path)}`, {
    method: "POST",
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
