import { describe, expect, it, vi } from "vitest";
import {
  inspectAsSoonAsIdKnown,
  pendingInspectFromLookup,
} from "./inspect-pending-card";

const SIMSBROOK_QUERY = "17005 Simsbrook Drive, Pflugerville, Texas, 78660";
const SIMSBROOK_ID = "48453:280239";
const WAINEE_ID = "48021:35772";
const LEFTOVER_51536 = "48021:51536";

describe("pendingInspectFromLookup", () => {
  it("carries the found parcelNodeId", () => {
    const pending = pendingInspectFromLookup({
      query: SIMSBROOK_QUERY,
      parcelNodeId: SIMSBROOK_ID,
    });
    expect(pending.parcelNodeId).toBe(SIMSBROOK_ID);
    expect(pending.card.situsAddress).toBe(SIMSBROOK_QUERY);
  });

  it("a different id does not match (not vacuous)", () => {
    const pending = pendingInspectFromLookup({
      query: SIMSBROOK_QUERY,
      parcelNodeId: SIMSBROOK_ID,
    });
    expect(pending.parcelNodeId).not.toBe(WAINEE_ID);
    expect(pending.parcelNodeId).not.toBe(LEFTOVER_51536);
  });

  it("does not treat a parcel-node-id query as a situs address", () => {
    const pending = pendingInspectFromLookup({
      query: SIMSBROOK_ID,
      parcelNodeId: SIMSBROOK_ID,
    });
    expect(pending.parcelNodeId).toBe(SIMSBROOK_ID);
    expect(pending.card.situsAddress).toBeNull();
  });
});

describe("inspectAsSoonAsIdKnown", () => {
  it("calls inspect before awaiting setSubject", async () => {
    const calls: string[] = [];
    let releaseSeal!: () => void;
    const sealGate = new Promise<void>((resolve) => {
      releaseSeal = resolve;
    });

    const inspectInPlace = vi.fn(() => {
      calls.push("inspect");
    });
    const sealSubject = vi.fn(async () => {
      calls.push("seal-start");
      await sealGate;
      calls.push("seal-done");
      return "sealed";
    });

    const pending = pendingInspectFromLookup({
      query: SIMSBROOK_QUERY,
      parcelNodeId: SIMSBROOK_ID,
    });
    const running = inspectAsSoonAsIdKnown(pending, inspectInPlace, sealSubject);

    await Promise.resolve();
    expect(calls).toEqual(["inspect", "seal-start"]);
    expect(inspectInPlace).toHaveBeenCalledTimes(1);
    expect(inspectInPlace.mock.calls[0][1]).toBe(SIMSBROOK_ID);
    expect(inspectInPlace.mock.calls[0][1]).not.toBe(WAINEE_ID);

    releaseSeal();
    await expect(running).resolves.toBe("sealed");
    expect(calls).toEqual(["inspect", "seal-start", "seal-done"]);
  });
});
