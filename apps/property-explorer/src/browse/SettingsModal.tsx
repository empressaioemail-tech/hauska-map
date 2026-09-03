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
//   Plan         REAL. Access, Tier name and Billing interval all come off the
//                ACCOUNT-level entitlement read (lib/accountEntitlementClient
//                — the parcel-less GET, added P-98b), and each says Not read
//                on its own null rather than on the row above it. NULL IS
//                UNKNOWN, never a default: nothing backfills the billing
//                interval, so a test-mode subscriber genuinely reads null and
//                the row says so. Renewal date is not on that wire at all.
//                Payment method, invoices and cancel are now ONE REAL CONTROL
//                (A-062): they are three doors into the same Stripe Customer
//                Portal, so the panel opens the portal rather than pretending
//                to own three features Stripe owns. The control renders only
//                when the account HAS a Stripe customer; otherwise the row
//                says so and stays honest. Renewal date is still Not read
//                because it is still not on the wire — this card licensed a
//                control where one now works, not a sweep turning every Not
//                built into a button.
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
//   Affiliate    P-117. Static explainer, not a design-drop translation: the
//                locked terms (20%, recurring, twelve-month cap, PromoteKit,
//                PayPal, opt-in by application) stated plainly, in
//                AffiliateSection.tsx. Reads no account state and proposes no
//                next action, because the GoHighLevel application pipeline
//                this tab would point to has not been created (OPS-16 A-081,
//                blocked on a credential this build cannot reach). It says so
//                rather than shipping a control that opens nothing.

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
import {
  ladderEntitlementFromAccount,
  useAccountEntitlement,
  type AccountEntitlementRead,
} from "../lib/useAccountEntitlement";
import { PE_PRICING } from "../lib/pricing";
import {
  startBillingPortal,
  type BillingPortalOutcome,
} from "../lib/portalClient";
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
import { AffiliateSection } from "./AffiliateSection";
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

export type SettingsSection =
  | "account"
  | "plan"
  | "connections"
  | "team"
  | "affiliate";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan" },
  { id: "connections", label: "Connections" },
  { id: "team", label: "Team" },
  { id: "affiliate", label: "Affiliate" },
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

// Exported so AffiliateSection (P-117) can build its panel from the same
// primitives rather than keeping a second copy of this layout.
export function Eyebrow({ children }: { children: ReactNode }) {
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

export function Aside({ children }: { children: ReactNode }) {
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

export function Panel({ children }: { children: ReactNode }) {
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

export function Row({
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

/**
 * The panel's word for a value with no traced source. It is used by three
 * rows below and is written once so a future edit cannot make one of them
 * say something softer than the others.
 */
const NOT_READ = "Not read";

/**
 * BILLING MANAGEMENT — the row A-062 built, and the rule it turns on.
 *
 * PURE, EXPORTED AND TESTED WITHOUT RENDERING, for the same reason
 * `ladderEntitlementFromAccount` is: this is the only place where a wire value
 * decides whether a person is shown a control that takes them to their own
 * money, and it is where "if in doubt, show the button" would be written if
 * anyone ever wrote it.
 *
 * THREE STATES, AND ONLY ONE OF THEM RENDERS A CONTROL:
 *
 *   unread     the read has not resolved, or resolved to sign-in / blocked /
 *              not-built / error, or came back for an unauthenticated caller.
 *              We do not know whether there is a billing account, so we do not
 *              claim one either way and we do not offer a door.
 *   none       the server said, positively, that this account has no Stripe
 *              customer. The ORDINARY state of a free account and of anyone
 *              who abandoned a checkout. It gets a sentence, not a button.
 *   manage     the server said there IS a Stripe customer. This is the only
 *              arm that renders the portal control.
 *
 * `unread` and `none` are deliberately not merged even though both withhold
 * the button, because they say different things to the reader: one is "we
 * could not read your account", the other is "you have never been billed".
 * Collapsing them would print a fact we did not read.
 *
 * NOTHING IS DERIVED FROM TIER. A paid account whose customer id never landed
 * is a real state and gets `none` honestly; a FREE account that subscribed
 * once and cancelled still has a portal, and it is precisely the person most
 * likely to want it. Reading the tier here instead of the bit would get both
 * of those backwards.
 */
export type BillingManagementState = "unread" | "none" | "manage";

export function billingManagementState(
  read: AccountEntitlementRead,
): BillingManagementState {
  if (read === null || read.kind !== "ready") return "unread";
  const { account } = read;
  // Signed out is not an account state. The server answers anonymous callers
  // with a 200, so this is reachable without an error.
  if (!account.authenticated) return "unread";
  return account.hasBillingAccount ? "manage" : "none";
}

/**
 * ACCESS, off the ACCOUNT read.
 *
 * THE HISTORY THIS FUNCTION CARRIES. This value used to be
 * `locked ? "Free" : signedOut ? "Not read" : "Paid"` computed from
 * usePropertyEntitlement(null). Settings is account-scoped and passes no
 * parcel; that hook returns its LOADING constant for a null id; the constant
 * carries locked:false and signedOut:false; so both guards missed and the
 * ternary fell through to its most generous branch and showed **Paid to every
 * account, including anonymous** (commit b4add1b). The account read fixes the
 * INPUT. This function keeps the two guards that were missed, because a
 * correct input through a generous ternary is the same defect one deploy
 * later.
 *
 * FOUR STATES, AND THREE OF THEM ARE "Not read":
 *
 *   read not resolved       we have not asked or have not heard. Unknown.
 *   sign-in/blocked/
 *   not-built/error         we asked and did not learn. Unknown, and NOT a
 *                           free account — a 404 is a fact about the route.
 *   ready, not authed       there is no account behind this browser. The
 *                           panel is showing sign-in buttons; printing a plan
 *                           beside them would be a claim about a person who
 *                           has not identified themselves.
 *   ready, authed           the server's own answer. accessTier null (the
 *                           wire did not carry either key) is still unknown.
 */
export function accessLabel(read: AccountEntitlementRead): string {
  if (read === null || read.kind !== "ready") return NOT_READ;
  const { account } = read;
  if (!account.authenticated) return NOT_READ;
  if (account.accessTier === null) return NOT_READ;
  return account.accessTier === "paid" ? "Paid" : PE_PRICING.free.title;
}

/**
 * TIER NAME, off the same read. The label comes from PE_PRICING so the plan
 * is never named in two places; Settings does not keep its own copy of "Solo".
 * Null — free, unlock-only, or a pre-contract server that does not emit the
 * field — stays "Not read" rather than being back-derived from paid/free.
 */
export function tierNameLabel(read: AccountEntitlementRead): string {
  if (read === null || read.kind !== "ready") return NOT_READ;
  const tier = read.account.subscriptionTier;
  if (tier === null) return NOT_READ;
  return PE_PRICING[tier].title;
}

/**
 * BILLING INTERVAL, and this is the row the whole card turns on.
 *
 * NULL IS UNKNOWN AND PRINTS "Not read". It is not monthly. Nothing backfills
 * the column, so today's test-mode subscribers genuinely read null, and a row
 * that printed "Monthly" for them would be asserting a billing fact about
 * somebody's money that no one read. The same null suppresses the ladder's
 * annual rung, for the same reason and out of the same field.
 *
 * The two labels come from PE_PRICING.interval, the same strings the pricing
 * popup's toggle uses, so the account console and the checkout cannot end up
 * calling the same interval two different things.
 */
export function billingIntervalLabel(read: AccountEntitlementRead): string {
  if (read === null || read.kind !== "ready") return NOT_READ;
  const interval = read.account.billingInterval;
  if (interval === null) return NOT_READ;
  // The WIRE says "year"/"month" (Stripe grammar, one vocabulary end to end
  // per the 2026-08-31 P-98b ruling). The LABEL says Annual/Monthly, because
  // that is what the pricing popup's toggle says and a person reads. Those are
  // different jobs: this is the render boundary, not a second wire vocabulary,
  // and it is the only place on the client where the two words meet.
  return interval === "year"
    ? PE_PRICING.interval.annualLabel
    : PE_PRICING.interval.monthlyLabel;
}

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
  // THE ACCOUNT READ. Not usePropertyEntitlement(null) — see accessLabel
  // above for what that cost. This asks an account-level question of a
  // parcel-less GET and is a different hook over a different shape.
  const account = useAccountEntitlement();
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

  // THE THREE PLAN VALUES, ALL OFF THE ONE ACCOUNT READ.
  //
  // Access, Tier name and Billing interval are three questions about the same
  // account and are answered from the same response, so they cannot disagree
  // with each other about what plan this is. Each falls to "Not read" on its
  // own null, and the reasoning for each lives on its function above rather
  // than in a ternary here.
  //
  // "Renewal date" is still NOT touched: it is genuinely not on this wire.
  // Payment method, invoices and cancellation WERE the three "Not built" rows
  // and are now one real control (A-062) — see billingManagementState above
  // for why they collapsed into one and when it renders.
  const access = accessLabel(account);
  const tierName = tierNameLabel(account);
  const billingInterval = billingIntervalLabel(account);
  const billingManagement = billingManagementState(account);

  // THE LADDER'S ENTITLEMENT INPUT, derived by a pure exported function so the
  // rule that matters is testable without rendering anything. Every non-ready
  // outcome, an unresolved read, a signed-out 200 and an unknown tier all
  // become `unread`, and the ladder proposes nothing on unread.
  //
  // billingInterval travels STRAIGHT THROUGH, null included. That is what
  // unstarves the annual rung: it can now be "month" and fire, and it can
  // now be null or "year" and stay quiet, which are three different answers
  // where before there was one. Nothing here infers an interval, and
  // nextAction.ts refuses anything but the literal "month" a second time.
  const entitlement: EntitlementRead = ladderEntitlementFromAccount(account);

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
  //
  // AFFILIATE IS EXCLUDED BY THE TYPE, not by a convention. nextAction.ts's
  // NextActionContext is the original four-tab union and does not carry
  // "affiliate" — narrowing `section` here rather than widening that union
  // is the choice, because the ladder has nothing to propose on a tab
  // explaining a program nobody can join yet, and going quiet is exactly
  // what P-98's own acceptance test requires of an empty context.
  const proposed =
    section === "affiliate"
      ? null
      : nextAction(section, {
          // A session that has not been read yet is not a signed-in one.
          authenticated: authed === true,
          claude,
          entitlement,
          unlocks,
          seats,
        });
  // Not runnable here means not rendered here. See SETTINGS_RUNNABLE.
  const action = proposed && SETTINGS_RUNNABLE.has(proposed.id) ? proposed : null;

  // A-062 — the portal open. `null` before any attempt; a refusal or a
  // transport failure is HELD and rendered rather than swallowed, because the
  // one thing worse than no cancel button is one that appears to do nothing.
  //
  // THE `portal` ARM IS EXCLUDED BY THE TYPE, not by a convention. A success
  // navigates away, so there is no state in which this holds one — and saying
  // so with Exclude<> means the render below cannot read a field that arm
  // lacks. The compiler enforces at the one call site what a comment would
  // only have asked for.
  const [portal, setPortal] = useState<Exclude<
    BillingPortalOutcome,
    { kind: "portal" }
  > | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const openBillingPortal = () => {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortal(null);
    void startBillingPortal().then((outcome) => {
      setPortalBusy(false);
      if (outcome.kind === "portal") {
        // Stripe's own host, already checked by portalClient — a 200 carrying
        // a non-Stripe URL never reaches here as `portal`.
        if (typeof window !== "undefined") {
          window.location.href = outcome.portalUrl;
        }
        return;
      }
      // EVERY OTHER OUTCOME IS SHOWN. sign-in, blocked, not-built, unavailable
      // and error each say something different and none of them is silence.
      setPortal(outcome);
    });
  };

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
                  <Row
                    label="Access"
                    value={<span data-testid="settings-access">{access}</span>}
                    last
                  />
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
                      Read from the account entitlement. A value that is not on
                      that wire says Not read rather than being guessed from
                      the ones that are.
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
                  {/*
                    Tier name and Billing interval read from the account
                    entitlement; each says "Not read" on its own null rather
                    than on the row above it, so a server that carries one and
                    not the other says so honestly.
                  */}
                  <Row
                    label="Tier name"
                    value={<span data-testid="settings-tier-name">{tierName}</span>}
                  />
                  <Row
                    label="Billing interval"
                    value={
                      <span data-testid="settings-billing-interval">
                        {billingInterval}
                      </span>
                    }
                  />
                  {/*
                    RENEWAL DATE IS STILL NOT READ, and stays that way. It is
                    genuinely not on the entitlement wire, and A-062 licensed a
                    control where one now works — not a sweep turning every
                    honest "Not built" into a button.
                  */}
                  <Row label="Renewal date" value={NOT_READ} />
                  {/*
                    A-062. Payment method, invoices and cancellation were three
                    separate "Not built" rows. They are three doors into the
                    SAME Stripe Customer Portal, which is Stripe's surface and
                    not ours, so they are one row that opens it rather than
                    three we would have to build and keep true.

                    THE CONTROL RENDERS ONLY ON `manage`. On `none` the row
                    states, positively, that there is no billing history — the
                    ordinary state of a free account, and a different sentence
                    from "we could not read your account", which is what
                    `unread` says. Rendering the button on either of those
                    would put a customer one click from a refusal at the exact
                    moment they are trying to stop paying us.
                  */}
                  <Row
                    label="Payment, invoices and cancellation"
                    last
                    value={
                      billingManagement === "manage" ? (
                        <Button
                          variant="secondary"
                          glyph={OPEN_GLYPH}
                          data-testid="settings-billing-portal"
                          onClick={openBillingPortal}
                        >
                          {portalBusy ? "Opening…" : "Manage billing"}
                        </Button>
                      ) : billingManagement === "none" ? (
                        <span data-testid="settings-billing-none">
                          No billing history
                        </span>
                      ) : (
                        <span data-testid="settings-billing-not-read">
                          {NOT_READ}
                        </span>
                      )
                    }
                    note={
                      billingManagement === "manage"
                        ? "Opens the Stripe billing portal, where payment method, invoices and cancellation live."
                        : billingManagement === "none"
                          ? "This account has never been billed, so there is no billing portal to open."
                          : undefined
                    }
                  />
                </Panel>
                {/*
                  THE REFUSAL IS SHOWN, never swallowed. A cancel control that
                  appears to do nothing is worse than the Not built row it
                  replaced, so every non-portal outcome from the client is
                  rendered here with its own words.
                */}
                {portal ? (
                  <Aside>
                    <span data-testid="settings-billing-portal-refusal">
                      {portal.kind === "sign-in"
                        ? "Your session has expired. Sign in again to manage billing."
                        : portal.kind === "blocked"
                          ? "The billing portal was refused by our own proxy. That is a defect on our side, not a fact about your account."
                          : portal.message}
                    </span>
                  </Aside>
                ) : billingManagement === "manage" ? (
                  <Aside>
                    Cancelling, changing the payment method and downloading
                    invoices all happen in the Stripe billing portal. Smart Site
                    does not keep a second copy of any of them.
                  </Aside>
                ) : (
                  <Aside>
                    A paid plan bought on this account opens a Stripe billing
                    portal, where payment method, invoices and cancellation
                    live. Until then the receipt email from checkout is the
                    record.
                  </Aside>
                )}
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

            {/* P-117. Explains the program; reads no account state and
                proposes nothing — see AffiliateSection.tsx. */}
            {section === "affiliate" ? <AffiliateSection /> : null}
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
