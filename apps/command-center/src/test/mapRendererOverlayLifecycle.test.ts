// apps/command-center/src/test/mapRendererOverlayLifecycle.test.ts
//
// Unit tests for the map-renderer overlay lifecycle — the seam behind Bug 2
// ("report says pushed to Map overlay stack, map never renders it").
//
// The regression: setOverlays gated the apply on map.isStyleLoaded(), which
// MapLibre reports FALSE whenever any source/tile is still loading (after a
// moveend, or right after the live-parcels setData). Report tiles push their
// overlay exactly ONCE per run; a push landing in such a window was stashed
// and never re-applied, so drainage/topography geometry silently never drew.
// The fix gates on the one-shot `load` event (style mutations are safe from
// then on) and applies every push immediately.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── maplibre-gl fake ───────────────────────────────────────────────────
// The renderer only needs Map + NavigationControl. The fake records
// sources/layers so tests can assert exactly what would be drawn.

const { fakeState, FakeMap } = vi.hoisted(() => {
  const fakeState = {
    instances: [] as any[],
  }

  class FakeMap {
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {}
    sources = new Map<string, { data: unknown }>()
    layers = new Map<
      string,
      { def: any; layout: Record<string, unknown>; paint: Record<string, unknown> }
    >()
    styleLoaded = false

    constructor(_opts: unknown) {
      fakeState.instances.push(this)
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      ;(this.handlers[event] ??= []).push(cb)
    }
    fire(event: string, ...args: unknown[]) {
      for (const cb of this.handlers[event] ?? []) cb(...args)
    }
    addControl() {}
    getCanvas() {
      return { style: {} }
    }
    isStyleLoaded() {
      return this.styleLoaded
    }
    addSource(id: string, def: { data: unknown }) {
      if (this.sources.has(id)) throw new Error(`source ${id} exists`)
      const src = {
        data: def.data,
        setData: (d: unknown) => {
          src.data = d
        },
      }
      this.sources.set(id, src as any)
    }
    getSource(id: string) {
      return this.sources.get(id)
    }
    removeSource(id: string) {
      this.sources.delete(id)
    }
    addLayer(def: { id: string }) {
      if (this.layers.has(def.id)) throw new Error(`layer ${def.id} exists`)
      this.layers.set(def.id, { def, layout: {}, paint: { ...(def as any).paint } })
    }
    getLayer(id: string) {
      return this.layers.get(id)
    }
    removeLayer(id: string) {
      this.layers.delete(id)
    }
    setLayoutProperty(id: string, prop: string, value: unknown) {
      const l = this.layers.get(id)
      if (!l) throw new Error(`no layer ${id}`)
      l.layout[prop] = value
    }
    setPaintProperty(id: string, prop: string, value: unknown) {
      const l = this.layers.get(id)
      if (!l) throw new Error(`no layer ${id}`)
      l.paint[prop] = value
    }
    jumpTo() {}
    getCenter() {
      return { lng: -97.3153, lat: 30.1109 }
    }
    getZoom() {
      return 15.2
    }
    getPitch() {
      return 0
    }
    getBearing() {
      return 0
    }
    getBounds() {
      return {
        getWest: () => -98,
        getSouth: () => 29,
        getEast: () => -97,
        getNorth: () => 31,
      }
    }
    resize() {}
    remove() {}
  }

  return { fakeState, FakeMap }
})

vi.mock('maplibre-gl', () => ({
  default: {
    Map: FakeMap,
    NavigationControl: class {},
  },
}))

import { createMapRenderer } from '../../../../packages/map-renderer/src/map-renderer.js'

const FLOW_SPEC = {
  layerKey: 'drainage-flow',
  visible: true,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-97.32, 30.11],
            [-97.31, 30.12],
          ],
        },
      },
    ],
  },
}

const CONTOURS_SPEC = {
  layerKey: 'topo-contours',
  visible: true,
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { elevation: 120 },
        geometry: {
          type: 'LineString',
          coordinates: [
            [-97.33, 30.1],
            [-97.32, 30.105],
          ],
        },
      },
    ],
  },
}

function mountRenderer() {
  const renderer = createMapRenderer()
  const slot = document.createElement('div')
  // The renderer runs without fixture layers (live consumers pass
  // useFixture=false), which keeps this test off the fixture corpus path.
  renderer.bindContext({ useFixture: false })
  renderer.mount(slot)
  const map = fakeState.instances[fakeState.instances.length - 1] as InstanceType<
    typeof FakeMap
  >
  return { renderer, map }
}

beforeEach(() => {
  fakeState.instances.length = 0
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})

describe('overlay lifecycle (report overlay stack)', () => {
  it('REGRESSION: applies a one-shot overlay push even while isStyleLoaded() is false (map busy loading tiles)', () => {
    const { renderer, map } = mountRenderer()

    // Style finished parsing (`load` fired) while the map is still busy:
    // isStyleLoaded() stays false — exactly the window that used to drop the
    // one-shot report push. (Also keeps jsdom off the fixture-DEM canvas path.)
    map.fire('load')
    expect(map.isStyleLoaded()).toBe(false)

    renderer.setOverlays([FLOW_SPEC])

    const src = map.getSource('hauska-ovl-drainage-flow') as any
    expect(src).toBeDefined()
    expect(src.data.features).toHaveLength(1)
    const line = map.getLayer('hauska-ovl-drainage-flow-line')
    expect(line).toBeDefined()
    expect(line!.layout.visibility).toBe('visible')
  })

  it('stashes pre-load pushes and applies them on the load event', () => {
    const { renderer, map } = mountRenderer()

    renderer.setOverlays([CONTOURS_SPEC])
    expect(map.getSource('hauska-ovl-topo-contours')).toBeUndefined()

    map.fire('load')

    expect(map.getSource('hauska-ovl-topo-contours')).toBeDefined()
    expect(map.getLayer('hauska-ovl-topo-contours-line')).toBeDefined()
  })

  it('honors per-overlay visibility toggles without dropping the source', () => {
    const { renderer, map } = mountRenderer()
    map.fire('load')

    renderer.setOverlays([FLOW_SPEC])
    expect(map.getLayer('hauska-ovl-drainage-flow-line')!.layout.visibility).toBe('visible')

    renderer.setOverlays([{ ...FLOW_SPEC, visible: false }])
    expect(map.getLayer('hauska-ovl-drainage-flow-line')!.layout.visibility).toBe('none')
    expect(map.getSource('hauska-ovl-drainage-flow')).toBeDefined()

    renderer.setOverlays([{ ...FLOW_SPEC, visible: true }])
    expect(map.getLayer('hauska-ovl-drainage-flow-line')!.layout.visibility).toBe('visible')
  })

  it('keeps distinct overlays separate and removes overlays that leave the stack', () => {
    const { renderer, map } = mountRenderer()
    map.fire('load')

    renderer.setOverlays([FLOW_SPEC, CONTOURS_SPEC])
    expect(map.getSource('hauska-ovl-drainage-flow')).toBeDefined()
    expect(map.getSource('hauska-ovl-topo-contours')).toBeDefined()

    renderer.setOverlays([CONTOURS_SPEC])
    expect(map.getSource('hauska-ovl-drainage-flow')).toBeUndefined()
    expect(map.getLayer('hauska-ovl-drainage-flow-line')).toBeUndefined()
    expect(map.getSource('hauska-ovl-topo-contours')).toBeDefined()

    renderer.setOverlays([])
    expect(map.getSource('hauska-ovl-topo-contours')).toBeUndefined()
  })
})
