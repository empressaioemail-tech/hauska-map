import { describe, expect, it } from "vitest";
import {
  classificationFieldsForFactSource,
  enrichLayerAbsenceProvenance,
  getClassification,
  getClassifications,
} from "./index";

describe("instrument-registry", () => {
  it("loads active registry with 21 keys", () => {
    expect(Object.keys(getClassifications())).toHaveLength(21);
  });

  it("maps flood-hazard-fact to Derivation + flood serveLayer", () => {
    const fields = classificationFieldsForFactSource("flood-hazard-fact");
    expect(fields).toMatchObject({
      provenanceClass: "Derivation",
      serveLayer: "flood",
      subjectKind: "intensional",
    });
  });

  it("handles road-node provenanceClassSplit", () => {
    expect(getClassification("road-node", "osm-assumed")?.provenanceClass).toBe(
      "Derivation",
    );
    expect(
      getClassification("road-node", "county-authoritative")?.provenanceClass,
    ).toBe("Record");
  });

  it("enrichLayerAbsenceProvenance adds registry fields", () => {
    const wire = enrichLayerAbsenceProvenance(
      {
        status: "absent",
        verdict: "lookup-failed",
        authority: "tad",
        scopeSearched: "cad",
        asOf: "2026-08-23T00:00:00.000Z",
        basis: "test",
      },
      "cad-parcel-roll",
    );
    expect(wire).toMatchObject({
      entityType: "cad-parcel-roll",
      provenanceClass: "Record",
      serveLayer: "cad",
      chainAnchoring: "backfill",
    });
  });
});
