// Records request — shared types for the Studio report (P-85 item 12).
// API shapes are provisional until the backend PR lands; the UI scaffold
// consumes these without inventing wire formats.

/** Instrument categories shown in the type filter row (design D1). */
export type RecordsInstrumentType =
  | "deed"
  | "lien"
  | "easement"
  | "plat"
  | "restriction"
  | "notice"
  | "other";

/** How much was read from a recorded instrument. */
export type RecordsReadDepth =
  | "clauses-vision"
  | "header-only"
  | "plat-clauses"
  | "not-acquired";

/** Run lifecycle for the county clerk index search. */
export type RecordsRunPhase =
  | "not-requested"
  | "queued"
  | "running"
  | "paused-fees"
  | "failed"
  | "complete";

/** Verdict cards that sit beside the instrument list (design D4–D5). */
export type RecordsVerdictKind =
  | "verified-absent"
  | "could-not-search";

export interface RecordsInstrumentRow {
  id: string;
  type: RecordsInstrumentType;
  label: string;
  instrumentNumber: string;
  recordedAt: string;
  partiesLine: string;
  readDepth: RecordsReadDepth;
  acquisitionNote?: string;
  corridorPlaced?: boolean;
}

export interface RecordsTypeFilter {
  type: RecordsInstrumentType | "all";
  label: string;
  count: number;
}

export interface RecordsVerdictCard {
  kind: RecordsVerdictKind;
  title: string;
  body: string;
}

export interface RecordsRunView {
  phase: RecordsRunPhase;
  parcelNodeId: string;
  searchedAt: string | null;
  instrumentCount: number;
  filters: RecordsTypeFilter[];
  instruments: RecordsInstrumentRow[];
  verdicts: RecordsVerdictCard[];
  /** Present when the run came from the live API (not design scaffold). */
  live?: boolean;
  jobId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface RecordsRunFetchResult {
  wired: boolean;
  run: RecordsRunView | null;
  notice: string | null;
}
