import { describe, expect, it } from "vitest";

import { interpretRecordCell, noSuchCellRefusal } from "./pe-record-cell-interpret";

describe("interpretRecordCell", () => {
  it("interprets a value scalar cell as present", () => {
    const result = interpretRecordCell(
      "48021:34049",
      "cityLimits",
      { kind: "value", value: "Bastrop", source: "landing_parcel_jurisdiction", vintage: "2026-09-02T18:13:56.751Z" },
      [],
    );
    expect(result).toMatchObject({
      state: "present",
      value: "Bastrop",
      cellSource: "landing_parcel_jurisdiction",
      vintage: "2026-09-02T18:13:56.751Z",
    });
  });

  it("interprets a value companion cell, carrying companion rows through unchanged", () => {
    const rows = [{ rowIndex: 0, payload: { districtId: "MUD-1" }, source: "x", vintage: "2026-01-01" }];
    const result = interpretRecordCell(
      "48021:1",
      "specialDistricts",
      { kind: "value", disposition: "rows", rowCount: 1, vintage: "2026-01-01" },
      rows,
    );
    expect(result.state).toBe("present");
    if (result.state === "present") {
      expect(result.companionRows).toEqual(rows);
      expect(result.disposition).toBe("rows");
      expect(result.rowCount).toBe(1);
    }
  });

  it("interprets absent-verified with a string basis", () => {
    const result = interpretRecordCell("48021:1", "flood", { kind: "absent-verified", basis: "no FEMA zone here" }, []);
    expect(result).toEqual({
      state: "absent",
      source: "parcel_record",
      placeKey: "48021:1",
      railKey: "flood",
      verdict: "absent-verified",
      basis: "no FEMA zone here",
    });
  });

  it("interprets absent-verified with an object basis (e.g. cityLimits' disposition shape)", () => {
    const result = interpretRecordCell(
      "48021:1",
      "cityLimits",
      { kind: "absent-verified", basis: { disposition: "unincorporated", source: "landing_parcel_jurisdiction" } },
      [],
    );
    expect(result.state).toBe("absent");
    if (result.state === "absent") {
      expect(result.basis).toEqual({ disposition: "unincorporated", source: "landing_parcel_jurisdiction" });
    }
  });

  it("interprets not-applicable", () => {
    const result = interpretRecordCell("48021:1", "flood", { kind: "not-applicable", reason: "not governed here" }, []);
    expect(result).toEqual({
      state: "absent",
      source: "parcel_record",
      placeKey: "48021:1",
      railKey: "flood",
      verdict: "not-applicable",
      basis: "not governed here",
    });
  });

  it("interprets refused with the engine's own reason", () => {
    const result = interpretRecordCell("48021:1", "zoningDistrict", { kind: "refused", reason: "ambiguous parcel geometry" }, []);
    expect(result).toEqual({
      state: "refused",
      source: "parcel_record",
      placeKey: "48021:1",
      railKey: "zoningDistrict",
      code: "engine-refused",
      reason: "ambiguous parcel geometry",
    });
  });

  it("interprets unaccounted as a refusal, never a fabricated absence", () => {
    const result = interpretRecordCell("48021:1", "wells", { kind: "unaccounted" }, []);
    expect(result.state).toBe("refused");
    if (result.state === "refused") {
      expect(result.code).toBe("unaccounted");
    }
  });

  it("refuses a malformed cell with no readable kind rather than inventing a state", () => {
    const result = interpretRecordCell("48021:1", "wells", { foo: "bar" }, []);
    expect(result).toEqual({
      state: "refused",
      source: "parcel_record",
      placeKey: "48021:1",
      railKey: "wells",
      code: "malformed-cell",
      reason: expect.stringContaining("no readable 'kind'"),
    });
  });

  it("refuses an unrecognized kind rather than guessing", () => {
    const result = interpretRecordCell("48021:1", "wells", { kind: "mystery" }, []);
    expect(result.state).toBe("refused");
    if (result.state === "refused") {
      expect(result.code).toBe("malformed-cell");
      expect(result.reason).toContain("mystery");
    }
  });

  it("noSuchCellRefusal names the missing (place_key, rail_key) pair", () => {
    const result = noSuchCellRefusal("48021:1", "wells");
    expect(result.code).toBe("no-such-parcel-or-rail");
    expect(result.reason).toContain("48021:1/wells");
  });
});
