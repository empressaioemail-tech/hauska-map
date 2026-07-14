// apps/command-center/src/admin/workspace/layoutModel.test.ts
//
// Layout model tests — reducer transitions (add/remove/minimize/span/move/columns),
// named-layout persistence round-trip (save/load/duplicate/delete/list/active),
// default-layout fallback, sanitization of corrupt storage, and the layout hash param.

import { describe, it, expect, beforeEach } from 'vitest'
import type { PresetSpace } from '@empressaio/tile-shell'
import {
  defaultLayoutFor,
  rowsFor,
  instanceIdFor,
  layoutReducer,
  sanitizeLayout,
  REPORT_TILE_KIND,
  COMPONENT_TILE_KIND,
  listLayoutNames,
  loadLayoutByName,
  saveLayout,
  deleteLayout,
  duplicateLayout,
  persistWorking,
  clearWorking,
  resolveInitialLayout,
  layoutNameFromHash,
  writeLayoutNameToHash,
  MAX_COLUMNS,
  type LayoutState,
} from './layoutModel'

const space: PresetSpace = {
  id: 'test-space',
  label: 'Test Space',
  tiles: ['a', 'b', 'c', 'd'],
  layoutId: '2x2',
}

function freshState(): LayoutState {
  return { layout: defaultLayoutFor(space), activeName: null }
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})

describe('defaultLayoutFor / rowsFor', () => {
  it('maps preset layoutId to columns with span-1 expanded tiles', () => {
    const layout = defaultLayoutFor(space)
    expect(layout.columns).toBe(2)
    expect(layout.tiles).toEqual([
      { id: 'a', span: 1, minimized: false },
      { id: 'b', span: 1, minimized: false },
      { id: 'c', span: 1, minimized: false },
      { id: 'd', span: 1, minimized: false },
    ])
  })

  it('falls back to 3 columns for unknown layoutIds', () => {
    expect(defaultLayoutFor({ ...space, layoutId: 'weird' }).columns).toBe(3)
  })

  it('computes rows matching the preset grid for defaults', () => {
    expect(rowsFor(defaultLayoutFor(space))).toBe(2) // 4 tiles / 2 cols
    expect(rowsFor(defaultLayoutFor({ ...space, tiles: ['a', 'b'], layoutId: '2x1' }))).toBe(1)
    expect(rowsFor({ columns: 2, tiles: [] })).toBe(1)
  })
})

describe('layoutReducer', () => {
  it('adds a tile once (no duplicates)', () => {
    let s = layoutReducer(freshState(), { type: 'add-tile', tileId: 'e' })
    expect(s.layout.tiles.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    s = layoutReducer(s, { type: 'add-tile', tileId: 'e' })
    expect(s.layout.tiles.filter((t) => t.id === 'e')).toHaveLength(1)
  })

  it('removes a tile', () => {
    const s = layoutReducer(freshState(), { type: 'remove-tile', tileId: 'b' })
    expect(s.layout.tiles.map((t) => t.id)).toEqual(['a', 'c', 'd'])
  })

  it('toggles minimize', () => {
    let s = layoutReducer(freshState(), { type: 'toggle-minimize', tileId: 'a' })
    expect(s.layout.tiles[0].minimized).toBe(true)
    s = layoutReducer(s, { type: 'toggle-minimize', tileId: 'a' })
    expect(s.layout.tiles[0].minimized).toBe(false)
  })

  it('adjusts span clamped to [1, columns]', () => {
    let s = layoutReducer(freshState(), { type: 'adjust-span', tileId: 'a', delta: 1 })
    expect(s.layout.tiles[0].span).toBe(2)
    s = layoutReducer(s, { type: 'adjust-span', tileId: 'a', delta: 5 })
    expect(s.layout.tiles[0].span).toBe(2) // clamped to columns=2
    s = layoutReducer(s, { type: 'adjust-span', tileId: 'a', delta: -9 })
    expect(s.layout.tiles[0].span).toBe(1) // clamped to 1
  })

  it('reorders via move-tile (drop dragged onto target)', () => {
    const s = layoutReducer(freshState(), { type: 'move-tile', fromId: 'd', toId: 'a' })
    expect(s.layout.tiles.map((t) => t.id)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('ignores move-tile with unknown ids', () => {
    const before = freshState()
    expect(layoutReducer(before, { type: 'move-tile', fromId: 'zz', toId: 'a' })).toBe(before)
  })

  it('adjusts columns within bounds and re-clamps spans', () => {
    let s = freshState()
    s = layoutReducer(s, { type: 'adjust-span', tileId: 'a', delta: 1 }) // span 2
    s = layoutReducer(s, { type: 'adjust-columns', delta: -1 }) // 2 -> 1 col
    expect(s.layout.columns).toBe(1)
    expect(s.layout.tiles[0].span).toBe(1) // re-clamped
    for (let i = 0; i < 20; i += 1) s = layoutReducer(s, { type: 'adjust-columns', delta: 1 })
    expect(s.layout.columns).toBe(MAX_COLUMNS)
  })

  it('apply replaces layout + active name', () => {
    const named = { columns: 3, tiles: [{ id: 'x', span: 1, minimized: false }] }
    const s = layoutReducer(freshState(), { type: 'apply', layout: named, activeName: 'mine' })
    expect(s.layout).toEqual(named)
    expect(s.activeName).toBe('mine')
  })
})

describe('persistence round-trip', () => {
  it('saves, lists, loads, duplicates, and deletes named layouts', () => {
    const layout = defaultLayoutFor(space)
    saveLayout(space.id, 'compact', layout)
    expect(listLayoutNames(space.id)).toEqual(['compact'])
    expect(loadLayoutByName(space.id, 'compact')).toEqual(layout)

    expect(duplicateLayout(space.id, 'compact', 'compact copy')).toBe(true)
    expect(listLayoutNames(space.id).sort()).toEqual(['compact', 'compact copy'])
    expect(loadLayoutByName(space.id, 'compact copy')).toEqual(layout)

    deleteLayout(space.id, 'compact')
    expect(listLayoutNames(space.id)).toEqual(['compact copy'])
    expect(loadLayoutByName(space.id, 'compact')).toBeNull()
  })

  it('duplicate of a missing source is a no-op', () => {
    expect(duplicateLayout(space.id, 'nope', 'copy')).toBe(false)
    expect(listLayoutNames(space.id)).toEqual([])
  })

  it('working copy survives "reload" (resolveInitialLayout)', () => {
    const edited = {
      columns: 2,
      tiles: [{ id: 'a', span: 2, minimized: true }],
    }
    persistWorking(space.id, edited, null)
    const resolved = resolveInitialLayout(space, null)
    expect(resolved.layout).toEqual(edited)
    expect(resolved.activeName).toBeNull()
  })

  it('saved active layout name survives reload', () => {
    const edited = { columns: 2, tiles: [{ id: 'b', span: 1, minimized: false }] }
    saveLayout(space.id, 'mine', edited)
    const resolved = resolveInitialLayout(space, null)
    expect(resolved.activeName).toBe('mine')
    expect(resolved.layout).toEqual(edited)
  })

  it('hash name takes precedence over working copy', () => {
    saveLayout(space.id, 'named', { columns: 1, tiles: [{ id: 'c', span: 1, minimized: false }] })
    persistWorking(space.id, defaultLayoutFor(space), null)
    const resolved = resolveInitialLayout(space, 'named')
    expect(resolved.activeName).toBe('named')
    expect(resolved.layout.columns).toBe(1)
  })

  it('falls back to the default layout for unknown names / empty storage', () => {
    const resolved = resolveInitialLayout(space, 'does-not-exist')
    expect(resolved.activeName).toBeNull()
    expect(resolved.layout).toEqual(defaultLayoutFor(space))
  })

  it('falls back to default after clearWorking', () => {
    persistWorking(space.id, { columns: 1, tiles: [] }, null)
    clearWorking(space.id)
    expect(resolveInitialLayout(space, null).layout).toEqual(defaultLayoutFor(space))
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('cc-workspace-layouts', '{not json')
    expect(resolveInitialLayout(space, null).layout).toEqual(defaultLayoutFor(space))
    expect(listLayoutNames(space.id)).toEqual([])
  })

  it('spaces are isolated from each other', () => {
    saveLayout('other-space', 'theirs', { columns: 4, tiles: [] })
    expect(listLayoutNames(space.id)).toEqual([])
    expect(resolveInitialLayout(space, 'theirs').layout).toEqual(defaultLayoutFor(space))
  })
})

describe('sanitizeLayout', () => {
  it('clamps and filters malformed entries', () => {
    const raw = {
      columns: 99,
      tiles: [
        { id: 'a', span: 42, minimized: 'yes' },
        { id: 'a', span: 1 }, // duplicate dropped
        { id: 7 }, // non-string id dropped
        { id: 'b' }, // defaults applied
      ],
    }
    expect(sanitizeLayout(raw)).toEqual({
      columns: MAX_COLUMNS,
      tiles: [
        { id: 'a', span: MAX_COLUMNS, minimized: false },
        { id: 'b', span: 1, minimized: false },
      ],
    })
  })

  it('rejects structurally unusable values', () => {
    expect(sanitizeLayout(null)).toBeNull()
    expect(sanitizeLayout('x')).toBeNull()
    expect(sanitizeLayout({ columns: 2 })).toBeNull()
  })
})

describe('parameterized tiles ({tileId, params})', () => {
  const reportParams = { capabilityId: 'avm', label: 'AVM / Valuation', status: 'partial' }

  it('derives instance ids from kind + params', () => {
    expect(instanceIdFor('intake')).toBe('intake')
    expect(instanceIdFor(REPORT_TILE_KIND, reportParams)).toBe('report:avm')
    expect(instanceIdFor(COMPONENT_TILE_KIND, { component: 'MapTile' })).toBe(
      'component:MapTile',
    )
    expect(instanceIdFor(REPORT_TILE_KIND, {})).toBeNull()
    expect(instanceIdFor(COMPONENT_TILE_KIND)).toBeNull()
  })

  it('add-tile with params creates a deduped parameterized entry', () => {
    let s = layoutReducer(freshState(), {
      type: 'add-tile',
      tileId: REPORT_TILE_KIND,
      params: reportParams,
    })
    const entry = s.layout.tiles.find((t) => t.id === 'report:avm')
    expect(entry).toEqual({
      id: 'report:avm',
      tileId: REPORT_TILE_KIND,
      params: reportParams,
      span: 1,
      minimized: false,
    })
    // duplicate add of the same capability is a no-op
    s = layoutReducer(s, { type: 'add-tile', tileId: REPORT_TILE_KIND, params: reportParams })
    expect(s.layout.tiles.filter((t) => t.id === 'report:avm')).toHaveLength(1)
    // unusable params are rejected
    expect(layoutReducer(s, { type: 'add-tile', tileId: REPORT_TILE_KIND, params: {} })).toBe(s)
  })

  it('plain add-tile keeps the exact #25 entry shape (no tileId/params keys)', () => {
    const s = layoutReducer(freshState(), { type: 'add-tile', tileId: 'letter' })
    const entry = s.layout.tiles.find((t) => t.id === 'letter')!
    expect(Object.keys(entry).sort()).toEqual(['id', 'minimized', 'span'])
  })

  it('round-trips {tileId, params} through save + load (localStorage JSON)', () => {
    const layout = {
      columns: 2,
      tiles: [
        { id: 'a', span: 1, minimized: false },
        {
          id: 'report:avm',
          tileId: REPORT_TILE_KIND,
          params: reportParams,
          span: 2,
          minimized: false,
        },
        {
          id: 'component:MapTile',
          tileId: COMPONENT_TILE_KIND,
          params: { component: 'MapTile', label: 'MapTile' },
          span: 1,
          minimized: true,
        },
      ],
    }
    saveLayout(space.id, 'with-reports', layout)
    expect(loadLayoutByName(space.id, 'with-reports')).toEqual(layout)
    // and via the reload path
    persistWorking(space.id, layout, 'with-reports')
    expect(resolveInitialLayout(space, null).layout).toEqual(layout)
    // and via the hash deep-link path
    expect(resolveInitialLayout(space, 'with-reports').layout).toEqual(layout)
  })

  it('sanitize derives the instance id from {tileId, params} even without id', () => {
    const raw = {
      columns: 2,
      tiles: [
        { tileId: REPORT_TILE_KIND, params: reportParams, span: 1, minimized: false },
      ],
    }
    expect(sanitizeLayout(raw)!.tiles[0]).toEqual({
      id: 'report:avm',
      tileId: REPORT_TILE_KIND,
      params: reportParams,
      span: 1,
      minimized: false,
    })
  })

  it('sanitize drops parameterized entries whose params cannot identify an instance', () => {
    const raw = {
      columns: 2,
      tiles: [
        { id: 'a', span: 1, minimized: false },
        { tileId: REPORT_TILE_KIND, params: { label: 'no capability id' }, span: 1, minimized: false },
        { tileId: COMPONENT_TILE_KIND, params: 'garbage', span: 1, minimized: false },
      ],
    }
    expect(sanitizeLayout(raw)!.tiles).toEqual([{ id: 'a', span: 1, minimized: false }])
  })

  it('is backward compatible with #25-shaped stored layouts', () => {
    // A layout persisted by the #25 code: entries have only {id, span, minimized}.
    localStorage.setItem(
      'cc-workspace-layouts',
      JSON.stringify({
        [space.id]: {
          active: 'legacy',
          working: null,
          layouts: {
            legacy: {
              columns: 2,
              tiles: [
                { id: 'a', span: 2, minimized: true },
                { id: 'b', span: 1, minimized: false },
              ],
            },
          },
        },
      }),
    )
    const resolved = resolveInitialLayout(space, null)
    expect(resolved.activeName).toBe('legacy')
    expect(resolved.layout.tiles).toEqual([
      { id: 'a', span: 2, minimized: true },
      { id: 'b', span: 1, minimized: false },
    ])
  })
})

describe('layout hash param', () => {
  it('reads layout=<name> from the hash alongside other params', () => {
    window.location.hash = '#panel=plan-review&layout=my%20view&apn=123'
    expect(layoutNameFromHash()).toBe('my view')
  })

  it('returns null when absent', () => {
    window.location.hash = '#panel=plan-review'
    expect(layoutNameFromHash()).toBeNull()
  })

  it('writes and removes the param while preserving other segments', () => {
    window.location.hash = '#panel=site-analysis&apn=42'
    writeLayoutNameToHash('dense')
    expect(window.location.hash).toBe('#panel=site-analysis&apn=42&layout=dense')
    expect(layoutNameFromHash()).toBe('dense')
    writeLayoutNameToHash(null)
    expect(window.location.hash).toBe('#panel=site-analysis&apn=42')
  })
})
