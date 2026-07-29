// apps/property-explorer/src/workbench/tools/BriefTool.tsx
//
// The BRIEF as the first workbench tool (WB1 — mechanical move only, no brief
// content changes; the verdict line is W2's).
//
// Behavior:
//   - The fetched R1 brief is PER-PROPERTY PERSISTENT via useDockToolState:
//     close the dock, open another tool, reopen brief → still there for that
//     property. Re-fetch happens ONLY when no brief is stored for the active
//     property (absent, or the active property changed).
//   - Fetch outcomes keep their existing states: 401 sign-in notice, 402 opens
//     the PaywallGate (host.openPaywall) + records pe_paywall_hit, 503/404
//     honest notices, network-unreachable notice. Non-ready outcomes are NOT
//     persisted — reopening the brief retries (e.g. after signing in).
//   - The brief renders through PropertyBriefPanel in embedded mode (same
//     content, Export PDF intact; the dock header owns close).

import { useEffect, useState } from "react";
import { PropertyBriefPanel } from "../../browse/PropertyBriefPanel";
import type { ResearchBriefPayload } from "../../browse/brief-view-model";
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import {
  BRIEF_PAYWALL_MESSAGE,
  briefOutcomeNotice,
  runBriefResearch,
} from "./brief-research";

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";

/** The chassis-stored (per-property, JSON-serializable) brief tool state. */
export interface BriefToolStoredState {
  brief: ResearchBriefPayload;
  fetchedAt: string;
}

type Phase =
  | { kind: "loading" }
  | { kind: "notice"; text: string; tone: "muted" | "amber" };

export function BriefTool() {
  const { activeParcelNodeId, closeDock, host } = useWorkbench();
  const [stored, setStored] = useDockToolState<BriefToolStoredState>("brief");
  // Transient fetch phase (per mount / per property) — never persisted, so a
  // failed or gated fetch retries on the next open.
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const hasBrief = !!stored?.brief;

  useEffect(() => {
    // Re-fetch only when absent or the property changed (stored is scoped to
    // the active property by the chassis). The dock guarantees a non-null
    // active property before rendering this propertyScoped tool.
    if (!activeParcelNodeId || hasBrief) return;
    let cancelled = false;
    setPhase({ kind: "loading" });
    void runBriefResearch(activeParcelNodeId).then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "ready") {
        // setStored is bound to the property this fetch STARTED for, so a
        // mid-flight property switch never writes to the wrong property.
        setStored({ brief: outcome.brief, fetchedAt: new Date().toISOString() });
        return;
      }
      if (outcome.kind === "paywall") {
        void recordPeGtmEvent({
          eventType: "pe_paywall_hit",
          parcelNodeId: activeParcelNodeId,
        });
        host.openPaywall(BRIEF_PAYWALL_MESSAGE);
      }
      setPhase({
        kind: "notice",
        text: briefOutcomeNotice(outcome),
        tone: outcome.kind === "unreachable" || outcome.kind === "message"
          ? "muted"
          : "amber",
      });
    });
    return () => {
      cancelled = true;
    };
    // setStored/host identities follow activeParcelNodeId; keying the effect on
    // the property (+ stored-presence) is the intended re-run contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParcelNodeId, hasBrief]);

  if (stored?.brief) {
    return (
      <PropertyBriefPanel embedded brief={stored.brief} onClose={closeDock} />
    );
  }
  if (phase.kind === "notice") {
    return (
      <p
        data-testid="brief-tool-notice"
        style={{
          margin: 0,
          fontSize: 11.5,
          color: phase.tone === "amber" ? AMBER : MUTED,
        }}
      >
        {phase.text}
      </p>
    );
  }
  return (
    <p
      data-testid="brief-tool-loading"
      style={{ margin: 0, fontSize: 11.5, color: MUTED }}
    >
      Checking access…
    </p>
  );
}
