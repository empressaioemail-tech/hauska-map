// apps/property-explorer/src/workbench/tools/brief-research.ts
//
// The R1 research-brief fetch, extracted VERBATIM-in-behavior from
// ExplorerMap.handleResearch (WB1 mechanical move) so the brief tool owns it
// and it stays unit-testable with an injected transport. Same endpoint, same
// status mapping:
//   401                          → sign-in notice
//   402                          → paywall (caller opens the PaywallGate)
//   503 + report_not_ready       → "wired; spine report_run integration pending"
//   404 + baked_snapshot_not_found → "no baked snapshot" notice
//   200 + runId + brief.sections → ready (the cited brief payload)
//   anything else                → the server's message or the status line
//   network throw                → "could not reach the research service"

import { postDeepResearch } from "../../lib/auth";
import type { ResearchBriefPayload } from "../../browse/brief-view-model";

export const BRIEF_ENDPOINT = "api/property-explorer/v1/research/brief";

/** The exact paywall copy the 402 path has always shown. */
export const BRIEF_PAYWALL_MESSAGE =
  "Deep research and cited property reports (R1–R10) require sign-in and Pro entitlement.";

export type BriefResearchOutcome =
  | { kind: "ready"; brief: ResearchBriefPayload }
  | { kind: "sign-in" }
  | { kind: "paywall" }
  | { kind: "not-ready" }
  | { kind: "no-snapshot" }
  | { kind: "message"; text: string }
  | { kind: "unreachable" };

/** Human copy for every non-ready outcome (rendered inside the dock). */
export function briefOutcomeNotice(
  outcome: Exclude<BriefResearchOutcome, { kind: "ready" }>,
): string {
  switch (outcome.kind) {
    case "sign-in":
      return "Sign in to unlock deep research on this parcel.";
    case "paywall":
      return BRIEF_PAYWALL_MESSAGE;
    case "not-ready":
      return "Property brief path is wired; spine report_run integration pending.";
    case "no-snapshot":
      return "No baked snapshot exists for this parcel yet.";
    case "message":
      return outcome.text;
    case "unreachable":
      return "Could not reach the research service.";
  }
}

export async function runBriefResearch(
  parcelNodeId: string,
  post: (
    path: string,
    body: Record<string, unknown>,
  ) => Promise<Response> = postDeepResearch,
): Promise<BriefResearchOutcome> {
  try {
    const res = await post(BRIEF_ENDPOINT, { parcelNodeId });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    } & Partial<ResearchBriefPayload>;
    if (res.status === 401) return { kind: "sign-in" };
    if (res.status === 402) return { kind: "paywall" };
    if (res.status === 503 && body.error === "report_not_ready") {
      return { kind: "not-ready" };
    }
    if (res.status === 404 && body.error === "baked_snapshot_not_found") {
      return { kind: "no-snapshot" };
    }
    if (res.ok && body.runId && body.brief?.sections) {
      return { kind: "ready", brief: body as ResearchBriefPayload };
    }
    return {
      kind: "message",
      text: body.message ?? `Research request returned ${res.status}.`,
    };
  } catch {
    return { kind: "unreachable" };
  }
}
