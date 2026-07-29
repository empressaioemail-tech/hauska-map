// PE workbench chassis (WB1) — brief research fetch outcome mapping.
//
// The fetch moved MECHANICALLY from ExplorerMap.handleResearch into the brief
// tool; these tests pin that every status path (401 / 402 / 503 / 404 / ok /
// other / network-throw) maps to the same state it always produced.

import { describe, expect, it } from "vitest";
import {
  BRIEF_ENDPOINT,
  briefOutcomeNotice,
  runBriefResearch,
} from "./brief-research";
import { ZONED_BRIEF } from "../../browse/__fixtures__/research-brief.fixture";

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe("runBriefResearch — status mapping", () => {
  it("posts the parcelNodeId to the R1 brief endpoint", async () => {
    let seenPath: string | null = null;
    let seenBody: unknown = null;
    await runBriefResearch("48021:123", async (path, body) => {
      seenPath = path;
      seenBody = body;
      return response(200, ZONED_BRIEF);
    });
    expect(seenPath).toBe(BRIEF_ENDPOINT);
    expect(seenBody).toEqual({ parcelNodeId: "48021:123" });
  });

  it("200 with runId + sections → ready with the brief payload", async () => {
    const out = await runBriefResearch("p", async () =>
      response(200, ZONED_BRIEF),
    );
    expect(out.kind).toBe("ready");
    if (out.kind === "ready") {
      expect(out.brief.runId).toBe(ZONED_BRIEF.runId);
      expect(out.brief.brief.sections.length).toBeGreaterThan(0);
    }
  });

  it("401 → sign-in", async () => {
    const out = await runBriefResearch("p", async () => response(401, {}));
    expect(out).toEqual({ kind: "sign-in" });
    expect(briefOutcomeNotice(out as never)).toContain("Sign in to unlock");
  });

  it("402 → paywall", async () => {
    const out = await runBriefResearch("p", async () => response(402, {}));
    expect(out).toEqual({ kind: "paywall" });
  });

  it("503 report_not_ready → not-ready with the honest wired-path notice", async () => {
    const out = await runBriefResearch("p", async () =>
      response(503, { error: "report_not_ready" }),
    );
    expect(out).toEqual({ kind: "not-ready" });
    expect(briefOutcomeNotice(out as never)).toContain(
      "spine report_run integration pending",
    );
  });

  it("404 baked_snapshot_not_found → no-snapshot", async () => {
    const out = await runBriefResearch("p", async () =>
      response(404, { error: "baked_snapshot_not_found" }),
    );
    expect(out).toEqual({ kind: "no-snapshot" });
    expect(briefOutcomeNotice(out as never)).toContain("No baked snapshot");
  });

  it("other statuses → the server message or the status line", async () => {
    const withMessage = await runBriefResearch("p", async () =>
      response(500, { message: "spine exploded" }),
    );
    expect(withMessage).toEqual({ kind: "message", text: "spine exploded" });

    const bare = await runBriefResearch("p", async () => response(418, {}));
    expect(bare).toEqual({
      kind: "message",
      text: "Research request returned 418.",
    });
  });

  it("ok response missing runId/sections → message, never a fake ready", async () => {
    const out = await runBriefResearch("p", async () =>
      response(200, { hello: true }),
    );
    expect(out.kind).toBe("message");
  });

  it("network throw → unreachable", async () => {
    const out = await runBriefResearch("p", async () => {
      throw new Error("offline");
    });
    expect(out).toEqual({ kind: "unreachable" });
    expect(briefOutcomeNotice(out as never)).toContain(
      "Could not reach the research service",
    );
  });
});
