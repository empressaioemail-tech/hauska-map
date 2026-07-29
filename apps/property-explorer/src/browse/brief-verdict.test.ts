// W2 verdict-line composer — the fixture payload matrix. The composer is a
// pure deterministic function over the R1 wire payload; every case pins the
// EXACT line (verbatim) so copy drift is a conscious edit, never an accident.

import { describe, expect, it } from "vitest";
import { composeBriefVerdict } from "./brief-verdict";
import type { ResearchBriefPayload } from "./brief-view-model";
import {
  UNZONED_BRIEF,
  ZONED_BRIEF,
} from "./__fixtures__/research-brief.fixture";

/** Deep-clone a fixture then apply a mutation — fixtures stay pristine. */
function variant(
  base: ResearchBriefPayload,
  mutate: (p: ResearchBriefPayload) => void,
): ResearchBriefPayload {
  const clone = JSON.parse(JSON.stringify(base)) as ResearchBriefPayload;
  mutate(clone);
  return clone;
}

function setFlood(p: ResearchBriefPayload, data: Record<string, unknown>) {
  const s = p.brief.sections.find((x) => x.id === "flood")!;
  s.data = { ...(s.data as Record<string, unknown>), ...data };
}

function setEnvelope(p: ResearchBriefPayload, data: Record<string, unknown>) {
  const s = p.brief.sections.find((x) => x.id === "setbacks-envelope")!;
  s.data = { ...(s.data as Record<string, unknown>), ...data };
}

// ZONED_BRIEF ships flood in-sfha + FLOODWAY; this variant is the clean
// all-present posture (outside any mapped flood zone).
const ALL_PRESENT_CLEAN = variant(ZONED_BRIEF, (p) =>
  setFlood(p, {
    status: "outside-sfha",
    floodZone: null,
    inSpecialFloodHazardArea: false,
    zoneSubtype: null,
    baseFloodElevation: null,
  }),
);

describe("composeBriefVerdict — fixture matrix", () => {
  it("all-present clean parcel earns the no-red-flags tail", () => {
    const v = composeBriefVerdict(ALL_PRESENT_CLEAN);
    expect(v.line).toBe(
      "Buildable · outside mapped flood hazard · zoned P-2 · single family residence per county record — no red flags.",
    );
    expect(v.tone).toBe("clear");
  });

  it("floodway parcel: the red flag LEADS the line (ZONED_BRIEF verbatim)", () => {
    const v = composeBriefVerdict(ZONED_BRIEF);
    expect(v.line).toBe(
      "Inside a FEMA floodway (Zone AE) · buildable · zoned P-2 · single family residence per county record.",
    );
    expect(v.tone).toBe("flag");
  });

  it("in-SFHA without floodway subtype still leads as the red flag", () => {
    const v = composeBriefVerdict(
      variant(ZONED_BRIEF, (p) => setFlood(p, { zoneSubtype: null })),
    );
    expect(v.line).toBe(
      "Inside the FEMA flood hazard area (Zone AE) · buildable · zoned P-2 · single family residence per county record.",
    );
    expect(v.tone).toBe("flag");
  });

  it("unzoned parcel: every absence appears AS an absence (UNZONED_BRIEF)", () => {
    const v = composeBriefVerdict(UNZONED_BRIEF);
    expect(v.line).toBe(
      "Buildable envelope not derived here · flood not verified here · zoning not verified here · no land-use classification on record.",
    );
    expect(v.tone).toBe("caution");
    expect(v.line).not.toContain("no red flags");
  });

  it("no-envelope (degenerate) parcel says so plainly, no clean tail", () => {
    const v = composeBriefVerdict(
      variant(ALL_PRESENT_CLEAN, (p) =>
        setEnvelope(p, { status: "no-buildable-area" }),
      ),
    );
    expect(v.line).toBe(
      "No buildable area after setbacks · outside mapped flood hazard · zoned P-2 · single family residence per county record.",
    );
    expect(v.tone).toBe("caution");
  });

  it("provisional envelope stays provisional and blocks the clean tail", () => {
    const v = composeBriefVerdict(
      variant(ALL_PRESENT_CLEAN, (p) => setEnvelope(p, { provisional: true })),
    );
    expect(v.line).toBe(
      "Buildable (provisional) · outside mapped flood hazard · zoned P-2 · single family residence per county record.",
    );
    expect(v.tone).toBe("caution");
  });

  it("mapped flood zone outside the SFHA is a caution, not a red flag", () => {
    const v = composeBriefVerdict(
      variant(ZONED_BRIEF, (p) =>
        setFlood(p, {
          status: "flood-zone",
          floodZone: "X",
          inSpecialFloodHazardArea: false,
          zoneSubtype: null,
        }),
      ),
    );
    expect(v.line).toBe(
      "Buildable · in a mapped FEMA flood zone (Zone X), outside the SFHA · zoned P-2 · single family residence per county record.",
    );
    expect(v.tone).toBe("caution");
  });

  it("sparse payload (no sections at all) renders four honest absences", () => {
    const sparse: ResearchBriefPayload = {
      runId: "pe-r1-sparse",
      brief: { sections: [] },
    };
    const v = composeBriefVerdict(sparse);
    expect(v.line).toBe(
      "Buildable envelope not derived here · flood not verified here · zoning not verified here · no land-use classification on record.",
    );
    expect(v.tone).toBe("caution");
  });

  it("never fabricates: an unknown flood enum degrades to the absence form", () => {
    const v = composeBriefVerdict(
      variant(ZONED_BRIEF, (p) => setFlood(p, { status: "mystery-value" })),
    );
    expect(v.line).toContain("flood not verified here");
    expect(v.tone).toBe("caution");
  });
});
