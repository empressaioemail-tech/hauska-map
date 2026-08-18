#!/usr/bin/env node
// gen-texas-county-names.mjs — regenerate the presentation-only FIPS -> county-name
// lookup from the canonical Texas roster.
//
// WHY THIS IS A SCRIPT AND NOT A HAND-MAINTAINED FILE: the County Manifest lane
// exists because hand-declared state drifts against the thing it describes. A
// hand-typed 254-row table is the same defect wearing a different costume. This
// reads the canonical roster and stamps its schema version and generated_at into
// the output header, so the emitted file always names what it came from.
//
// Usage:
//   node apps/command-center/scripts/gen-texas-county-names.mjs [rosterCsvPath]
//
// Default roster path is the canonical doc_repo catalog artifact. The roster is
// NOT vendored into this repo; regeneration needs the doc_repo checkout present.
//
// The output is PRESENTATION ONLY. Nothing that produces a coverage figure, a
// denominator, or a completeness percentage may read it. The API's countyName is
// always preferred; this fills only where the API serves null.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const rosterCsv = process.argv[2] ?? 'P:/doc_repo/_catalog/texas_roster_v1.csv'
const rosterJson = rosterCsv.replace(/\.csv$/, '.json')
const outPath = resolve(here, '../src/admin/control/panels/texasCountyNames.ts')

const csv = readFileSync(rosterCsv, 'utf8')
const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0)
const header = lines[0].split(',')
const iType = header.indexOf('record_type')
const iFips = header.indexOf('fips')
const iName = header.indexOf('name')
if (iType < 0 || iFips < 0 || iName < 0) {
  throw new Error(`roster header missing record_type/fips/name: ${lines[0]}`)
}

const names = new Map()
for (const line of lines.slice(1)) {
  const cols = line.split(',')
  if (cols[iType] !== 'county') continue
  const fips = cols[iFips].trim()
  const name = cols[iName].trim()
  if (!/^48\d{3}$/.test(fips)) throw new Error(`non-Texas county fips in roster: ${fips}`)
  if (!name) throw new Error(`empty county name for ${fips}`)
  if (names.has(fips)) throw new Error(`duplicate county fips in roster: ${fips}`)
  names.set(fips, name)
}

let schemaVersion = 'unknown'
let generatedAt = 'unknown'
let countiesInRoster = null
try {
  const meta = JSON.parse(readFileSync(rosterJson, 'utf8'))
  schemaVersion = meta.schema_version ?? schemaVersion
  generatedAt = meta.generated_at ?? generatedAt
  countiesInRoster = meta.coverage?.counties_in_roster ?? null
} catch {
  // The CSV is the source of record; the sidecar JSON only supplies provenance.
}

if (countiesInRoster != null && countiesInRoster !== names.size) {
  throw new Error(`roster JSON says ${countiesInRoster} counties, CSV yielded ${names.size}`)
}

const sorted = [...names.entries()].sort((a, b) => a[0].localeCompare(b[0]))

const body = sorted.map(([fips, name]) => `  '${fips}': ${JSON.stringify(name)},`).join('\n')

const out = `// texasCountyNames.ts — GENERATED. Do not edit by hand.
//
// Regenerate: node apps/command-center/scripts/gen-texas-county-names.mjs
// Source:     ${rosterCsv}
// Schema:     ${schemaVersion}
// Vintage:    ${generatedAt}
// Counties:   ${sorted.length}
//
// PRESENTATION ONLY. This is a label lookup, in the same class as RAIL_LABELS in
// countyManifestTypes.ts. It never participates in a measurement: no coverage
// figure, no denominator, no completeness percentage reads it. GET /api/county-ledger
// serves countyName for only the counties carrying a registry row (10 of 254 as
// served 2026-08-18), which left 244 grid rows showing a bare FIPS. The API name
// always wins where the API serves one; this fills the rest, and the console
// displays the api-vs-roster split so the declared half stays counted on screen.

export const TEXAS_COUNTY_NAMES: Readonly<Record<string, string>> = Object.freeze({
${body}
})

export const TEXAS_COUNTY_NAME_SOURCE = Object.freeze({
  artifact: ${JSON.stringify(rosterCsv)},
  schemaVersion: ${JSON.stringify(schemaVersion)},
  vintage: ${JSON.stringify(generatedAt)},
  countyCount: ${sorted.length},
})

export type CountyNameOrigin = 'api' | 'roster' | 'none'

/**
 * Resolve a display name for a county FIPS, reporting WHERE the name came from.
 * The origin is returned rather than swallowed so the caller can count how much
 * of what the operator reads is served versus locally declared.
 */
export function resolveCountyName(
  countyFips: string,
  apiName: string | null | undefined,
): { name: string; origin: CountyNameOrigin } {
  const trimmed = apiName?.trim()
  if (trimmed) return { name: trimmed, origin: 'api' }
  const roster = TEXAS_COUNTY_NAMES[countyFips]
  if (roster) return { name: roster, origin: 'roster' }
  return { name: countyFips, origin: 'none' }
}
`

writeFileSync(outPath, out, 'utf8')
console.log(`wrote ${outPath} — ${sorted.length} counties from ${rosterCsv} (${schemaVersion} @ ${generatedAt})`)
