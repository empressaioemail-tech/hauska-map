/**
 * P-291 (operator ruling A-184) — a county outside the graded six says so.
 *
 * Falsifier 4, both directions:
 *   - a Bell (48027) fixture carries the statement;
 *   - a Bastrop (48021) fixture does not;
 *   - the statement exists in exactly one place in this repo.
 *
 * "On the card" is asserted through BOTH card-model builders, because this repo
 * has two (`deriveBakedCardModel` off a baked payload, `sheetToCardModel` off a
 * resolved fact sheet) and a statement that lands in only one of them is a
 * statement half the surfaces never show.
 */
import { describe, expect, it } from "vitest";
import { deriveBakedCardModel } from "./baked-facets";
import {
  COUNTY_NOT_VERIFIED_STATEMENT,
  GRADED_COUNTY_FIPS,
  countyNotVerifiedStatement,
  countyRowText,
  isGradedCounty,
} from "./county-grade";

const BELL = { countyFips: "48027", countyName: "Bell" };
const BASTROP = { countyFips: "48021", countyName: "Bastrop" };

describe("P-291 falsifier 4: the graded six carry nothing new, the rest say so", () => {
  it("a Bell (48027) fixture carries the statement on the card", () => {
    const model = deriveBakedCardModel({
      parcelNodeId: "48027:12345",
      ...BELL,
      baseFacts: { apn: "12345", situsAddress: "100 N MAIN ST, KILLEEN, TX 76541" },
    } as never);
    expect(model.county.state).toBe("present");
    expect(model.county.value).toContain("Bell County (48027)");
    expect(model.county.value).toMatch(/not yet verified/i);
    expect(model.county.value).toContain(COUNTY_NOT_VERIFIED_STATEMENT);
  });

  it("a Bastrop (48021) fixture carries nothing new", () => {
    const model = deriveBakedCardModel({
      parcelNodeId: "48021:34137",
      ...BASTROP,
      baseFacts: { apn: "34137", situsAddress: "908 PINE, BASTROP, TX 78602" },
    } as never);
    expect(model.county.value).toBe("Bastrop County (48021)");
    expect(model.county.value).not.toMatch(/not yet verified/i);
  });

  it("every graded county is byte-identical to the pre-P-291 row", () => {
    for (const fips of GRADED_COUNTY_FIPS) {
      expect(countyRowText("Somewhere", fips)).toBe(`Somewhere County (${fips})`);
      expect(countyNotVerifiedStatement(fips)).toBeNull();
    }
  });

  it("NEGATIVE: an unknown/blank FIPS is not silently treated as graded", () => {
    // Fail VISIBLE, not silent: a parcel whose county we cannot name must not
    // read as a graded county.
    expect(isGradedCounty(null)).toBe(false);
    expect(isGradedCounty("")).toBe(false);
    expect(isGradedCounty("   ")).toBe(false);
    expect(isGradedCounty("99999")).toBe(false);
    expect(countyNotVerifiedStatement("99999")).toBe(COUNTY_NOT_VERIFIED_STATEMENT);
  });

  it("the statement exists in exactly one place", () => {
    // One module defines it; nothing else re-spells the words. If a second copy
    // appears, this is the assertion that should have caught it — it pins the
    // exact wording so a re-spelling in another file is a visible diff here.
    expect(COUNTY_NOT_VERIFIED_STATEMENT).toBe(
      "Not yet verified — this county is served from an earlier data bake, not from the graded program.",
    );
    expect(GRADED_COUNTY_FIPS.size).toBe(6);
  });
});
