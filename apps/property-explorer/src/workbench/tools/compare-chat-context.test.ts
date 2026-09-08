// UI QA Batch 7 (2026-09-08). "AI Chat panel can't read what's loaded in the
// Compare panel." These pin: null on every incomplete state (nothing invented
// for a half-loaded compare), the message transport (rides the MESSAGE, same
// as dossier-chat-context.ts, never the subject allowlist chat-research.ts
// would silently drop it from), and that the rendered context reuses
// deriveCompareColumn rather than re-deriving facts.

import { describe, expect, it } from "vitest";
import {
  chatCompareContextFrom,
  composeMessageWithCompareContext,
} from "./compare-chat-context";
import type { CompareSlotData, CompareStoredState } from "./compare-facts";

function slot(parcelNodeId: string, address: string): CompareSlotData {
  return {
    parcelNodeId,
    verdict: { line: `${address}: looks buildable.`, tone: "clear" },
    facets: {
      parcelNodeId,
      baseFacts: { situsAddress: address },
    } as never,
    tier2: null,
    snapshotAt: "2026-09-01T00:00:00.000Z",
    fetchedAt: "2026-09-01T00:00:05.000Z",
  };
}

const READY: CompareStoredState = {
  a: "48021:1",
  b: "48021:2",
  payloads: {
    "48021:1": slot("48021:1", "100 Main St"),
    "48021:2": slot("48021:2", "200 Oak St"),
  },
};

describe("chatCompareContextFrom — only a fully loaded compare produces context", () => {
  it("null when stored is null", () => {
    expect(chatCompareContextFrom(null)).toBeNull();
  });

  it("null when only one slot is selected", () => {
    expect(
      chatCompareContextFrom({ a: "48021:1", b: null, payloads: {} }),
    ).toBeNull();
    expect(
      chatCompareContextFrom({ a: null, b: "48021:2", payloads: {} }),
    ).toBeNull();
  });

  it("null when both slots are selected but a payload has not fetched yet", () => {
    // NOT VACUOUS for the payload half specifically: both ids present, one
    // payload missing — must still refuse rather than describe a slot with no
    // facts in hand.
    const half: CompareStoredState = {
      a: "48021:1",
      b: "48021:2",
      payloads: { "48021:1": slot("48021:1", "100 Main St") },
    };
    expect(chatCompareContextFrom(half)).toBeNull();
  });

  it("both columns, derived via the SAME deriveCompareColumn the Compare panel renders from", () => {
    const ctx = chatCompareContextFrom(READY);
    expect(ctx).not.toBeNull();
    expect(ctx!.a.parcelNodeId).toBe("48021:1");
    expect(ctx!.a.address).toBe("100 Main St");
    expect(ctx!.b.parcelNodeId).toBe("48021:2");
    expect(ctx!.b.address).toBe("200 Oak St");
    // Cells came from the real deriver, not a hand-rolled shape here.
    expect(ctx!.a.cells.zoning).toBeDefined();
    expect(ctx!.a.cells.status).toBeDefined();
  });
});

describe("composeMessageWithCompareContext — rides the MESSAGE, same transport as user-work", () => {
  it("returns the message unchanged when there is no compare context", () => {
    expect(composeMessageWithCompareContext("compare these two", null)).toBe(
      "compare these two",
    );
  });

  it("names both properties and both addresses, and does not lose the question", () => {
    const ctx = chatCompareContextFrom(READY)!;
    const out = composeMessageWithCompareContext("compare these two", ctx);
    expect(out).toContain("100 Main St");
    expect(out).toContain("200 Oak St");
    expect(out).toContain("Property A:");
    expect(out).toContain("Property B:");
    expect(out).toContain("User question: compare these two");
  });

  it("tells the model these ARE the properties meant by an unnamed reference", () => {
    const ctx = chatCompareContextFrom(READY)!;
    const out = composeMessageWithCompareContext("compare these two", ctx);
    expect(out).toMatch(/these two.*mean the two below/is);
  });

  it("composes with the attachments/user-work chain without dropping either block", () => {
    // The chain ChatTool.tsx actually calls: attachments innermost, compare
    // next, user-work outermost. Each layer must survive the next wrap.
    const ctx = chatCompareContextFrom(READY)!;
    const withAttachments = "--- ATTACHMENTS ---\nUser question: compare these two";
    const out = composeMessageWithCompareContext(withAttachments, ctx);
    expect(out).toContain("--- ATTACHMENTS ---");
    expect(out).toContain("PROPERTIES CURRENTLY LOADED IN THE COMPARE PANEL");
    // The compare block's own trailing line re-wraps whatever came before it.
    expect(out.trim().endsWith(withAttachments)).toBe(true);
  });
});
