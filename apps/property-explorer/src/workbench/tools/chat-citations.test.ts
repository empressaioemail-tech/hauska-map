// W3 chat — citation→chip data tests: response-ref merge/normalization
// (numbered-citation reality, deprecated {{atom:...}} markup NOT resurrected),
// Cotality neutral-rename hygiene, and the ported freshness derivation.

import { describe, expect, it } from "vitest";
import {
  deriveChipFreshness,
  freshnessTitle,
  isWebUnverifiedRef,
  normalizeChatRef,
  parseAnswerSegments,
  refForCitationNumber,
  refsFromChatResponse,
  type ChatRef,
} from "./chat-citations";

function ref(overrides: Partial<ChatRef>): ChatRef {
  return {
    did: "did:hauska:code-section:x",
    entityType: "code-section",
    entityId: "x",
    label: "X",
    snippet: null,
    edition: null,
    vintage: null,
    n: null,
    ...overrides,
  };
}

describe("normalizeChatRef", () => {
  it("normalizes a numbered chat citation (atomDid) into a chip ref", () => {
    const r = normalizeChatRef({
      n: 2,
      atomDid: "did:hauska:code-section:bastrop-udc-5-1",
      label: "Setbacks",
      snippet: "Front setback shall be…",
    });
    expect(r).toMatchObject({
      did: "did:hauska:code-section:bastrop-udc-5-1",
      entityType: "code-section",
      entityId: "bastrop-udc-5-1",
      label: "Setbacks",
      snippet: "Front setback shall be…",
    });
  });

  it("derives a did when only entityType/entityId are present", () => {
    const r = normalizeChatRef({ entityType: "zoning-district", entityId: "p2", label: "P-2" });
    expect(r?.did).toBe("did:hauska:zoning-district:p2");
  });

  it("drops refs with no identity; label falls back to the entity id", () => {
    expect(normalizeChatRef({ label: "orphan" })).toBeNull();
    expect(normalizeChatRef(null)).toBeNull();
    const r = normalizeChatRef({ atomDid: "did:hauska:code-section:abc" });
    expect(r?.label).toBe("abc");
  });

  it("COTALITY HYGIENE: legacy cotality-parcel entityType renders as neutral 'Parcel'", () => {
    // Cotality is extinguished — PE never emits this key; if a stale ref
    // arrives carrying it, the label is neutrally renamed, never displayed raw.
    const r = normalizeChatRef({
      entityType: "cotality-parcel",
      entityId: "48021-000123",
      label: "cotality-parcel record",
    });
    expect(r?.label).toBe("Parcel");
  });
});

describe("refsFromChatResponse — merge + dedupe", () => {
  it("merges citations + sources + inlineRefs, deduped by did, first wins", () => {
    const refs = refsFromChatResponse({
      citations: [
        { n: 1, atomDid: "did:hauska:code-section:a", label: "A", snippet: "sa" },
      ],
      sources: [
        { n: 1, atomDid: "did:hauska:code-section:a", label: "A-dup" },
        { n: 2, atomDid: "did:hauska:code-section:b", label: "B" },
      ],
      atoms: {
        inlineRefs: [{ did: "did:hauska:code-section:c", label: "C" }],
      },
    });
    expect(refs.map((r) => r.did)).toEqual([
      "did:hauska:code-section:a",
      "did:hauska:code-section:b",
      "did:hauska:code-section:c",
    ]);
    expect(refs[0]!.label).toBe("A"); // first occurrence wins
  });

  it("a duplicate donates its snippet when the first had none", () => {
    const refs = refsFromChatResponse({
      citations: [{ atomDid: "did:hauska:code-section:a", label: "A" }],
      sources: [
        { atomDid: "did:hauska:code-section:a", label: "A", snippet: "late snippet" },
      ],
    });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.snippet).toBe("late snippet");
  });

  it("empty / absent arrays → empty chip list (no crash)", () => {
    expect(refsFromChatResponse({})).toEqual([]);
    expect(refsFromChatResponse({ citations: [null, 42, "x"] })).toEqual([]);
  });

  it("carries the backend citation number n (inline [n] anchor mapping)", () => {
    const refs = refsFromChatResponse({
      citations: [
        { n: 1, atomDid: "did:hauska:code-section:a", label: "A" },
        { atomDid: "did:hauska:code-section:b", label: "B" },
      ],
    });
    expect(refs[0]!.n).toBe(1);
    expect(refs[1]!.n).toBeNull();
    // Invalid n shapes are dropped, never coerced.
    expect(
      refsFromChatResponse({
        citations: [{ n: "7", atomDid: "did:hauska:code-section:c", label: "C" }],
      })[0]!.n,
    ).toBeNull();
  });

  it("a duplicate donates its n when the first had none", () => {
    const refs = refsFromChatResponse({
      citations: [{ atomDid: "did:hauska:code-section:a", label: "A" }],
      sources: [{ n: 3, atomDid: "did:hauska:code-section:a", label: "A" }],
    });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.n).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// PRO-mode inline [n] anchor parsing (R2). The second line of defense: only
// an [n] that maps to a REAL delivered citation may anchor; the rest is text.
// ---------------------------------------------------------------------------

describe("parseAnswerSegments — inline [n] markers", () => {
  it("splits text and citation markers, preserving order", () => {
    expect(parseAnswerSegments("Front setback is 15 ft [1] per code [2].")).toEqual([
      { kind: "text", text: "Front setback is 15 ft " },
      { kind: "cite", n: 1 },
      { kind: "text", text: " per code " },
      { kind: "cite", n: 2 },
      { kind: "text", text: "." },
    ]);
  });

  it("no markers → one text segment; empty → empty", () => {
    expect(parseAnswerSegments("Plain prose.")).toEqual([
      { kind: "text", text: "Plain prose." },
    ]);
    expect(parseAnswerSegments("")).toEqual([]);
  });

  it("non-numeric brackets stay text ([a], [), malformed never crashes", () => {
    expect(parseAnswerSegments("see [a] and [ then [12")).toEqual([
      { kind: "text", text: "see [a] and [ then [12" },
    ]);
  });

  it("refForCitationNumber maps n → the delivered ref; unknown n → null", () => {
    const refs = [ref({ n: 1, did: "did:hauska:code-section:a" })];
    expect(refForCitationNumber(refs, 1)?.did).toBe(
      "did:hauska:code-section:a",
    );
    // An invented [99] resolves to NOTHING — the renderer keeps it plain text.
    expect(refForCitationNumber(refs, 99)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Websearch-derived sources are NEVER atom chips (distinct + unverified).
// ---------------------------------------------------------------------------

describe("isWebUnverifiedRef", () => {
  it("websearch: ids classify as web-unverified", () => {
    expect(
      isWebUnverifiedRef(ref({ did: "websearch:austin-zoning-overview" })),
    ).toBe(true);
    expect(
      isWebUnverifiedRef(
        ref({ did: "did:hauska:code-section:x", entityId: "websearch:abc" }),
      ),
    ).toBe(true);
  });

  it("bare URLs and web entity types classify as web-unverified", () => {
    expect(isWebUnverifiedRef(ref({ did: "https://example.com/zoning" }))).toBe(
      true,
    );
    expect(isWebUnverifiedRef(ref({ entityType: "websearch" }))).toBe(true);
    expect(isWebUnverifiedRef(ref({ entityType: "web-source" }))).toBe(true);
  });

  it("recorded atom refs are NOT web-unverified", () => {
    expect(isWebUnverifiedRef(ref({}))).toBe(false);
    expect(
      isWebUnverifiedRef(ref({ did: "did:hauska:zoning-fact:48021:28286" })),
    ).toBe(false);
  });
});

describe("deriveChipFreshness — ported heuristic (atom-freshness.js)", () => {
  it("structured edition field wins: 2018 → outdated (not demo)", () => {
    const f = deriveChipFreshness(ref({ edition: "2018 IBC" }));
    expect(f).toEqual({
      status: "outdated",
      year: 2018,
      demo: false,
      reason: "atom edition 2018",
    });
  });

  it("structured edition at/after the current cycle → current", () => {
    const f = deriveChipFreshness(ref({ vintage: "2024" }));
    expect(f.status).toBe("current");
    expect(f.year).toBe(2024);
    expect(f.demo).toBe(false);
  });

  it("label heuristic: cycle code + old year → outdated (demo)", () => {
    const f = deriveChipFreshness(ref({ label: "2018 IPMC §302.4" }));
    expect(f.status).toBe("outdated");
    expect(f.demo).toBe(true);
  });

  it("label heuristic: cycle code + current year → current (demo)", () => {
    const f = deriveChipFreshness(ref({ label: "IBC 2024 §1013" }));
    expect(f.status).toBe("current");
    expect(f.year).toBe(2024);
  });

  it("year WITHOUT a cycle-code token → unknown (no false claim)", () => {
    const f = deriveChipFreshness(ref({ label: "Ordinance 2018-14" }));
    expect(f.status).toBe("unknown");
  });

  it("no signal at all → unknown (no badge)", () => {
    const f = deriveChipFreshness(ref({ label: "Bastrop UDC setbacks" }));
    expect(f).toEqual({
      status: "unknown",
      year: null,
      demo: true,
      reason: "no edition signal",
    });
  });

  it("freshness titles carry the year and the demo-estimate disclosure", () => {
    expect(freshnessTitle(deriveChipFreshness(ref({ edition: "2018" })))).toBe(
      "Cited edition (2018) is superseded by the current code cycle",
    );
    expect(
      freshnessTitle(deriveChipFreshness(ref({ label: "IRC 2021 §R305" }))),
    ).toBe("Cited edition (2021) is superseded by the current code cycle · demo estimate");
  });
});
