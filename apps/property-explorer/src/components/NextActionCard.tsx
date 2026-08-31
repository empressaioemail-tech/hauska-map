// apps/property-explorer/src/components/NextActionCard.tsx
//
// P-98 — the NEXT-ACTION rail, as a MOUNTABLE COMPONENT.
//
// Settings is the prototype mount, not the destination: Settings is a
// low-traffic surface and a funnel engine that only fires there moves almost
// nothing. So nothing in this file knows what Settings is. It takes an action
// (or null), renders it (or nothing), and hands the click back to whoever
// mounted it. The decision on which action to show is in lib/nextAction.ts,
// which is pure and has no React in it at all.
//
// IT RENDERS NOTHING WHEN THERE IS NOTHING. Not a placeholder, not a "you're
// all set" card, not a skeleton. An account with nothing to do gets an empty
// rail, and the empty rail is what makes the non-empty one worth reading.
//
// THE EYEBROW LIVES INSIDE THE ACTION, not above the slot, for the same
// reason: a heading with nothing under it is a control that does nothing.

import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";
import { PE } from "../styles/pe-chrome";
import {
  recordActivationEvent,
  type ActivationEvent,
  type ActivationEventOutcome,
} from "../lib/activationEvents";
import type { NextAction } from "../lib/nextAction";

/** The 14px stroke glyph the kit's primary variant paints blue. */
const ACT_GLYPH = "→";

export interface NextActionCardProps {
  /** The one action, or null when the account has nothing to do here. */
  action: NextAction | null;
  /** Where this is mounted. Travels with every event. */
  surface: string;
  /** The host runs the action. This component never knows the target. */
  onAct: (action: NextAction) => void;
  /**
   * Host-owned line under the control, e.g. the result of acting. Optional,
   * and absent by default — the component does not invent one.
   */
  note?: ReactNode;
  /** Injectable so tests can observe the events without a network. */
  emit?: (event: ActivationEvent) => Promise<ActivationEventOutcome>;
}

export function NextActionCard({
  action,
  surface,
  onAct,
  note,
  emit = recordActivationEvent,
}: NextActionCardProps) {
  const actionId = action?.id ?? null;

  // SHOWN fires when an action renders, keyed on the action id so switching
  // tabs to a different action counts once each and re-rendering the same one
  // does not double-count.
  //
  // `void` and no catch: recordActivationEvent never throws and returns an
  // outcome instead. A failed or 404'd event is DROPPED here on purpose —
  // instrumentation must never block the action or put an error in front of
  // someone who was trying to do something else. That degradation is declared
  // in activationEvents.ts rather than being a silent swallow.
  useEffect(() => {
    if (!actionId) return;
    void emit({ eventType: "shown", actionId, surface });
  }, [actionId, surface, emit]);

  if (!action) return null;

  return (
    <div
      data-testid="next-action"
      data-action-id={action.id}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: PE.t5,
        }}
      >
        Next step
      </div>
      <div style={{ fontSize: 15.5, lineHeight: 1.45, color: PE.t1, fontWeight: 600 }}>
        {action.headline}
      </div>
      {action.detail ? (
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: PE.t4 }}>
          {action.detail}
        </div>
      ) : null}
      <Button
        variant="primary"
        glyph={ACT_GLYPH}
        type="button"
        data-testid="next-action-cta"
        onClick={() => {
          // ACTED first, then the handler. The event is fire-and-forget, so
          // ordering costs nothing, and doing it first means an action whose
          // handler navigates away is still counted.
          void emit({ eventType: "acted", actionId: action.id, surface });
          onAct(action);
        }}
      >
        {action.ctaLabel}
      </Button>
      {note ? (
        <div
          data-testid="next-action-note"
          style={{ fontSize: 12.5, lineHeight: 1.55, color: PE.t5 }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
