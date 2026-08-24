import { describe, expect, it } from "vitest";
import { envelopeRequestBody } from "./buildable-envelope.js";

describe("envelopeRequestBody", () => {
  it("does not send parcel_node_id until cortex accepts it (400 today)", () => {
    const body = envelopeRequestBody({
      address: "908 PINE , BASTROP, TX 78602",
      parcelNodeId: "48021:34137",
      lat: 30.11,
      lng: -97.32,
    });
    expect(body).toEqual({
      address: "908 PINE , BASTROP, TX 78602",
      lat: 30.11,
      lng: -97.32,
    });
    expect(body).not.toHaveProperty("parcel_node_id");
  });

  it("coords-only when no address", () => {
    expect(envelopeRequestBody({ lat: 30.1, lng: -97.3 })).toEqual({
      lat: 30.1,
      lng: -97.3,
    });
  });

  it("drops a truncated Travis situs and sends the click point (404 path)", () => {
    expect(
      envelopeRequestBody({
        address: "17006 DASHWOOD CREEK DR, TX 7866",
        lat: 30.439,
        lng: -97.62,
      }),
    ).toEqual({ lat: 30.439, lng: -97.62 });
  });

  it("drops a bare ', TX' sentinel", () => {
    expect(
      envelopeRequestBody({
        address: ", TX",
        lat: 30.439,
        lng: -97.62,
      }),
    ).toEqual({ lat: 30.439, lng: -97.62 });
  });
});
