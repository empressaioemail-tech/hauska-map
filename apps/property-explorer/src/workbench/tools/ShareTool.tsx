// SHARE — the share-link tool (Workbench W4).
//
// Mints a link that carries the ANALYSIS for the active property (brief +
// site-plan PDF + terrain drawings via the read-only /share view), not just a
// parcel id — the realtor-hands-a-client wedge.
//
// Behavior:
//   - The minted link is PER-PROPERTY PERSISTENT via useDockToolState: close
//     the dock, switch tools, reopen → the same link for that property.
//   - Create → POST /api/pe-share (session required; share is FREE per canon):
//     401 → sign-in notice; 503 sharing-not-configured → honest notice;
//     network → honest notice.
//   - Copy button (clipboard), expiry note, regenerate (mints a fresh token;
//     old links stay valid until their own expiry — tokens are stateless).

import { useState } from "react";
import { Button } from "../../components/Button";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { PE } from "../../styles/pe-chrome";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import {
  mintShareLink,
  type MintedShareLink,
} from "../../lib/shareClient";
import { updatePropertyDossier } from "../../lib/savedPropertiesClient";
import {
  notesExcludeNeedsGrantId,
  upsertSharePackage,
} from "../../lib/share-package";
import { defaultShareMessage } from "../../lib/share-personas";

/** Share value line — free for every signed-in user (acquisition channel). */
export const SHARE_VALUE_LINE =
  "Share links carry the grant-scoped instrument for this property. The public-record brief is one source. Site plan, terrain, and X-ray appear when the sharer exported them. Owner data is labelled when it cannot be served.";

const MUTED = PE.muted;
const AMBER = PE.warning;
const TEXT = PE.text;

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
  includeNotes,
  onIncludeNotesChange,
  onCreate,
  onCopy,
}: {
  stored: ShareToolStoredState | null;
  phase: Phase;
  includeNotes: boolean;
  onIncludeNotesChange: (include: boolean) => void;
  onCreate: () => void;
  onCopy: () => void;
}) {
  return (
    <div data-testid="share-tool">
      {stored ? (
        <>
          <p style={{ margin: "0 0 6px", fontSize: 11.5, color: TEXT }}>
            Anyone with this link can fetch it. The public-record brief is one
            source on the share, not the share by itself. Site plan, terrain,
            and X-ray appear when exported. Owner data is labelled when
            withheld. Read-only, this property only, 30 days.
          </p>
          <div
            data-testid="share-link-url"
            style={{
              fontFamily: PE.mono,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: PE.t2,
              wordBreak: "break-all",
              background: "rgba(255,255,255,.02)",
              border: `1px solid ${PE.line14}`,
              borderRadius: PE.rTouch,
              padding: "8px 11px",
              marginBottom: 9,
            }}
          >
            {stored.link.url}
          </div>
          <label
            data-testid="share-include-notes"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              fontSize: 11.5,
              color: TEXT,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              data-testid="share-include-notes-input"
              checked={includeNotes}
              onChange={(e) => onIncludeNotesChange(e.target.checked)}
            />
            Include notes on this share
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <Button
              variant="primary"
              dense
              type="button"
              data-testid="share-copy"
              onClick={onCopy}
              style={{ flex: 1 }}
            >
              {phase.kind === "copied" ? (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    width={13}
                    height={13}
                    aria-hidden
                    fill="none"
                    stroke={PE.ok}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Copied
                </>
              ) : (
                "Copy link"
              )}
            </Button>
            <Button
              variant="secondary"
              dense
              type="button"
              data-testid="share-regenerate"
              onClick={onCreate}
              disabled={phase.kind === "minting"}
            >
              {phase.kind === "minting" ? "…" : "Regenerate"}
            </Button>
          </div>
          <p data-testid="share-expiry" style={{ margin: 0, fontSize: 10, color: MUTED }}>
            {fmtExpiry(stored.link.expiresAt)} Regenerating mints a fresh link;
            previously shared links stay valid until their own expiry.
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: TEXT }}>
            Create a read-only /s/{"{grantId}"} link a model can fetch. The
            public-record brief is one source. Site plan, terrain, and X-ray
            appear when the sharer exported them. Owner data is labelled when
            withheld. No sign-in needed to view. This property only, 30 days.
          </p>
          <label
            data-testid="share-include-notes"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              fontSize: 11.5,
              color: TEXT,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              data-testid="share-include-notes-input"
              checked={includeNotes}
              onChange={(e) => onIncludeNotesChange(e.target.checked)}
            />
            Include notes on this share
          </label>
          <Button
            variant="primary"
            fullWidth
            type="button"
            data-testid="share-create"
            onClick={onCreate}
            disabled={phase.kind === "minting"}
          >
            {phase.kind === "minting" ? "Creating link…" : "Create share link"}
          </Button>
        </>
      )}
      {phase.kind === "notice" && (
        <p
          data-testid="share-notice"
          style={{
            margin: "8px 0 0",
            fontSize: 11.5,
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
  const { activeParcelNodeId } = useWorkbench();
  const [stored, setStored] = useDockToolState<ShareToolStoredState>("share");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [includeNotes, setIncludeNotes] = useState(true);
  // Share is FREE per canon — only sign-in is required to mint.
  const ent = usePropertyEntitlement(activeParcelNodeId);

  const handleCreate = async () => {
    if (!activeParcelNodeId) return;
    setPhase({ kind: "minting" });
    const outcome = await mintShareLink(activeParcelNodeId, { includeNotes });
    switch (outcome.kind) {
      case "ready": {
        const grantId = outcome.link.grantId ?? null;
        if (notesExcludeNeedsGrantId(includeNotes, grantId)) {
          setPhase({
            kind: "notice",
            text: "Notes were excluded, but the grant id did not return. The link was not shown.",
            tone: "amber",
          });
          return;
        }
        if (grantId) {
          const bound = await updatePropertyDossier(activeParcelNodeId, (current) => ({
            sharePackages: upsertSharePackage(current.sharePackages ?? undefined, {
              grantId,
              includeNotes,
              persona: "other",
              message: defaultShareMessage("other"),
              savedAt: new Date().toISOString(),
            }),
          }));
          if (includeNotes === false && bound.kind !== "ok") {
            setPhase({
              kind: "notice",
              text:
                bound.kind === "not-saved"
                  ? "Save the property to exclude notes from a share."
                  : "Share package could not be stored. The link was not shown because notes were excluded.",
              tone: "amber",
            });
            return;
          }
        }
        setStored({ link: outcome.link, mintedAt: new Date().toISOString() });
        setPhase({ kind: "idle" });
        return;
      }
      case "sign-in":
        setPhase({
          kind: "notice",
          text: "Sign in to create a share link for this property.",
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
      }, 1400);
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
        valueLine={SHARE_VALUE_LINE}
        signedOut
        signInLine="Sign in to create a share link for this property."
        testId="share-locked"
      />
    );
  }

  return (
    <ShareBody
      stored={stored}
      phase={phase}
      includeNotes={includeNotes}
      onIncludeNotesChange={setIncludeNotes}
      onCreate={() => void handleCreate()}
      onCopy={() => void handleCopy()}
    />
  );
}
