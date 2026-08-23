/**
 * WB6 — save chat to property: the ONE summary call on the same research
 * route, honest summary-failure fallback (thread still saves), capped thread,
 * and the not-saved offer path.
 */

import { describe, expect, it, vi } from "vitest";
import {
  capThreadForDossier,
  chatSummaryPrompt,
  saveChatToProperty,
} from "./chat-dossier";
import type { ChatSubjectContext, ChatTurnOutcome } from "./chat-research";
import { DOSSIER_CHAT_MAX_TURNS } from "../../lib/propertyDossier";

const subject: ChatSubjectContext = {
  parcelNodeId: "48021:2",
  address: "104 Main St, Bastrop, TX",
  jurisdictionKey: "bastrop-tx",
  setbacks: null,
  envelope: null,
  parcelFacts: {
    acreageAc: null,
    acreageSqft: null,
    livingAreaSqft: null,
    floodZoneLabel: null,
    landUseCode: null,
    landUseDescription: null,
    zoningDistrict: null,
  },
};

function turns(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `turn ${i}`,
  }));
}

const answerOutcome: ChatTurnOutcome = {
  kind: "answer",
  answer: {
    message: "• Finding one\n• Finding two",
    refs: [],
    disclaimer: "Not legal advice.",
    confidence: 0.7,
    generatedAt: "2026-07-29T00:00:00Z",
    method: "live",
  },
};

describe("chatSummaryPrompt", () => {
  it("carries the address (or the honest fallback)", () => {
    expect(chatSummaryPrompt("104 Main St")).toContain("104 Main St");
    expect(chatSummaryPrompt("104 Main St")).toContain("5 bullet points");
    expect(chatSummaryPrompt(null)).toContain("this property");
  });
});

describe("capThreadForDossier", () => {
  it("keeps the LAST 20 turns, role + content only", () => {
    const out = capThreadForDossier(turns(30));
    expect(out).toHaveLength(DOSSIER_CHAT_MAX_TURNS);
    expect(out[out.length - 1]).toEqual({ role: "assistant", content: "turn 29" });
    expect(Object.keys(out[0])).toEqual(["role", "content"]);
  });
});

describe("saveChatToProperty", () => {
  it("summary success → thread + labeled AI summary stored via ONE extra call", async () => {
    const runTurn = vi.fn(async () => answerOutcome);
    const update = vi.fn(async () => ({ kind: "ok" }) as const);
    const outcome = await saveChatToProperty(
      { parcelNodeId: "48021:2", address: subject.address, turns: turns(4), subject },
      { runTurn, update, now: () => "2026-07-29T12:00:00Z" },
    );
    expect(outcome).toEqual({ kind: "saved", summarized: true, summaryNote: null });
    expect(runTurn).toHaveBeenCalledTimes(1);
    const call = runTurn.mock.calls[0]![0] as {
      message: string;
      history: unknown[];
      subject: ChatSubjectContext;
      purpose?: string;
    };
    expect(call.message).toBe(chatSummaryPrompt(subject.address));
    expect(call.history).toHaveLength(4);
    expect(call.subject).toBe(subject);
    // R1: the summary declares itself PAID chat.
    expect(call.purpose).toBe("summary");
    expect(update).toHaveBeenCalledWith("48021:2", {
      chatThread: capThreadForDossier(turns(4)),
      chatSummary: {
        summary: "• Finding one\n• Finding two",
        savedAt: "2026-07-29T12:00:00Z",
        turnCount: 4,
        disclaimer: "Not legal advice.",
      },
    });
  });

  it("summary failure → thread saves WITHOUT a summary, honestly noted", async () => {
    const runTurn = vi.fn(async () => ({ kind: "unreachable" }) as const);
    const update = vi.fn(async () => ({ kind: "ok" }) as const);
    const outcome = await saveChatToProperty(
      { parcelNodeId: "48021:2", address: null, turns: turns(2), subject },
      { runTurn, update },
    );
    expect(outcome).toEqual({
      kind: "saved",
      summarized: false,
      summaryNote: "research service unreachable",
    });
    const patch = update.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch.chatThread).toHaveLength(2);
    expect("chatSummary" in patch).toBe(false); // an older summary is not wiped
  });

  it("unsaved property → not-saved (caller offers to save first)", async () => {
    const runTurn = vi.fn(async () => answerOutcome);
    const update = vi.fn(async () => ({ kind: "not-saved" }) as const);
    const outcome = await saveChatToProperty(
      { parcelNodeId: "48021:2", address: null, turns: turns(2), subject },
      { runTurn, update },
    );
    expect(outcome).toEqual({ kind: "not-saved" });
  });

  it("empty thread → honest error, no calls fired", async () => {
    const runTurn = vi.fn(async () => answerOutcome);
    const update = vi.fn(async () => ({ kind: "ok" }) as const);
    const outcome = await saveChatToProperty(
      { parcelNodeId: "48021:2", address: null, turns: [], subject },
      { runTurn, update },
    );
    expect(outcome.kind).toBe("error");
    expect(runTurn).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("with a session id → UPSERTS into chatThreads (revisit) alongside the legacy fields", async () => {
    const runTurn = vi.fn(async () => answerOutcome);
    // Function-form patch: assert the merged chatThreads it produces from the
    // property's CURRENT dossier (an unrelated existing thread survives).
    const update = vi.fn(
      async (
        _id: string,
        patch:
          | Record<string, unknown>
          | ((current: Record<string, unknown>) => Record<string, unknown>),
      ) => {
        const resolved =
          typeof patch === "function"
            ? patch({
                chatThreads: [
                  { id: "other", title: "Other", savedAt: "2026-07-01T00:00:00Z", turnCount: 2, turns: [] },
                ],
              })
            : patch;
        expect(resolved.chatThread).toBeDefined();
        const threads = resolved.chatThreads as Array<{ id: string }>;
        expect(threads.map((t) => t.id)).toContain("session-42");
        expect(threads.map((t) => t.id)).toContain("other");
        return { kind: "ok" } as const;
      },
    );
    const outcome = await saveChatToProperty(
      {
        parcelNodeId: "48021:2",
        address: subject.address,
        turns: turns(4),
        subject,
        session: { id: "session-42", title: "ADU questions" },
      },
      { runTurn, update, now: () => "2026-08-01T12:00:00Z" },
    );
    expect(outcome.kind).toBe("saved");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
