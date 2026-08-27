import { describe, expect, it, vi, afterEach } from "vitest";
import {
  chatRecordsContextFromFetch,
  chatRefFromRecordsInstrument,
  chatRefsFromRecordsInstruments,
  enrichChatAnswerWithRecords,
  mergeAnswerRefsWithRecords,
  recordingRefDid,
  resetChatPropertyRecordsCache,
  getChatPropertyRecords,
} from "./records-chat-context";
import type { ChatAnswer } from "./chat-research";

describe("recordingRefDid", () => {
  it("builds a stable recorded-instrument did from the ref", () => {
    expect(recordingRefDid("2019012345")).toBe(
      "did:hauska:recorded-instrument:2019012345",
    );
  });
});

describe("chatRefFromRecordsInstrument", () => {
  it("cites by recording reference with honest index-hit label", () => {
    const ref = chatRefFromRecordsInstrument(
      {
        recordingRef: "2020-12345",
        documentType: "DEED",
        recordedAt: "2020-06-15",
        parties: "SMITH, JOHN",
        readDepth: "not-acquired",
        source: "index-hit",
      },
      1,
    );
    expect(ref).toMatchObject({
      did: "did:hauska:recorded-instrument:2020-12345",
      entityType: "recorded-instrument",
      entityId: "2020-12345",
      n: 1,
    });
    expect(ref.label).toContain("rec. 2020-12345");
    expect(ref.snippet).toContain("Clerk index hit");
  });

  it("carries classified instrument parties without index-hit disclaimer", () => {
    const ref = chatRefFromRecordsInstrument(
      {
        recordingRef: "2019012345",
        documentType: "Warranty deed",
        recordedAt: "2019-03-01",
        parties: "JONES TO SMITH",
        readDepth: "header-only",
        source: "classified",
      },
      2,
    );
    expect(ref.snippet).toBe("JONES TO SMITH");
    expect(ref.snippet).not.toContain("index hit");
  });
});

describe("mergeAnswerRefsWithRecords", () => {
  it("adds recording-ref chips not already in backend citations", () => {
    const merged = mergeAnswerRefsWithRecords(
      [
        {
          did: "did:hauska:code-section:a",
          entityType: "code-section",
          entityId: "a",
          label: "Setbacks",
          snippet: null,
          edition: null,
          vintage: null,
          n: 1,
          sourceUrl: null,
        },
      ],
      [
        {
          recordingRef: "2020-12345",
          documentType: "Easement",
          recordedAt: null,
          parties: null,
          readDepth: "not-acquired",
          source: "index-hit",
        },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]?.did).toBe("did:hauska:recorded-instrument:2020-12345");
    expect(merged[1]?.n).toBe(2);
  });

  it("dedupes when backend already cited the same recording ref", () => {
    const merged = mergeAnswerRefsWithRecords(
      [
        {
          did: "did:hauska:recorded-instrument:2020-12345",
          entityType: "recorded-instrument",
          entityId: "2020-12345",
          label: "DEED",
          snippet: null,
          edition: null,
          vintage: null,
          n: 1,
          sourceUrl: null,
        },
      ],
      [
        {
          recordingRef: "2020-12345",
          documentType: "DEED",
          recordedAt: null,
          parties: null,
          readDepth: "header-only",
          source: "classified",
        },
      ],
    );
    expect(merged).toHaveLength(1);
  });
});

describe("chatRecordsContextFromFetch", () => {
  it("includes instruments only when the run is complete", () => {
    const inFlight = chatRecordsContextFromFetch({
      wired: true,
      notice: null,
      run: {
        phase: "running",
        parcelNodeId: "48021:1",
        searchedAt: null,
        instrumentCount: 0,
        filters: [],
        instruments: [],
        verdicts: [],
        live: true,
      },
    });
    expect(inFlight?.instruments).toEqual([]);

    const complete = chatRecordsContextFromFetch({
      wired: true,
      notice: null,
      run: {
        phase: "complete",
        parcelNodeId: "48021:1",
        searchedAt: "Aug 27, 2026",
        instrumentCount: 1,
        filters: [],
        instruments: [
          {
            id: "idx-1",
            type: "deed",
            label: "Warranty deed",
            instrumentNumber: "2019012345",
            recordedAt: "2019-01-02",
            partiesLine: "A TO B",
            readDepth: "not-acquired",
            acquisitionNote: "Clerk index hit — image not acquired yet",
          },
        ],
        verdicts: [],
        live: true,
        jobId: "job-1",
      },
    });
    expect(complete?.instruments).toHaveLength(1);
    expect(complete?.instruments[0]?.recordingRef).toBe("2019012345");
    expect(complete?.instruments[0]?.source).toBe("index-hit");
  });
});

describe("enrichChatAnswerWithRecords", () => {
  it("merges records refs into the answer chip list", () => {
    const answer: ChatAnswer = {
      message: "There is an easement at rec. 2020-12345 [2].",
      refs: [],
      disclaimer: null,
      confidence: null,
      generatedAt: null,
      method: null,
    };
    const enriched = enrichChatAnswerWithRecords(answer, {
      phase: "complete",
      jobId: "j",
      searchedAt: null,
      instrumentCount: 1,
      verdictKind: null,
      instruments: [
        {
          recordingRef: "2020-12345",
          documentType: "Easement",
          recordedAt: null,
          parties: null,
          readDepth: "not-acquired",
          source: "index-hit",
        },
      ],
    });
    expect(enriched.refs).toHaveLength(1);
    expect(enriched.refs[0]?.entityId).toBe("2020-12345");
  });
});

describe("chatRefsFromRecordsInstruments", () => {
  it("numbers refs sequentially for inline [n] mapping", () => {
    const refs = chatRefsFromRecordsInstruments([
      {
        recordingRef: "111",
        documentType: "Deed",
        recordedAt: null,
        parties: null,
        readDepth: "not-acquired",
        source: "index-hit",
      },
      {
        recordingRef: "222",
        documentType: "Lien",
        recordedAt: null,
        parties: null,
        readDepth: "not-acquired",
        source: "index-hit",
      },
    ]);
    expect(refs.map((r) => r.n)).toEqual([1, 2]);
  });
});

describe("getChatPropertyRecords", () => {
  afterEach(() => {
    resetChatPropertyRecordsCache();
  });

  it("caches fetch per parcelNodeId", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      wired: true,
      run: null,
      notice: null,
    });
    await getChatPropertyRecords("48021:99", fetcher);
    await getChatPropertyRecords("48021:99", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
