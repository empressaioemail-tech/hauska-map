import { describe, expect, it } from "vitest";
import {
  chatUserWorkFrom,
  composeMessageWithUserWork,
} from "./dossier-chat-context";
import type { SavedPropertyRow } from "../../lib/savedPropertiesClient";

// WHAT WENT WRONG THE FIRST TIME, pinned so it cannot recur.
//
// The first cut hung this context on ChatSubjectContext. The request body is
// built from an explicit ALLOWLIST, so the field was dropped before the fetch
// and never left the browser — correct-looking code that reached nothing. The
// tests then "passed" because they only checked the shape of an object nobody
// transmitted.
//
// So these test the MESSAGE, which is the thing actually sent. If the context
// is not in the outgoing string, it does not exist.

const row = (
  parcelNodeId: string,
  over: Partial<SavedPropertyRow["snapshot"]> = {},
): SavedPropertyRow =>
  ({
    parcelNodeId,
    snapshot: {
      address: `${parcelNodeId} Main St`,
      exports: [],
      ...over,
    },
  }) as SavedPropertyRow;

describe("chatUserWorkFrom — account-wide reports, per-property notes", () => {
  it("collects reports from EVERY property, not just the one in view", () => {
    const work = chatUserWorkFrom(
      [
        row("48021:1", {
          exports: [{ kind: "xray", format: "pdf", savedAt: "2026-08-28T00:00:00Z" }],
        }),
        row("48021:2", {
          exports: [
            { kind: "flood-drainage", format: "pdf", savedAt: "2026-08-27T00:00:00Z" },
          ],
        }),
      ],
      "48021:1",
    );
    expect(work?.reports).toHaveLength(2);
    expect(work?.reports.filter((r) => r.isThisProperty)).toHaveLength(1);
  });

  it("takes notes ONLY from the property in view", () => {
    const work = chatUserWorkFrom(
      [
        row("48021:1", { notes: "mine" }),
        row("48021:2", { notes: "someone else's parcel" }),
      ],
      "48021:1",
    );
    expect(work?.notes).toBe("mine");
  });

  it("newest report first, so a capped list keeps what matters", () => {
    const work = chatUserWorkFrom(
      [
        row("48021:1", {
          exports: [
            { kind: "xray", format: "pdf", savedAt: "2026-01-01T00:00:00Z" },
            { kind: "terrain", format: "dxf", savedAt: "2026-08-28T00:00:00Z" },
          ],
        }),
      ],
      "48021:1",
    );
    expect(work?.reports[0].kind).toBe("terrain");
  });

  it("nothing of theirs -> NO context, never an empty block", () => {
    expect(chatUserWorkFrom([], null)).toBeNull();
    expect(chatUserWorkFrom([row("48021:1")], "48021:1")).toBeNull();
  });
});

describe("composeMessageWithUserWork — the transport that actually reaches the model", () => {
  const work = chatUserWorkFrom(
    [
      row("48021:1", {
        notes: "Seller wants a quick close.",
        exports: [
          { kind: "flood-drainage", format: "pdf", savedAt: "2026-08-28T00:00:00Z" },
        ],
      }),
    ],
    "48021:1",
  );

  it("puts the reports INTO the outgoing message", () => {
    const out = composeMessageWithUserWork("what reports do I have?", work);
    expect(out).toContain("REPORTS THIS USER HAS GENERATED");
    expect(out).toContain("Flood & drainage report");
    expect(out).toContain("2026-08-28");
  });

  it("carries the user's notes verbatim", () => {
    const out = composeMessageWithUserWork("anything?", work);
    expect(out).toContain("Seller wants a quick close.");
  });

  it("preserves the user's actual question at the end", () => {
    const out = composeMessageWithUserWork("what reports do I have?", work);
    expect(out).toContain("User question: what reports do I have?");
  });

  it("FORBIDS the model characterising a report it cannot read", () => {
    // The whole honesty design. We know a flood study exists; we did not read
    // it. A model that infers findings from a filename is worse than the
    // honest "no" this replaced.
    const out = composeMessageWithUserWork("what did the flood report say?", work);
    expect(out).toContain("FILING RECORDS");
    expect(out).toContain("CONTENTS were not read");
    expect(out).toMatch(/must NOT state or imply what any report concluded/);
  });

  it("is a pass-through when there is nothing of theirs — no empty scaffolding", () => {
    expect(composeMessageWithUserWork("hello", null)).toBe("hello");
  });
});
