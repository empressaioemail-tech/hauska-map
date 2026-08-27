// USE IN YOUR AI — P-87 items 15 and 16.
//
// A signed-in rail bubble that opens the vendor sheet. OAuth is not live, so
// every vendor row is Coming soon or Unavailable. Never a Connect that does
// nothing. Never a key, Cloud Run URL, or product-key string.
//
// Until Connect ships, the working hook is a grant-scoped share link
// (`/s/{grantId}`). This sheet mints that link into the same chassis key the
// Share tool uses, so the two surfaces stay one grant.

import { useState } from "react";
import { Button } from "../../components/Button";
import { StatusChip } from "../../components/StatusChip";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { mintShareLink } from "../../lib/shareClient";
import { PE } from "../../styles/pe-chrome";
import { useDockToolState, useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";
import type { ShareToolStoredState } from "./ShareTool";

export const USE_IN_YOUR_AI_VALUE_LINE =
  "Your Smart Site account, in the chat you already use. Same plan. No key.";

export type UseInAiVendorId = "claude" | "chatgpt" | "cursor" | "copilot";

export type UseInAiVendorStatus = "coming" | "unavailable";

export interface UseInAiVendorRow {
  id: UseInAiVendorId;
  name: string;
  line: string;
  status: UseInAiVendorStatus;
  statusLabel: string;
  note?: string;
}

/** Four rows, always this order. Statuses are honest while Connect is not live. */
export const USE_IN_AI_VENDORS: UseInAiVendorRow[] = [
  {
    id: "claude",
    name: "Claude",
    line: "Find a parcel, open its smart site, run reports from the chat you already use.",
    status: "coming",
    statusLabel: "Coming soon",
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    line: "Same jobs, when that workspace class can finish the connect.",
    status: "unavailable",
    statusLabel: "Unavailable",
    note: "ChatGPT needs a Business or Enterprise workspace for this.",
  },
  {
    id: "cursor",
    name: "Cursor",
    line: "Same account, in the editor you already use.",
    status: "coming",
    statusLabel: "Coming soon",
  },
  {
    id: "copilot",
    name: "Copilot",
    line: "Same account, in the editor you already use.",
    status: "coming",
    statusLabel: "Coming soon",
  },
];

type SharePhase =
  | { kind: "idle" }
  | { kind: "minting" }
  | { kind: "notice"; text: string; tone: "muted" | "amber" }
  | { kind: "copied" };

export function UseInYourAiBody({
  hasParcel,
  shareUrl,
  sharePhase,
  onCreateShare,
  onCopyShare,
}: {
  hasParcel: boolean;
  shareUrl: string | null;
  sharePhase: SharePhase;
  onCreateShare: () => void;
  onCopyShare: () => void;
}) {
  return (
    <div data-testid="use-in-ai-tool">
      <p
        data-testid="use-in-ai-lede"
        style={{ margin: "0 0 12px", fontSize: 11.5, lineHeight: 1.5, color: PE.text }}
      >
        {USE_IN_YOUR_AI_VALUE_LINE}
      </p>

      <div
        data-testid="use-in-ai-share"
        style={{
          marginBottom: 14,
          padding: "10px 10px 8px",
          borderRadius: PE.radiusCard,
          border: `1px solid ${PE.accentBorderSoft}`,
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: 11.5, lineHeight: 1.5, color: PE.text }}>
          Connect is not live yet. Paste a share link into any chat that
          fetches URLs. Claude can read it today.
        </p>
        {!hasParcel ? (
          <p
            data-testid="use-in-ai-need-parcel"
            style={{ margin: 0, fontSize: 11, color: PE.muted }}
          >
            Select a property on the map, then create the link from this sheet.
          </p>
        ) : shareUrl ? (
          <>
            <div
              data-testid="use-in-ai-share-url"
              style={{
                fontSize: 10.5,
                color: PE.accent,
                wordBreak: "break-all",
                marginBottom: 8,
              }}
            >
              {shareUrl}
            </div>
            <Button
              variant="primary"
              fullWidth
              type="button"
              data-testid="use-in-ai-copy-share"
              onClick={onCopyShare}
            >
              {sharePhase.kind === "copied" ? "Copied" : "Copy share link"}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            fullWidth
            type="button"
            data-testid="use-in-ai-create-share"
            onClick={onCreateShare}
            disabled={sharePhase.kind === "minting"}
          >
            {sharePhase.kind === "minting"
              ? "Creating link…"
              : "Create a link Claude can fetch"}
          </Button>
        )}
        {sharePhase.kind === "notice" ? (
          <p
            data-testid="use-in-ai-share-notice"
            style={{
              margin: "8px 0 0",
              fontSize: 11,
              color: sharePhase.tone === "amber" ? PE.warning : PE.muted,
            }}
          >
            {sharePhase.text}
          </p>
        ) : null}
      </div>

      <ul
        data-testid="use-in-ai-vendors"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {USE_IN_AI_VENDORS.map((row) => (
          <li
            key={row.id}
            data-testid={`use-in-ai-row-${row.id}`}
            data-status={row.status}
            style={{
              padding: "10px 0",
              borderTop: "1px solid rgba(154,166,178,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 12, color: PE.text }}>{row.name}</strong>
              <StatusChip
                data-testid={`use-in-ai-status-${row.id}`}
                tone={row.status === "unavailable" ? "warning" : "absence"}
              >
                {row.statusLabel}
              </StatusChip>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 11, lineHeight: 1.45, color: PE.muted }}>
              {row.line}
            </p>
            {row.note ? (
              <p
                data-testid={`use-in-ai-note-${row.id}`}
                style={{ margin: "4px 0 0", fontSize: 10.5, lineHeight: 1.4, color: PE.muted }}
              >
                {row.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UseInYourAiTool() {
  const { activeParcelNodeId } = useWorkbench();
  const [stored, setStored] = useDockToolState<ShareToolStoredState>("share");
  const [sharePhase, setSharePhase] = useState<SharePhase>({ kind: "idle" });
  const ent = usePropertyEntitlement(activeParcelNodeId);

  const handleCreate = async () => {
    if (!activeParcelNodeId) return;
    setSharePhase({ kind: "minting" });
    const outcome = await mintShareLink(activeParcelNodeId);
    switch (outcome.kind) {
      case "ready":
        setStored({ link: outcome.link, mintedAt: new Date().toISOString() });
        setSharePhase({ kind: "idle" });
        return;
      case "sign-in":
        setSharePhase({
          kind: "notice",
          text: "Sign in to create a share link for this property.",
          tone: "amber",
        });
        return;
      case "not-configured":
        setSharePhase({ kind: "notice", text: outcome.message, tone: "muted" });
        return;
      case "message":
        setSharePhase({ kind: "notice", text: outcome.text, tone: "muted" });
        return;
      case "unreachable":
        setSharePhase({
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
      setSharePhase({ kind: "copied" });
      window.setTimeout(() => {
        setSharePhase((p) => (p.kind === "copied" ? { kind: "idle" } : p));
      }, 1800);
    } catch {
      setSharePhase({
        kind: "notice",
        text: "Copy failed — select the link text and copy it manually.",
        tone: "muted",
      });
    }
  };

  if (activeParcelNodeId && ent.signedOut) {
    return (
      <LockedToolPanel
        valueLine={USE_IN_YOUR_AI_VALUE_LINE}
        signedOut
        signInLine="Sign in to hook this Smart Site account to the chat you already use."
        testId="use-in-ai-locked"
      />
    );
  }

  return (
    <UseInYourAiBody
      hasParcel={Boolean(activeParcelNodeId)}
      shareUrl={stored?.link.url ?? null}
      sharePhase={sharePhase}
      onCreateShare={() => void handleCreate()}
      onCopyShare={() => void handleCopy()}
    />
  );
}
