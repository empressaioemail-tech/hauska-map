// R2 — citation accordion data layer tests: fetch-on-tap cache + degrade,
// chain parsing, the CLIENT-COMPOSED lineage matrix (full / partial / absent
// — never a fabricated link), the honest card model (NEVER-BARE confidence,
// earned-vs-asserted display downgrade), and the shared accordion controller
// (one open, lineage walk stack, ← back).
//
// Fixtures mirror the LIVE retrieval wire verified 2026-07-29 against
// property-nodes/48021:28286/atom-chain and atoms/:did (dids are
// did:hauska:<type>:<parcelNodeId>; envelope inputAtomRefs carry fact/rule
// roles + reference-field geometry inputs; readContract axes carry
// asserted/calibrated WidthedConfidence with provenance).

import { beforeEach, describe, expect, it } from "vitest";
import {
  atomFromChain,
  composeLineage,
  deriveAtomCardModel,
  displayedDid,
  fetchAtomByDid,
  getChainEntries,
  lineageChipLabel,
  openCitationCard,
  parseChainEntries,
  popLineage,
  pushLineage,
  resetAtomCardCaches,
  type ChainAtomEntry,
} from "./chat-atom-card";

// ---------------------------------------------------------------------------
// Wire fixtures (live-shape).
// ---------------------------------------------------------------------------

const ZONING_DID = "did:hauska:zoning-fact:48021:28286";
const SETBACK_DID = "did:hauska:setback-rule:48021:28286";
const ENVELOPE_DID = "did:hauska:buildable-envelope:48021:28286";

const ZONING_ATOM = {
  entityType: "zoning-fact",
  atomDid: ZONING_DID,
  parcelNodeId: "48021:28286",
  district: "P-3",
  accessPolicy: "public-free",
  sourceAdapter: "txgio-zoning-stamp:bastrop-city-tx",
  sourceUrl:
    "https://services7.arcgis.com/qOeXJdBtGknaCJC4/arcgis/rest/services/Zoning_Place_Type/FeatureServer/0",
  sourceCitation: "GIS Zoning_Place_Type field PlaceTypeClass",
  fetchedAt: "2026-07-23T11:58:59.441Z",
  extractedAt: "2026-07-23T11:58:59.441Z",
  reasoningChain: { reasoningKind: "observed" },
  readContract: {
    axes: {
      assertedConfidence: {
        n: 0,
        estimate: 0.9,
        provenance: "asserted",
        intervalWidth: 0.12,
      },
      calibratedConfidence: {
        n: 0,
        estimate: 0.9,
        provenance: "seed",
        intervalWidth: 0.12,
      },
      consequence: { kind: "not-applicable" },
    },
    assembledAt: "2026-07-23T11:58:59.441Z",
  },
};

const SETBACK_ATOM = {
  entityType: "setback-rule",
  atomDid: SETBACK_DID,
  parcelNodeId: "48021:28286",
  front: 15,
  side: 0,
  rear: 0,
  districtCode: "P-3",
  accessPolicy: "public-free",
  sourceAdapter: "b3-code-setbacks",
  sourceUrl:
    "https://www.cityofbastrop.org/upload/page/0107/docs/B3/B3%20Code%20-%20April%202025.pdf",
  sourceCitation: "B3 Code §6.5.003",
  fetchedAt: "2026-07-29T08:38:21.055Z",
  extractedAt: "2026-07-29T08:38:21.055Z",
  reasoningChain: { reasoningKind: "observed" },
};

const ENVELOPE_ATOM = {
  entityType: "buildable-envelope",
  atomDid: ENVELOPE_DID,
  parcelNodeId: "48021:28286",
  accessPolicy: "public-free",
  outcome: { kind: "buildable", areaSqFt: 7316 },
  sourceAdapter: "depth-warm",
  sourceUrl: "https://hauska.dev/internal/depth-warm/promote",
  sourceCitation: "depth-warm-verified mechanical promote",
  extractedAt: "2026-07-29T08:38:21.055Z",
  reasoningChain: {
    reasoningKind: "derived",
    derivationMethod: "buildable-envelope-inset-v1",
    inputAtomRefs: [
      { role: "fact", atomDid: ZONING_DID, entityType: "zoning-fact" },
      { role: "rule", atomDid: SETBACK_DID, entityType: "setback-rule" },
      {
        role: "reference-field",
        atomDid: "48021:28286/geometry",
        citationLabel: "parcel-geometry-ring",
      },
      {
        role: "reference-field",
        atomDid: "48021:28286/front-edge",
        citationLabel: "front-edge-anchor",
      },
    ],
  },
  readContract: {
    axes: {
      assertedConfidence: {
        n: 0,
        estimate: 0.85,
        provenance: "asserted",
        intervalWidth: 0.15,
      },
      calibratedConfidence: {
        n: 0,
        estimate: 0.85,
        provenance: "asserted",
        intervalWidth: 0.15,
      },
      consequence: { kind: "not-applicable" },
    },
    assembledAt: "2026-07-29T08:38:21.055Z",
  },
};

const FULL_CHAIN_WIRE = {
  parcelNodeId: "48021:28286",
  atoms: [
    {
      did: ENVELOPE_DID,
      type: "buildable-envelope",
      kind: "buildable-envelope",
      accessPolicy: "public-free",
      payload: ENVELOPE_ATOM,
    },
    {
      did: SETBACK_DID,
      type: "setback-rule",
      kind: "setback-rule",
      accessPolicy: "public-free",
      payload: SETBACK_ATOM,
    },
    {
      did: ZONING_DID,
      type: "zoning-fact",
      kind: "zoning-fact",
      accessPolicy: "public-free",
      payload: ZONING_ATOM,
    },
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetAtomCardCaches();
});

// ---------------------------------------------------------------------------
// Fetch-on-tap: cache + uniform degrade.
// ---------------------------------------------------------------------------

describe("fetchAtomByDid — cache + degrade", () => {
  it("200 → ok with the atom body; cached (ONE fetch per did)", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return jsonResponse(200, { atom: ZONING_ATOM });
    };
    const a = await fetchAtomByDid(ZONING_DID, fetcher);
    const b = await fetchAtomByDid(ZONING_DID, fetcher);
    expect(a.kind).toBe("ok");
    expect(b).toBe(a);
    expect(calls).toBe(1);
  });

  it("ANY non-200 → unavailable, identically, and CACHED (gated-serve client)", async () => {
    // Live probe 2026-07-29: the route's only failure is a uniform 404
    // {"error":"atom not found"} — the client must not distinguish shapes.
    for (const status of [404, 403, 500]) {
      resetAtomCardCaches();
      let calls = 0;
      const fetcher = async () => {
        calls++;
        return jsonResponse(status, { error: "atom not found" });
      };
      const a = await fetchAtomByDid("did:hauska:code-section:missing", fetcher);
      await fetchAtomByDid("did:hauska:code-section:missing", fetcher);
      expect(a).toEqual({ kind: "unavailable" });
      expect(calls).toBe(1); // the dead did is never re-fetched
    }
  });

  it("network throw → unavailable but NOT cached (transient retries allowed)", async () => {
    let calls = 0;
    const fetcher = async (): Promise<Response> => {
      calls++;
      throw new Error("offline");
    };
    expect(await fetchAtomByDid("did:x", fetcher)).toEqual({
      kind: "unavailable",
    });
    expect(await fetchAtomByDid("did:x", fetcher)).toEqual({
      kind: "unavailable",
    });
    expect(calls).toBe(2);
  });

  it("200 with a bodyless/invalid payload → unavailable (never a broken card)", async () => {
    const a = await fetchAtomByDid("did:y", async () =>
      jsonResponse(200, { nope: true }),
    );
    expect(a).toEqual({ kind: "unavailable" });
  });
});

// ---------------------------------------------------------------------------
// Chain parsing + per-property cache.
// ---------------------------------------------------------------------------

describe("getChainEntries / parseChainEntries", () => {
  it("parses the live wire shape into entries with dids", () => {
    const entries = parseChainEntries(FULL_CHAIN_WIRE);
    expect(entries.map((e) => e.did)).toEqual([
      ENVELOPE_DID,
      SETBACK_DID,
      ZONING_DID,
    ]);
    expect(entries[0]!.type).toBe("buildable-envelope");
    expect(entries[0]!.accessPolicy).toBe("public-free");
  });

  it("invalid/absent atoms arrays parse to empty (no crash)", () => {
    expect(parseChainEntries({})).toEqual([]);
    expect(parseChainEntries(null)).toEqual([]);
    expect(parseChainEntries({ atoms: [null, 42, { did: "x" }] })).toEqual([]);
  });

  it("caches per parcelNodeId; failure evicts for retry", async () => {
    let calls = 0;
    const ok = async () => {
      calls++;
      return jsonResponse(200, FULL_CHAIN_WIRE);
    };
    await getChainEntries("48021:28286", ok);
    await getChainEntries("48021:28286", ok);
    expect(calls).toBe(1);

    let failCalls = 0;
    const fail = async () => {
      failCalls++;
      return jsonResponse(500, {});
    };
    expect(await getChainEntries("48021:9", fail)).toBeNull();
    expect(await getChainEntries("48021:9", fail)).toBeNull();
    expect(failCalls).toBe(2); // evicted → retried
  });

  it("atomFromChain serves the payload for a chain did, else null", () => {
    const entries = parseChainEntries(FULL_CHAIN_WIRE);
    expect(atomFromChain(ZONING_DID, entries)).toBe(ZONING_ATOM);
    expect(atomFromChain("did:hauska:code-section:elsewhere", entries)).toBeNull();
    expect(atomFromChain(ZONING_DID, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lineage composition matrix — only links ACTUALLY on the chain.
// ---------------------------------------------------------------------------

describe("composeLineage — the client-composed walk", () => {
  const entries = parseChainEntries(FULL_CHAIN_WIRE);

  it("FULL chain: envelope ← zoning-fact + setback-rule (computed-from)", () => {
    const l = composeLineage(ENVELOPE_DID, entries);
    expect(l.computedFrom.map((c) => c.did)).toEqual([ZONING_DID, SETBACK_DID]);
    expect(l.computedFrom.map((c) => c.label)).toEqual([
      "zoning fact",
      "setback rule",
    ]);
    // reference-field inputs are cited inputs, NEVER chips.
    expect(l.citedInputs).toEqual(["parcel-geometry-ring", "front-edge-anchor"]);
    expect(l.wouldAffect).toEqual([]);
  });

  it("FULL chain: zoning/setback → envelope (would-affect, real inversion)", () => {
    expect(composeLineage(ZONING_DID, entries).wouldAffect.map((c) => c.did)).toEqual(
      [ENVELOPE_DID],
    );
    expect(
      composeLineage(SETBACK_DID, entries).wouldAffect.map((c) => c.did),
    ).toEqual([ENVELOPE_DID]);
    // Observed atoms have no derivation inputs — nothing is fabricated.
    expect(composeLineage(ZONING_DID, entries).computedFrom).toEqual([]);
  });

  it("PARTIAL chain (no envelope) → observed atoms compose NOTHING", () => {
    const partial = entries.filter((e) => e.did !== ENVELOPE_DID);
    for (const did of [ZONING_DID, SETBACK_DID]) {
      const l = composeLineage(did, partial);
      expect(l).toEqual({ computedFrom: [], wouldAffect: [], citedInputs: [] });
    }
  });

  it("PARTIAL chain: envelope present but an input atom absent — the ref still renders (it IS recorded on the envelope)", () => {
    const noZoning = entries.filter((e) => e.did !== ZONING_DID);
    const l = composeLineage(ENVELOPE_DID, noZoning);
    // The link is recorded on the envelope's own reasoningChain — real, kept.
    expect(l.computedFrom.map((c) => c.did)).toEqual([ZONING_DID, SETBACK_DID]);
  });

  it("ABSENT: did not on the chain and cited by nothing → all empty; null chain → all empty", () => {
    expect(composeLineage("did:hauska:code-section:x", entries)).toEqual({
      computedFrom: [],
      wouldAffect: [],
      citedInputs: [],
    });
    expect(composeLineage(ENVELOPE_DID, null)).toEqual({
      computedFrom: [],
      wouldAffect: [],
      citedInputs: [],
    });
    expect(composeLineage(ENVELOPE_DID, [])).toEqual({
      computedFrom: [],
      wouldAffect: [],
      citedInputs: [],
    });
  });

  it("malformed reasoningChain shapes compose nothing (no crash, no invention)", () => {
    const mangled: ChainAtomEntry[] = [
      {
        did: "did:hauska:buildable-envelope:x",
        type: "buildable-envelope",
        accessPolicy: null,
        payload: {
          entityType: "buildable-envelope",
          reasoningChain: { reasoningKind: "derived", inputAtomRefs: "nope" },
        },
      },
    ];
    expect(composeLineage("did:hauska:buildable-envelope:x", mangled)).toEqual({
      computedFrom: [],
      wouldAffect: [],
      citedInputs: [],
    });
  });

  it("lineageChipLabel humanizes entityType, falls back to did type segment", () => {
    expect(lineageChipLabel("zoning-fact", "whatever")).toBe("zoning fact");
    expect(lineageChipLabel(null, "did:hauska:setback-rule:48021:1")).toBe(
      "setback rule",
    );
    expect(lineageChipLabel(null, "opaque-id")).toBe("opaque-id");
  });
});

// ---------------------------------------------------------------------------
// Card model — honesty rules.
// ---------------------------------------------------------------------------

describe("deriveAtomCardModel — never-bare confidence, honest display", () => {
  it("zoning-fact: claim, provenance, ASSERTED confidence with basis", () => {
    const m = deriveAtomCardModel(ZONING_DID, ZONING_ATOM);
    expect(m.claim).toBe("Zoning district P-3");
    expect(m.source).toBe("txgio-zoning-stamp:bastrop-city-tx");
    expect(m.method).toBe("observed");
    expect(m.confidence).toEqual({
      value: 0.9,
      basis: "asserted",
      n: 0,
      intervalWidth: 0.12,
    });
    // seed-provenance calibrated axis is NOT earned → display-downgraded.
    expect(m.calibrated).toBeNull();
    expect(m.verification).toBe("asserted");
    expect(m.accessPolicy).toBe("public-free");
    expect(m.asOf).toBe("2026-07-23T11:58:59.441Z");
  });

  it("setback-rule: dimensional claim with district", () => {
    const m = deriveAtomCardModel(SETBACK_DID, SETBACK_ATOM);
    expect(m.claim).toBe(
      "Setbacks — front 15 ft · side 0 ft · rear 0 ft (district P-3)",
    );
    // No readContract on this fixture → NO number renders (never bare).
    expect(m.confidence).toBeNull();
    expect(m.calibrated).toBeNull();
  });

  it("buildable-envelope: outcome claim + derivation method; asserted calibrated placeholder downgraded", () => {
    const m = deriveAtomCardModel(ENVELOPE_DID, ENVELOPE_ATOM);
    expect(m.claim).toBe("Buildable area ≈ 7,316 sq ft after setbacks");
    expect(m.method).toBe("buildable-envelope-inset-v1");
    expect(m.confidence?.basis).toBe("asserted");
    expect(m.calibrated).toBeNull();
  });

  it("EARNED calibrated axis (provenance live/backtest) IS displayed", () => {
    const atom = {
      ...ZONING_ATOM,
      readContract: {
        axes: {
          assertedConfidence: {
            n: 0,
            estimate: 0.9,
            provenance: "asserted",
            intervalWidth: 0.12,
          },
          calibratedConfidence: {
            n: 214,
            estimate: 0.62,
            provenance: "live",
            intervalWidth: 0.04,
          },
        },
      },
    };
    const m = deriveAtomCardModel(ZONING_DID, atom);
    expect(m.calibrated).toEqual({
      value: 0.62,
      basis: "live",
      n: 214,
      intervalWidth: 0.04,
    });
  });

  it("a confidence value without a basis NEVER surfaces (bare number forbidden)", () => {
    const atom = {
      ...ZONING_ATOM,
      readContract: { axes: { assertedConfidence: { estimate: 0.9 } } },
    };
    expect(deriveAtomCardModel(ZONING_DID, atom).confidence).toBeNull();
  });

  it("honest absence claim for an unstamped zoning-fact", () => {
    const m = deriveAtomCardModel("did:z", {
      entityType: "zoning-fact",
      absence: { kind: "no-zoning-stamp" },
    });
    expect(m.claim).toBe("No zoning recorded here (no-zoning-stamp)");
  });
});

// ---------------------------------------------------------------------------
// Accordion controller — one open, walk stack, ← back.
// ---------------------------------------------------------------------------

describe("citation card controller", () => {
  it("open / toggle-close / replace (one card at a time)", () => {
    const opened = openCitationCard(null, 1, "did:a");
    expect(opened).toEqual({ turnIndex: 1, anchorDid: "did:a", stack: ["did:a"] });
    // Re-tapping the open anchor closes.
    expect(openCitationCard(opened, 1, "did:a")).toBeNull();
    // Tapping another chip (any turn) REPLACES — never two cards.
    expect(openCitationCard(opened, 3, "did:b")).toEqual({
      turnIndex: 3,
      anchorDid: "did:b",
      stack: ["did:b"],
    });
  });

  it("lineage walk: push swaps the card, back pops, anchor floor holds", () => {
    let s = openCitationCard(null, 0, ENVELOPE_DID);
    s = pushLineage(s, SETBACK_DID);
    expect(displayedDid(s!)).toBe(SETBACK_DID);
    s = pushLineage(s, ZONING_DID);
    expect(s!.stack).toEqual([ENVELOPE_DID, SETBACK_DID, ZONING_DID]);
    s = popLineage(s);
    expect(displayedDid(s!)).toBe(SETBACK_DID);
    s = popLineage(s);
    expect(displayedDid(s!)).toBe(ENVELOPE_DID);
    // At the anchor, back is a no-op (the card stays; close is the chip tap).
    expect(popLineage(s)).toBe(s);
  });

  it("push on the currently-displayed did / closed state is a no-op", () => {
    const s = openCitationCard(null, 0, ENVELOPE_DID);
    expect(pushLineage(s, ENVELOPE_DID)).toBe(s);
    expect(pushLineage(null, "did:a")).toBeNull();
  });

  it("re-opening after a walk resets the stack (fresh anchor)", () => {
    let s = openCitationCard(null, 0, ENVELOPE_DID);
    s = pushLineage(s, SETBACK_DID);
    // Tapping the anchor chip mid-walk re-opens fresh (stack length > 1).
    const reopened = openCitationCard(s, 0, ENVELOPE_DID);
    expect(reopened).toEqual({
      turnIndex: 0,
      anchorDid: ENVELOPE_DID,
      stack: [ENVELOPE_DID],
    });
  });
});
