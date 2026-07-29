// SHARE — the share-link tool (Workbench W4).
//
// Mints a link that carries the ANALYSIS for the active property (brief +
// site-plan PDF + terrain drawings via the read-only /share view), not just a
// parcel id — the realtor-hands-a-client wedge.
//
// Behavior:
//   - The minted link is PER-PROPERTY PERSISTENT via useDockToolState: close
//     the dock, switch tools, reopen → the same link for that property.
//   - Create → POST /api/pe-share (session + export entitlement class):
//     401 → sign-in notice; 402 → PaywallGate via host.openPaywall; 503
//     sharing-not-configured → honest notice; network → honest notice.
//   - Copy button (clipboard), expiry note, regenerate (mints a fresh token;
//     old links stay valid until their own expiry — tokens are stateless).

import { useState } from "react";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import {
  mintShareLink,
  SHARE_PAYWALL_MESSAGE,
  type MintedShareLink,
} from "../../lib/shareClient";

/** R1 value line — share is a PAID bubble folded into the per-property
 *  unlock semantics (the mint requires property entitlement). */
export const SHARE_LOCKED_VALUE_LINE =
  "Share links carry this property's full analysis — the verdict and cited brief plus the site-plan and terrain downloads — readable by anyone you send them to.";

const MUTED = "#9aa6b2";
const AMBER = "#fcd34d";
const TEXT = "#e5e7eb";
const ACCENT = "#7dd3fc";

/** The chassis-stored (per-property, JSON-serializable) share tool state. */
export interface ShareToolStoredState {
  link: MintedShareLink;
  mintedAt: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "minting" }
  | { kind: "notice"; text: string; tone: "muted" | "amber" }
  | { kind: "copied" };

function fmtExpiry(iso: string | null): string {
  if (!iso) return "Link expires 30 days after it was created.";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Link expires 30 days after it was created.";
  return `Link expires ${iso.slice(0, 10)}.`;
}

/**
 * Presentational body — exported for direct render tests (stored-link render
 * and create-state render without effects/clipboard).
 */
export function ShareBody({
  stored,
  phase,
  onCreate,
  onCopy,
}: {
  stored: ShareToolStoredState | null;
  phase: Phase;
  onCreate: () => void;
  onCopy: () => void;
}) {
  return (
    <div data-testid="share-tool">
      {stored ? (
        <>
          <p style={{ margin: "0 0 6px", fontSize: 11.5, color: TEXT }}>
            Anyone with this link can view this property's analysis — the cited
            brief plus the site-plan and terrain downloads when exported.
            Read-only, this property only.
          </p>
          <div
            data-testid="share-link-url"
            style={{
              fontSize: 10.5,
              color: ACCENT,
              wordBreak: "break-all",
              border: "1px solid rgba(125,211,252,0.25)",
              borderRadius: 6,
              padding: "6px 8px",
              marginBottom: 8,
            }}
          >
            {stored.link.url}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button
              type="button"
              data-testid="share-copy"
              onClick={onCopy}
              style={{
                flex: 1,
                padding: "7px 10px",
                fontSize: 11.5,
                fontWeight: 600,
                color: "#0d1117",
                background: ACCENT,
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {phase.kind === "copied" ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              data-testid="share-regenerate"
              onClick={onCreate}
              disabled={phase.kind === "minting"}
              style={{
                padding: "7px 10px",
                fontSize: 11.5,
                fontWeight: 600,
                color: TEXT,
                background: "transparent",
                border: "1px solid rgba(154,166,178,0.35)",
                borderRadius: 6,
                cursor: phase.kind === "minting" ? "default" : "pointer",
              }}
            >
              {phase.kind === "minting" ? "…" : "Regenerate"}
            </button>
          </div>
          <p data-testid="share-expiry" style={{ margin: 0, fontSize: 10, color: MUTED }}>
            {fmtExpiry(stored.link.expiresAt)} Regenerating mints a fresh link;
            previously shared links stay valid until their own expiry.
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: TEXT }}>
            Create a read-only link that carries this property's ANALYSIS — the
            verdict and full cited brief, plus the site-plan PDF and terrain
            drawings when exported. No sign-in needed to view; the link covers
            only this property and expires after 30 days.
          </p>
          <button
            type="button"
            data-testid="share-create"
            onClick={onCreate}
            disabled={phase.kind === "minting"}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "#0d1117",
              background: ACCENT,
              border: "none",
              borderRadius: 6,
              cursor: phase.kind === "minting" ? "default" : "pointer",
              opacity: phase.kind === "minting" ? 0.6 : 1,
            }}
          >
            {phase.kind === "minting" ? "Creating link…" : "Create share link"}
          </button>
        </>
      )}
      {phase.kind === "notice" && (
        <p
          data-testid="share-notice"
          style={{
            margin: "8px 0 0",
            fontSize: 11,
            color: phase.tone === "amber" ? AMBER : MUTED,
          }}
        >
          {phase.text}
        </p>
      )}
    </div>
  );
}

export function ShareTool() {
  const { activeParcelNodeId, host } = useWorkbench();
  const [stored, setStored] = useDockToolState<ShareToolStoredState>("share");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // R1 PROACTIVE gate: the share MINT requires property entitlement ($15
  // unlock or Pro). locked → in-dock LOCKED state; signedOut → sign-in-first;
  // loading/error → run as today (the server-402 belt stays authoritative).
  const ent = usePropertyEntitlement(activeParcelNodeId);

  const handleCreate = async () => {
    if (!activeParcelNodeId) return;
    setPhase({ kind: "minting" });
    const outcome = await mintShareLink(activeParcelNodeId);
    switch (outcome.kind) {
      case "ready":
        // setStored is bound to the property this mint STARTED for.
        setStored({ link: outcome.link, mintedAt: new Date().toISOString() });
        setPhase({ kind: "idle" });
        return;
      case "sign-in":
        setPhase({
          kind: "notice",
          text: "Sign in to create a share link for this property.",
          tone: "amber",
        });
        return;
      case "paywall":
        host.openPaywall(outcome.message || SHARE_PAYWALL_MESSAGE);
        setPhase({
          kind: "notice",
          text: outcome.message || SHARE_PAYWALL_MESSAGE,
          tone: "amber",
        });
        return;
      case "not-configured":
        setPhase({ kind: "notice", text: outcome.message, tone: "muted" });
        return;
      case "message":
        setPhase({ kind: "notice", text: outcome.text, tone: "muted" });
        return;
      case "unreachable":
        setPhase({
          kind: "notice",
          text: "Could not reach the sharing service.",
          tone: "muted",
        });
        return;
    }
  };

  const handleCopy = async () => {
    if (!stored) return;
    try {
      await navigator.clipboard.writeText(stored.link.url);
      setPhase({ kind: "copied" });
      window.setTimeout(() => {
        setPhase((p) => (p.kind === "copied" ? { kind: "idle" } : p));
      }, 1800);
    } catch {
      setPhase({
        kind: "notice",
        text: "Copy failed — select the link text and copy it manually.",
        tone: "muted",
      });
    }
  };

  if (ent.signedOut) {
    return (
      <LockedToolPanel
        parcelNodeId={activeParcelNodeId}
        valueLine={SHARE_LOCKED_VALUE_LINE}
        signedOut
        signInLine="Sign in to create a share link for this property."
        testId="share-locked"
      />
    );
  }
  if (ent.locked) {
    return (
      <LockedToolPanel
        parcelNodeId={activeParcelNodeId}
        valueLine={SHARE_LOCKED_VALUE_LINE}
        testId="share-locked"
      />
    );
  }

  return (
    <ShareBody
      stored={stored}
      phase={phase}
      onCreate={() => void handleCreate()}
      onCopy={() => void handleCopy()}
    />
  );
}
