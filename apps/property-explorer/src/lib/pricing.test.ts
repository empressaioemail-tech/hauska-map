import { describe, expect, it } from "vitest";
import {
  PE_PRICING,
  annualFromMonthlyUsd,
  defaultPricingInterval,
  extraSeatUsd,
  matrixCellText,
  propertyChoiceLabel,
  propertyUnlockOffer,
  soloChoiceLabel,
  studioChoiceLabel,
  proChoiceLabel,
  teamMonthlyTotalUsd,
  teamSeatsControlVisible,
  teamSeatsOnWire,
  tierHeadline,
  toCheckoutInterval,
} from "./pricing";

describe("PE_PRICING — locked 2026-08-10 ladder", () => {
  it("carries the per-property unlock price and 30-day window", () => {
    expect(PE_PRICING.property.priceLabel).toBe("$15");
    expect(PE_PRICING.property.durationDays).toBe(30);
    expect(propertyUnlockOffer()).toContain("30 days");
    expect(PE_PRICING.property.blurb).not.toContain("forever");
  });

  it("carries Solo, Studio, and Team tier prices", () => {
    expect(PE_PRICING.solo.priceLabel).toBe("$49/mo");
    expect(PE_PRICING.studio.priceLabel).toBe("$129/mo");
    expect(PE_PRICING.team.priceLabel).toBe("$299/mo");
    expect(PE_PRICING.team.seatNote).toContain("10 seats");
    expect(PE_PRICING.team.seatNote).toContain("$25");
  });

  it("carries locked annual amounts and the annual-Team seat cap", () => {
    expect(PE_PRICING.solo.annualPriceLabel).toBe("$490");
    expect(PE_PRICING.studio.annualPriceLabel).toBe("$1,290");
    expect(PE_PRICING.team.annualPriceLabel).toBe("$2,990");
    expect(PE_PRICING.team.extraSeatPriceLabel).toBe("$25");
    expect(PE_PRICING.team.baseSeats).toBe(10);
    expect(defaultPricingInterval()).toBe("annual");
    expect(teamSeatsControlVisible("annual")).toBe(false);
    expect(teamSeatsControlVisible("monthly")).toBe(true);
    expect(tierHeadline("studio", "annual").amount).toBe("$1,290");
    expect(tierHeadline("studio", "monthly").amount).toBe("$129");
    expect(propertyUnlockOffer()).toBe("$15 for 30 days");
    expect(matrixCellText("teamSeats", "annual")).toBe(
      PE_PRICING.team.annualSeatCell,
    );
    expect(matrixCellText("teamSeats", "monthly")).toContain("$25");
    expect(toCheckoutInterval("annual")).toBe("year");
    expect(toCheckoutInterval("monthly")).toBe("month");
    expect(toCheckoutInterval("annual")).not.toBe("annual");
    expect(teamSeatsOnWire("annual", 14)).toBe(PE_PRICING.team.baseSeats);
    expect(teamSeatsOnWire("monthly", 14)).toBe(14);
  });

  it("Team 12-seat math is $25 after 10, never leftover $45", () => {
    expect(extraSeatUsd()).toBe(25);
    expect(extraSeatUsd()).not.toBe(45);
    expect(teamMonthlyTotalUsd(10)).toBe(299);
    expect(teamMonthlyTotalUsd(12)).toBe(349);
    expect(teamMonthlyTotalUsd(12)).not.toBe(299 + 2 * 45);
    expect(annualFromMonthlyUsd(49)).toBe(490);
    expect(annualFromMonthlyUsd(129)).toBe(1290);
    expect(annualFromMonthlyUsd(299)).toBe(2990);
  });

  it("retired Pro framing is gone from user-visible labels", () => {
    expect(soloChoiceLabel()).toContain("$49/mo");
    expect(soloChoiceLabel()).not.toContain("$99");
    expect(soloChoiceLabel()).not.toContain("$149");
    expect(propertyChoiceLabel()).toContain("$15");
    expect(studioChoiceLabel()).toContain("$129/mo");
    expect(proChoiceLabel()).toBe(soloChoiceLabel());
  });
});
