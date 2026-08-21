/**
 * G6 — one canonical parcel-node-id regex across PE BFF + MCP gate.
 * The MCP source string is mirrored here; a drift fails this test.
 */
import { describe, it, expect } from "vitest";
import {
  PARCEL_NODE_ID_SOURCE,
  isValidParcelNodeId,
  normalizeParcelNodeId,
  parcelGrammarAlias,
  parcelGrammarPair,
  echoRequestedParcelNodeId,
  PARCEL_PAD_SUFFIX,
} from "./parcel-node-id";
import { PARCEL_NODE_ID_SOURCE as API_SOURCE } from "../../api/_lib/parcel-node-id";

/** Mirrored from hauska-mcp-server `src/property-atom-chain.ts` (F1b G6). */
const MCP_PARCEL_NODE_ID_SOURCE = String.raw`^\d{5}:[^/\s]+$`;

describe("G6 parcel-node-id contract", () => {
  it("src and api/_lib export the same source string", () => {
    expect(PARCEL_NODE_ID_SOURCE).toBe(API_SOURCE);
  });

  it("matches the MCP gate regex source (no digits-only drift)", () => {
    expect(PARCEL_NODE_ID_SOURCE).toBe(MCP_PARCEL_NODE_ID_SOURCE);
    // Explicitly reject the pre-F1b digits-only shape as the sole contract.
    expect(PARCEL_NODE_ID_SOURCE).not.toBe(String.raw`^\d{5}:\d+$`);
  });

  it("accepts Central-TX numeric and non-slash propIds", () => {
    expect(isValidParcelNodeId("48209:156346")).toBe(true);
    expect(isValidParcelNodeId("48021:27303")).toBe(true);
    expect(isValidParcelNodeId("48453:R123")).toBe(true);
  });

  it("rejects path injection and whitespace", () => {
    expect(isValidParcelNodeId("48209:156/346")).toBe(false);
    expect(isValidParcelNodeId("48209: 156346")).toBe(false);
    expect(isValidParcelNodeId("8209:156346")).toBe(false);
    expect(normalizeParcelNodeId("  48209:156346  ")).toBe("48209:156346");
  });
});

describe("parcelGrammarAlias dual-grammar pair (WDLL 5)", () => {
  it("adds trailing .00000000 on integer propId", () => {
    expect(PARCEL_PAD_SUFFIX).toBe(".00000000");
    expect(parcelGrammarAlias("48021:34137")).toBe("48021:34137.00000000");
    expect(parcelGrammarAlias("48055:18925")).toBe("48055:18925.00000000");
  });

  it("strips trailing .00000000 from padded propId", () => {
    expect(parcelGrammarAlias("48021:34137.00000000")).toBe("48021:34137");
    expect(parcelGrammarAlias("48055:18925.00000000")).toBe("48055:18925");
  });

  it("refuses a non .00000000 suffix", () => {
    expect(parcelGrammarAlias("48021:34137.1")).toBeNull();
    expect(parcelGrammarAlias("48021:34137.00000001")).toBeNull();
    expect(parcelGrammarAlias("48021:34137.00")).toBeNull();
    expect(parcelGrammarPair("48021:34137.1").alias).toBeNull();
  });

  it("pair is requested plus the other grammar", () => {
    expect(parcelGrammarPair("48021:34137")).toEqual({
      requested: "48021:34137",
      alias: "48021:34137.00000000",
    });
    expect(parcelGrammarPair("48021:34137.00000000")).toEqual({
      requested: "48021:34137.00000000",
      alias: "48021:34137",
    });
  });

  it("echoes REQUESTED parcelNodeId and does not rewrite URL identity", () => {
    const echoed = echoRequestedParcelNodeId(
      {
        parcelNodeId: "48021:34137",
        facets: { parcelNodeId: "48021:34137", zoning: { district: "SF-1" } },
      },
      "48021:34137.00000000",
    );
    expect(echoed.parcelNodeId).toBe("48021:34137.00000000");
    expect(echoed.facets.parcelNodeId).toBe("48021:34137.00000000");
    expect(echoed.facets.zoning.district).toBe("SF-1");
  });
});

