/**
 * P-272 (XD-9) — a malformed situs must not break envelope drawing, and the
 * card must say the address is unreadable rather than printing punctuation.
 *
 * Both directions are asserted for each half, so reverting the change fails
 * the test rather than merely losing a guard:
 *
 *   - the request body DROPS `", ,"` when a click point exists (and still POSTs
 *     a free-typed search with no coordinates, and still prefers a usable
 *     address over a point);
 *   - the card model says "Address unreadable" for a roll that CARRIES an
 *     unreadable situs, and does NOT say it for a roll that carries none.
 *
 * The pre-fix behaviour is spelled out in the comments so the failure is
 * legible: `envelopeRequestBody` used a narrower predicate that knew only
 * `", TX"` and the truncated-ZIP tail, so `", ,"` rode along with the point,
 * cortex sits-matched on the punctuation, missed, and nothing drew.
 */
import { describe, expect, it } from "vitest";
import { envelopeRequestBody } from "./buildable-envelope.js";
import {
  SITUS_UNREADABLE_REASON,
  SITUS_UNREADABLE_STATEMENT,
  isUnreadableSitusAddress,
  isUnusableEnvelopeAddress,
  isUsableSitusAddress,
} from "./situs-address";
import { deriveBakedCardModel } from "./baked-facets";

const POINT = { lat: 30.439, lng: -97.62 };

describe("P-272 falsifier 3a: a malformed situs rides a click point no longer", () => {
  it('drops ", ," and sends the point — pre-fix this posted { address: ", ,", lat, lng }', () => {
    expect(envelopeRequestBody({ address: ", ,", ...POINT })).toEqual(POINT);
    // The garbage string is never in the body that reaches the geocoder.
    expect(JSON.stringify(envelopeRequestBody({ address: ", ,", ...POINT }))).not.toContain(
      ", ,",
    );
  });

  it("drops the whole sentinel class the same way, not just the observed string", () => {
    for (const address of [", ,", ", TX", ",", " , , ", ",  ,  "]) {
      expect(envelopeRequestBody({ address, ...POINT })).toEqual(POINT);
    }
  });

  it("NEGATIVE: still POSTs a free-typed search string when there is no point", () => {
    // With no coordinates there is nothing to fall back to, so cortex must be
    // allowed to answer — including with an honest miss.
    expect(envelopeRequestBody({ address: ", ," })).toEqual({ address: ", ," });
    expect(envelopeRequestBody({ address: "nowhere at all" })).toEqual({
      address: "nowhere at all",
    });
  });

  it("NEGATIVE: a USABLE address still wins over the point (address-primary)", () => {
    expect(
      envelopeRequestBody({ address: "908 PINE , BASTROP, TX 78602", ...POINT }),
    ).toEqual({ address: "908 PINE , BASTROP, TX 78602", ...POINT });
  });

  it("NEGATIVE: the truncated Travis ZIP tail still drops (no regression)", () => {
    expect(envelopeRequestBody({ address: "17006 DASHWOOD CREEK DR, TX 7866", ...POINT })).toEqual(
      POINT,
    );
  });
});

describe("P-272: isUnusableEnvelopeAddress is the widened rule, in one place", () => {
  it("rejects every string isUsableSitusAddress rejects", () => {
    for (const raw of [", ,", ", TX", ",", "", "   ", "MAIN ST", null, undefined]) {
      expect(isUsableSitusAddress(raw)).toBe(false);
      expect(isUnusableEnvelopeAddress(raw)).toBe(true);
    }
  });

  it("adds the truncated-ZIP tail that isUsableSitusAddress deliberately passes", () => {
    const truncated = "17006 DASHWOOD CREEK DR, TX 7866";
    expect(isUsableSitusAddress(truncated)).toBe(true);
    expect(isUnusableEnvelopeAddress(truncated)).toBe(true);
  });

  it("NEGATIVE: a good address is usable and sendable", () => {
    for (const raw of ["908 PINE , BASTROP, TX 78602", "414 SPILLER LN"]) {
      expect(isUsableSitusAddress(raw)).toBe(true);
      expect(isUnusableEnvelopeAddress(raw)).toBe(false);
    }
  });

  it("separates 'carries an unreadable situs' from 'carries none'", () => {
    expect(isUnreadableSitusAddress(", ,")).toBe(true);
    expect(isUnreadableSitusAddress(", TX")).toBe(true);
    // No situs at all is an ABSENCE, not an unreadable one — the card has two
    // different true things to say about these.
    expect(isUnreadableSitusAddress(null)).toBe(false);
    expect(isUnreadableSitusAddress("")).toBe(false);
    expect(isUnreadableSitusAddress("908 PINE , BASTROP, TX 78602")).toBe(false);
  });
});

describe("P-272 falsifier 3b: the card says the address is unreadable", () => {
  const base = {
    parcelNodeId: "48021:34137",
    countyFips: "48021",
    countyName: "Bastrop",
  };

  it('says "address unreadable" for a roll that carries ", ,"', () => {
    const model = deriveBakedCardModel({
      ...base,
      baseFacts: { apn: "34137", situsAddress: ", ," },
    } as never);
    expect(model.situsAddress.state).toBe("absent");
    expect(model.situsAddress.value ?? "").toMatch(/address unreadable/i);
    expect(model.situsAddress.value).toBe(SITUS_UNREADABLE_REASON);
    // The punctuation is never what the card prints.
    expect(model.situsAddress.value).not.toBe(", ,");
  });

  it("NEGATIVE: a roll carrying NO situs does not claim it is unreadable", () => {
    const model = deriveBakedCardModel({
      ...base,
      baseFacts: { apn: "34137" },
    } as never);
    expect(model.situsAddress.state).toBe("absent");
    expect(model.situsAddress.value ?? "").not.toMatch(/address unreadable/i);
    expect(model.situsAddress.value).toBeNull();
  });

  it("NEGATIVE: a readable situs is still served verbatim", () => {
    const model = deriveBakedCardModel({
      ...base,
      baseFacts: { apn: "34137", situsAddress: "908 PINE , BASTROP, TX 78602" },
    } as never);
    expect(model.situsAddress.state).toBe("present");
    expect(model.situsAddress.value).toBe("908 PINE , BASTROP, TX 78602");
  });

  it("the statement exists in exactly one place", () => {
    // The constant is the wording; nothing else in the module re-spells it.
    expect(SITUS_UNREADABLE_STATEMENT).toBe("Address unreadable");
    expect(SITUS_UNREADABLE_REASON).toContain(SITUS_UNREADABLE_STATEMENT);
  });
});
