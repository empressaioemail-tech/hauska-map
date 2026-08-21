import { describe, it, expect } from "vitest";
import {
  aliasedRetrievalPathIfEmpty,
  attachingRoadsResponseIsEmpty,
  rewriteRetrievalBindPath,
} from "../../api/_lib/retrieval-bind-alias";

describe("retrieval bind alias (WDLL 5)", () => {
  it("rewrites padded attaching-roads to integer", () => {
    expect(
      rewriteRetrievalBindPath(
        "property-nodes/48021:34137.00000000/attaching-roads",
      ),
    ).toBe("property-nodes/48021:34137/attaching-roads");
    expect(
      rewriteRetrievalBindPath("property-nodes/48021:34137/attaching-roads"),
    ).toBe("property-nodes/48021:34137.00000000/attaching-roads");
  });

  it("rewrites padded atom-chain to integer", () => {
    expect(
      rewriteRetrievalBindPath(
        "property-nodes/48021:34137.00000000/atom-chain",
      ),
    ).toBe("property-nodes/48021:34137/atom-chain");
    expect(
      rewriteRetrievalBindPath(
        "property-nodes/48055:18925.00000000/atom-chain",
      ),
    ).toBe("property-nodes/48055:18925/atom-chain");
  });

  it("does not rewrite near-bbox (viewport, not parcel bind)", () => {
    expect(rewriteRetrievalBindPath("road-nodes/near-bbox")).toBeNull();
    expect(
      aliasedRetrievalPathIfEmpty(
        "road-nodes/near-bbox",
        200,
        JSON.stringify({ count: 0, items: [] }),
      ),
    ).toBeNull();
  });

  it("attaching-roads padded rewrites to integer when the padded upstream is empty", () => {
    const empty = JSON.stringify({
      attachingRoads: [],
      reason: "no frontage-eligible boundary-edge",
    });
    expect(
      attachingRoadsResponseIsEmpty({
        attachingRoads: [],
        reason: "no frontage-eligible boundary-edge",
      }),
    ).toBe(true);
    expect(
      aliasedRetrievalPathIfEmpty(
        "property-nodes/48021:34137.00000000/attaching-roads",
        200,
        empty,
      ),
    ).toBe("property-nodes/48021:34137/attaching-roads");
    expect(
      aliasedRetrievalPathIfEmpty(
        "property-nodes/48021:34137.00000000/attaching-roads",
        200,
        JSON.stringify({
          attachingRoads: [{ entityId: "48021:road:15113284" }],
        }),
      ),
    ).toBeNull();
  });

  it("atom-chain padded aliases when requested body is empty", () => {
    expect(
      aliasedRetrievalPathIfEmpty(
        "property-nodes/48021:34137.00000000/atom-chain",
        200,
        JSON.stringify({ parcelNodeId: "48021:34137.00000000", atoms: [] }),
      ),
    ).toBe("property-nodes/48021:34137/atom-chain");
  });
});
