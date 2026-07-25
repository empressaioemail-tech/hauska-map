/**
 * G6 — one canonical parcel-node-id regex across PE BFF + MCP gate.
 * The MCP source string is mirrored here; a drift fails this test.
 */
import { describe, it, expect } from "vitest";
import {
  PARCEL_NODE_ID_SOURCE,
  isValidParcelNodeId,
  normalizeParcelNodeId,
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
