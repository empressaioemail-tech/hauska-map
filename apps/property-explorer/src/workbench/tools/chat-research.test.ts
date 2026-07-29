// W3 chat — request seam tests: the starter-id remap table (extension
// research-api.js parity), the request-body builder (areaContext + last-8
// history window, NO mapContext), subject-context derivation from the stored
// R1 brief, and the honest outcome mapping per status.

import { describe, expect, it } from "vitest";
import {
  buildChatRequestBody,
  buildChatSubjectContext,
  buildChatSubjectFromFacets,
  chatOutcomeNotice,
  CHAT_ENDPOINT,
  CHAT_HISTORY_WINDOW,
  getChatPropertyFacets,
  INVESTOR_STARTER_PROMPTS,
  resetChatPropertyFacetsCache,
  resolveBrokerageStarterPromptId,
  runChatTurn,
  type ChatSubjectContext,
  type ChatTurn,
} from "./chat-research";
import type { BakedFacetPayload } from "../../lib/baked-facets";
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
// SELF-SUFFICIENT subject context from the BAKED FACETS (workbench polish).
// The live defect: with the card showing zoning P-5 / setbacks / acreage,
// chat answered "I don't have zoning information" because the subject was
// built only from the stored R1 brief — empty unless the Brief tool had been
// opened. The facets are now the PRIMARY source; the brief supplements.
// ---------------------------------------------------------------------------

const PECAN_FACETS: BakedFacetPayload = {
  parcelNodeId: "48021:58867",
  countyFips: "48021",
  countyName: "Bastrop",
  baseFacts: {
    apn: "58867",
    situsAddress: "1010 Pecan St, Bastrop, TX",
    acreage: { value: 0.21 },
  },
  zoning: { district: "P-5" },
  envelope: {
    status: "ok",
    approximate: true,
    district: "P-5",
    setbacks: { front_ft: 10, side_ft: 5, rear_ft: 10 },
    buildableAreaSqFt: 4200,
    buildableAreaPct: 46,
    disclosure: "Approximate — not survey grade.",
    citationUrl: "https://library.municode.com/tx/bastrop",
  },
  facetCoverage: { zoning: true, envelope: true },
};

describe("buildChatSubjectFromFacets — chat carries its own property context", () => {
  it("BRIEF NEVER OPENED: builds a FULL subject from the baked facets alone", () => {
    const s = buildChatSubjectFromFacets("48021:58867", PECAN_FACETS, null, null);
    expect(s).toEqual({
      parcelNodeId: "48021:58867",
      address: "1010 Pecan St, Bastrop, TX",
      // Facets carry no jurisdiction key today — honest omission, not a guess.
      jurisdictionKey: null,
      setbacks: { front_ft: 10, side_ft: 5, rear_ft: 10, district: "P-5" },
      envelope: {
        buildableAreaSqFt: 4200,
        buildableAreaPct: 46,
        maxHeightFt: null,
        maxLotCoveragePct: null,
        maxFootprintSqFt: null,
        notSurveyGrade: true,
        approximate: true,
        edgeSignal: null,
        disclosure: "Approximate — not survey grade.",
        citationUrl: "https://library.municode.com/tx/bastrop",
      },
    });
    // …and the request body carries the district on the anchor parcel too.
    const body = buildChatRequestBody({ message: "zoning?", history: [], subject: s }) as {
      areaContext: {
        visibleParcels: Array<Record<string, unknown>>;
        subject: { setbacks: { district: string | null } | null };
      };
    };
    expect(body.areaContext.subject.setbacks?.district).toBe("P-5");
    expect(body.areaContext.visibleParcels[0]).toMatchObject({ zoning: "P-5" });
  });

  it("stored brief SUPPLEMENTS facets (jurisdictionKey + max* fields) — never a prerequisite", () => {
    const s = buildChatSubjectFromFacets(
      "48021:123",
      PECAN_FACETS,
      ZONED_BRIEF,
      "123 Main St",
    );
    // Facets stay primary where they carry values…
    expect(s.address).toBe("1010 Pecan St, Bastrop, TX");
    expect(s.setbacks).toEqual({
      front_ft: 10,
      side_ft: 5,
      rear_ft: 10,
      district: "P-5",
    });
    expect(s.envelope?.buildableAreaSqFt).toBe(4200);
    // …and the brief fills what facets do not carry.
    expect(s.jurisdictionKey).toBe("bastrop-city-tx");
    expect(s.envelope?.maxHeightFt).toBe(35);
    expect(s.envelope?.maxLotCoveragePct).toBe(60);
  });

  it("zoning known but setback scalars absent → district still travels (numbers stay null)", () => {
    const facets: BakedFacetPayload = {
      parcelNodeId: "48021:77",
      zoning: { district: "C-1" },
      envelope: { status: "declined", declineReason: "setback-rule-pending" },
    };
    const s = buildChatSubjectFromFacets("48021:77", facets, null, null);
    expect(s.setbacks).toEqual({
      front_ft: null,
      side_ft: null,
      rear_ft: null,
      district: "C-1",
    });
    expect(s.envelope).toBeNull();
  });

  it("not_specified axes are NULLED — never sent as fabricated scalar setbacks", () => {
    const facets: BakedFacetPayload = {
      ...PECAN_FACETS,
      envelope: {
        ...PECAN_FACETS.envelope!,
        setbacks: {
          front_ft: 25,
          side_ft: 0,
          rear_ft: 0,
          not_specified: { side: true, rear: true },
        },
      },
    };
    const s = buildChatSubjectFromFacets("48021:58867", facets, null, null);
    expect(s.setbacks).toEqual({
      front_ft: 25,
      side_ft: null,
      rear_ft: null,
      district: "P-5",
    });
  });

  it("no facets at all → identical to the brief-only subject (unchanged behavior)", () => {
    const fromFacets = buildChatSubjectFromFacets(
      "48021:123",
      null,
      ZONED_BRIEF,
      "123 Main St",
    );
    expect(fromFacets).toEqual(
      buildChatSubjectContext("48021:123", ZONED_BRIEF, "123 Main St"),
    );
  });

  it("no facets AND no brief → honest nulls with the host address, never a throw", () => {
    const s = buildChatSubjectFromFacets("48021:9", null, null, "9 Elm St");
    expect(s).toEqual({
      parcelNodeId: "48021:9",
      address: "9 Elm St",
      jurisdictionKey: null,
      setbacks: null,
      envelope: null,
    });
  });

  it("reads a jurisdiction key DEFENSIVELY when the wire carries one", () => {
    const facets = {
      ...PECAN_FACETS,
      zoning: { district: "P-5", jurisdictionKey: "bastrop_city_tx" },
    } as unknown as BakedFacetPayload;
    const s = buildChatSubjectFromFacets("48021:58867", facets, null, null);
    expect(s.jurisdictionKey).toBe("bastrop_city_tx");
  });
});

describe("getChatPropertyFacets — fetch once per property, module-cached", () => {
  it("fetches ONCE across repeated calls for the same property", async () => {
    resetChatPropertyFacetsCache();
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return PECAN_FACETS;
    };
    const a = await getChatPropertyFacets("48021:58867", fetcher);
    const b = await getChatPropertyFacets("48021:58867", fetcher);
    expect(a).toBe(PECAN_FACETS);
    expect(b).toBe(PECAN_FACETS);
    expect(calls).toBe(1);
  });

  it("a failed/empty fetch is NOT pinned — the next message retries", async () => {
    resetChatPropertyFacetsCache();
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return PECAN_FACETS;
    };
    expect(await getChatPropertyFacets("48021:1", fetcher)).toBeNull();
    expect(await getChatPropertyFacets("48021:1", fetcher)).toBe(PECAN_FACETS);
    expect(calls).toBe(2);
  });

  it("different properties cache independently", async () => {
    resetChatPropertyFacetsCache();
    const seen: string[] = [];
    const fetcher = async (id: string) => {
      seen.push(id);
      return PECAN_FACETS;
    };
    await getChatPropertyFacets("48021:1", fetcher);
    await getChatPropertyFacets("48021:2", fetcher);
    expect(seen).toEqual(["48021:1", "48021:2"]);
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
          {
            parcelId: "48021:123",
            address: "123 Main St, Bastrop, TX",
            zoning: "P-2",
          },
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
      { parcelId: "48021:123", zoning: "P-2" },
    ]);
  });

  it("omits zoning on the visible parcel when no district is known", () => {
    const subject: ChatSubjectContext = {
      parcelNodeId: "48021:9",
      address: null,
      jurisdictionKey: null,
      setbacks: null,
      envelope: null,
    };
    const body = buildChatRequestBody({
      message: "q",
      history: [],
      subject,
    }) as Record<string, unknown> & {
      areaContext: { visibleParcels: Array<Record<string, unknown>> };
    };
    expect(body.areaContext.visibleParcels).toEqual([{ parcelId: "48021:9" }]);
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
