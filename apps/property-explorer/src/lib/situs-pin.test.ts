import { describe, expect, it } from "vitest";
import { situsHitsFromResponse, uniqueSitusPin } from "./situs-pin";

const SIMSBROOK = {
  parcelNodeId: null,
  situsAddress: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
  lat: 30.459005369635157,
  lng: -97.63542129189058,
};

const GOLD_POLLUTED = [
  {
    parcelNodeId: "48027:70876",
    situsAddress: "908 PINEWOOD DR, HARKER HEIGHTS, TX 76548",
    lat: null,
    lng: null,
  },
  {
    parcelNodeId: "48491:R042064",
    situsAddress: "908 PINE ST, GEORGETOWN, TX 78626",
    lat: null,
    lng: null,
  },
  {
    parcelNodeId: "48491:R582034",
    situsAddress: "908 PINEY CV, GEORGETOWN, TX 78626",
    lat: null,
    lng: null,
  },
  {
    parcelNodeId: null,
    situsAddress: "908 PINE ST, Georgetown, TX, 78626",
    lat: 30.635,
    lng: -97.67,
  },
  {
    parcelNodeId: null,
    situsAddress: "908 PINEY CV, Georgetown, TX, 78626",
    lat: 30.656,
    lng: -97.651,
  },
];

describe("uniqueSitusPin", () => {
  it("pins a single address-point even when parcelNodeId is null (Simsbrook)", () => {
    expect(uniqueSitusPin([SIMSBROOK])).toEqual(SIMSBROOK);
  });

  it("pins a single node-bearing hit", () => {
    expect(
      uniqueSitusPin([
        {
          parcelNodeId: "48021:34137",
          situsAddress: "908 PINE , BASTROP, TX 78602",
          lat: null,
          lng: null,
        },
      ]),
    ).toEqual({
      parcelNodeId: "48021:34137",
      situsAddress: "908 PINE , BASTROP, TX 78602",
      lat: null,
      lng: null,
    });
  });

  it("does not take hits[0] of the gold-polluted 908 Pine list (WDLL 4)", () => {
    expect(uniqueSitusPin(GOLD_POLLUTED)).toBeNull();
  });

  it("empty and unusable rows are not a pin", () => {
    expect(uniqueSitusPin([])).toBeNull();
    expect(
      uniqueSitusPin([
        {
          parcelNodeId: null,
          situsAddress: "NO POINT",
          lat: null,
          lng: null,
        },
      ]),
    ).toBeNull();
  });
});

describe("situsHitsFromResponse", () => {
  it("reads the BFF hits body and drops junk", () => {
    const hits = situsHitsFromResponse({
      hits: [
        {
          parcelNodeId: null,
          situsAddress: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
          latitude: 30.459,
          longitude: -97.635,
        },
        { parcelNodeId: "x", situsAddress: "" },
        null,
      ],
    });
    expect(hits).toEqual([
      {
        parcelNodeId: null,
        situsAddress: "17005 SIMSBROOK DR, Pflugerville, TX, 78660",
        lat: 30.459,
        lng: -97.635,
      },
    ]);
  });
});
