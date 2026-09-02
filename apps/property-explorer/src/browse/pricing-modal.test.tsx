// THE ONE PRICING POPUP (2026-08-24 operator ruling) — replaces the retired
// UnlockFlow/PaywallGate pair (and their unlock-flow.test.tsx pins, carried
// forward here): every price from the ONE config module, the $15 unlock
// honest-disabled without a parcel, the Studio-only variant marks the unlock
// not-applicable, and no state ever renders a fake success.
//
// A2 (Lane 2): comparison table, monthly default (2026-08-27), Free as a
// caption, Unlock as a footer. Existing cases below are UPDATED, not deleted.
//
// Node test environment (no jsdom): static-markup pins prove what renders;
// click WIRING is proven through the pure lockedPanelPaywallArgs helper
// (LockedToolPanel) and by the shared useCheckoutActions seam tests.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PricingModal } from "./PricingModal";
import { lockedPanelPaywallArgs } from "../workbench/tools/LockedToolPanel";
import { clampTeamSeats } from "./useCheckoutActions";
import {
  PE_PRICING,
  defaultPricingInterval,
  propertyChoiceLabel,
  propertyUnlockOffer,
  soloChoiceLabel,
  studioChoiceLabel,
  teamChoiceLabel,
  teamSeatsControlVisible,
  tierHeadline,
  toCheckoutInterval,
} from "../lib/pricing";

const noop = () => {};

describe("PricingModal — ALL pricing in one popup, every string from config", () => {
  it("renders the header, free caption, $15 unlock footer, and ALL THREE subscription columns with config prices", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).toContain('data-testid="pricing-modal"');
    expect(html).toContain(PE_PRICING.header.eyebrow);
    expect(html).toContain(PE_PRICING.header.title);
    expect(html).not.toContain("One ladder");
    expect(html).not.toContain("stay free");
    expect(html).not.toContain(PE_PRICING.soloNudge);
    expect(html).toContain('data-testid="pricing-free-row"');
    expect(html).toContain(PE_PRICING.free.blurb);
    expect(html).toContain('data-testid="pricing-unlock-card"');
    expect(html).toContain(PE_PRICING.property.title);
    expect(html).toContain(propertyUnlockOffer());
    expect(html).toContain(PE_PRICING.property.blurb);
    // P-101: FOUR groups, walked from config rather than named one by one.
    // The literal list is kept alongside so this cannot go vacuous if
    // PE_PRICING.groups is ever emptied.
    expect(html).toContain('data-testid="pricing-group-answer"');
    expect(html).toContain('data-testid="pricing-group-list"');
    expect(html).toContain('data-testid="pricing-group-handoff"');
    expect(html).toContain('data-testid="pricing-group-firm"');
    expect(html).toContain(PE_PRICING.groups.answer.title);
    expect(html).toContain(PE_PRICING.groups.list.title);
    expect(html).toContain(PE_PRICING.groups.handoff.title);
    expect(html).toContain(PE_PRICING.groups.firm.title);
    for (const tier of ["solo", "studio", "team"] as const) {
      expect(html).toContain(`data-testid="pricing-${tier}-card"`);
      expect(html).toContain(`data-testid="pricing-${tier}-button"`);
      expect(html).toContain(PE_PRICING[tier].ctaLabel);
      expect(html).toContain(PE_PRICING[tier].monthlyAmount);
    }
    expect(soloChoiceLabel()).toContain("$49/mo");
    expect(studioChoiceLabel()).toContain("$129/mo");
    expect(teamChoiceLabel()).toContain("$299/mo");
    expect(propertyChoiceLabel()).toContain("$15");
    expect(html).toContain(PE_PRICING.team.annualCapNote);
    // P-101 item 8: a positive assertion on the badge STRING, plus a negative
    // on the retired one. `toContain(PE_PRICING.studio.badge)` alone goes
    // vacuous the moment the badge is emptied to "" — toContain("") passes on
    // any string — so the empty case is refused explicitly.
    expect(PE_PRICING.studio.badge.trim().length).toBeGreaterThan(0);
    expect(html).toContain(PE_PRICING.studio.badge);
    expect(html).toContain('data-testid="pricing-studio-badge"');
    expect(html).not.toContain("The packet");
  });

  it("team seat input lives in the Team column on monthly; hidden on annual", () => {
    const monthlyDefault = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(monthlyDefault).toContain('data-testid="pricing-team-seats"');
    expect(monthlyDefault.indexOf('data-testid="pricing-team-card"')).toBeLessThan(
      monthlyDefault.indexOf('data-testid="pricing-team-seats"'),
    );
    expect(teamSeatsControlVisible("annual")).toBe(false);

    const monthly = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        initialInterval="monthly"
        onClose={noop}
      />,
    );
    expect(monthly).toContain('data-testid="pricing-team-seats"');
    expect(monthly).toContain('min="1"');
    expect(monthly).toContain('max="500"');
    expect(monthly).toContain('value="3"');
    expect(monthly).toContain(PE_PRICING.team.seatNote);
    expect(teamSeatsControlVisible("monthly")).toBe(true);
    expect(clampTeamSeats(0)).toBe(1);
    expect(clampTeamSeats(501)).toBe(500);
    expect(clampTeamSeats(14)).toBe(14);

    const annual = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        initialInterval="annual"
        onClose={noop}
      />,
    );
    expect(annual).not.toContain('data-testid="pricing-team-seats"');
    expect(annual).toContain('data-testid="pricing-team-annual-note"');
    expect(annual).toContain(PE_PRICING.interval.teamAnnualNote);
    expect(annual).not.toContain("2 months free");
  });

  it("Team 12-seat price is $524 (3 included + 9 extras), never leftover $45 (violate: $45 extra-seat math fails)", () => {
    const html = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        initialInterval="monthly"
        initialTeamSeats={12}
        onClose={noop}
      />,
    );
    // REMOVED 2026-08-31 by operator ruling. The card carried a hardcoded
    // "12 seats $524/mo" example that was NOT bound to the seat stepper: the
    // stepper could read 3 while this line read 12, which is two numbers for
    // one thing on a pricing surface. Asserted as ABSENCE so it cannot return.
    expect(html).not.toContain('data-testid="pricing-team-12-total"');
    // NOT asserted: absence of the string "12 seats". The headline's compare
    // line legitimately renders "12 seats · then $25/mo after 3" from the LIVE
    // stepper value. The first cut of this assertion banned that string and
    // failed on correct behaviour, which is the over-broad-control mistake:
    // ban the removed ELEMENT, not a substring the real one also produces.
    // The math protection MOVES to the headline rather than being dropped.
    // data-usd lived only on the removed span; the headline renders the same
    // total and is BOUND TO THE STEPPER, so this now asserts the live value
    // rather than a hardcoded one. $704 is the falsifier: it is what 12 seats
    // costs if an extra seat is wrongly priced at $45 instead of $25.
    expect(html).toContain("$524");
    expect(html).not.toContain("$704");
    expect(html).not.toContain("$45");
  });

  it("NO active parcel → the unlock button is DISABLED with honest copy; subscriptions stay live", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId={null} onClose={noop} />,
    );
    expect(html).toMatch(/data-testid="pricing-unlock-button"[^>]*disabled/);
    expect(html).toContain('data-testid="pricing-unlock-needs-property"');
    expect(html).toContain(PE_PRICING.property.needsPropertyNote);
    expect(html).not.toMatch(/data-testid="pricing-solo-button"[^>]*disabled/);
  });

  it("with an active parcel the unlock button is NOT disabled and the needs-property note is absent", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).not.toMatch(/data-testid="pricing-unlock-button"[^>]*disabled/);
    expect(html).not.toContain('data-testid="pricing-unlock-needs-property"');
  });

  it("STUDIO-ONLY variant (terrain): unlock card marked not-applicable with the note; Studio AND Team emphasized, Solo not", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" studioOnly onClose={noop} />,
    );
    expect(html).toMatch(
      /data-testid="pricing-unlock-card"[^>]*data-not-applicable="true"/,
    );
    expect(html).toContain('data-testid="pricing-unlock-na-note"');
    expect(html).toContain(PE_PRICING.property.studioOnlyNote);
    expect(html).toMatch(/data-testid="pricing-studio-card"[^>]*data-emphasized="true"/);
    expect(html).toMatch(/data-testid="pricing-team-card"[^>]*data-emphasized="true"/);
    expect(html).toMatch(/data-testid="pricing-solo-card"[^>]*data-emphasized="false"/);
  });

  it("default variant: Studio emphasized (A2 Deliverables); highlightTier emphasizes that column too", () => {
    const plain = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(plain).toMatch(
      /data-testid="pricing-unlock-card"[^>]*data-not-applicable="false"/,
    );
    expect(plain).toMatch(/data-testid="pricing-studio-card"[^>]*data-emphasized="true"/);
    expect(plain).toMatch(/data-testid="pricing-solo-card"[^>]*data-emphasized="false"/);
    expect(plain).toMatch(/data-testid="pricing-team-card"[^>]*data-emphasized="false"/);
    const solo = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" highlightTier="solo" onClose={noop} />,
    );
    expect(solo).toMatch(/data-testid="pricing-solo-card"[^>]*data-emphasized="true"/);
    expect(solo).toMatch(/data-testid="pricing-studio-card"[^>]*data-emphasized="true"/);
  });

  it("contextLine (the triggering tool's value line) renders near the top; absent when null", () => {
    const withLine = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        contextLine="Terrain export is a Studio feature."
        onClose={noop}
      />,
    );
    expect(withLine).toContain('data-testid="pricing-context-line"');
    expect(withLine).toContain("Terrain export is a Studio feature.");
    const without = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(without).not.toContain('data-testid="pricing-context-line"');
    expect(withLine).toContain(PE_PRICING.header.eyebrow);
    expect(withLine).toContain(PE_PRICING.header.title);
    expect(withLine.indexOf(PE_PRICING.header.eyebrow)).toBeLessThan(
      withLine.indexOf('data-testid="pricing-context-line"'),
    );
  });

  it("dialog semantics + BOTH close affordances (scrim and X); card fits the viewport with no scrollbar", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).toMatch(/role="dialog"[^>]*aria-modal="true"/);
    expect(html).toContain('data-testid="pricing-modal-scrim"');
    expect(html).toContain('data-testid="pricing-modal-close"');
    expect(html).toContain('data-scroll="none"');
    expect(html).toContain("overflow:hidden");
    expect(html).not.toContain("overflow-y:auto");
    expect(html).toContain("min(940px, calc(100vw - 24px))");
    expect(html).toContain("calc(100dvh - 24px)");
  });

  it("honest status footnote renders when provided (ICC citation state)", () => {
    const html = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        statusNote="ICC citations run in fallback mode."
        onClose={noop}
      />,
    );
    expect(html).toContain('data-testid="pricing-status-note"');
    expect(html).toContain("ICC citations run in fallback mode.");
  });

  it("never renders a success/unlocked state without a real checkout event", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).not.toContain("Property unlocked");
    expect(html).not.toContain('data-testid="pricing-note"');
  });

  it("first paint is monthly (violate: annual selected as default fails)", () => {
    expect(defaultPricingInterval()).toBe("monthly");
    expect(defaultPricingInterval()).not.toBe("annual");
    const monthly = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(monthly).toMatch(
      /data-testid="pricing-interval"[^>]*data-interval="monthly"/,
    );
    expect(monthly).not.toMatch(
      /data-testid="pricing-interval"[^>]*data-interval="annual"/,
    );
    expect(monthly).toContain(PE_PRICING.interval.annualLabel);
    expect(monthly).toContain(PE_PRICING.interval.monthlyLabel);
    expect(monthly).not.toContain("2 months free");
    expect(monthly).toContain(tierHeadline("solo", "monthly").amount);
    expect(monthly).toContain(tierHeadline("studio", "monthly").amount);
    expect(monthly).toContain(tierHeadline("team", "monthly").amount);
    expect(monthly).toContain(`data-amount="${PE_PRICING.solo.monthlyAmount}"`);
    expect(monthly).not.toContain(`data-amount="${PE_PRICING.solo.annualPriceLabel}"`);
    expect(monthly).toContain(`data-checkout-interval="${toCheckoutInterval("monthly")}"`);
    expect(monthly).toContain('data-checkout-interval="month"');
    expect(monthly).not.toContain('data-checkout-interval="year"');

    const annual = renderToStaticMarkup(
      <PricingModal
        parcelNodeId="48021:1"
        initialInterval="annual"
        onClose={noop}
      />,
    );
    expect(annual).toMatch(
      /data-testid="pricing-interval"[^>]*data-interval="annual"/,
    );
    expect(annual).toContain(tierHeadline("solo", "annual").amount);
    expect(annual).toContain(`data-amount="${PE_PRICING.solo.annualPriceLabel}"`);
    expect(annual).toContain('data-checkout-interval="year"');
    expect(annual).toContain(PE_PRICING.interval.teamAnnualNote);
    expect(annual).not.toContain("2 months free");
  });

  it("purchase surface does not carry the ICC I-Code ingest-hold line", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).not.toContain("ICC I-Code");
    expect(html).not.toContain("ingest credentials");
    expect(html).not.toContain("hold list");
  });

  it("uses Button variants for CTAs; close is the only raw button; no gold / --sc-* on the surface", () => {
    const html = renderToStaticMarkup(
      <PricingModal parcelNodeId="48021:1" onClose={noop} />,
    );
    expect(html).toContain('data-testid="pricing-studio-button"');
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-variant="subtle"');
    expect(html).toContain('data-variant="ghost"');
    expect(html).toContain('data-testid="pricing-modal-close"');
    expect(html).not.toContain("#E8963B");
    expect(html).not.toContain("--sc-");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("Oxygen");
  });
});

describe("lockedPanelPaywallArgs — the dock button's exact host.openPaywall wiring", () => {
  it("standard tool → the value line, no variant opts", () => {
    expect(lockedPanelPaywallArgs("Deep research on this parcel.", false)).toEqual([
      "Deep research on this parcel.",
      undefined,
    ]);
  });

  it("Studio-only tool (terrain) → studioOnly + the Studio highlight", () => {
    expect(lockedPanelPaywallArgs("Terrain export.", true)).toEqual([
      "Terrain export.",
      { studioOnly: true, highlightTier: "studio" },
    ]);
  });
});

describe("PricingModal — unlock modal receives the custom session", () => {
  it("passes clientSecret and publishableKey into UnlockCheckoutModal", () => {
    const src = readFileSync(resolve(__dirname, "PricingModal.tsx"), "utf8");
    expect(src).toContain("clientSecret={unlockSession.clientSecret}");
    expect(src).toContain("publishableKey={unlockSession.publishableKey}");
  });

  it("Start Solo/Studio/Team opens SubscriptionCheckoutModal, not /checkout", () => {
    const src = readFileSync(resolve(__dirname, "PricingModal.tsx"), "utf8");
    expect(src).toContain("SubscriptionCheckoutModal");
    expect(src).toContain("subscriptionSession");
    expect(src).not.toMatch(/window\.location\.assign/);
  });
});

/**
 * P-101 — the ladder re-cut on the comparison surface.
 *
 * Operator ruling 2026-08-31: Solo answers one parcel, Studio works a list of
 * them. Prices are untouched; what moved is which rung a capability sits on
 * and how the surface groups them.
 *
 * These are RENDERED-OUTPUT assertions, not config assertions, and that is the
 * whole point of the item: `PricingModal.tsx` hand-wrote its three groups and
 * nothing iterated `PE_PRICING.groups`, so a config-only edit would have
 * shipped a fourth group that rendered nowhere while the suite stayed green.
 */
describe("P-101: the comparison surface is four groups and Studio works a list", () => {
  const render = () =>
    renderToStaticMarkup(<PricingModal parcelNodeId="48021:1" onClose={noop} />);

  it("EVERY group in config renders — the drift this card exists to kill", () => {
    const html = render();
    const keys = Object.keys(PE_PRICING.groups);
    // Not vacuous: there are four, and the count is asserted before the walk
    // so an emptied config cannot make the loop pass by iterating nothing.
    expect(keys).toEqual(["answer", "list", "handoff", "firm"]);
    for (const key of keys) {
      expect(html).toContain(`data-testid="pricing-group-${key}"`);
      const group = PE_PRICING.groups[key as keyof typeof PE_PRICING.groups];
      expect(html).toContain(group.title);
      for (const row of group.rows) {
        // renderToStaticMarkup escapes &, so compare against the escaped form
        // rather than weakening the assertion to a substring of the label.
        expect(html).toContain(row.label.replaceAll("&", "&amp;"));
      }
    }
  });

  it('the new group is named for the job and carries screens, owner data and records', () => {
    const html = render();
    expect(PE_PRICING.groups.list.title).toBe("Work a list of them");
    expect(html).toContain("Work a list of them");
    expect(html).toContain("Screens and boards");
    expect(html).toContain("Owner data");
    // Item 7: the SHIPPED label from the workbench catalog (reports-catalog.ts
    // id REC), never "dossier" — which means an export kind on the MCP and the
    // X-ray report engine on PE, and is not studio-gated there.
    expect(html).toContain("Records request");
    expect(html).not.toContain("Dossier");
  });

  it("owner data left the handoff group; handoff is the two deliverables only", () => {
    const handoffLabels = PE_PRICING.groups.handoff.rows.map((r) => r.label);
    expect(handoffLabels).toEqual([
      "Site plan CAD · DXF, IFC",
      "Terrain export · GLB, IFC4, DXF",
    ]);
    expect(handoffLabels).not.toContain("Owner data");
    expect(PE_PRICING.groups.list.rows.map((r) => r.label)).toContain(
      "Owner data",
    );
    expect(PE_PRICING.groups.handoff.title).toBe("Hand it off");
    expect(render()).not.toContain("Hand it to someone else");
  });

  it("every new row is Solo-excluded and Studio-and-Team included — the move, not just the label", () => {
    for (const row of PE_PRICING.groups.list.rows) {
      expect(row.solo).toBe("notIncluded");
      expect(row.studio).toBe("included");
      expect(row.team).toBe("included");
    }
  });

  it("the Studio badge is not empty, is not the retired one, and reaches the DOM", () => {
    const html = render();
    expect(PE_PRICING.studio.badge).not.toBe("");
    expect(PE_PRICING.studio.badge).not.toBe("The packet");
    expect(html).toContain('data-testid="pricing-studio-badge"');
    expect(html).toContain(PE_PRICING.studio.badge);
    expect(html).not.toContain("The packet");
  });

  it("PRICES ARE UNTOUCHED — the ruling amends the ladder, it does not reprice it", () => {
    expect(PE_PRICING.solo.monthlyAmount).toBe("$49");
    expect(PE_PRICING.solo.annualPriceLabel).toBe("$490");
    expect(PE_PRICING.studio.monthlyAmount).toBe("$129");
    expect(PE_PRICING.studio.annualPriceLabel).toBe("$1,290");
    expect(PE_PRICING.team.monthlyAmount).toBe("$299");
    expect(PE_PRICING.team.annualPriceLabel).toBe("$2,990");
    expect(PE_PRICING.property.priceLabel).toBe("$15");
    expect(PE_PRICING.property.durationDays).toBe(30);
    expect(PE_PRICING.team.extraSeatPriceLabel).toBe("$25");
    expect(PE_PRICING.team.baseSeats).toBe(3);
  });

  it("no coming-soon row is on the purchase surface (P-101 item 12: Prospect stays doc-only)", () => {
    const html = render();
    expect(html).not.toContain(PE_PRICING.cells.comingSoon);
    const kinds = Object.values(PE_PRICING.groups).flatMap((g) =>
      g.rows.flatMap((r) => [r.solo, r.studio, r.team]),
    );
    expect(kinds).not.toContain("comingSoon");
  });
});
