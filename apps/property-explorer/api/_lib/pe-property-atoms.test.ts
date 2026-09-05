import { afterEach, describe, expect, it, vi } from "vitest";

import { bastropPerParcelSetbackIfNeeded } from "./pe-property-atoms";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bastropPerParcelSetbackIfNeeded", () => {
  it("fetches and returns live scalars for a Bastrop city parcel with no existing live rule", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 8733833,
              ZoneTypeClass: 2,
              FrontSetback_: 50,
              SideSetback: "20 ft",
              RearSetback_: 50,
              Shape__Area: 22168.1,
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48021:8733833", {
      zoningFact: {
        district: "RR",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
      },
      setbackRule: null,
    });

    expect(result).toEqual({ front_ft: 50, rear_ft: 50, side_ft: 20, side_corner_ft: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null and never calls fetch for a normal table jurisdiction (Austin)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48453:280239", {
      zoningFact: {
        district: "SF-3",
        sourceAdapter: "txgio-zoning-stamp:austin-tx",
      },
      setbackRule: null,
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null and never calls fetch when the atom-chain already carries a live layer-23 rule", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48021:8733833", {
      zoningFact: {
        district: "RR",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
      },
      setbackRule: {
        front: 50,
        side: 20,
        rear: 50,
        districtCode: "RR",
        sourceAdapter: "bastrop-per-parcel-record-layer-23",
      },
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null (propagating an honest decline) when the live record is unusable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 8733833,
              ZoneTypeClass: 2,
              FrontSetback_: 50,
              SideSetback: "see ordinance",
              RearSetback_: 50,
              Shape__Area: 22168.1,
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await bastropPerParcelSetbackIfNeeded("48021:8733833", {
      zoningFact: {
        district: "RR",
        sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
      },
      setbackRule: null,
    });

    expect(result).toBeNull();
  });
});
