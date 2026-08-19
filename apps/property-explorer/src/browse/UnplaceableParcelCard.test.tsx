// apps/property-explorer/src/browse/UnplaceableParcelCard.test.tsx
//
// AMENDMENT 1's designed state. The first implementation of I5 made an
// unplaceable parcel fail to open at all, which trades one honest failure for a
// worse one — the QA pass this programme answers was ABOUT parcels that could
// not be found. These tests pin the three things the card must say and the one
// thing it must not look like.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { UnplaceableParcel } from "@empressaio/parcel-fact-sheet";
import { UnplaceableParcelCard } from "./UnplaceableParcelCard";

const PROV = {
  source: "cad-roll",
  sourceLabel: "Bastrop County appraisal roll",
  vintage: null,
  method: null,
  retrievedAt: null,
  confidence: null,
  confidenceBasis: "asserted" as const,
  sourceUrl: null,
  atomDids: [],
};

function parcel(over: Partial<UnplaceableParcel> = {}): UnplaceableParcel {
  return {
    kind: "unplaceable",
    parcelNodeId: "48021:36521",
    identity: {
      parcelNodeId: "48021:36521",
      county: { fips: "48021", name: "Bastrop" },
      apn: { state: "present", value: "R12345", provenance: PROV },
      situsAddress: {
        state: "absent-covered",
        reason: "no situs address on the county roll for this parcel",
        provenance: PROV,
      },
      owner: {
        state: "absent-uncovered",
        reason: "owner is not served on the public tier",
        wouldBeFilledBy: "the paid owner facet",
      },
    },
    reason:
      "No boundary or coordinate is on file for this parcel, so it cannot be placed on the map.",
    wouldBeFilledBy: "parcel geometry for Bastrop County (48021)",
    ...over,
  };
}

const noop = () => {};

describe("UnplaceableParcelCard", () => {
  const html = renderToStaticMarkup(
    <UnplaceableParcelCard parcel={parcel()} onClose={noop} />,
  );

  it("says WHAT WE HOLD — the parcel is real and named", () => {
    expect(html).toContain("48021:36521");
    expect(html).toContain("Bastrop County");
    // County is not a Fact on the sheet, so this can never say "not on file".
    expect(html).not.toContain("not on file");
  });

  it("says THAT WE CANNOT PLACE IT, in customer terms", () => {
    expect(html).toContain('data-testid="unplaceable-reason"');
    expect(html).toContain("cannot be placed on the map");
  });

  it("says WHAT WOULD FIX IT — an absence that cannot is just empty (I4)", () => {
    expect(html).toContain('data-testid="unplaceable-would-be-filled-by"');
    expect(html).toContain("parcel geometry for Bastrop County (48021)");
  });

  it("is styled as an ABSENCE, never as an error (I4)", () => {
    // The whole point of I4 is that a failure and an absence must not look
    // alike. Nothing has gone wrong here; a data gap has been named.
    expect(html).toContain("--semantic-absence");
    expect(html.toLowerCase()).not.toContain("error");
    expect(html.toLowerCase()).not.toContain("something went wrong");
  });

  it("leads with the address when there is one, and the parcel when there is not", () => {
    expect(html).toContain("Parcel R12345");
    const withAddress = renderToStaticMarkup(
      <UnplaceableParcelCard
        parcel={parcel({
          identity: {
            ...parcel().identity,
            situsAddress: {
              state: "present",
              value: "1503 Farm St",
              provenance: PROV,
            },
          },
        })}
        onClose={noop}
      />,
    );
    expect(withAddress).toContain("1503 Farm St");
  });

  it("carries the parcel id as a probe attribute for a live sweep", () => {
    expect(html).toContain('data-parcel-node-id="48021:36521"');
  });
});
