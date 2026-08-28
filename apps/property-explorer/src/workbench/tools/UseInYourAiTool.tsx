// USE IN YOUR AI — P-87 items 15 and 16.
//
// Signed-in rail bubble: vendor sheet with live Connect for Claude and Cursor.
// No API key, Cloud Run URL, or product-key strings. Share mint remains a
// secondary hook for URL-fetching chats.

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

/** Customer-facing hostname only — never a Cloud Run hash. */
export const SMART_SITE_CONNECT_HOST = "mcp.smartsite.cloud";

/** Full connector URL copied into Claude / Cursor. */
export const SMART_SITE_CONNECT_URL = `https://${SMART_SITE_CONNECT_HOST}/mcp`;

/**
 * Deep link to Claude's Connectors pane.
 *
 * The slug is `customize-connectors`, not `connectors`. Two earlier guesses
 * (`/settings/customize/connectors` as a PATH, then `#settings/connectors`)
 * both landed on the wrong pane. This one was READ OFF THE ADDRESS BAR with
 * Connectors open (operator, 2026-08-28), which is the only way this value
 * was ever going to be right.
 *
 * If it ever stops working, read the bar again. Do not infer a fourth form
 * from the shape of this one — that is exactly how the first two were wrong.
 */
export const CLAUDE_CUSTOMIZE_CONNECTORS_URL =
  "https://claude.ai/new#settings/customize-connectors";

export type UseInAiVendorId = "claude" | "chatgpt" | "cursor" | "copilot";

export type UseInAiVendorStatus = "connect" | "coming" | "unavailable";

export interface UseInAiVendorRow {
  id: UseInAiVendorId;
  name: string;
  line: string;
  status: UseInAiVendorStatus;
  statusLabel: string;
  note?: string;
}

/** Four rows, always this order. Claude and Cursor Connect when OAuth is live. */
export const USE_IN_AI_VENDORS: UseInAiVendorRow[] = [
  {
    id: "claude",
    name: "Claude",
    line: "Find a parcel, open its smart site, run reports from the chat you already use.",
    status: "connect",
    statusLabel: "Connect",
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
    status: "connect",
    statusLabel: "Connect",
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

type ConnectPhase =
  | { kind: "idle" }
  | { kind: "copied" }
  | { kind: "notice"; text: string };

function connectBeatCopy(vendor: UseInAiVendorId): string {
  if (vendor === "claude") {
    // Numbered, because this is a five-step hop between two apps and the
    // operator reported getting lost on step one. Sign-in is OAuth: the
    // server answers POST /mcp with 401 and publishes both discovery
    // documents, so Claude runs the approval itself. There is no key to paste.
    return "1. Copy the address below. 2. In Claude, open Settings, then Connectors. 3. Add custom connector. 4. Paste the address. 5. Approve Smart Site when Claude asks. No key needed.";
  }
  return "Add Smart Site in Cursor, paste the address below, then finish sign-in when prompted.";
}

function VendorConnectPanel({
  vendor,
  connectPhase,
  onCopyAddress,
  onCancel,
}: {
  vendor: UseInAiVendorId;
  connectPhase: ConnectPhase;
  onCopyAddress: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      data-testid={`use-in-ai-connect-panel-${vendor}`}
      style={{
        marginTop: 8,
        padding: "12px 12px 10px",
        borderRadius: PE.rFloat,
        border: `1px solid ${PE.line14}`,
        background: "rgba(255,255,255,.02)",
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.5, color: PE.t3 }}>
        {connectBeatCopy(vendor)}
      </p>
      <p
        style={{
          margin: "0 0 3px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".13em",
          textTransform: "uppercase",
          color: PE.t6,
        }}
      >
        Smart Site address
      </p>
      <div
        data-testid={`use-in-ai-connect-host-${vendor}`}
        style={{
          fontFamily: PE.mono,
          fontSize: 11.5,
          lineHeight: 1.65,
          color: PE.t2,
          wordBreak: "break-all",
          background: "rgba(0,0,0,.28)",
          border: `1px solid ${PE.line06}`,
          borderRadius: PE.rTouch,
          padding: "8px 10px",
          marginBottom: 10,
        }}
      >
        {SMART_SITE_CONNECT_URL}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Button
          variant="primary"
          fullWidth
          type="button"
          data-testid={`use-in-ai-copy-address-${vendor}`}
          onClick={onCopyAddress}
        >
          {connectPhase.kind === "copied" ? "Copied" : "Copy Smart Site address"}
        </Button>
        {vendor === "claude" ? (
          <Button
            variant="secondary"
            fullWidth
            type="button"
            data-testid="use-in-ai-open-claude"
            onClick={() => {
              window.open(CLAUDE_CUSTOMIZE_CONNECTORS_URL, "_blank", "noopener,noreferrer");
            }}
          >
            Open Customize → Connectors
          </Button>
        ) : null}
        <Button
          variant="secondary"
          fullWidth
          type="button"
          data-testid={`use-in-ai-connect-cancel-${vendor}`}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      {connectPhase.kind === "notice" ? (
        <p
          data-testid={`use-in-ai-connect-notice-${vendor}`}
          style={{ margin: "8px 0 0", fontSize: 11.5, color: PE.t5 }}
        >
          {connectPhase.text}
        </p>
      ) : null}
    </div>
  );
}

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
  const [expandedConnect, setExpandedConnect] = useState<UseInAiVendorId | null>(null);
  const [connectPhase, setConnectPhase] = useState<ConnectPhase>({ kind: "idle" });

  const handleConnectClick = (vendor: UseInAiVendorId) => {
    setConnectPhase({ kind: "idle" });
    setExpandedConnect((current) => (current === vendor ? null : vendor));
  };

  const handleCopyAddress = async (_vendor: UseInAiVendorId) => {
    try {
      await navigator.clipboard.writeText(SMART_SITE_CONNECT_URL);
      setConnectPhase({ kind: "copied" });
      window.setTimeout(() => {
        setConnectPhase((p) => (p.kind === "copied" ? { kind: "idle" } : p));
      }, 1800);
    } catch {
      setConnectPhase({
        kind: "notice",
        text: "Copy failed — select the address and copy it manually.",
      });
    }
  };

  return (
    <div data-testid="use-in-ai-tool">
      <p
        data-testid="use-in-ai-lede"
        style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.5, color: PE.t3 }}
      >
        {USE_IN_YOUR_AI_VALUE_LINE}
      </p>

      <div
        data-testid="use-in-ai-share"
        style={{
          marginBottom: 14,
          padding: "10px 10px 8px",
          borderRadius: PE.rFloat,
          border: `1px solid ${PE.accentBorderSoft}`,
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.5, color: PE.t3 }}>
          Connect Claude or Cursor below with your Smart Site account. Or paste a share
          link into any chat that fetches URLs.
        </p>
        {!hasParcel ? (
          <p
            data-testid="use-in-ai-need-parcel"
            style={{ margin: 0, fontSize: 11.5, color: PE.t5 }}
          >
            Select a property on the map to mint a share link from this sheet.
          </p>
        ) : shareUrl ? (
          <>
            <div
              data-testid="use-in-ai-share-url"
              style={{
                fontFamily: PE.mono,
                fontSize: 11.5,
                lineHeight: 1.65,
                color: PE.t2,
                wordBreak: "break-all",
                background: "rgba(0,0,0,.28)",
                border: `1px solid ${PE.line06}`,
                borderRadius: PE.rTouch,
                padding: "8px 10px",
                marginBottom: 9,
              }}
            >
              {shareUrl}
            </div>
            <Button
              variant="secondary"
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
            variant="secondary"
            fullWidth
            type="button"
            data-testid="use-in-ai-create-share"
            onClick={onCreateShare}
            disabled={sharePhase.kind === "minting"}
          >
            {sharePhase.kind === "minting" ? "Creating link…" : "Create a share link"}
          </Button>
        )}
        {sharePhase.kind === "notice" ? (
          <p
            data-testid="use-in-ai-share-notice"
            style={{
              margin: "8px 0 0",
              fontSize: 11.5,
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
              <strong style={{ fontSize: 12.5, color: PE.t1 }}>{row.name}</strong>
              {row.status === "connect" ? (
                <Button
                  variant="primary"
                  type="button"
                  data-testid={`use-in-ai-connect-${row.id}`}
                  onClick={() => handleConnectClick(row.id)}
                  style={{ padding: "4px 10px", fontSize: 11.5, minHeight: 0 }}
                >
                  Connect
                </Button>
              ) : (
                <StatusChip
                  data-testid={`use-in-ai-status-${row.id}`}
                  tone={row.status === "unavailable" ? "warning" : "absence"}
                >
                  {row.statusLabel}
                </StatusChip>
              )}
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 11.5, lineHeight: 1.45, color: PE.t5 }}>
              {row.line}
            </p>
            {row.note ? (
              <p
                data-testid={`use-in-ai-note-${row.id}`}
                style={{ margin: "5px 0 0", fontSize: 11.5, lineHeight: 1.45, color: PE.t5 }}
              >
                {row.note}
              </p>
            ) : null}
            {expandedConnect === row.id && row.status === "connect" ? (
              <VendorConnectPanel
                vendor={row.id}
                connectPhase={connectPhase}
                onCopyAddress={() => void handleCopyAddress(row.id)}
                onCancel={() => setExpandedConnect(null)}
              />
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
    const outcome = await mintShareLink(activeParcelNodeId, { includeNotes: true });
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
