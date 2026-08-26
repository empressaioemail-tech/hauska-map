// Records request BFF client — Phase 1 stub until backend routes merge.
// Fail closed: never fabricates a run; returns wired=false with an honest notice.

import type { RecordsRunFetchResult } from "../workbench/tools/records-request-types";

export const RECORDS_NOT_WIRED_NOTICE =
  "Records request API is not wired yet — this panel is a UI scaffold only.";

/** Fetch the latest run for a parcel. Stub until GET /api/pe-records-run exists. */
export async function fetchRecordsRun(
  _parcelNodeId: string,
): Promise<RecordsRunFetchResult> {
  return {
    wired: false,
    run: null,
    notice: RECORDS_NOT_WIRED_NOTICE,
  };
}

/** Start a new clerk-index search. Stub until POST /api/pe-records-run exists. */
export async function requestRecordsRun(
  _parcelNodeId: string,
): Promise<RecordsRunFetchResult> {
  return {
    wired: false,
    run: null,
    notice: RECORDS_NOT_WIRED_NOTICE,
  };
}
