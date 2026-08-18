// railFieldMap.ts — the explicit pairing between COUNTY MANIFEST rails and
// SERVING SWEEP fields, and the named classes on each side that have no counterpart.
//
// The two instruments answer different questions and use different vocabularies. To
// put a rail reading and a served reading in adjacent columns, something has to say
// which rail corresponds to which field. That correspondence is a JUDGEMENT, so it is
// written down with a basis per pair instead of being buried in a lookup, and every
// rail and every field that has NO counterpart is enumerated as its own class.
//
// DEV_PROCESS 1.3 — measure the class you are reporting, never derive it by
// subtraction. DEV_PROCESS 3.3 — "unmentioned" is the failure state; "no counterpart"
// is a valid and required classification. A rail with no sweep field must render as
// "no counterpart", never as zero, or the console invents a gap that does not exist.
//
// NOT A DOUBLE COUNT: `cad` pairs to two fields (situsAddress, apn) and `zoning` pairs
// to two (zoning, setbacks). One rail can serve more than one served field. The rail
// reading is repeated on each paired row and is never summed across rows.

import type { FieldKey } from './servingSweepTypes'

export interface RailFieldPair {
  railKey: string
  field: FieldKey
  /** Why these two are the same subject. Rendered on the reconciliation row. */
  basis: string
}

export const RAIL_FIELD_PAIRS: readonly RailFieldPair[] = Object.freeze([
  { railKey: 'geometry', field: 'geometry', basis: 'same subject: parcel geometry' },
  {
    railKey: 'cad',
    field: 'situsAddress',
    basis: 'situs address is carried on the CAD parcel roll the cad rail scores',
  },
  { railKey: 'cad', field: 'apn', basis: 'the APN is the CAD roll account key' },
  { railKey: 'landuse', field: 'landUse', basis: 'same subject; rail key drops the hyphen' },
  { railKey: 'zoning', field: 'zoning', basis: 'same subject: zoning district' },
  {
    railKey: 'zoning',
    field: 'setbacks',
    basis: 'setbacks are derived from the zoning rail — the rail is labelled "Zoning + setback"',
  },
  { railKey: 'envelope', field: 'envelope', basis: 'same subject: buildable envelope' },
  { railKey: 'flood', field: 'flood', basis: 'same subject: flood hazard' },
  {
    railKey: 'roads',
    field: 'frontage',
    basis: 'frontage is derived from the roads rail — the rail is labelled "Roads / frontage"',
  },
])

/** Rails with no sweep counterpart, each with the reason it has none. */
export const RAILS_WITHOUT_FIELD: Readonly<Record<string, string>> = Object.freeze({
  footprint: 'building footprints are not a ParcelFactSheet field',
  easement: 'utility easements are not a ParcelFactSheet field',
  owner: 'owner is not a ParcelFactSheet field (the sheet carries no owner fact)',
  'rrc-wells': 'RRC wells are not a ParcelFactSheet field',
  'rrc-pipelines': 'RRC pipelines are not a ParcelFactSheet field',
  'rail-corridor': 'rail corridors are not a ParcelFactSheet field',
  mud: 'special districts are not a ParcelFactSheet field',
})

export function fieldsForRail(railKey: string): FieldKey[] {
  return RAIL_FIELD_PAIRS.filter((p) => p.railKey === railKey).map((p) => p.field)
}

export function railsForField(field: FieldKey): string[] {
  return RAIL_FIELD_PAIRS.filter((p) => p.field === field).map((p) => p.railKey)
}

export interface RailClassification {
  /** Rails present in the payload that pair with at least one field. */
  paired: string[]
  /** Rails present in the payload with a declared reason for having no field. */
  unpairedDeclared: Array<{ railKey: string; reason: string }>
  /**
   * Rails present in the payload that are NEITHER paired NOR declared unpaired.
   * A non-empty list here means a rail was added server-side and this file has not
   * been told about it. It renders as a visible gap, not as a silent omission.
   */
  unclassified: string[]
}

/**
 * Classify every rail in the payload. The three buckets are measured, and their sizes
 * sum to the rail count — that identity is asserted in the test.
 */
export function classifyRails(railKeys: string[]): RailClassification {
  const paired: string[] = []
  const unpairedDeclared: Array<{ railKey: string; reason: string }> = []
  const unclassified: string[] = []
  for (const railKey of railKeys) {
    if (fieldsForRail(railKey).length > 0) paired.push(railKey)
    else if (railKey in RAILS_WITHOUT_FIELD)
      unpairedDeclared.push({ railKey, reason: RAILS_WITHOUT_FIELD[railKey] })
    else unclassified.push(railKey)
  }
  return { paired, unpairedDeclared, unclassified }
}

/** Fields in the frozen record with no rail counterpart in the given rail set. */
export function fieldsWithoutRail(railKeys: string[], fields: readonly FieldKey[]): FieldKey[] {
  const present = new Set(railKeys)
  return fields.filter((f) => !railsForField(f).some((r) => present.has(r)))
}
