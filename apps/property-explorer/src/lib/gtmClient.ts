/**
 * Property Explorer GTM client — consent + funnel events via cortex BFF (WDLL 25).
 */

import { CORTEX_PROXY_BASE } from "./config";
import { getInstallId } from "./installId";
import type { PersonaId } from "./personaRegister";

export type Persona = PersonaId;

export type PeFunnelEventType =
  | "pe_browse_started"
  | "pe_cold_open_dismissed"
  | "pe_signup_intent"
  | "pe_save_property"
  | "pe_research_clicked"
  | "pe_paywall_hit"
  | "pe_upgrade_started";

const GTM_BASE = `${CORTEX_PROXY_BASE}/brokerage/v1/gtm/property-explorer`;

let consentPromise: Promise<boolean> | null = null;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GTM_BASE}${path}`, {
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
      await postJson("/consent", { installId: getInstallId() });
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
    await postJson("/events", {
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
