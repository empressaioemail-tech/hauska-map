import { describe, expect, it, vi } from "vitest";

import {
  BASTROP_PARCELS_ONE_CLICK_LAYER_23,
  fetchBastropPerParcelSetback,
} from "./pe-bastrop-per-parcel-setback";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("fetchBastropPerParcelSetback", () => {
  it("resolves a normal scalar side setback", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
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
    const result = await fetchBastropPerParcelSetback("8733833", { fetchImpl });
    expect(result).toEqual({
      kind: "ok",
      scalars: { front_ft: 50, rear_ft: 50, side_ft: 20, side_corner_ft: 20 },
    });
    const url = fetchImpl.mock.calls[0]![0] as string;
    expect(url).toContain(BASTROP_PARCELS_ONE_CLICK_LAYER_23);
    expect(url).toContain("prop_id");
  });

  it("resolves a real-world conditional side-yard string to its leading scalar (not a decline)", async () => {
    // Live-observed layer-23 text: leading number governs, parenthetical
    // residential-adjacency clause is not a corner-side embed.
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 62943,
              ZoneTypeClass: 9,
              FrontSetback_: 25,
              SideSetback: "20 ft (40 ft when abutting to residential district)",
              RearSetback_: 25,
              Shape__Area: 154.86,
            },
          },
        ],
      }),
    );
    const result = await fetchBastropPerParcelSetback("62943", { fetchImpl });
    expect(result).toEqual({
      kind: "ok",
      scalars: { front_ft: 25, rear_ft: 25, side_ft: 20, side_corner_ft: 20 },
    });
  });

  it("resolves a building/fire-code side-yard deferral to the 5ft standard", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 111,
              ZoneTypeClass: 6,
              FrontSetback_: 25,
              SideSetback: "None - Reference Building Code/Fire Code",
              RearSetback_: 20,
              Shape__Area: 5000,
            },
          },
        ],
      }),
    );
    const result = await fetchBastropPerParcelSetback("111", { fetchImpl });
    expect(result).toEqual({
      kind: "ok",
      scalars: { front_ft: 25, rear_ft: 20, side_ft: 5, side_corner_ft: 5 },
    });
  });

  it("parses a corner-side embed distinct from the interior side value", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 222,
              ZoneTypeClass: 3,
              FrontSetback_: 25,
              SideSetback: "10 ft (Corner Side Street Setback: 20 ft)",
              RearSetback_: 20,
              Shape__Area: 8000,
            },
          },
        ],
      }),
    );
    const result = await fetchBastropPerParcelSetback("222", { fetchImpl });
    expect(result).toEqual({
      kind: "ok",
      scalars: { front_ft: 25, rear_ft: 20, side_ft: 10, side_corner_ft: 20 },
    });
  });

  it("selects the largest-area row on a split-zone parcel over a sliver matching the engine stamp", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 333,
              ZoneTypeClass: 3, // SF-1 — matches engine stamp but is the sliver
              FrontSetback_: 10,
              SideSetback: "5 ft",
              RearSetback_: 10,
              Shape__Area: 100,
            },
          },
          {
            attributes: {
              prop_id: 333,
              ZoneTypeClass: 6, // MU — not the engine stamp, but the dominant area
              FrontSetback_: 25,
              SideSetback: "10 ft",
              RearSetback_: 20,
              Shape__Area: 50000,
            },
          },
        ],
      }),
    );
    const result = await fetchBastropPerParcelSetback("333", {
      fetchImpl,
      districtCode: "SF-1",
    });
    // Dominant (largest-area) row's scalars govern, not the engine-stamp-matching sliver.
    expect(result).toEqual({
      kind: "ok",
      scalars: { front_ft: 25, rear_ft: 20, side_ft: 10, side_corner_ft: 10 },
    });
  });

  it("honest-declines when the side text is genuinely unparseable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 444,
              ZoneTypeClass: 1,
              FrontSetback_: 25,
              SideSetback: "see ordinance",
              RearSetback_: 20,
              Shape__Area: 1000,
            },
          },
        ],
      }),
    );
    const result = await fetchBastropPerParcelSetback("444", { fetchImpl });
    expect(result.kind).toBe("decline");
    expect((result as { code: string }).code).toBe(
      "bastrop-per-parcel-nonscalar-side",
    );
  });

  it("honest-declines when front/rear scalars are missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        features: [
          {
            attributes: {
              prop_id: 555,
              ZoneTypeClass: 1,
              SideSetback: "10 ft",
              Shape__Area: 1000,
            },
          },
        ],
      }),
    );
    const result = await fetchBastropPerParcelSetback("555", { fetchImpl });
    expect(result.kind).toBe("decline");
    expect((result as { code: string }).code).toBe(
      "bastrop-per-parcel-incomplete-scalars",
    );
  });

  it("honest-declines when no layer-23 row is found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));
    const result = await fetchBastropPerParcelSetback("999999", { fetchImpl });
    expect(result).toEqual({
      kind: "decline",
      code: "bastrop-per-parcel-not-found",
      reason: "No layer-23 row for prop_id=999999.",
    });
  });

  it("honest-declines on a fetch failure without throwing", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await fetchBastropPerParcelSetback("8733833", { fetchImpl });
    expect(result.kind).toBe("decline");
    expect((result as { code: string }).code).toBe(
      "bastrop-per-parcel-fetch-failed",
    );
  });

  it("honest-declines on a non-ok HTTP response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const result = await fetchBastropPerParcelSetback("8733833", { fetchImpl });
    expect(result.kind).toBe("decline");
    expect((result as { code: string }).code).toBe(
      "bastrop-per-parcel-fetch-failed",
    );
  });
});
