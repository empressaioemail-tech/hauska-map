import { describe, expect, it } from "vitest";
import { countyDisplayName } from "./MapCornerChrome";

// `card.county` is composed as "Bastrop County (48021)" in sheet-to-card.ts.
// That is right for the inspect card's County row, where the code is part of
// the identity. On the brand chip it is noise beside a wordmark, so it is
// stripped THERE and only there.

describe("countyDisplayName — the FIPS comes off the brand chip", () => {
  it("drops a trailing parenthesised FIPS", () => {
    expect(countyDisplayName("Bastrop County (48021)")).toBe("Bastrop County");
    expect(countyDisplayName("Travis County (48453)")).toBe("Travis County");
  });

  it("leaves a county that carries no code alone", () => {
    expect(countyDisplayName("Bastrop County")).toBe("Bastrop County");
  });

  it("does NOT strip a general parenthetical — only a numeric code", () => {
    // A blanket paren strip would eat real name detail. The rule is narrow on
    // purpose: 4-6 digits, at the end, and nothing else.
    expect(countyDisplayName("Doña Ana County (formerly Doña Ana)")).toBe(
      "Doña Ana County (formerly Doña Ana)",
    );
    expect(countyDisplayName("St. Louis (city)")).toBe("St. Louis (city)");
  });

  it("does not strip a code that is not at the end", () => {
    expect(countyDisplayName("(48021) Bastrop County")).toBe("(48021) Bastrop County");
  });

  it("absence stays absence — never an empty chip segment", () => {
    expect(countyDisplayName(null)).toBeNull();
    expect(countyDisplayName(undefined)).toBeNull();
    expect(countyDisplayName("")).toBeNull();
    expect(countyDisplayName("   ")).toBeNull();
    // A value that is ONLY a code leaves nothing worth printing.
    expect(countyDisplayName("(48021)")).toBeNull();
  });
});
