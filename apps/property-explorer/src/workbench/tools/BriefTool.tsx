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
//     the pricing modal (host.openPaywall) + records pe_paywall_hit, 503/404
//     honest notices, network-unreachable notice. Non-ready outcomes are NOT
//     persisted — reopening the brief retries (e.g. after signing in).
//   - The brief renders as BriefSourcesStrip: sources, freshness and run
//     provenance only. The inspect card directly above it in this dock is the
//     surface that states parcel facts, so restating them here duplicated it
//     and, where the baked snapshot had less coverage than the card,
//     contradicted it. Merged 2026-08-28 on operator direction.

import { useEffect, useState } from "react";
import { BriefSourcesStrip } from "./BriefSourcesStrip";
import { PE } from "../../styles/pe-chrome";
import { LabelledSkeleton, Spinner } from "../../components/Loading";
import type { ResearchBriefPayload } from "../../browse/brief-view-model";
import { recordPeGtmEvent } from "../../lib/gtmClient";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import {
  BRIEF_PAYWALL_MESSAGE,
  briefOutcomeNotice,
  runBriefResearch,
} from "./brief-research";

const MUTED = PE.muted;
const AMBER = PE.warning;

/** The sections deriveBriefViewModel is built to render (brief-view-model.ts
 *  switches on exactly these four ids). Used as the loading skeleton labels,
 *  so the wait shows the SHAPE of the answer rather than a blank panel. A
 *  server that returns fewer still resolves honestly — the skeleton states
 *  what was asked for, not what is guaranteed back. */
const BRIEF_SECTION_LABELS = [
  "Zoning",
  "Setbacks and envelope",
  "Flood",
  "Land use",
] as const;

/** The chassis-stored (per-property, JSON-serializable) brief tool state. */
export interface BriefToolStoredState {
  brief: ResearchBriefPayload;
  fetchedAt: string;
}

type Phase =
  | { kind: "loading" }
  | { kind: "notice"; text: string; tone: "muted" | "amber" };

export function BriefTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [stored, setStored] = useDockToolState<BriefToolStoredState>("brief");
  // Transient fetch phase (per mount / per property) — never persisted, so a
  // failed or gated fetch retries on the next open.
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  // R1 PROACTIVE gate: the brief is a PAID bubble — read entitlement BEFORE
  // fetching. locked → the in-dock LOCKED state (no fetch); signedOut →
  // sign-in-first; loading/error → run as today (the server-402 belt stays
  // authoritative — a failed entitlement read never hard-blocks).
  const ent = usePropertyEntitlement(activeParcelNodeId);
  const proactivelyGated = ent.locked || ent.signedOut;

  const hasBrief = !!stored?.brief;

  useEffect(() => {
    // Re-fetch only when absent or the property changed (stored is scoped to
    // the active property by the chassis). The dock guarantees a non-null
    // active property before rendering this propertyScoped tool.
    if (!activeParcelNodeId || hasBrief) return;
    // Proactively gated (or entitlement still resolving): don't fire a fetch
    // we know will 402 — the locked/sign-in panel renders instead. status
    // "loading" waits one beat; "error" falls through and runs optimistically.
    if (proactivelyGated || ent.status === "loading") return;
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
    // the property (+ stored-presence + the proactive gate) is the intended
    // re-run contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParcelNodeId, hasBrief, proactivelyGated, ent.status]);

  if (stored?.brief) {
    // ONE SECTION, NOT TWO. This used to render PropertyBriefPanel's whole
    // "Property Intel Brief" beneath the inspect card, restating the card's
    // own facts and contradicting them where the baked snapshot had less
    // coverage than the card. Operator 2026-08-28: merge them. What is left
    // is what the card cannot say — sources, freshness, and which run made
    // the snapshot. The Export X-ray PDF hero came out with the panel; export
    // lives in Reports, which is where the other exports already are.
    //
    // THE FETCH AND THE GATE ABOVE ARE UNCHANGED ON PURPOSE. The brief is a
    // paid bubble and the 402 is what opens the pricing modal, so dropping
    // the panel must not drop the paywall. PropertyBriefPanel is untouched
    // and still renders in full for ShareView.
    return <BriefSourcesStrip brief={stored.brief} />;
  }
  // R1: the proactive LOCKED / sign-in-first states — value line + the
  // unified unlock flow in the dock, never a broken/empty state.
  if (ent.signedOut) {
    return (
      <LockedToolPanel
        valueLine={BRIEF_PAYWALL_MESSAGE}
        signedOut
        signInLine="Sign in to unlock deep research on this parcel."
        testId="brief-locked"
      />
    );
  }
  if (ent.locked) {
    return (
      <LockedToolPanel
        valueLine={BRIEF_PAYWALL_MESSAGE}
        testId="brief-locked"
      />
    );
  }
  if (phase.kind === "notice") {
    return (
      <p
        data-testid="brief-tool-notice"
        style={{
          margin: 0,
          fontSize: 12.5,
          color: phase.tone === "amber" ? AMBER : MUTED,
        }}
      >
        {phase.text}
      </p>
    );
  }
  // TWO loading states, told apart, because they are two different waits and
  // collapsing them was hiding one of them. Checking an entitlement is a gate
  // and has no fields to promise; running the research does, so it shows the
  // sections the brief is built from with shimmering bars where the values
  // will land. Never a bare spinner, never a skeleton with no labels.
  const checkingAccess = ent.status === "loading";
  return (
    <div data-testid="brief-tool-loading">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: checkingAccess ? 0 : 14,
          fontSize: 12.5,
          color: PE.t5,
        }}
      >
        <Spinner />
        {checkingAccess ? "Checking access…" : "Researching this parcel…"}
      </div>
      {checkingAccess ? null : (
        <LabelledSkeleton labels={BRIEF_SECTION_LABELS} />
      )}
    </div>
  );
}
