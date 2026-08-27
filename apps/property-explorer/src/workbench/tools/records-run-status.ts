import type { RecordsRunPhase, RecordsRunView } from "./records-request-types";
import { SCAFFOLD_RUN_STATUS } from "./records-request-scaffold-data";

export type RecordsRunStatusTone = "idle" | "active" | "person" | "warn";

export interface RecordsRunStatusCopy {
  tone: RecordsRunStatusTone;
  title: string;
  body: string;
  progress?: number;
  detail?: string;
}

/** Honest copy for a live API job — never the design-reference queue fiction. */
export function liveRecordsRunStatus(run: RecordsRunView): RecordsRunStatusCopy {
  switch (run.phase) {
    case "queued":
      return {
        tone: "idle",
        title: "Queued",
        body: "Your clerk index search is queued. The portal has not been searched yet — results will appear here when the run finishes.",
      };
    case "running":
      return {
        tone: "active",
        title: "Searching county records",
        body: "The clerk portal search is in progress. Instrument rows will populate when extraction completes.",
      };
    case "paused-fees":
      return {
        tone: "warn",
        title: "Paused — county fees need approval",
        body:
          run.errorMessage ??
          "The run paused at a county per-page purchase gate. Approve fees to continue, or the run will finish with header-only rows.",
      };
    case "failed":
      return {
        tone: "warn",
        title: run.errorCode
          ? `Run failed · ${run.errorCode}`
          : "Run failed",
        body:
          run.errorMessage ??
          "The clerk portal search did not complete. Nothing was invented — try again or contact support.",
      };
    case "complete":
      return {
        tone: "idle",
        title:
          run.instrumentCount > 0
            ? `Run complete · ${run.instrumentCount} instruments`
            : "Run complete",
        body: run.searchedAt
          ? `Clerk index search finished ${run.searchedAt}. Results are listed below.`
          : "Clerk index search finished. Results are listed below.",
      };
    default:
      return {
        tone: "idle",
        title: "Not requested",
        body: "No clerk index search has been started for this parcel.",
      };
  }
}

export function recordsRunStatusCopy(
  phase: RecordsRunPhase,
  run?: RecordsRunView | null,
  options?: { preferLive?: boolean },
): RecordsRunStatusCopy {
  if (run && (run.live || options?.preferLive)) {
    return liveRecordsRunStatus(run);
  }
  return SCAFFOLD_RUN_STATUS[phase] ?? SCAFFOLD_RUN_STATUS.running;
}
