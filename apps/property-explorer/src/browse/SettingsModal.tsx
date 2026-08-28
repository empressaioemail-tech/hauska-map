// SETTINGS — the standalone account popup, peer to PricingModal and checkout.
//
// WHAT IS REAL HERE AND WHAT IS NOT, stated because the difference is the
// whole design.
//
//   Account      REAL. auth.ts has provider sign-in and logout.
//   Connections  REAL. Reuses USE_IN_AI_VENDORS — the same rows the rail
//                bubble drives, not a copy that can drift.
//   Plan         PARTIAL, AND SAYS SO. The tier this app can read is the
//                binary free/paid (api/_lib/pe-entitlement.ts). There is no
//                customer-portal endpoint anywhere in this repo, so changing
//                a card, viewing invoices, and cancelling are NOT possible
//                from here. Upgrade routes to the real checkout.
//   Team         DOES NOT EXIST. "team" is a CHECKOUT TIER with a seat count
//                (billingClient PeCheckoutTier), not a surface. There is no
//                member list, no invite, no role, nothing to manage. So this
//                renders a plain statement of that rather than a pane that
//                looks operable. A dead settings pane is worse than an absent
//                one: it reads as done, and it is discovered only by someone
//                trying to use it.
//
// The identity line says signed-in without an address on purpose. The session
// probe returns authenticated/hasSession and carries no email, so printing
// one would mean inventing it.

import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { PE } from "../styles/pe-chrome";
import {
  fetchAuthStatus,
  fetchSession,
  googleSignInUrl,
  logout,
  microsoftSignInUrl,
  type AuthStatus,
} from "../lib/auth";
import { USE_IN_AI_VENDORS } from "../workbench/tools/UseInYourAiTool";

const MUTED = PE.muted2;
const TEXT = PE.text;
const BLUE = PE.accent;

export type SettingsSection = "account" | "plan" | "connections" | "team";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "plan", label: "Plan" },
  { id: "connections", label: "Connections" },
  { id: "team", label: "Team" },
];

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: MUTED,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>
      {children}
    </p>
  );
}

export function SettingsModal({
  onClose,
  onUpgrade,
  initialSection = "account",
}: {
  onClose: () => void;
  /** Opens the real pricing/checkout flow. Settings never prices anything. */
  onUpgrade: () => void;
  initialSection?: SettingsSection;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSession().then((s) => {
      if (!cancelled) setAuthed(s.authenticated);
    });
    void fetchAuthStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal label="Settings" title="Settings" onClose={onClose} width={520}>
      <div data-testid="settings-modal">
        <div
          role="tablist"
          style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={section === s.id}
              data-testid={`settings-tab-${s.id}`}
              onClick={() => setSection(s.id)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 12,
                cursor: "pointer",
                color: section === s.id ? TEXT : MUTED,
                background:
                  section === s.id ? "rgba(255,255,255,.06)" : "transparent",
                border: `1px solid ${
                  section === s.id ? "rgba(255,255,255,.18)" : "transparent"
                }`,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === "account" ? (
          <div data-testid="settings-account">
            <SectionTitle>Account</SectionTitle>
            {authed === null ? (
              <Note>Checking your session.</Note>
            ) : authed ? (
              <>
                {/* No email: the session probe does not return one, and an
                    invented identity is worse than none. */}
                <Note>You are signed in on this browser.</Note>
                <Button
                  variant="secondary"
                  data-testid="settings-signout"
                  onClick={() => {
                    void logout().then(() => window.location.reload());
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Note>
                  Sign in to save properties, run reports, and connect an AI
                  assistant.
                </Note>
                {status && !status.anyProvider ? <Note>{status.message}</Note> : null}
                <div style={{ display: "flex", gap: 8 }}>
                  {status?.configured.google ? (
                    <a href={googleSignInUrl()} data-testid="settings-signin-google">
                      <Button variant="primary">Continue with Google</Button>
                    </a>
                  ) : null}
                  {status?.configured.microsoft ? (
                    <a
                      href={microsoftSignInUrl()}
                      data-testid="settings-signin-microsoft"
                    >
                      <Button variant="secondary">Continue with Microsoft</Button>
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}

        {section === "plan" ? (
          <div data-testid="settings-plan">
            <SectionTitle>Plan and billing</SectionTitle>
            <Note>
              Upgrading opens the same checkout as everywhere else in the app,
              so a plan is never priced in two places.
            </Note>
            <Button variant="primary" data-testid="settings-upgrade" onClick={onUpgrade}>
              View plans
            </Button>
            {/* DECLARED DEGRADATION. There is no customer-portal endpoint in
                this repo; pretending otherwise sends the reader looking for a
                control that does not exist. */}
            <Note>
              Changing a payment method, downloading invoices, and cancelling
              are not available here yet. They need a billing portal that has
              not been built. Until then, use the email receipt from checkout.
            </Note>
          </div>
        ) : null}

        {section === "connections" ? (
          <div data-testid="settings-connections">
            <SectionTitle>Connections</SectionTitle>
            <Note>
              Connect Smart Site to an AI assistant so it can read the
              properties and reports on this account.
            </Note>
            {USE_IN_AI_VENDORS.map((row) => (
              <div
                key={row.id}
                data-testid={`settings-connection-${row.id}`}
                data-status={row.status}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderBottom: "1px solid rgba(154,166,178,0.15)",
                  fontSize: 12.5,
                }}
              >
                <span style={{ flex: 1, color: TEXT }}>{row.name}</span>
                <span
                  style={{
                    color: row.status === "connect" ? BLUE : MUTED,
                    fontSize: 11.5,
                    fontWeight: row.status === "connect" ? 600 : 400,
                  }}
                >
                  {row.statusLabel}
                </span>
              </div>
            ))}
            <Note>
              The connector itself is set up from the Use in your AI panel on
              the rail, which carries the URL to paste.
            </Note>
          </div>
        ) : null}

        {section === "team" ? (
          <div data-testid="settings-team">
            <SectionTitle>Team</SectionTitle>
            {/* NOT A PLACEHOLDER FOR A THING BEING BUILT. It states what
                exists today. If member management ships, this pane changes
                with it; until then it must not imply otherwise. */}
            <Note>
              Team member management is not built. A Team plan buys a seat
              count at checkout, but there is no member list, invitation, or
              role assignment in the product yet, here or anywhere else.
            </Note>
            <Note>
              If you bought a Team plan and need someone added, that is a
              manual step today.
            </Note>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
