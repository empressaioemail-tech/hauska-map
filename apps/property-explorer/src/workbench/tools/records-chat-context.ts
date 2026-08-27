// P-85 item 12 — records request instruments in chat context and citation chips.
// When a clerk run is complete, PE sends the instrument list upstream and
// merges recording-reference chips client-side so answers can cite by ref.

import { fetchRecordsRun } from "../../lib/recordsRequestClient";
import type {
  RecordsInstrumentRow,
  RecordsRunFetchResult,
  RecordsRunPhase,
} from "./records-request-types";
import type { ChatRef } from "./chat-citations";
import type { ChatAnswer, ChatSubjectContext } from "./chat-research";

/** One instrument row carried in chat / research areaContext. */
export interface ChatRecordsInstrument {
  recordingRef: string;
  documentType: string;
  recordedAt: string | null;
  parties: string | null;
  readDepth: string;
  /** classified = ADR-020 row; index-hit = clerk index only (honest label). */
  source: "classified" | "index-hit";
}

export interface ChatRecordsRequestContext {
  phase: RecordsRunPhase;
  jobId: string | null;
  searchedAt: string | null;
  instrumentCount: number;
  verdictKind: "verified-absent" | "could-not-search" | null;
  instruments: ChatRecordsInstrument[];
}

export function instrumentSourceFromRow(
  row: RecordsInstrumentRow,
): ChatRecordsInstrument["source"] {
  return row.readDepth === "not-acquired" ? "index-hit" : "classified";
}

/** Map UI instrument rows to the chat wire shape (complete runs only). */
export function chatRecordsInstrumentsFromRows(
  rows: RecordsInstrumentRow[],
): ChatRecordsInstrument[] {
  return rows.map((row) => ({
    recordingRef: row.instrumentNumber,
    documentType: row.label,
    recordedAt: row.recordedAt === "—" ? null : row.recordedAt,
    parties:
      row.partiesLine === "Parties not extracted yet" ? null : row.partiesLine,
    readDepth: row.readDepth,
    source: instrumentSourceFromRow(row),
  }));
}

export function chatRecordsContextFromFetch(
  result: RecordsRunFetchResult,
): ChatRecordsRequestContext | null {
  if (!result.wired || !result.run) return null;
  const run = result.run;
  const verdictKind = run.verdicts[0]?.kind ?? null;
  const instruments =
    run.phase === "complete"
      ? chatRecordsInstrumentsFromRows(run.instruments)
      : [];
  return {
    phase: run.phase,
    jobId: run.jobId ?? null,
    searchedAt: run.searchedAt,
    instrumentCount: run.instrumentCount,
    verdictKind,
    instruments,
  };
}

/** Stable did for a county recording reference (chat chip identity). */
export function recordingRefDid(recordingRef: string): string {
  const id = recordingRef.trim();
  return `did:hauska:recorded-instrument:${id}`;
}

export function chatRefFromRecordsInstrument(
  inst: ChatRecordsInstrument,
  n?: number,
): ChatRef {
  const ref = inst.recordingRef.trim();
  const sourceNote =
    inst.source === "index-hit"
      ? "Clerk index hit — image not acquired yet."
      : null;
  const snippetParts = [inst.parties, sourceNote].filter(Boolean);
  return {
    did: recordingRefDid(ref),
    entityType: "recorded-instrument",
    entityId: ref,
    label:
      inst.source === "index-hit"
        ? `${inst.documentType} · rec. ${ref}`
        : `${inst.documentType} · rec. ${ref}`,
    snippet: snippetParts.length ? snippetParts.join(" · ") : null,
    edition: null,
    vintage: inst.recordedAt,
    n: n ?? null,
    sourceUrl: null,
  };
}

export function chatRefsFromRecordsInstruments(
  instruments: ChatRecordsInstrument[],
): ChatRef[] {
  return instruments.map((inst, i) => chatRefFromRecordsInstrument(inst, i + 1));
}

/**
 * Merge backend citation refs with local records refs. Backend wins on did
 * collision; records refs fill gaps (recordingRef not already cited).
 */
export function mergeAnswerRefsWithRecords(
  backendRefs: ChatRef[],
  recordsInstruments: ChatRecordsInstrument[],
): ChatRef[] {
  if (recordsInstruments.length === 0) return backendRefs;
  const byDid = new Map<string, ChatRef>();
  for (const ref of backendRefs) {
    byDid.set(ref.did, ref);
  }
  const out = [...backendRefs];
  let nextN =
    backendRefs.reduce((max, r) => (r.n != null && r.n > max ? r.n : max), 0) +
    1;
  for (const inst of recordsInstruments) {
    const did = recordingRefDid(inst.recordingRef);
    if (byDid.has(did)) continue;
    const ref = chatRefFromRecordsInstrument(inst, nextN);
    nextN += 1;
    byDid.set(did, ref);
    out.push(ref);
  }
  return out;
}

export function enrichChatAnswerWithRecords(
  answer: ChatAnswer,
  records: ChatRecordsRequestContext | null | undefined,
): ChatAnswer {
  if (!records?.instruments.length) return answer;
  return {
    ...answer,
    refs: mergeAnswerRefsWithRecords(answer.refs, records.instruments),
  };
}

export function attachRecordsToChatSubject(
  subject: ChatSubjectContext,
  records: ChatRecordsRequestContext | null | undefined,
): ChatSubjectContext {
  if (!records) return subject;
  return { ...subject, recordsRequest: records };
}

// ---------------------------------------------------------------------------
// Per-property records cache — one fetch per parcel per session (chat sends).
// ---------------------------------------------------------------------------

const chatRecordsCache = new Map<string, Promise<RecordsRunFetchResult>>();

export function getChatPropertyRecords(
  parcelNodeId: string,
  fetcher: (parcelNodeId: string) => Promise<RecordsRunFetchResult> = fetchRecordsRun,
): Promise<RecordsRunFetchResult> {
  const cached = chatRecordsCache.get(parcelNodeId);
  if (cached) return cached;
  const inFlight = fetcher(parcelNodeId).then(
    (result) => {
      if (!result.wired) chatRecordsCache.delete(parcelNodeId);
      return result;
    },
    () => {
      chatRecordsCache.delete(parcelNodeId);
      return {
        wired: false,
        run: null,
        notice: null,
      } satisfies RecordsRunFetchResult;
    },
  );
  chatRecordsCache.set(parcelNodeId, inFlight);
  return inFlight;
}

/** Test seam — clear the per-property records cache. */
export function resetChatPropertyRecordsCache(): void {
  chatRecordsCache.clear();
}
