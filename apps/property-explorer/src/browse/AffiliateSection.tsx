// AFFILIATE — the Settings tab explaining the program, not selling it.
//
// OPS-16 P-117. In-product help copy, not a canonical doc page and not a
// pitch: the operator ruled this belongs in Settings as plain explanation of
// mechanics a partner would otherwise have to ask about by email.
//
// THE TERMS BELOW ARE THE LOCKED ONES, not invented for this card. Source:
// _smartsite_gtm/01_central_texas_gtm_strategy.md ("Terms are locked at 20
// percent, recurring, capped at twelve months. Attribution is PromoteKit
// against Stripe subscriptions, and payouts run through PayPal.") and the
// 2026-08-31 operator ruling in _decisions/2026-08-31_ctx_gtm_rulings.md
// ("Affiliate is opt-in with an application. Subscribers do not automatically
// receive an affiliate link."). Nothing here states a commission number,
// a channel, or an eligibility rule this card did not read from those two
// sources.
//
// WHY THERE IS NO "APPLY NOW" BUTTON. The application intake is meant to be a
// GoHighLevel pipeline ("Affiliate Recruiting", per
// _smartsite_gtm/05_ghl_chrome_runbook.md) created through the API. As of
// this card (OPS-16 A-081, 2026-09-03) that pipeline has not been created —
// the credential that would create it is operator-local and not reachable
// from this build. There is no live intake mechanism to link to. A button
// that opens nothing is the dead-control defect this product's own honesty
// discipline exists to catch, so this card states the program is not open
// for applications yet instead of rendering one. The one link on this tab
// (support@empressa.io) is the SAME address the Account tab already points
// people to for account asks with no self-serve flow yet — not a new address
// invented for this card.
//
// WHAT THIS CARD DOES NOT DO. It does not compute or read any account state:
// there is nothing account-specific to say about a program nobody can join
// yet, so this component takes no props and makes no request. It does not
// propose a next action — SettingsModal excludes "affiliate" from the
// next-action ladder's context type for the same reason the ladder can
// return null elsewhere: a surface that always finds something to push is an
// ad slot, and an unopened program has nothing to push.

import type { ReactNode } from "react";
import { Eyebrow, Aside, Panel, Row } from "./SettingsModal";
import { StatusChip } from "../components/StatusChip";
import { PE } from "../styles/pe-chrome";

/** The one address this card links to. Already published — see privacy.html
 *  ("no delete-my-account button... email support@empressa.io") — reused
 *  rather than invented for this card. */
const SUPPORT_EMAIL = "support@empressa.io";

function SupportEmailLink(): ReactNode {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}`}
      data-testid="affiliate-support-email"
      style={{ color: PE.blue }}
    >
      {SUPPORT_EMAIL}
    </a>
  );
}

export function AffiliateSection() {
  return (
    <div
      data-testid="settings-affiliate"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <Eyebrow>Affiliate</Eyebrow>
      <div style={{ fontSize: 15.5, lineHeight: 1.65, color: PE.t2 }}>
        Smart Site pays a recurring commission to partners who send paying
        subscribers our way. This is how it works, plainly, not a pitch.
      </div>

      <Panel>
        <Row
          label="Commission"
          value="20%, recurring"
          note="Paid on the subscription you referred, for up to twelve months."
        />
        <Row
          label="Attribution"
          value="PromoteKit"
          note="Tracked against live Stripe subscriptions, not self-reported clicks."
        />
        <Row label="Payouts" value="PayPal" />
        <Row
          label="Applications"
          value={
            <span data-testid="settings-affiliate-status">
              <StatusChip tone="provisional">Not yet open</StatusChip>
            </span>
          }
          note="Opt-in by application — every subscriber does not receive a link automatically. A referral of your own account is not payable."
          last
        />
      </Panel>

      <Aside>
        <span data-testid="settings-affiliate-not-open">
          Applications are not open yet, and there is no enrollment flow here
          to open. If you would like to be contacted when they are, email{" "}
          <SupportEmailLink />.
        </span>
      </Aside>
    </div>
  );
}
