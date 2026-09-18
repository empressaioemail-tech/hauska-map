import { describe, expect, it } from "vitest";

import {
  SITUS_CITY_LIMITS_NOTE,
  composeSitusLine,
  isUsableSitusAddress,
  situsCityLimitsNote,
} from "./situs-address";

/**
 * P-270 ADDRESS HALF (2026-09-18). The one composer every map surface and the
 * outbound geocode/live-derive POST share. Two directions are asserted here:
 *
 *   - DROPS: the measured Pflugerville `48453:445501` shape — the roll's situs is
 *     a bare street line, the ledger holds `situsZip` 78660 and a containing city
 *     — must gain both.
 *   - BYTE-IDENTICAL: a roll whose situs already spells out city/state/ZIP must
 *     come back char-for-char unchanged (the falsifier's control).
 */
describe("composeSitusLine — P-270 address half", () => {
  it("carries the ledger ZIP and city on a bare street line (measured shape of 48453:445501)", () => {
    expect(
      composeSitusLine({
        situsAddress: "21404 GRAND NATIONAL AVE",
        situsCity: "Pflugerville",
        situsCityBasis: "city-limits",
        situsState: "TX",
        situsZip: "78660",
      }),
    ).toBe("21404 GRAND NATIONAL AVE, Pflugerville, TX 78660");
  });

  it("is BYTE-IDENTICAL for a roll whose situs already reads in full", () => {
    const spelledOut = "1109 Pecan St, Bastrop, TX 78602";
    expect(composeSitusLine({ situsAddress: spelledOut, situsCity: "Bastrop", situsState: "TX", situsZip: "78602" })).toBe(spelledOut);
    const alreadSpelled = "5833 Taylor Draper Cv, Austin, TX 78759";
    expect(composeSitusLine({ situsAddress: alreadSpelled, situsCity: "Austin", situsState: "TX", situsZip: "78759" })).toBe(alreadSpelled);
  });

  it("appends the state alone when the payload carries no ZIP, exactly as the pre-P-270 composer did", () => {
    expect(composeSitusLine({ situsAddress: "414 SPILLER LN", situsCity: "Austin", situsState: "TX" })).toBe("414 SPILLER LN, Austin, TX");
  });

  it("adds a ZIP the situs line does not carry even when it already carries its city and state", () => {
    expect(composeSitusLine({ situsAddress: "21404 GRAND NATIONAL AVE, PFLUGERVILLE, TX", situsState: "TX", situsZip: "78660" })).toBe(
      "21404 GRAND NATIONAL AVE, PFLUGERVILLE, TX 78660",
    );
  });

  it("appends the ZIP as one part with its state, never floating free of it", () => {
    expect(composeSitusLine({ situsAddress: "1 Main St", situsState: "TX", situsZip: "78660" })).toBe("1 Main St, TX 78660");
    expect(composeSitusLine({ situsAddress: "1 Main St", situsZip: "78660" })).toBe("1 Main St, 78660");
  });

  it("returns null only when there is no street line at all, and never invents one from a city or ZIP", () => {
    expect(composeSitusLine({ situsCity: "Pflugerville", situsState: "TX", situsZip: "78660" })).toBeNull();
    expect(composeSitusLine({ situsAddress: "   ", situsCity: "Pflugerville" })).toBeNull();
    expect(composeSitusLine({})).toBeNull();
  });

  it("leaves an unreadable situs flowing UNCHANGED-IN-KIND — the composer never decides readability, so every P-272/XD-9 refusal decision that reads the raw string is preserved", () => {
    // The pre-P-270 composer composed onto any non-empty street line and returned
    // null only for an empty one; the drop predicates (`isUnusableEnvelopeAddress`)
    // still reject the composed result, so the outbound decision is untouched.
    expect(composeSitusLine({ situsAddress: ", ,", situsCity: "Bastrop", situsState: "TX", situsZip: "78602" })).toBe(", ,, Bastrop, TX 78602");
    // ", TX" already carries the state, so the ZIP is a space suffix rather than
    // the duplicated ", TX, TX 78602" the old substring rule would have produced.
    // Still unusable (`isUsableSitusAddress` reads an empty first segment), so the
    // outbound refusal is unchanged.
    expect(composeSitusLine({ situsAddress: ", TX", situsState: "TX", situsZip: "78602" })).toBe(", TX 78602");
    expect(isUsableSitusAddress(composeSitusLine({ situsAddress: ", TX", situsState: "TX", situsZip: "78602" }))).toBe(false);
  });

  it("labels a city-limits city, and only that one, as the containing city rather than the roll's mailing city", () => {
    expect(situsCityLimitsNote({ situsCity: "Pflugerville", situsCityBasis: "city-limits" })).toBe(SITUS_CITY_LIMITS_NOTE);
    expect(situsCityLimitsNote({ situsCity: "Bastrop", situsCityBasis: "cad-roll" })).toBeNull();
    // An unstated basis is never assumed to be the roll's city.
    expect(situsCityLimitsNote({ situsCity: "Bastrop" })).toBeNull();
    expect(situsCityLimitsNote({ situsCityBasis: "city-limits" })).toBeNull();
  });
});
