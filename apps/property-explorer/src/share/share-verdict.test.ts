/**
 * Share-view verdict derivation (Workbench W4) — honest fragments only.
 */

import { describe, expect, it } from "vitest";
import { deriveShareVerdict } from "./share-verdict";
import {
  UNZONED_BRIEF,
  ZONED_BRIEF,
} from "../browse/__fixtures__/research-brief.fixture";

describe("deriveShareVerdict", () => {
  it("headlines zoning, buildable %, and flood when the payload asserts them", () => {
    expect(deriveShareVerdict(ZONED_BRIEF)).toEqual([
      "Zoned P-2",
      "Buildable 70% of the lot",
      "In FEMA flood zone AE (SFHA)",
    ]);
  });

  it("asserts NOTHING for the unzoned/declined/unavailable parcel", () => {
    // Zoning null, envelope declined, flood unavailable — every fragment must
    // be skipped; the view renders the honest fallback line instead.
    expect(deriveShareVerdict(UNZONED_BRIEF)).toEqual([]);
  });

  it("headlines the honest 0% envelope", () => {
    const payload = {
      ...ZONED_BRIEF,
      brief: {
        ...ZONED_BRIEF.brief,
        sections: ZONED_BRIEF.brief.sections.map((s) =>
          s.id === "setbacks-envelope"
            ? { ...s, data: { status: "no-buildable-area" } }
            : s,
        ),
      },
    };
    expect(deriveShareVerdict(payload)).toContain(
      "No buildable area after setbacks",
    );
  });

  it("outside-sfha reads as outside mapped zones", () => {
    const payload = {
      ...ZONED_BRIEF,
      brief: {
        ...ZONED_BRIEF.brief,
        sections: ZONED_BRIEF.brief.sections.map((s) =>
          s.id === "flood" ? { ...s, data: { status: "outside-sfha" } } : s,
        ),
      },
    };
    expect(deriveShareVerdict(payload)).toContain(
      "Outside mapped FEMA flood zones",
    );
  });
});
