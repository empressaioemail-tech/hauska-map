// W3 chat — request seam tests: the starter-id remap table (extension
// research-api.js parity), the request-body builder (areaContext + last-8
// history window, NO mapContext), subject-context derivation from the stored
// R1 brief, and the honest outcome mapping per status.

import { describe, expect, it } from "vitest";
import {
  buildChatRequestBody,
  buildChatSubjectContext,
  chatOutcomeNotice,
  CHAT_ENDPOINT,
  CHAT_HISTORY_WINDOW,
  INVESTOR_STARTER_PROMPTS,
  resolveBrokerageStarterPromptId,
  runChatTurn,
  type ChatSubjectContext,
  type ChatTurn,
} from "./chat-research";
import { ZONED_BRIEF, UNZONED_BRIEF } from "../../browse/__fixtures__/research-brief.fixture";

// ---------------------------------------------------------------------------
// Starter-chip remap (unknown starterPromptId values 400 server-side).
// ---------------------------------------------------------------------------

describe("starter-id remap — extension table, verbatim", () => {
  it("passes through the brokerage enum unchanged", () => {
    for (const id of ["adu", "flood", "schools", "str", "setbacks", "red_flags"]) {
      expect(resolveBrokerageStarterPromptId(id)).toBe(id);
    }
  });

  it("remaps the investor chip ids to the nearest brokerage starter", () => {
    expect(resolveBrokerageStarterPromptId("unit_subdivide")).toBe("adu");
    expect(resolveBrokerageStarterPromptId("killers")).toBe("red_flags");
    expect(resolveBrokerageStarterPromptId("insurance")).toBe("flood");
    expect(resolveBrokerageStarterPromptId("rehab")).toBe("red_flags");
  });

  it("unmappable / absent ids resolve to undefined (field omitted, never 400)", () => {
    expect(resolveBrokerageStarterPromptId("pencil")).toBeUndefined();
    expect(resolveBrokerageStarterPromptId("nonsense")).toBeUndefined();
    expect(resolveBrokerageStarterPromptId(undefined)).toBeUndefined();
    expect(resolveBrokerageStarterPromptId(null)).toBeUndefined();
  });

  it("every investor starter chip is either mappable or intentionally unmapped", () => {
    const mapped = INVESTOR_STARTER_PROMPTS.map((p) => ({
      id: p.id,
      to: resolveBrokerageStarterPromptId(p.id),
    }));
    expect(mapped).toEqual([
      { id: "unit_subdivide", to: "adu" },
      { id: "pencil", to: undefined },
      { id: "killers", to: "red_flags" },
      { id: "rehab", to: "red_flags" },
      { id: "insurance", to: "flood" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Subject context from the stored R1 brief.
// ---------------------------------------------------------------------------

describe("buildChatSubjectContext — from the stored R1 brief", () => {
  it("reads zoning + setbacks-envelope into the BE field names", () => {
    const s = buildChatSubjectContext("48021:123", ZONED_BRIEF, "123 Main St");
    expect(s.parcelNodeId).toBe("48021:123");
    expect(s.address).toBe("123 Main St");
    expect(s.jurisdictionKey).toBe("bastrop-city-tx");
    expect(s.setbacks).toEqual({
      front_ft: 10,
      side_ft: 0,
      rear_ft: 0,
      district: "P-2",
    });
    expect(s.envelope).toMatchObject({
      buildableAreaSqFt: 6100,
      buildableAreaPct: 70,
      maxHeightFt: 35,
      maxLotCoveragePct: 60,
      maxFootprintSqFt: 5227,
      notSurveyGrade: true,
      approximate: true,
      citationUrl:
        "https://library.municode.com/tx/bastrop/codes/code_of_ordinances",
    });
  });

  it("declined envelope / missing zoning stay honestly null", () => {
    const s = buildChatSubjectContext("48055:987", UNZONED_BRIEF, null);
    expect(s.jurisdictionKey).toBeNull();
    expect(s.setbacks).toBeNull();
    expect(s.envelope).toBeNull();
    expect(s.address).toBeNull();
  });

  it("no stored brief at all → nulls, never a throw", () => {
    const s = buildChatSubjectContext("48021:9", null, null);
    expect(s).toEqual({
      parcelNodeId: "48021:9",
      address: null,
      jurisdictionKey: null,
      setbacks: null,
      envelope: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Request-body builder.
// ---------------------------------------------------------------------------

const FULL_SUBJECT: ChatSubjectContext = buildChatSubjectContext(
  "48021:123",
  ZONED_BRIEF,
  "123 Main St, Bastrop, TX",
);

describe("buildChatRequestBody — the RESEARCH_CHAT_BODY shape", () => {
  it("builds the full body: areaContext subject seam + address + remapped starter", () => {
    const body = buildChatRequestBody({
      message: "Can I add an ADU?",
      history: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      subject: FULL_SUBJECT,
      starterPromptId: "unit_subdivide",
      personaBucket: "investor",
    });
    expect(body).toEqual({
      message: "Can I add an ADU?",
      history: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      presentationMode: "consumer",
      starterPromptId: "adu",
      personaBucket: "investor",
      address: "123 Main St, Bastrop, TX",
      areaContext: {
        scope: "property",
        jurisdictionKey: "bastrop-city-tx",
        visibleParcels: [
          { parcelId: "48021:123", address: "123 Main St, Bastrop, TX" },
        ],
        subject: {
          parcelNodeId: "48021:123",
          address: "123 Main St, Bastrop, TX",
          setbacks: {
            front_ft: 10,
            side_ft: 0,
            rear_ft: 0,
            district: "P-2",
          },
          envelope: {
            buildableAreaSqFt: 6100,
            buildableAreaPct: 70,
            maxHeightFt: 35,
            maxLotCoveragePct: 60,
            maxFootprintSqFt: 5227,
            notSurveyGrade: true,
            approximate: true,
            edgeSignal: null,
            disclosure:
              "One or more scalar setbacks are not specified in the code (build-to-line governs).",
            citationUrl:
              "https://library.municode.com/tx/bastrop/codes/code_of_ordinances",
          },
        },
      },
    });
  });

  it("NEVER includes mapContext (not in the server schema)", () => {
    const body = buildChatRequestBody({
      message: "q",
      history: [],
      subject: FULL_SUBJECT,
    });
    expect(Object.keys(body)).not.toContain("mapContext");
  });

  it("windows history to the LAST 8 turns", () => {
    const history: ChatTurn[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${i}`,
    }));
    const body = buildChatRequestBody({
      message: "q",
      history,
      subject: FULL_SUBJECT,
    }) as { history: ChatTurn[] };
    expect(body.history).toHaveLength(CHAT_HISTORY_WINDOW);
    expect(body.history[0]!.content).toBe("turn 4");
    expect(body.history[7]!.content).toBe("turn 11");
  });

  it("omits starterPromptId for unmappable ids (400-guard) and address when unknown", () => {
    const subject: ChatSubjectContext = { ...FULL_SUBJECT, address: null };
    const body = buildChatRequestBody({
      message: "does it pencil?",
      history: [],
      subject,
      starterPromptId: "pencil",
      personaBucket: "investor",
    }) as Record<string, unknown> & {
      areaContext: { visibleParcels: Array<Record<string, unknown>> };
    };
    expect(body).not.toHaveProperty("starterPromptId");
    expect(body).not.toHaveProperty("address");
    // The subject parcel still anchors run-selector eligibility.
    expect(body.areaContext.visibleParcels).toEqual([
      { parcelId: "48021:123" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Outcome mapping (injected transport — no network).
// ---------------------------------------------------------------------------

function fakePost(status: number, payload: unknown) {
  return async (path: string): Promise<Response> => {
    expect(path).toBe(CHAT_ENDPOINT);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  };
}

const SEND = {
  message: "Can I add an ADU?",
  history: [] as ChatTurn[],
  subject: FULL_SUBJECT,
};

describe("runChatTurn — honest status mapping", () => {
  it("200 with a message → answer turn with normalized citation refs", async () => {
    const outcome = await runChatTurn(
      SEND,
      fakePost(200, {
        message: "Likely yes, subject to P-2 standards.",
        messageHtml: "<p>Likely yes, subject to P-2 standards.</p>",
        citations: [
          {
            n: 1,
            atomDid: "did:hauska:code-section:bastrop-udc-4-2",
            label: "ADU standards",
            snippet: "Accessory dwelling units are permitted…",
          },
        ],
        sources: [],
        disclaimer: "Not legal advice.",
        confidence: 0.75,
        generatedAt: "2026-07-29T00:00:00.000Z",
        method: "grok",
      }),
    );
    expect(outcome.kind).toBe("answer");
    if (outcome.kind !== "answer") return;
    expect(outcome.answer.message).toBe("Likely yes, subject to P-2 standards.");
    expect(outcome.answer.refs).toHaveLength(1);
    expect(outcome.answer.refs[0]).toMatchObject({
      did: "did:hauska:code-section:bastrop-udc-4-2",
      label: "ADU standards",
    });
    expect(outcome.answer.disclaimer).toBe("Not legal advice.");
    expect(outcome.answer.confidence).toBe(0.75);
  });

  it("401 → sign-in", async () => {
    const outcome = await runChatTurn(SEND, fakePost(401, {}));
    expect(outcome).toEqual({ kind: "sign-in" });
    expect(chatOutcomeNotice(outcome as never)).toMatch(/sign in/i);
  });

  it("402 → paywall (caller opens the gate)", async () => {
    const outcome = await runChatTurn(SEND, fakePost(402, {}));
    expect(outcome).toEqual({ kind: "paywall" });
  });

  it("400 (run-selector/areaContext rejection) → scope-failed with the server's words", async () => {
    const outcome = await runChatTurn(
      SEND,
      fakePost(400, { error: "invalid_request", message: "Invalid research chat body" }),
    );
    expect(outcome).toEqual({
      kind: "scope-failed",
      text: "Invalid research chat body",
    });
    expect(chatOutcomeNotice(outcome as never)).toBe(
      "Chat could not scope to this property.",
    );
  });

  it("404 (no brokerage run resolved) → scope-failed too", async () => {
    const outcome = await runChatTurn(
      SEND,
      fakePost(404, {
        error: "not_found",
        message: "No brief run for this property — POST /api/brokerage/v1/brief first",
      }),
    );
    expect(outcome.kind).toBe("scope-failed");
  });

  it("5xx → retryable with the server's message", async () => {
    const outcome = await runChatTurn(
      SEND,
      fakePost(503, { message: "upstream unavailable" }),
    );
    expect(outcome).toEqual({ kind: "retryable", text: "upstream unavailable" });
  });

  it("2xx without a message body → honest message outcome (no fake answer)", async () => {
    const outcome = await runChatTurn(SEND, fakePost(200, {}));
    expect(outcome).toEqual({
      kind: "message",
      text: "Chat request returned 200.",
    });
  });

  it("network throw → unreachable", async () => {
    const outcome = await runChatTurn(SEND, async () => {
      throw new Error("offline");
    });
    expect(outcome).toEqual({ kind: "unreachable" });
  });
});
