// SETTINGS — the standalone account console. Peer of pricing and checkout.
//
// Built from the v2 design drop (Smart Site Account Settings.dc). What was
// TRANSLATED rather than copied, and why:
//
//   The drop links the SmartCity design system and loads Oxygen. Neither may
//   ship here: PE has one kit (pe-tokens.css + pe-chrome.ts) and Oxygen is
//   retired. Every colour below is a PE token, every control is the kit
//   Button, and the type sits on the v2 ramp. The comp's raw hexes are its
//   own canvas chrome, not the spec.
//
// WHAT IS REAL AND WHAT IS NOT, which is the whole design:
//
//   Account      REAL. Provider sign-in and logout from auth.ts. The email is
//                NOT READ: GET /api/auth/session returns { authenticated,
//                hasSession } and the BFF holds an opaque token. The address
//                exists only at the OAuth callback. The slot says so instead
//                of printing a specimen address.
//   Plan         REAL for access (free/paid). Tier name, billing interval and
//                renewal date have no read anywhere and say Not read. Payment
//                method, invoices and cancel need a billing portal that does
//                not exist and say Not built.
//   Connections  REAL. Renders CLAUDE_SYNC_VENDORS, the same list the Claude
//                Sync rail bubble renders, so the two cannot drift. Claude-only
//                since the 2026-08-31 operator ruling: Cursor Connect still
//                works against the same OAuth server and is simply no longer
//                advertised on either surface.
//   Team         REAL UI over a read that does not exist yet. There is no
//                members table and no endpoint; fetchTeamRoster calls the one
//                the server will expose and reports what it got. Today that
//                is 404 -> `not-built`, which renders the drop's own Not read
//                state. There are NO fixture rows in this file. When the
//                endpoint lands, this lights up unchanged.

import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { StatusChip } from "../components/StatusChip";
import { PE } from "../styles/pe-chrome";
import {
  fetchAuthStatus,
  fetchSession,
  googleSignInUrl,
  logout,
  microsoftSignInUrl,
  type AuthStatus,
} from "../lib/auth";
import { usePropertyEntitlement } from "../lib/usePropertyEntitlement";
import {
  CLAUDE_CUSTOMIZE_CONNECTORS_URL,
  CLAUDE_SYNC_VENDORS,
  SMART_SITE_CONNECT_URL,
} from "../workbench/tools/ClaudeSyncTool";
import {
  canActOn,
  canInvite,
  fetchTeamRoster,
  isLastOwner,
  seatCounts,
  type TeamOutcome,
} from "../lib/teamClient";
import { NextActionCard } from "../components/NextActionCard";
import { fetchAiConnections } from "../lib/aiConnectionClient";
import { fetchAccountUnlocks } from "../lib/unlockClient";
import {
  nextAction,
  type ClaudeRead,
  type EntitlementRead,
  type NextAction,
  type NextActionId,
  type SeatsRead,
  type UnlocksRead,
} from "../lib/nextAction";

export type SettingsSection = "account" | "plan" | "connections" | "team";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan" },
  { id: "connections", label: "Connections" },
  { id: "team", label: "Team" },
];

/**
 * P-98. The right rail used to carry a per-tab sentence explaining the panel's
 * own design discipline. It now carries ONE state-derived next step, or
 * nothing, from the pure ladder in lib/nextAction.ts. Settings is the
 * PROTOTYPE mount for that component, not its destination.
 */
const NEXT_ACTION_SURFACE = "settings";

/**
 * WHAT THIS MOUNT CAN ACTUALLY RUN, and it is fewer than the ladder can
 * propose. The ladder is host-agnostic; this host does not have a working
 * control for every step, and rendering a button that goes nowhere is the
 * dead-control defect this panel exists to avoid.
 *
 * NOT RUNNABLE HERE, with the reason:
 *
 *   team_invite             There is NO invite write path anywhere in this
 *                           client. The Team tab's Invite block is prose, and
 *                           api/_lib/deep-allowlist.ts states the writes stay
 *                           off "until the client has a write path".
 *   unlock_expiring         onUpgrade opens the pricing modal scoped to the
 *                           MAP's active parcel, which is not necessarily the
 *                           parcel whose unlock is lapsing. Sending someone to
 *                           a checkout for a different property is worse than
 *                           not offering the step at all. Extending needs
 *                           parcel-scoped routing this host does not have.
 *
 * FAIL CLOSED. A new NextActionId is not runnable until it is added here AND
 * given a branch in runAction below. The rail goes quiet rather than guessing.
 */
const SETTINGS_RUNNABLE: ReadonlySet<NextActionId> = new Set<NextActionId>([
  "connect_claude",
  "property_unlock",
  "annual_upgrade",
]);

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: ".16em",
        textTransform: "uppercase",
        color: PE.blue,
      }}
    >
      {children}
    </div>
  );
}

function Aside({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 14.5,
        lineHeight: 1.6,
        color: PE.t4,
        borderLeft: `2px solid ${PE.line28}`,
        paddingLeft: 12,
      }}
    >
      {children}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${PE.line14}`,
        borderRadius: PE.rTouch,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  note,
  last,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "13px 16px",
        borderBottom: last ? undefined : `1px solid ${PE.line06}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <span style={{ fontSize: 14.5, color: PE.t3 }}>{label}</span>
        <span style={{ fontSize: 14.5, color: PE.t5 }}>{value}</span>
      </div>
      {note ? (
        <div style={{ fontSize: 12.5, lineHeight: 1.55, color: PE.t5 }}>{note}</div>
      ) : null}
    </div>
  );
}

/** The one emphasis treatment: quiet outline plus a blue glyph. Never a fill. */
const OPEN_GLYPH = "↗";

export function SettingsModal({
  onClose,
  onUpgrade,
  initialSection = "account",
}: {
  onClose: () => void;
  onUpgrade: () => void;
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [team, setTeam] = useState<TeamOutcome | null>(null);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const ent = usePropertyEntitlement(null);
  const [claude, setClaude] = useState<ClaudeRead>({ kind: "unread" });
  const [unlocks, setUnlocks] = useState<UnlocksRead>({ kind: "unread" });
  const [unlocksAsked, setUnlocksAsked] = useState(false);
  // The post-action note is KEYED TO THE ACTION THAT PRODUCED IT. Holding a
  // bare ReactNode here was the first draft and it was wrong: "Address
  // copied" would still be sitting under whatever action the next tab
  // proposed, which is a line of text asserting something about a step the
  // user never took.
  const [actNote, setActNote] = useState<{ id: NextActionId; node: ReactNode } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchSession().then((s) => !cancelled && setAuthed(s.authenticated));
    void fetchAuthStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (section !== "team" || team) return;
    let cancelled = false;
    void fetchTeamRoster().then((o) => !cancelled && setTeam(o));
    return () => {
      cancelled = true;
    };
  }, [section, team]);

  // THE CLAUDE READ IS REUSED, NOT REBUILT. fetchAiConnections is the same
  // call the Claude Sync card makes; there is exactly one read of
  // pe_ai_connections in this client and this is it.
  //
  // ONLY A CLEAN READ BECOMES A FACT. sign-in, blocked (403 — our own proxy),
  // not-built (404) and error all stay `unread`, and the ladder proposes
  // nothing on unread. That is the OPPOSITE of what the Claude Sync CARD does
  // with the same outcomes, and the difference is deliberate: the card's job
  // is disclosure, so showing setup on an unknown costs nothing, while the
  // rail's job is to propose a step off read state. The reasoning is written
  // out at the top of lib/nextAction.ts.
  useEffect(() => {
    let cancelled = false;
    void fetchAiConnections().then((o) => {
      if (cancelled) return;
      setClaude(
        o.kind === "ready"
          ? { kind: "read", connected: o.claude !== null }
          : { kind: "unread" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The account-wide unlock read, asked once, only on the tab that uses it.
  //
  // EVERY NON-READY OUTCOME KEEPS ITS OWN KIND. A 404 (route not deployed), a
  // 403 (our own proxy refusing our own path) and a 500 (the server could not
  // compute) must none of them reach the ladder looking like "this account
  // holds no unlocks". The route fails LOUD and never returns an empty list to
  // mean failure, which is exactly why an empty `read` can be trusted here.
  //
  // `asOf` travels with the list because it is the clock those expiries were
  // computed against; the ladder reads it rather than the browser's.
  useEffect(() => {
    if (section !== "plan" || unlocksAsked) return;
    setUnlocksAsked(true);
    let cancelled = false;
    void fetchAccountUnlocks().then((o) => {
      if (cancelled) return;
      setUnlocks(
        o.kind === "ready"
          ? { kind: "read", asOf: o.asOf, unlocks: o.unlocks }
          : o.kind === "not-built"
            ? { kind: "not-built" }
            : o.kind === "blocked"
              ? { kind: "blocked" }
              : o.kind === "error"
                ? { kind: "error" }
                : { kind: "unread" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [section, unlocksAsked]);

  // ACCESS SAYS "Not read" UNTIL THE READ RESOLVES, AND HERE IT NEVER DOES.
  //
  // This line used to be `locked ? "Free" : signedOut ? "Not read" : "Paid"`,
  // and it showed **Paid to every account, including anonymous**. The chain:
  // line 183 passes `null` on purpose, because Settings is account-scoped and
  // has no parcel; usePropertyEntitlement returns its LOADING constant for a
  // null id; LOADING carries `locked: false` and `signedOut: false`; so both
  // guards missed and the ternary fell through to its most generous branch.
  //
  // The entitlement route requires a parcelNodeId, so this hook can never
  // answer an account-level question and the field is UNREADABLE from here.
  // This panel's own rule is that a field with no traced source says Not read.
  // It now obeys that rule rather than guessing the flattering answer.
  //
  // The real fix is an account-level entitlement read that does not need a
  // parcel. That same missing read also starves the next-action rail's
  // annual_upgrade rung, which needs billingInterval. One route unblocks both.
  const access =
    ent.status !== "ready"
      ? "Not read"
      : ent.locked
        ? "Free"
        : ent.signedOut
          ? "Not read"
          : "Paid";

  // ENTITLEMENT IS UNREAD ON THIS SURFACE, and that is a fact about the read
  // rather than a shortcut. usePropertyEntitlement is PER-PROPERTY, Settings
  // has no property, and the hook returns its LOADING constant and never
  // fetches when parcelNodeId is null. So `status` is "loading" here and this
  // resolves to `unread`, which keeps every Plan and Team rung quiet instead
  // of proposing an action off a constant. What would populate it is an
  // ACCOUNT-level entitlement read, which does not exist in this client; the
  // branch is written so that the day one lands, the rail lights up unchanged.
  const entitlement: EntitlementRead =
    ent.status === "ready"
      ? {
          kind: "read",
          tier: ent.pro ? "paid" : "free",
          subscriptionTier: ent.subscriptionTier,
          // NOT ON THE WIRE. The Plan tab above renders "Billing interval:
          // Not read" for exactly this reason. Inferring "monthly" from the
          // absence would push an annual upgrade at someone who already
          // switched, so the annual rung stays starved until the field exists.
          billingInterval: null,
          freeMessagesLeft: ent.freeMessagesLeft,
        }
      : { kind: "unread" };

  // Seats come off the roster read that the Team tab already performs. An
  // unknown seat count stays unread — teamClient.canInvite refuses on one for
  // the same reason: unknown is the absence of permission, not permission.
  const seats: SeatsRead = (() => {
    if (team?.kind !== "ready") return { kind: "unread" };
    const counts = seatCounts(team.roster);
    if (counts.remaining === null) return { kind: "unread" };
    return {
      kind: "read",
      seatsRemaining: counts.remaining,
      viewerIsOwner: team.roster.viewerRole === "owner",
    };
  })();

  // No clock is passed. The only rung that needs one reads the `asOf` the
  // server stamped on the same response as the expiries, so the rail and the
  // server cannot disagree about what "four days" means.
  const proposed = nextAction(section, {
    // A session that has not been read yet is not a signed-in one.
    authenticated: authed === true,
    claude,
    entitlement,
    unlocks,
    seats,
  });
  // Not runnable here means not rendered here. See SETTINGS_RUNNABLE.
  const action = proposed && SETTINGS_RUNNABLE.has(proposed.id) ? proposed : null;

  const runAction = (a: NextAction) => {
    switch (a.id) {
      case "connect_claude": {
        // The real step is two things, and both constants come from
        // ClaudeSyncTool so Settings and the Sync card cannot disagree about
        // the address or about the hard-won connectors URL slug.
        const paste = `Paste ${SMART_SITE_CONNECT_URL} into Claude: Add custom connector.`;
        const say = (node: ReactNode) => setActNote({ id: a.id, node });
        try {
          const write = navigator.clipboard?.writeText(SMART_SITE_CONNECT_URL);
          if (write) {
            void write.then(
              () =>
                say("Address copied. In Claude: Settings, Connectors, Add custom connector."),
              // The note reports what actually happened. Claiming a copy that
              // failed would leave someone pasting an empty clipboard.
              () => say(paste),
            );
          } else {
            say(paste);
          }
        } catch {
          say(paste);
        }
        window.open(
          CLAUDE_CUSTOMIZE_CONNECTORS_URL,
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      case "property_unlock":
      case "annual_upgrade":
        // ONE pricing surface. The rail names the capability and the checkout
        // carries the number, so a plan is never priced in two places.
        onUpgrade();
        return;
      case "unlock_expiring":
      case "team_invite":
        // Unreachable: SETTINGS_RUNNABLE excludes both, with reasons. Left as
        // explicit arms so adding a NextActionId is a compile-time decision
        // here rather than a silent no-op.
        return;
    }
  };

  return (
    <Modal label="Settings" title="Settings" onClose={onClose} width={940}>
      <div data-testid="settings-modal">
        {/* TABS */}
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${PE.line06}`,
            marginBottom: 0,
          }}
        >
          {SECTIONS.map((s) => {
            const on = section === s.id;
            return (
              // The kit Button, not a native one: W9 (P-93) makes a raw
              // <button> in chrome a CI failure, and a tab is still a button.
              // The tab LOOK is a style override on the quiet variant, which
              // is what the style prop is for.
              <Button
                key={s.id}
                variant="ghost"
                role="tab"
                aria-selected={on}
                data-testid={`settings-tab-${s.id}`}
                onClick={() => setSection(s.id)}
                style={{
                  padding: "12px 16px",
                  fontSize: 15.5,
                  borderRadius: 0,
                  border: 0,
                  borderBottom: `2px solid ${on ? PE.blue : "transparent"}`,
                  color: on ? PE.t1 : PE.t3,
                  fontWeight: on ? 600 : 400,
                }}
              >
                {s.label}
              </Button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px" }}>
          <div
            style={{
              padding: "22px 22px 26px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {section === "account" ? (
              <div data-testid="settings-account" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Eyebrow>Account</Eyebrow>
                <Panel>
                  <Row
                    label="Signed in as"
                    value={<span data-testid="settings-email-not-read">Not read</span>}
                    note="The session read returns authentication only. The address exists at the OAuth callback and is not persisted anywhere a later read can reach."
                  />
                  <Row label="Session" value="This browser" />
                  <Row label="Access" value={access} last />
                </Panel>
                {authed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Button
                      variant="primary"
                      data-testid="settings-signout"
                      onClick={() => void logout().then(() => window.location.reload())}
                    >
                      Sign out
                    </Button>
                    <span style={{ fontSize: 12.5, color: PE.t5 }}>
                      Signing out clears this browser only.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    {status?.configured.google ? (
                      <a href={googleSignInUrl()} data-testid="settings-signin-google">
                        <Button variant="primary">Continue with Google</Button>
                      </a>
                    ) : null}
                    {status?.configured.microsoft ? (
                      <a href={microsoftSignInUrl()} data-testid="settings-signin-microsoft">
                        <Button variant="secondary">Continue with Microsoft</Button>
                      </a>
                    ) : null}
                  </div>
                )}
                <Aside>
                  Sign-in is Google or Microsoft, so there is no Smart Site
                  password; change the address with that provider.
                </Aside>
              </div>
            ) : null}

            {section === "plan" ? (
              <div data-testid="settings-plan" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Eyebrow>Plan and billing</Eyebrow>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 20,
                    padding: "16px 18px",
                    border: `1px solid ${PE.line14}`,
                    borderRadius: PE.rTouch,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: PE.t1 }}>{access}</div>
                    <div style={{ fontSize: 12.5, color: PE.t5 }}>
                      Entitlement reads paid or free. Tier name and billing
                      interval are not on that wire.
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    glyph={OPEN_GLYPH}
                    data-testid="settings-upgrade"
                    onClick={onUpgrade}
                  >
                    View plans
                  </Button>
                </div>
                <div style={{ fontSize: 15.5, lineHeight: 1.65, color: PE.t2 }}>
                  Upgrading opens the same checkout as everywhere else in the
                  app, so a plan is never priced in two places.
                </div>
                <Panel>
                  <Row label="Tier name" value="Not read" />
                  <Row label="Billing interval" value="Not read" />
                  <Row label="Renewal date" value="Not read" />
                  <Row label="Payment method" value="Not built" />
                  <Row label="Invoices" value="Not built" />
                  <Row label="Cancel subscription" value="Not built" last />
                </Panel>
                <Aside>
                  Payment method, invoices and cancelling need a billing portal
                  that has not been built. Until then, use the email receipt
                  from checkout.
                </Aside>
              </div>
            ) : null}

            {section === "connections" ? (
              <div data-testid="settings-connections" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Eyebrow>Connections</Eyebrow>
                <div style={{ fontSize: 15.5, lineHeight: 1.65, color: PE.t2 }}>
                  Connect Smart Site to an AI assistant so it can read the
                  properties and reports on this account.
                </div>
                <Panel>
                  {CLAUDE_SYNC_VENDORS.map((row, i) => (
                    <div
                      key={row.id}
                      data-testid={`settings-connection-${row.id}`}
                      data-status={row.status}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 20,
                        padding: "13px 16px",
                        borderBottom:
                          i === CLAUDE_SYNC_VENDORS.length - 1
                            ? undefined
                            : `1px solid ${PE.line06}`,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 15.5, color: PE.t1 }}>{row.name}</span>
                        <span style={{ fontSize: 12.5, color: PE.t5 }}>
                          {row.status === "connect"
                            ? "Reads properties and reports on this account"
                            : row.statusLabel}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: row.status === "connect" ? 14.5 : 12.5,
                          fontWeight: row.status === "connect" ? 600 : 400,
                          color: row.status === "connect" ? PE.blue : PE.t5,
                        }}
                      >
                        {row.statusLabel}
                      </span>
                    </div>
                  ))}
                </Panel>
                <div style={{ fontSize: 12.5, color: PE.t5 }}>
                  Rows render the shared vendor list the Claude Sync bubble
                  renders. Settings does not declare its own.
                </div>
              </div>
            ) : null}

            {section === "team" ? (
              <TeamTab
                outcome={team}
                confirmEmail={confirmEmail}
                onAskRemove={setConfirmEmail}
                onUpgrade={onUpgrade}
                onRetry={() => setTeam(null)}
              />
            ) : null}
          </div>

          {/* NEXT ACTION — one state-derived step, or nothing. */}
          <div
            data-testid="settings-next-action-rail"
            style={{
              borderLeft: `1px solid ${PE.line06}`,
              padding: "22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <NextActionCard
              action={action}
              surface={NEXT_ACTION_SURFACE}
              onAct={runAction}
              // Keyed to the action that produced it, so a note from one step
              // can never sit under the next tab's step.
              note={actNote && actNote.id === action?.id ? actNote.node : null}
            />
            <div style={{ flex: 1 }} />
            {/*
              THE HONESTY NOTE STAYS, in one line, BELOW the action.

              This panel is full of "Not read" and "Not built" rows and fixing
              those rows was out of scope for the card that replaced this rail.
              Deleting the sentence that makes them read as honest rather than
              broken, while the rows it explains are still there, would make
              the product look worse rather than cleaner. It lives here rather
              than inside NextActionCard because it is a statement about
              SETTINGS, and the component may not assume Settings.
            */}
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                color: PE.t5,
                borderTop: `1px solid ${PE.line06}`,
                paddingTop: 14,
              }}
            >
              Every value here names where it was read from — a field with no
              traced source says Not read, and nothing in this popup is a
              control that does nothing.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The Team tab.
 *
 * Every branch below is driven by what the READ returned. `not-built` is its
 * own state because an unreadable roster and an empty one are different facts,
 * and the design is explicit that a failed read must never fall through to an
 * empty list.
 */
function TeamTab({
  outcome,
  confirmEmail,
  onAskRemove,
  onUpgrade,
  onRetry,
}: {
  outcome: TeamOutcome | null;
  confirmEmail: string | null;
  onAskRemove: (email: string | null) => void;
  onUpgrade: () => void;
  onRetry: () => void;
}) {
  if (outcome === null) {
    return (
      <div data-testid="settings-team" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Eyebrow>Team</Eyebrow>
        <div style={{ fontSize: 14.5, color: PE.t5 }}>Reading the roster.</div>
      </div>
    );
  }

  if (outcome.kind !== "ready") {
    const notBuilt = outcome.kind === "not-built";
    return (
      <div data-testid="settings-team" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Eyebrow>Team</Eyebrow>
        <div
          data-testid="settings-team-not-read"
          style={{
            border: `1px solid ${PE.line14}`,
            borderRadius: PE.rTouch,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <StatusChip tone="absence">Not read</StatusChip>
          <div style={{ fontSize: 17.5, fontWeight: 700, color: PE.t1 }}>
            {outcome.kind === "sign-in"
              ? "Sign in to see who is on this account"
              : "The roster could not be read"}
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.65, color: PE.t2 }}>
            {notBuilt
              ? "The member service is not deployed yet. This is not an empty team: how many people are on this account is unknown, and so is the seat count."
              : outcome.kind === "sign-in"
                ? "Members and seats are account data, so they need a session."
                : outcome.message}
          </div>
        </div>
        {outcome.kind !== "sign-in" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button variant="primary" data-testid="settings-team-retry" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const { roster } = outcome;
  const counts = seatCounts(roster);
  const viewerIsOwner = roster.viewerRole === "owner";
  const inviteAllowed = canInvite(counts, roster.viewerRole);
  const atCapacity = counts.remaining === 0;

  // An account with no seats has nobody to list and no role to assign.
  if (counts.purchased !== null && counts.purchased <= 1 && roster.members.length <= 1) {
    return (
      <div data-testid="settings-team" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Eyebrow>Team</Eyebrow>
        <div
          data-testid="settings-team-no-plan"
          style={{
            border: `1px solid ${PE.line14}`,
            borderRadius: PE.rTouch,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 17.5, fontWeight: 700, color: PE.t1 }}>
            This account has no seats
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.65, color: PE.t2 }}>
            Seats are bought at checkout as a count. Until an account has more
            than one, there is nobody to list and no role to assign.
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.65, color: PE.t4 }}>
            Two roles exist when there are: an owner, who handles billing and
            invitations, and members, who use the product.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="primary" glyph={OPEN_GLYPH} onClick={onUpgrade}>
            View plans
          </Button>
          <span style={{ fontSize: 12.5, color: PE.t5 }}>
            Seat counts and prices live in checkout. Settings never prices
            anything itself.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="settings-team" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <Eyebrow>Team</Eyebrow>
        {roster.viewerRole ? (
          <StatusChip tone="absence" data-testid="settings-team-viewer-role">
            {viewerIsOwner ? "Owner" : "Member"}
          </StatusChip>
        ) : null}
      </div>

      {/* SEATS */}
      <div
        data-testid="settings-team-seats"
        style={{
          border: `1px solid ${PE.line14}`,
          borderRadius: PE.rTouch,
          padding: "13px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
          <span style={{ fontSize: 15.5, color: PE.t1 }}>
            {counts.purchased === null
              ? `${counts.used} in this account, seats Not read`
              : `${counts.used} of ${counts.purchased} seats used` +
                (counts.invited ? `, ${counts.invited} invited` : "")}
          </span>
          <span style={{ fontSize: 14.5, color: counts.remaining ? PE.t3 : PE.t1 }}>
            {counts.remaining === null
              ? "Not read"
              : counts.remaining > 0
                ? `${counts.remaining} remaining`
                : "No seats remaining"}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12.5, color: PE.t5 }}>
          <span>Accepted {counts.accepted}</span>
          <span>Invited {counts.invited} — an invitation holds a seat</span>
          <span>
            Purchased {counts.purchased === null ? "Not read" : counts.purchased} at checkout
          </span>
        </div>
      </div>

      {atCapacity && viewerIsOwner ? (
        <div
          data-testid="settings-team-at-capacity"
          style={{
            border: `1px solid ${PE.line14}`,
            borderRadius: PE.rTouch,
            padding: "13px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 15.5, color: PE.t1 }}>
              Every purchased seat is taken. Inviting is refused until a seat
              frees up.
            </span>
            <span style={{ fontSize: 12.5, color: PE.t5 }}>
              Revoke an invitation or remove a member to free one, or buy more
              seats.
            </span>
          </div>
          <Button variant="primary" glyph={OPEN_GLYPH} onClick={onUpgrade}>
            Add seats
          </Button>
        </div>
      ) : null}

      {/* ROSTER */}
      <Panel>
        {roster.members.map((member, i) => {
          const invited = member.status === "invited";
          const acts = canActOn(roster, member, roster.viewerRole, roster.viewerEmail);
          const isSelf = roster.viewerEmail === member.email;
          const last = isLastOwner(roster, member);
          return (
            <div key={member.email}>
              <div
                data-testid="settings-team-member"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 20,
                  padding: "13px 16px",
                  borderBottom:
                    i === roster.members.length - 1 ? undefined : `1px solid ${PE.line06}`,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15.5, color: PE.t1 }}>{member.email}</span>
                    {isSelf ? <StatusChip tone="absence">You</StatusChip> : null}
                    {invited ? <StatusChip tone="absence">Invited</StatusChip> : null}
                  </div>
                  <span style={{ fontSize: 12.5, color: PE.t5 }}>
                    {invited
                      ? `Invited${member.at ? ` ${member.at.slice(0, 10)}` : ""} — holding a seat`
                      : `Joined${member.at ? ` ${member.at.slice(0, 10)}` : ""}`}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 14.5, color: invited ? PE.t5 : PE.t2 }}>
                    {invited ? "Invitation pending" : member.role === "owner" ? "Owner" : "Member"}
                  </span>
                  {acts ? (
                    <Button
                      variant="secondary"
                      data-testid="settings-team-remove"
                      onClick={() => onAskRemove(member.email)}
                    >
                      {invited ? "Revoke" : "Remove"}
                    </Button>
                  ) : (
                    <span style={{ fontSize: 12.5, color: PE.t5 }}>
                      {isSelf
                        ? "You cannot remove yourself"
                        : last
                          ? "Last owner — cannot be removed or demoted"
                          : ""}
                    </span>
                  )}
                </div>
              </div>
              {confirmEmail === member.email ? (
                <div
                  data-testid="settings-team-confirm"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "12px 16px",
                    borderBottom: `1px solid ${PE.line06}`,
                    background: PE.raised,
                  }}
                >
                  <span style={{ fontSize: 14.5, color: PE.t2 }}>
                    {invited
                      ? "Revoke this invitation? The seat is released immediately and the link stops working."
                      : `Remove ${member.email} from this account? They lose access at once and the seat is released.`}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button variant="secondary" onClick={() => onAskRemove(null)}>
                      Keep
                    </Button>
                    {/* Destructive confirm within the four variants: primary is
                        the quiet outline, so the WORDS carry the weight. There
                        is no red variant and one is not invented here. */}
                    <Button variant="primary" data-testid="settings-team-confirm-remove">
                      {invited ? "Revoke invitation" : "Remove member"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </Panel>

      {viewerIsOwner ? (
        <div
          data-testid="settings-team-invite"
          style={{
            border: `1px solid ${PE.line14}`,
            borderRadius: PE.rTouch,
            padding: "13px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
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
            Invite
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: PE.t5 }}>
            {inviteAllowed
              ? `The invitation holds one of the ${counts.remaining} remaining seats from the moment it is sent. An owner can invite; a member cannot.`
              : counts.remaining === null
                ? "Seats are Not read, so inviting is refused. An unknown seat count is not permission."
                : `Refused: all ${counts.purchased} seats are held. Free one by revoking an invitation or removing a member, or add seats in checkout. Nothing is over-allocated and nothing is queued.`}
          </div>
        </div>
      ) : (
        <Aside>
          You are a member on this account. Billing, invitations and roles
          belong to the owners listed above — ask one of them. Leaving the
          account is not built; an owner removes you.
        </Aside>
      )}
    </div>
  );
}
