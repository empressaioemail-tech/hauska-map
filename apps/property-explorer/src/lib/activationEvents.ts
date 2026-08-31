// apps/property-explorer/src/lib/activationEvents.ts
//
// P-98 — ACTIVATION INSTRUMENTATION, in this build rather than later.
//
// WHY IT IS NOT DEFERRABLE. The locked GTM plan names activation
// instrumentation as the blocker for affiliate optimisation: without it the
// programme cannot tell a good audience from a bad one. The ladder already
// computes activation state in order to decide what to show, so the event is
// nearly free once the ladder exists — and shipping an unmeasured funnel
// mechanism is the pattern this operation keeps having to dig out of. The
// decision's own reversal criterion ("reverse to an information rail if the
// acted rate does not clear a bar") is only decidable if this exists.
//
// THE DEGRADATION HERE IS DELIBERATE AND IS DECLARED, NOT SILENT.
//
//   A failed event MUST NEVER block the action or surface an error. Somebody
//   trying to connect Claude does not care that our analytics POST 404'd, and
//   an error toast about telemetry is worse than no telemetry. So every
//   failure path below returns an outcome and throws nothing.
//
//   The outcome is RETURNED rather than swallowed, which is the difference
//   between declared and silent: the caller may ignore it (the card does, on
//   purpose), but a test can assert which branch was taken, and a future
//   caller that wants to count drops has something to count. A function that
//   returned void here would make "the route is down" and "the event landed"
//   indistinguishable from every position, including a test's.
//
// NOT gtm_events. That store is install-scoped for the browser extension and
// is the wrong spine for a signed-in PE user; the sibling lane is adding a
// user-scoped POST api/property-explorer/v1/activation-events.

import { CORTEX_DEEP_PROXY_BASE } from "./auth";

export const ACTIVATION_EVENTS_PATH = "api/property-explorer/v1/activation-events";

export type ActivationEventType = "shown" | "acted";

export interface ActivationEvent {
  eventType: ActivationEventType;
  /** The stable action id, never the headline. */
  actionId: string;
  /** Where the action was rendered, e.g. "settings". Set by the host. */
  surface: string;
}

export type ActivationEventOutcome =
  | { kind: "recorded" }
  /** 404 / 501 — the route is not deployed yet. Dropped on purpose. */
  | { kind: "not-built" }
  /** 403 — our own deep proxy refused the path. Dropped, and it is our bug. */
  | { kind: "blocked" }
  /** 401 — nobody to attribute this to. Dropped. */
  | { kind: "no-session" }
  /**
   * 400 — THE SERVER REFUSED THE action_id.
   *
   * Its own kind because it is the one failure here that is a defect in OUR
   * code rather than a state of the world: the route 400s on any action_id
   * outside its five, and since a failed event is dropped silently, a renamed
   * rung would lose every event for that rung with nothing anywhere going red.
   * The control that actually catches it is the literal pin on all five
   * strings in nextAction.test.ts; this kind exists so the failure is at
   * least NAMEABLE at runtime rather than filed under "network".
   */
  | { kind: "rejected"; reason: string }
  /** Anything else: network, 5xx, a thrown fetch. Dropped, with the reason. */
  | { kind: "dropped"; reason: string };

/**
 * Best effort. Never throws, never rejects, never blocks the caller.
 *
 * Callers fire and forget: `void recordActivationEvent(...)`. The returned
 * promise exists so tests can await the branch, not so the UI can wait on it.
 */
export async function recordActivationEvent(
  event: ActivationEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<ActivationEventOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${CORTEX_DEEP_PROXY_BASE}/${ACTIVATION_EVENTS_PATH}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: event.eventType,
        action_id: event.actionId,
        surface: event.surface,
      }),
    });
  } catch (err) {
    return { kind: "dropped", reason: (err as Error).message };
  }
  if (res.status === 404 || res.status === 501) return { kind: "not-built" };
  if (res.status === 403) return { kind: "blocked" };
  if (res.status === 401) return { kind: "no-session" };
  if (res.status === 400) {
    return { kind: "rejected", reason: `server refused action_id ${event.actionId}` };
  }
  if (!res.ok) return { kind: "dropped", reason: `status ${res.status}` };
  return { kind: "recorded" };
}
