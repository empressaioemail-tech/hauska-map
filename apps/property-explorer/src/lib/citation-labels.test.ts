import { describe, expect, it } from "vitest";
import {
  formatCityKeyLabel,
  humanizeCitationLabel,
  humanizeGisZoningSourceLabel,
} from "./citation-labels";

describe("citation-labels", () => {
  it("humanizes Zoned_Parcels + cityKey", () => {
    expect(
      humanizeGisZoningSourceLabel("Zoned_Parcels", "bastrop-city-tx"),
    ).toBe("City of Bastrop zoning map (Bastrop, TX)");
  });

  it("rewrites legacy chip labels", () => {
    expect(humanizeCitationLabel("Zoned_Parcels (bastrop-city-tx)")).toBe(
      "City of Bastrop zoning map (Bastrop, TX)",
    );
  });

  it("formats city keys for display", () => {
    expect(formatCityKeyLabel("bastrop-city-tx")).toBe("Bastrop, TX");
  });
});
