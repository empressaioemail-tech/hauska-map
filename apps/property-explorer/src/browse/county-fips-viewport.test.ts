import { describe, it, expect } from "vitest";
import { countyFipsForViewportCenter } from "./county-fips-viewport";

describe("countyFipsForViewportCenter (Track B1-map)", () => {
  it("resolves City of Bastrop gold area to 48021", () => {
    expect(countyFipsForViewportCenter(30.1105, -97.3184)).toBe("48021");
  });

  it("returns null outside Central-TX coverage boxes", () => {
    expect(countyFipsForViewportCenter(40.7, -74.0)).toBeNull();
  });
});
