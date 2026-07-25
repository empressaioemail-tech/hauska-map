/**
 * WDLL 6 / G6 dogfood — one parcel-node read path + one trace client.
 * Fails if a second tracer or a forked liveGis body reappears.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchAtomTrace, propertyChainDids } from './atomTrace'

const adminRoot = resolve(__dirname, '..')
const mapRoot = resolve(__dirname, '../../../../..')

describe('one-read-path guardrails (F1b dogfood)', () => {
  it('propertyChainDids uses the canonical DID shape', () => {
    const d = propertyChainDids('48209:156346')
    expect(d.zoningFact).toBe('did:hauska:zoning-fact:48209:156346')
    expect(d.setbackRule).toBe('did:hauska:setback-rule:48209:156346')
    expect(d.buildableEnvelope).toBe('did:hauska:buildable-envelope:48209:156346')
  })

  it('Parcel Trace and Node Graph both import fetchAtomTrace (no second tracer)', () => {
    const parcelTrace = readFileSync(
      resolve(adminRoot, 'control/panels/ParcelTrace.tsx'),
      'utf8',
    )
    const nodeGraph = readFileSync(
      resolve(adminRoot, 'control/panels/NodeGraph.tsx'),
      'utf8',
    )
    expect(parcelTrace).toMatch(/from ['"].*atomTrace['"]/)
    expect(parcelTrace).toMatch(/fetchAtomTrace/)
    expect(nodeGraph).toMatch(/from ['"].*atomTrace['"]/)
    expect(nodeGraph).toMatch(/fetchAtomTrace/)
    expect(parcelTrace).not.toMatch(/\$\{retrievalUrl\}\/atoms\/trace/)
    expect(nodeGraph).not.toMatch(/\$\{retrievalUrl\}\/atoms\/trace/)
  })

  it('liveGis.ts in PE and CC are thin re-exports of @hauska/map-renderer (WDLL 6)', () => {
    const pe = readFileSync(
      resolve(mapRoot, 'apps/property-explorer/src/browse/liveGis.ts'),
      'utf8',
    )
    const cc = readFileSync(
      resolve(mapRoot, 'apps/command-center/src/admin/workspace/tiles/liveGis.ts'),
      'utf8',
    )
    expect(pe).toMatch(/packages\/map-renderer\/src\/live-gis/)
    expect(cc).toMatch(/packages\/map-renderer\/src\/live-gis/)
    expect(pe).not.toMatch(/export async function fetchGisLayer/)
    expect(cc).not.toMatch(/export async function fetchGisLayer/)
    expect(existsSync(resolve(mapRoot, 'packages/map-renderer/src/live-gis.ts'))).toBe(true)
  })

  it('fetchAtomTrace is exported for reuse', () => {
    expect(typeof fetchAtomTrace).toBe('function')
  })
})
