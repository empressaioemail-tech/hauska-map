// CLAUDE SYNC — P-87. Was "Use in your AI", a four-vendor sheet.
//
// Operator ruling 2026-08-31: Claude only, here and in Settings. Cursor
// Connect still WORKS against the same OAuth server; it is no longer
// advertised. Nothing server-side was removed, so anyone already connected
// through Cursor keeps working. That is a deliberate narrowing, not a
// deprecation, and it is written down here because the code alone reads like
// the capability was dropped.
//
// TWO STATES, AND THE FACT THAT PICKS BETWEEN THEM.
//
//   not connected  the setup instructions, which are the only thing a new
//                  account can act on
//   connected      one Sync button that pushes the open property into a new
//                  Claude chat
//
// The fact is `pe_ai_connections`, written by the Smart Site MCP server when a
// client NAMES ITSELF on the JSON-RPC initialize. Claude sends that handshake
// the moment a custom connector finishes OAuth, so the card flips when setup
// finishes rather than when the user next remembers to ask something.
//
// THERE IS NO LOCAL "I CONNECTED IT" FLAG. It was the cheap version and it was
// rejected: a self-declared connection is a check that cannot fail, it resets
// on every new browser, and when it is wrong the user gets a Sync button that
// opens a Claude which cannot answer. Every unknown here — signed out, 404,
// 500, offline — renders the SETUP state. Showing someone how to connect when
// they already are costs them one click. The other direction costs them trust.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { usePropertyEntitlement } from "../../lib/usePropertyEntitlement";
import { getSavedProperty } from "../../lib/savedPropertiesClient";
import { savedRowDisplayLabel } from "../../lib/propertyDossier";
import {
  fetchAiConnections,
  type AiConnection,
  type AiConnectionsOutcome,
} from "../../lib/aiConnectionClient";
import {
  buildSyncPrompt,
  claudeDesktopChatUrl,
  claudeWebChatUrl,
  relativeSeen,
  SMART_SITE_CONNECT_HOST,
  SMART_SITE_CONNECT_URL,
  subscribeConnectionRefresh,
} from "../../lib/claudeSync";
import { PE } from "../../styles/pe-chrome";
import { useWorkbench } from "../WorkbenchContext";
import { LockedToolPanel } from "./LockedToolPanel";

export const CLAUDE_SYNC_VALUE_LINE =
  "Your Smart Site account, in Claude. Same plan. No key.";

/**
 * P-105: these two moved to src/lib/claudeSync.ts so the share plane's
 * serverless function can read them without importing a React component.
 * Re-exported here so every existing consumer and test is untouched, and so
 * there stays exactly ONE definition of the connector's address.
 */
export { SMART_SITE_CONNECT_HOST, SMART_SITE_CONNECT_URL };

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

export type UseInAiVendorId = "claude";
export type UseInAiVendorStatus = "connect" | "coming" | "unavailable";

export interface UseInAiVendorRow {
  id: UseInAiVendorId;
  name: string;
  line: string;
  status: UseInAiVendorStatus;
  statusLabel: string;
  note?: string;
}

/**
 * ONE row. Settings renders this same constant, so the two surfaces cannot
 * disagree about what this account can connect to. When a second vendor is
 * advertised again it is added here and both surfaces move together.
 */
export const CLAUDE_VENDOR: UseInAiVendorRow = {
  id: "claude",
  name: "Claude",
  line: "Find a parcel, open its smart site, run reports from the chat you already use.",
  status: "connect",
  statusLabel: "Connect",
};

export const CLAUDE_SYNC_VENDORS: UseInAiVendorRow[] = [CLAUDE_VENDOR];

/**
 * The Claude mark.
 *
 * DRAWN, NOT LICENSED. An eleven-ray burst generated from polar geometry in
 * the language of Anthropic's mark. It is NOT the official artwork and is not
 * claimed to be. If the exact logo is wanted, drop Anthropic's own SVG in here
 * and delete this note; the colour token and every call site stay as they are.
 */
const CLAUDE_BURST =
  "M12.16 10.85 L13.05 1.10 A1.05 1.05 0 0 0 10.95 1.10 L11.84 10.85 Z " +
  "M12.76 11.12 L18.78 3.40 A1.05 1.05 0 0 0 17.01 2.26 L12.49 10.95 Z " +
  "M13.11 11.67 L22.35 8.43 A1.05 1.05 0 0 0 21.48 6.52 L12.98 11.38 Z " +
  "M13.12 12.32 L22.64 14.59 A1.05 1.05 0 0 0 22.94 12.51 L13.16 12.01 Z " +
  "M12.76 12.87 L19.55 19.93 A1.05 1.05 0 0 0 20.93 18.34 L12.97 12.63 Z " +
  "M12.17 13.15 L14.06 22.75 A1.05 1.05 0 0 0 16.08 22.16 L12.48 13.06 Z " +
  "M11.52 13.06 L7.92 22.16 A1.05 1.05 0 0 0 9.94 22.75 L11.83 13.15 Z " +
  "M11.03 12.63 L3.07 18.34 A1.05 1.05 0 0 0 4.45 19.93 L11.24 12.87 Z " +
  "M10.84 12.01 L1.06 12.51 A1.05 1.05 0 0 0 1.36 14.59 L10.88 12.32 Z " +
  "M11.02 11.38 L2.52 6.52 A1.05 1.05 0 0 0 1.65 8.43 L10.89 11.67 Z " +
  "M11.51 10.95 L6.99 2.26 A1.05 1.05 0 0 0 5.22 3.40 L11.24 11.12 Z";

/**
 * Always Claude orange, in every rail state.
 *
 * The other rail glyphs are `currentColor` and take the rest / hover / open
 * ramp from the bubble. This one does not: a vendor mark that changes colour
 * on hover stops reading as that vendor's mark. The bubble still shows its
 * own state through the tint and the lift behind the glyph.
 */
export function ClaudeMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill={PE.claude}
      data-testid="claude-mark"
    >
      <path d={CLAUDE_BURST} />
    </svg>
  );
}

type CopyPhase =
  { kind: "idle" } | { kind: "copied" } | { kind: "notice"; text: string };

type SyncPhase =
  | { kind: "idle" }
  /** Prompt copied and a chat opened. Says both, because only one is certain. */
  | { kind: "sent" }
  | { kind: "notice"; text: string };

/**
 * What the card knows about Claude.
 *
 * `unknown` CARRIES A REASON. The first cut did not, and that is why a
 * completely dead read looked exactly like an honest "you have not connected
 * yet": both painted the setup panel with no notice. A read that failed and a
 * read that returned nothing are different facts and the card now says which.
 */
export type ClaudeConnectionState =
  | { kind: "loading" }
  | { kind: "connected"; connection: AiConnection }
  | { kind: "not-connected" }
  | { kind: "unknown"; reason: string };

/**
 * Customer-facing line for a read that did NOT come back clean.
 *
 * `blocked` gets its own wording because it is OUR fault, not the user's, and
 * telling a signed-in person to sign in is the specific lie that made this bug
 * invisible. None of these name an internal system.
 */
export function connectionFailureLine(outcome: AiConnectionsOutcome): string {
  switch (outcome.kind) {
    case "sign-in":
      return "Sign in to Smart Site to see whether Claude is connected.";
    case "blocked":
      return "Smart Site could not check this account. This is a fault on our side, not a problem with your Claude connection.";
    case "not-built":
      return "This Smart Site cannot check Claude connections yet.";
    default:
      return "Smart Site could not reach your account to check for a Claude connection.";
  }
}

export const CONNECT_STEPS: [string, string][] = [
  ["Copy the address below", "It is the full URL, not just the host"],
  ["In Claude: Settings, Connectors, Add custom connector", "Paste it there"],
  // NOT "Sign-in is OAuth". That word is on this sheet's own forbidden list and
  // was only ever invisible because the steps sat behind a collapsed panel.
  // Promoting them to the card exposed it, which is the test working.
  [
    "Approve Smart Site when Claude asks",
    "You sign in as yourself. There is no key",
  ],
];

function Label({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: "0 0 3px",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: ".13em",
        textTransform: "uppercase",
        color: PE.t6,
      }}
    >
      {children}
    </p>
  );
}

function Mono({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        fontFamily: PE.mono,
        fontSize: 12.5,
        lineHeight: 1.65,
        color: PE.t2,
        wordBreak: "break-all",
        // THE RECESS, not a bespoke dark panel. This is a slot the user copies
        // out of, which is the exact case pe-tokens.css defines --ss-sh-inset
        // for: void ground, one plane below the dock.
        background: PE.void,
        boxShadow: PE.shInset,
        border: `1px solid ${PE.line06}`,
        borderRadius: PE.rTouch,
        padding: "8px 10px",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

/**
 * STATE A — set it up.
 *
 * THREE STEP ROWS, not a run-on sentence. This was one paragraph carrying five
 * numbered steps, and the operator got lost on step one: a numbered list read
 * as prose gives you nothing to hold your place against while you switch to
 * another app and back.
 *
 * Each row is the number, WHAT YOU DO on the left, WHAT HAPPENS on the right.
 * Step three has no control on purpose. It happens inside Claude, and drawing
 * a button for it would promise something this app cannot do.
 *
 * THE CAPABILITY DISCLOSURE IS HERE TOO, AND IT GOES LAST. It shipped in the
 * connected panel only, which put "what you get" in front of the one audience
 * that had already decided. The person weighing up whether to connect is in
 * THIS panel and was the only one the old placement could never reach.
 *
 * Last child, not between the address and the Copy button. Two constraints
 * pin it there and neither is negotiable: the steps are the only thing an
 * unconnected account can act on, so nothing may push them down; and this card
 * leads with ONE action, which here is Copy. Any position above the button
 * column breaks the second, any position above the list breaks the first.
 */
export function ClaudeSetupPanel({
  copyPhase,
  onCopyAddress,
  heading,
  onBack,
  onRecheck,
  checking,
}: {
  copyPhase: CopyPhase;
  onCopyAddress: () => void;
  heading?: string;
  /** Present only when these steps were reached FROM the connected state. */
  onBack?: () => void;
  /** Manual re-read. The belt for when a focus event does not fire. */
  onRecheck?: () => void;
  checking?: boolean;
}) {
  return (
    <div data-testid="claude-sync-setup">
      {heading ? (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 14.5,
            lineHeight: 1.5,
            color: PE.t3,
          }}
        >
          {heading}
        </p>
      ) : null}
      <ol
        data-testid="claude-sync-steps"
        style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}
      >
        {CONNECT_STEPS.map(([action, effect], i) => (
          <li
            key={action}
            style={{
              display: "grid",
              gridTemplateColumns: "16px 1fr 1fr",
              gap: 8,
              alignItems: "baseline",
              padding: "5px 0",
              borderBottom:
                i === CONNECT_STEPS.length - 1
                  ? undefined
                  : `1px solid ${PE.line06}`,
              fontSize: 14.5,
              lineHeight: 1.45,
            }}
          >
            <span style={{ fontFamily: PE.mono, fontSize: 12.5, color: PE.t6 }}>
              {i + 1}
            </span>
            <span style={{ color: PE.t2 }}>{action}</span>
            <span style={{ color: PE.t5 }}>{effect}</span>
          </li>
        ))}
      </ol>
      <Label>Smart Site address</Label>
      <Mono testId="claude-sync-connect-host">{SMART_SITE_CONNECT_URL}</Mono>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Button
          variant="primary"
          fullWidth
          type="button"
          data-testid="claude-sync-copy-address"
          onClick={onCopyAddress}
        >
          {copyPhase.kind === "copied" ? "Copied" : "Copy Smart Site address"}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          type="button"
          data-testid="claude-sync-open-claude"
          onClick={() => {
            window.open(
              CLAUDE_CUSTOMIZE_CONNECTORS_URL,
              "_blank",
              "noopener,noreferrer",
            );
          }}
        >
          Open Customize → Connectors
        </Button>
        {onRecheck ? (
          <Button
            variant="ghost"
            dense
            type="button"
            data-testid="claude-sync-recheck"
            onClick={onRecheck}
            disabled={checking}
          >
            {checking ? "Checking…" : "Already connected? Check again"}
          </Button>
        ) : null}
        {onBack ? (
          <Button
            variant="ghost"
            dense
            type="button"
            data-testid="claude-sync-setup-back"
            onClick={onBack}
          >
            Back to sync
          </Button>
        ) : null}
      </div>
      {copyPhase.kind === "notice" ? (
        <p
          data-testid="claude-sync-copy-notice"
          style={{ margin: "8px 0 0", fontSize: 12.5, color: PE.t5 }}
        >
          {copyPhase.text}
        </p>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <WhatYouCanDo />
      </div>
    </div>
  );
}

/**
 * WHAT YOU CAN DO IN CLAUDE WITH SMART SITE.
 *
 * TAKEN FROM THE SERVER'S OWN llms.txt, not written from memory. The Smart
 * Site MCP publishes thirteen tools and marks THREE of them `not ready`:
 * request_records, check_request and ask_the_map. Those are deliberately
 * absent from this list. A card headed "what you can do" that names a tool
 * returning not_ready is a promise the product cannot keep, and the user
 * discovers it by asking Claude and getting a refusal.
 *
 * When one of the three goes live, it moves from CLAUDE_NOT_YET to
 * CLAUDE_CAN_DO. The test pins that the two sets never overlap.
 *
 * P-101, 2026-09-02. The same rule bites on ENTITLEMENT, not only on
 * readiness. "Screen a pasted list" and "Keep a screen" promised every
 * connected user a capability that, since the 2026-08-31 ladder re-cut, is
 * Studio and Team: `create_screen` and `add_to_screen` are refused at the
 * api-server screens routes for Solo and free accounts. An unqualified card
 * row is the same broken promise this file's header already refuses to make,
 * discovered the same way -- by asking Claude and getting a refusal. Both rows
 * now name the rung. `list_screens` stays open, so reopening a screen is not
 * qualified.
 */
export const CLAUDE_CAN_DO: { title: string; line: string }[] = [
  {
    title: "Find a property",
    line: "By address or parcel id, anywhere in Central Texas coverage.",
  },
  {
    title: "Open its smart site",
    line: "Zoning and jurisdiction, land use, flood zone and the setback disposition, each with its citation.",
  },
  {
    title: "Run the property report",
    line: "The same R1 report the Reports tool builds, read from the baked snapshot.",
  },
  {
    title: "Export an instrument",
    line: "Site plan, terrain model, dossier or brief, at whatever your plan allows.",
  },
  {
    title: "Screen a pasted list",
    line: "Paste addresses and Claude opens a screening board with a rail state per property. Studio and Team.",
  },
  {
    title: "Keep a screen",
    line: "Add properties to a screen on Studio or Team; reopen a screen by name on any plan.",
  },
  {
    title: "Save and track",
    line: "Save a property, set it to New, Watching, Chasing or Passed, and list what you have saved.",
  },
];

/**
 * Named because silence reads as "not possible" rather than "not yet", and a
 * user who asks Claude for records should not have to learn this from a
 * refusal. These are the server's own `not ready` tools.
 */
export const CLAUDE_NOT_YET =
  "Records requests and free-form questions about a parcel are not live yet.";

/**
 * TWO MOUNT SITES, ONE COMPONENT, ONE COPY.
 *
 * Rendered last in the setup panel and last in the connected panel. Not
 * duplicated and not forked per state: this file already holds one vendor row
 * feeding two surfaces for the same reason, which is that two copies of a
 * capability list drift and the drift is invisible until a user is promised
 * something that is not there.
 *
 * Each mount owns its own `open`, which is right rather than merely tolerable
 * — the two panels are mutually exclusive (`showSync` XOR setup) and never
 * co-render, so there is no shared state for them to disagree about.
 *
 * Collapsed on first render in BOTH. The card leads with one action in each
 * state (Copy when not connected, Sync when connected) and a disclosure that
 * opened itself would take that lead away.
 */
function WhatYouCanDo() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 4 }}>
      <Button
        variant="ghost"
        dense
        type="button"
        data-testid="claude-sync-can-do-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide" : "What you can do in Claude with Smart Site"}
      </Button>
      {open ? (
        <ul
          data-testid="claude-sync-can-do"
          style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}
        >
          {CLAUDE_CAN_DO.map((row, i) => (
            <li
              key={row.title}
              style={{
                padding: "7px 0",
                borderTop: i === 0 ? undefined : `1px solid ${PE.line06}`,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600, color: PE.t2 }}>
                {row.title}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  color: PE.t5,
                }}
              >
                {row.line}
              </div>
            </li>
          ))}
          <li
            data-testid="claude-sync-not-yet"
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${PE.line06}`,
              fontSize: 12.5,
              lineHeight: 1.45,
              color: PE.t6,
            }}
          >
            {CLAUDE_NOT_YET}
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/**
 * STATE B — push it.
 *
 * Sync copies the prompt AND opens a chat, and the confirmation says both.
 * Anthropic documents prefill only for the `claude://` desktop scheme; the web
 * `?q=` form is undocumented and was reported removed for regular chat. So the
 * clipboard is the half that is certain and the composer is the half that
 * might be. Saying so is cheaper than a Sync that silently does nothing.
 */
export function ClaudeSyncPanel({
  connection,
  subjectLabel,
  hasParcel,
  syncPhase,
  onSync,
  onSyncDesktop,
  onReconnect,
  now,
}: {
  connection: AiConnection;
  subjectLabel: string | null;
  hasParcel: boolean;
  syncPhase: SyncPhase;
  onSync: () => void;
  onSyncDesktop: () => void;
  onReconnect: () => void;
  now?: number;
}) {
  const seen = relativeSeen(connection.lastSeenAt, now);
  return (
    <div data-testid="claude-sync-connected">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          fontSize: 12.5,
          color: PE.t5,
        }}
      >
        <ClaudeMark size={14} />
        <span data-testid="claude-sync-connected-line">
          Connected as {connection.client}
          {seen ? `, last seen ${seen}` : ""}
        </span>
      </div>

      <Label>Property</Label>
      <Mono testId="claude-sync-subject">
        {hasParcel ? (subjectLabel ?? "Resolving…") : "No property selected"}
      </Mono>

      {hasParcel ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Button
            variant="primary"
            fullWidth
            type="button"
            data-testid="claude-sync-push"
            onClick={onSync}
          >
            {syncPhase.kind === "sent" ? "Sent to Claude" : "Sync to Claude"}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            type="button"
            data-testid="claude-sync-push-desktop"
            onClick={onSyncDesktop}
          >
            Open in the Claude desktop app
          </Button>
        </div>
      ) : (
        <p
          data-testid="claude-sync-need-parcel"
          style={{ margin: 0, fontSize: 12.5, color: PE.t5 }}
        >
          Select a property on the map to push it into a Claude chat.
        </p>
      )}

      {syncPhase.kind === "sent" ? (
        <p
          data-testid="claude-sync-sent-notice"
          style={{ margin: "8px 0 0", fontSize: 12.5, color: PE.t5 }}
        >
          Claude is open in a new tab and the prompt is on your clipboard. Paste
          it if the chat came up empty.
        </p>
      ) : null}
      {syncPhase.kind === "notice" ? (
        <p
          data-testid="claude-sync-notice"
          style={{ margin: "8px 0 0", fontSize: 12.5, color: PE.t5 }}
        >
          {syncPhase.text}
        </p>
      ) : null}

      <div style={{ marginTop: 10 }}>
        <Button
          variant="ghost"
          dense
          type="button"
          data-testid="claude-sync-reconnect"
          onClick={onReconnect}
        >
          Connect a different Claude
        </Button>
        <WhatYouCanDo />
      </div>
    </div>
  );
}

export function ClaudeSyncBody({
  connection,
  hasParcel,
  subjectLabel,
  onSync,
  onSyncDesktop,
  syncPhase,
  onRecheck,
  checking,
  now,
}: {
  connection: ClaudeConnectionState;
  hasParcel: boolean;
  subjectLabel: string | null;
  onSync: () => void;
  onSyncDesktop: () => void;
  syncPhase: SyncPhase;
  /** Manual re-read of the connection. Absent in pure-render tests. */
  onRecheck?: () => void;
  checking?: boolean;
  now?: number;
}) {
  const [copyPhase, setCopyPhase] = useState<CopyPhase>({ kind: "idle" });
  /** Reveals the setup steps from the connected state, without claiming we disconnected. */
  const [forceSetup, setForceSetup] = useState(false);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(SMART_SITE_CONNECT_URL);
      setCopyPhase({ kind: "copied" });
      window.setTimeout(() => {
        setCopyPhase((p) => (p.kind === "copied" ? { kind: "idle" } : p));
      }, 1800);
    } catch {
      setCopyPhase({
        kind: "notice",
        text: "Copy failed — select the address and copy it manually.",
      });
    }
  };

  const showSync = connection.kind === "connected" && !forceSetup;

  return (
    <div data-testid="claude-sync-tool">
      <p
        data-testid="claude-sync-lede"
        style={{
          margin: "0 0 12px",
          fontSize: 14.5,
          lineHeight: 1.5,
          color: PE.t3,
        }}
      >
        {CLAUDE_SYNC_VALUE_LINE}
      </p>

      {connection.kind === "loading" ? (
        <p
          data-testid="claude-sync-loading"
          style={{ margin: "0 0 12px", fontSize: 12.5, color: PE.t5 }}
        >
          Checking this account for a Claude connection…
        </p>
      ) : showSync ? (
        <ClaudeSyncPanel
          connection={connection.connection}
          subjectLabel={subjectLabel}
          hasParcel={hasParcel}
          syncPhase={syncPhase}
          onSync={onSync}
          onSyncDesktop={onSyncDesktop}
          onReconnect={() => setForceSetup(true)}
          now={now}
        />
      ) : (
        <>
          {connection.kind === "unknown" ? (
            <p
              data-testid="claude-sync-check-failed"
              style={{
                margin: "0 0 12px",
                padding: "8px 10px",
                borderRadius: PE.rTouch,
                border: `1px solid ${PE.line14}`,
                fontSize: 12.5,
                lineHeight: 1.45,
                color: PE.warning,
              }}
            >
              {connection.reason}
            </p>
          ) : null}
          <ClaudeSetupPanel
            copyPhase={copyPhase}
            onCopyAddress={() => void handleCopyAddress()}
            heading={
              forceSetup
                ? "Add Smart Site to another Claude account or surface."
                : "Connect Claude to this Smart Site account. Three steps, no key."
            }
            onBack={forceSetup ? () => setForceSetup(false) : undefined}
            onRecheck={onRecheck}
            checking={checking}
          />
        </>
      )}
    </div>
  );
}

export function ClaudeSyncTool() {
  const { activeParcelNodeId } = useWorkbench();
  const [syncPhase, setSyncPhase] = useState<SyncPhase>({ kind: "idle" });
  const [connection, setConnection] = useState<ClaudeConnectionState>({
    kind: "loading",
  });
  const [subjectLabel, setSubjectLabel] = useState<string | null>(null);
  const ent = usePropertyEntitlement(activeParcelNodeId);

  // THE CONNECTED READ, AND WHY IT RE-RUNS.
  //
  // This shipped 2026-08-31 as a mount-only `useEffect` with `[]` deps, and it
  // was the defect the operator hit within the hour: connect Claude, come back
  // to the tab, and the card is still showing setup instructions computed
  // BEFORE the connect. Reopening the card did not help either, because the
  // dock collapse keeps its content mounted (`maxHeight: isOpen ? 100000 : 0`
  // in Workbench.tsx) rather than unmounting it. Only a full page reload ever
  // re-read. A correct read that runs once and can never run again is a
  // starved mechanism: it reports as working and answers with stale state.
  //
  // Connecting happens in ANOTHER APPLICATION. The whole flow is: leave this
  // tab, do something in Claude, come back. So the return itself is the
  // signal, and `focus` plus `visibilitychange` are what carry it. The manual
  // control below is the belt: focus events do not fire in every arrangement
  // (same-tab navigation and back, some window managers), and a user who has
  // just connected needs a way to say so that does not depend on us guessing
  // the window semantics right.
  const [checking, setChecking] = useState(false);

  const refreshConnection = useCallback(async () => {
    setChecking(true);
    const outcome = await fetchAiConnections();
    setChecking(false);
    if (outcome.kind !== "ready") {
      setConnection({
        kind: "unknown",
        reason: connectionFailureLine(outcome),
      });
      return;
    }
    setConnection(
      outcome.claude
        ? { kind: "connected", connection: outcome.claude }
        : { kind: "not-connected" },
    );
  }, []);

  useEffect(() => {
    let live = true;
    const run = () => {
      if (live) void refreshConnection();
    };
    run();
    const unsubscribe = subscribeConnectionRefresh(run, window, document);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [refreshConnection]);

  // BEST-EFFORT LABEL. Resolved from the saved-property row when there is one.
  // Never synthesised: an unresolved label falls back to the node id, which is
  // the half `get_smart_site` actually needs, and buildSyncPrompt drops the
  // human name rather than dressing the id up as an address.
  useEffect(() => {
    let live = true;
    setSubjectLabel(null);
    if (!activeParcelNodeId) return;
    void getSavedProperty(activeParcelNodeId)
      .then((outcome) => {
        if (!live) return;
        const row = outcome.kind === "found" ? outcome.row : null;
        setSubjectLabel(row ? savedRowDisplayLabel(row) : activeParcelNodeId);
      })
      .catch(() => {
        if (live) setSubjectLabel(activeParcelNodeId);
      });
    return () => {
      live = false;
    };
  }, [activeParcelNodeId]);

  const pushToClaude = useCallback(
    async (target: "web" | "desktop") => {
      if (!activeParcelNodeId) return;
      const prompt = buildSyncPrompt({
        parcelNodeId: activeParcelNodeId,
        label: subjectLabel,
      });
      let copied = true;
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        copied = false;
      }
      const url =
        target === "desktop"
          ? claudeDesktopChatUrl(prompt)
          : claudeWebChatUrl(prompt);
      window.open(
        url,
        target === "desktop" ? "_self" : "_blank",
        "noopener,noreferrer",
      );
      setSyncPhase(
        copied
          ? { kind: "sent" }
          : {
              kind: "notice",
              text: "Claude is open, but the prompt could not be copied. Ask it for this property by address.",
            },
      );
      window.setTimeout(() => {
        setSyncPhase((p) => (p.kind === "sent" ? { kind: "idle" } : p));
      }, 6000);
    },
    [activeParcelNodeId, subjectLabel],
  );

  if (activeParcelNodeId && ent.signedOut) {
    return (
      <LockedToolPanel
        valueLine={CLAUDE_SYNC_VALUE_LINE}
        signedOut
        signInLine="Sign in to hook this Smart Site account to Claude."
        testId="claude-sync-locked"
      />
    );
  }

  return (
    <ClaudeSyncBody
      connection={connection}
      hasParcel={Boolean(activeParcelNodeId)}
      subjectLabel={subjectLabel}
      onSync={() => void pushToClaude("web")}
      onSyncDesktop={() => void pushToClaude("desktop")}
      syncPhase={syncPhase}
      onRecheck={() => void refreshConnection()}
      checking={checking}
    />
  );
}
