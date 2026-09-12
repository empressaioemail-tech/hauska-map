// api/_lib/pe-record-cell-interpret.ts
//
// P-152 PANEL (lane 2 of 2): pure interpretation of one parcel_record cell,
// as already served by the Hauska retrieval service's
// `GET /property-nodes/:id/record` (lane 1, hauska-engine PR #417).
//
// VENDORED, NOT REINVENTED. This is the same interpretation legacy-design-
// tools' `parcelRecordCellRead.ts` (`interpretParcelRecordCell`) already
// applies to the identical cell_state shape (cortex PR #658, itself now
// reading through the same retrieval-api /record endpoint per lane 1's
// close). Porting the exact kind-switch here — rather than re-deriving it —
// is what the falsifier requires: byte-for-byte parity with what cortex
// already (correctly, already-diffed-clean) serves for the same cell. See
// `_inbox/2026-09-11_p152-reader_close.json` and legacy-design-tools
// `artifacts/api-server/src/lib/parcelRecordCellRead.ts` (read as reference
// only — this repo does not import across the seat boundary).
//
// The one difference from the vendored source: LDT's version issues its own
// SQL read via `loadParcelRecordCell`. This module has no store of its own —
// the caller already holds the decoded `record.rails[railKey]` object from
// one `/record` HTTP call for the whole parcel, and passes its `cell` and
// `companions` straight in.

export const PARCEL_RECORD_SOURCE = "parcel_record" as const;

export type RecordCompanionRow = {
  rowIndex: number;
  payload: unknown;
  source: string;
  vintage: string;
};

export type RecordCellPresent = {
  state: "present";
  source: typeof PARCEL_RECORD_SOURCE;
  placeKey: string;
  railKey: string;
  cellSource: string;
  vintage: string;
  value: string | number | boolean | null;
  disposition: "rows" | "empty-set" | null;
  rowCount: number | null;
  companionRows: RecordCompanionRow[];
  /** The full decoded cell_state object, for a rail whose own extra fields live on the cell itself (e.g. schoolDistrict's districtCode/geoid). */
  raw: Record<string, unknown>;
};

export type RecordCellAbsent = {
  state: "absent";
  source: typeof PARCEL_RECORD_SOURCE;
  placeKey: string;
  railKey: string;
  verdict: "absent-verified" | "not-applicable";
  basis: string | Record<string, unknown> | null;
};

export type RecordCellRefusalCode =
  | "unaccounted"
  | "engine-refused"
  | "no-such-parcel-or-rail"
  | "malformed-cell"
  | "store-not-configured";

export type RecordCellRefusal = {
  state: "refused";
  source: typeof PARCEL_RECORD_SOURCE;
  placeKey: string;
  railKey: string;
  code: RecordCellRefusalCode;
  reason: string;
};

export type RecordCellRead = RecordCellPresent | RecordCellAbsent | RecordCellRefusal;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Interpret an already-fetched cell_state plus its companion rows. Pure —
 * every cell kind (value scalar, value companion, absent-verified with a
 * string basis, absent-verified with an object basis, not-applicable,
 * refused, unaccounted, malformed/missing-kind) is a plain function of its
 * input, matching legacy-design-tools' `interpretParcelRecordCell` exactly.
 */
export function interpretRecordCell(
  placeKey: string,
  railKey: string,
  cellState: unknown,
  companionRows: ReadonlyArray<RecordCompanionRow>,
): RecordCellRead {
  const rec = asRecord(cellState);
  const kind = rec ? asNullableString(rec.kind) : null;
  if (!rec || !kind) {
    return {
      state: "refused",
      source: PARCEL_RECORD_SOURCE,
      placeKey,
      railKey,
      code: "malformed-cell",
      reason: `parcel_record_cell ${placeKey}/${railKey} has no readable 'kind'. Refusing rather than inventing a state.`,
    };
  }

  switch (kind) {
    case "value": {
      const disposition = asNullableString(rec.disposition) as "rows" | "empty-set" | null;
      return {
        state: "present",
        source: PARCEL_RECORD_SOURCE,
        placeKey,
        railKey,
        cellSource: asNullableString(rec.source) ?? "parcel_record",
        vintage: asNullableString(rec.vintage) ?? "",
        value:
          typeof rec.value === "string" ||
          typeof rec.value === "number" ||
          typeof rec.value === "boolean" ||
          rec.value === null
            ? (rec.value as string | number | boolean | null)
            : null,
        disposition,
        rowCount: asNullableNumber(rec.rowCount),
        companionRows: companionRows.map((r) => ({ ...r })),
        raw: rec,
      };
    }
    case "absent-verified": {
      const basis = rec.basis;
      return {
        state: "absent",
        source: PARCEL_RECORD_SOURCE,
        placeKey,
        railKey,
        verdict: "absent-verified",
        basis: typeof basis === "string" ? basis : asRecord(basis) ?? null,
      };
    }
    case "not-applicable": {
      return {
        state: "absent",
        source: PARCEL_RECORD_SOURCE,
        placeKey,
        railKey,
        verdict: "not-applicable",
        basis: asNullableString(rec.reason),
      };
    }
    case "refused": {
      return {
        state: "refused",
        source: PARCEL_RECORD_SOURCE,
        placeKey,
        railKey,
        code: "engine-refused",
        reason: asNullableString(rec.reason) ?? "parcel_record marked this cell refused with no reason recorded.",
      };
    }
    case "unaccounted": {
      return {
        state: "refused",
        source: PARCEL_RECORD_SOURCE,
        placeKey,
        railKey,
        code: "unaccounted",
        reason: "parcel_record has not yet examined this rail for this parcel. Refusing rather than serving a pipeline word.",
      };
    }
    default: {
      return {
        state: "refused",
        source: PARCEL_RECORD_SOURCE,
        placeKey,
        railKey,
        code: "malformed-cell",
        reason: `parcel_record_cell ${placeKey}/${railKey} has kind '${kind}', not one of value/absent-verified/not-applicable/refused/unaccounted. Refusing rather than guessing.`,
      };
    }
  }
}

/** No cell row at all for this (place_key, rail_key) — the /record response's own `cell: null`. */
export function noSuchCellRefusal(placeKey: string, railKey: string): RecordCellRefusal {
  return {
    state: "refused",
    source: PARCEL_RECORD_SOURCE,
    placeKey,
    railKey,
    code: "no-such-parcel-or-rail",
    reason: `No parcel_record_cell row for ${placeKey}/${railKey}. Either the parcel is outside the program's landing population, or the rail key is not one of the 65.`,
  };
}
