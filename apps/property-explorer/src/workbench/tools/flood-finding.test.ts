import { describe, expect, it } from "vitest";
import { floodFindingLead } from "./flood-finding";

describe("floodFindingLead", () => {
  it("returns the first two sentences and does not split on a decimal", () => {
    const briefing =
      "The parcel sits at or near a local high point and drains away from it. No modeled ponding intersects the parcel at a 9.5 inch design storm. This models local storm ponding from on-parcel depressions.";
    expect(floodFindingLead(briefing)).toBe(
      "The parcel sits at or near a local high point and drains away from it. No modeled ponding intersects the parcel at a 9.5 inch design storm.",
    );
  });

  it("a one-sentence briefing is the whole lead", () => {
    const one =
      "The upstream catchment delivers runoff toward the parcel pour point; verify finished-floor elevation against the ponding scenario before locking the envelope.";
    expect(floodFindingLead(one)).toBe(one);
  });

  it("empty or missing briefing is absence", () => {
    expect(floodFindingLead("")).toBeNull();
    expect(floodFindingLead("   ")).toBeNull();
    expect(floodFindingLead(null)).toBeNull();
    expect(floodFindingLead(undefined)).toBeNull();
  });
});
