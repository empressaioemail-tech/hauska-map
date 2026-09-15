import { describe, expect, it } from "vitest";
import { isFloodDrainageEmbedRequest } from "./flood-embed";

describe("isFloodDrainageEmbedRequest", () => {
  it("is true for the exact embed=flood-drainage param", () => {
    expect(isFloodDrainageEmbedRequest("?embed=flood-drainage&parcelNodeId=48021:34049")).toBe(true);
  });

  it("is false with no embed param", () => {
    expect(isFloodDrainageEmbedRequest("?parcelNodeId=48021:34049")).toBe(false);
  });

  it("is false for a different embed value", () => {
    expect(isFloodDrainageEmbedRequest("?embed=site-plan")).toBe(false);
  });

  it("is false for an empty search string", () => {
    expect(isFloodDrainageEmbedRequest("")).toBe(false);
  });
});
