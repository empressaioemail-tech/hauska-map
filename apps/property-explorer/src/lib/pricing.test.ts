import { describe, expect, it } from "vitest";
import {
  PE_PRICING,
  propertyChoiceLabel,
  soloChoiceLabel,
  studioChoiceLabel,
  proChoiceLabel,
} from "./pricing";

describe("PE_PRICING — locked 2026-08-10 ladder", () => {
  it("carries the per-property unlock price and 30-day window", () => {
    expect(PE_PRICING.property.priceLabel).toBe("$15");
    expect(PE_PRICING.property.durationDays).toBe(30);
    expect(PE_PRICING.property.blurb).toContain("30 days");
    expect(PE_PRICING.property.blurb).not.toContain("forever");
  });

  it("carries Solo, Studio, and Team tier prices", () => {
    expect(PE_PRICING.solo.priceLabel).toBe("$49/mo");
    expect(PE_PRICING.studio.priceLabel).toBe("$129/mo");
    expect(PE_PRICING.team.priceLabel).toBe("$299/mo");
    expect(PE_PRICING.team.seatNote).toContain("10 seats");
    expect(PE_PRICING.team.seatNote).toContain("$25");
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
