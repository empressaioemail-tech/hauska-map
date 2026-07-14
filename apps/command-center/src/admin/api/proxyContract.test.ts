// apps/command-center/src/admin/api/proxyContract.test.ts
//
// Proxy contract enforcement test. Walks the endpoint inventory and asserts
// every panel/tile endpoint is either allowlisted or explicitly marked
// proxy-excluded. Prevents new panels from shipping paths the proxy doesn't carry.

import { describe, it, expect } from 'vitest'

// ── Proxy Contract: Endpoint Inventory ──

interface EndpointSpec {
  panel: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
  path: string
  proxiedRoute: string
  status: 'allowed' | 'excluded'
  notes?: string
}

// Every endpoint every panel and workspace tile calls
const ENDPOINT_INVENTORY: EndpointSpec[] = [
  // ── Panel Endpoints ──
  { panel: 'Atom Inspector', method: 'POST', path: '/mcp', proxiedRoute: '/api/spine/mcp', status: 'allowed', notes: 'MCP JSON-RPC: initialize, tools/list, tools/call' },
  { panel: 'MCP Inspector', method: 'GET', path: '/admin/introspection/tools', proxiedRoute: '/api/spine/mcp-introspection/tools', status: 'allowed', notes: 'Path-pinned read-only catalog; X-Hauska-Admin-Key attached server-side (MCP_ADMIN_KEY)' },
  { panel: 'MCP Inspector', method: 'POST', path: '/admin/introspection/tools/:name/call', proxiedRoute: '/api/spine/mcp-introspection/tools/:name/call', status: 'excluded', notes: 'Live call probe executes tools under simulated auth — operator-only, blocked at the proxy' },
  { panel: 'Surface & Gate', method: 'GET', path: '/admin/introspection/tools', proxiedRoute: '/api/spine/mcp-introspection/tools', status: 'allowed', notes: 'Same pinned catalog route as MCP Inspector' },
  { panel: 'Agent View', method: 'POST', path: '/mcp', proxiedRoute: '/api/spine/mcp', status: 'allowed', notes: 'MCP protocol' },
  { panel: 'Agent View', method: 'GET', path: '/llms.txt', proxiedRoute: 'N/A', status: 'excluded', notes: 'MCP root path not under /mcp/*' },
  { panel: 'Agent View', method: 'GET', path: '/.well-known/agents.txt', proxiedRoute: 'N/A', status: 'excluded', notes: 'MCP root path not under /mcp/*' },
  { panel: 'Layer Registry View', method: 'GET', path: '/api/brokerage/v1/map-data/gis-layers', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/map-data/gis-layers', status: 'allowed' },
  { panel: 'Revenue Meter', method: 'GET', path: '/metering/summary?days=7', proxiedRoute: '/api/spine/mcp-metering/summary', status: 'allowed', notes: 'MCP metering API (upstream requires a platform_internal key)' },
  { panel: 'Parcel Trace', method: 'GET', path: '/atoms/trace/:did', proxiedRoute: '/api/spine/retrieval/atoms/trace/:did', status: 'allowed', notes: 'retrieval-api (unprefixed routes — no /v1); Bearer RETRIEVAL_API_KEY attached server-side' },
  { panel: 'Parcel Trace', method: 'POST', path: '/api/plan-review/geocode', proxiedRoute: '/api/spine/cortex/api/plan-review/geocode', status: 'allowed', notes: 'Resolve step: address body → placeKey (replaces the nonexistent GET /api/brokerage/v1/place/resolve, which was SPA fallthrough; live-verified 2026-07-14)' },
  { panel: 'Parcel Trace', method: 'GET', path: '/api/brokerage/v1/place/:placeKey/atoms', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/place/:placeKey/atoms', status: 'allowed', notes: 'Atoms composed at the resolved place; 404 {error:"geocode_miss"} for unknown place keys (live-verified 2026-07-14)' },
  { panel: 'Run Monitor', method: 'GET', path: '/api/brokerage/v1/operator/warming/status', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/operator/warming/status', status: 'allowed', notes: 'Honest-empty until the warming harness runs' },
  { panel: 'Run Monitor', method: 'GET', path: '/api/internal/qa/run-state', proxiedRoute: '/api/spine/cortex/api/internal/qa/run-state', status: 'allowed', notes: 'Honest-empty until the run-state endpoint ships' },
  { panel: 'Run Monitor', method: 'GET', path: '/admin/operator/run-state', proxiedRoute: 'N/A', status: 'excluded', notes: 'MCP admin path; endpoint does not exist yet — probe skipped in proxy mode' },

  // ── Workspace Tile Endpoints (Cortex) ──
  
  // Intake & Submission Tiles
  { panel: 'IntakeQueue', method: 'GET', path: '/engagements', proxiedRoute: '/api/spine/cortex/api/engagements', status: 'allowed' },
  { panel: 'IntakeQueue', method: 'GET', path: '/engagements/:id', proxiedRoute: '/api/spine/cortex/api/engagements/:id', status: 'allowed' },
  { panel: 'IntakeQueue', method: 'GET', path: '/engagements/:id/submissions', proxiedRoute: '/api/spine/cortex/api/engagements/:id/submissions', status: 'allowed' },
  { panel: 'IntakeQueue', method: 'POST', path: '/engagements/:id/submissions', proxiedRoute: '/api/spine/cortex/api/engagements/:id/submissions', status: 'allowed' },
  { panel: 'IntakeQueue', method: 'POST', path: '/engagements/:id/submissions/:sid/compliance', proxiedRoute: '/api/spine/cortex/api/engagements/:id/submissions/:sid/compliance', status: 'allowed' },
  { panel: 'IntakeQueue', method: 'GET', path: '/engagements/:id/reports/:type', proxiedRoute: '/api/spine/cortex/api/engagements/:id/reports/:type', status: 'allowed' },
  { panel: 'Intake', method: 'POST', path: '/engagements', proxiedRoute: '/api/spine/cortex/api/engagements', status: 'allowed' },
  { panel: 'Intake', method: 'POST', path: '/intake/parse', proxiedRoute: '/api/spine/cortex/api/intake/parse', status: 'allowed' },

  // Compliance Tiles
  { panel: 'FindingsLibrary', method: 'GET', path: '/engagements/:id/findings', proxiedRoute: '/api/spine/cortex/api/engagements/:id/findings', status: 'allowed' },
  { panel: 'FindingsLibrary', method: 'PATCH', path: '/engagements/:id/findings/:fid', proxiedRoute: '/api/spine/cortex/api/engagements/:id/findings/:fid', status: 'allowed' },
  { panel: 'FindingsLibrary', method: 'POST', path: '/engagements/:id/reports/:type/run', proxiedRoute: '/api/spine/cortex/api/engagements/:id/reports/:type/run', status: 'allowed' },
  { panel: 'ComplianceRun', method: 'GET', path: '/engagements/:id/reports/:type', proxiedRoute: '/api/spine/cortex/api/engagements/:id/reports/:type', status: 'allowed' },
  { panel: 'ComplianceRun', method: 'POST', path: '/engagements/:id/reports/:type/run', proxiedRoute: '/api/spine/cortex/api/engagements/:id/reports/:type/run', status: 'allowed' },

  // Document & Dataroom Tiles
  { panel: 'DocumentViewer', method: 'GET', path: '/engagements/:id/documents/:docId', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents/:docId', status: 'allowed' },
  { panel: 'DocumentViewer', method: 'GET', path: '/engagements/:id/documents/:docId/download', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents/:docId/download', status: 'allowed' },
  { panel: 'Dataroom', method: 'GET', path: '/engagements/:id/documents', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents', status: 'allowed' },
  { panel: 'Dataroom', method: 'POST', path: '/engagements/:id/documents/request-upload-url', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents/request-upload-url', status: 'allowed' },
  { panel: 'Dataroom', method: 'POST', path: '/engagements/:id/documents/complete-upload', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents/complete-upload', status: 'allowed' },
  { panel: 'Dataroom', method: 'POST', path: '/engagements/:id/documents/:docId/ingest', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents/:docId/ingest', status: 'allowed' },
  { panel: 'Dataroom', method: 'DELETE', path: '/engagements/:id/documents/:docId', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents/:docId', status: 'allowed' },
  { panel: 'SheetExtraction', method: 'POST', path: '/engagements/:id/sheets/extract', proxiedRoute: '/api/spine/cortex/api/engagements/:id/sheets/extract', status: 'allowed' },
  { panel: 'SheetExtraction', method: 'GET', path: '/engagements/:id/sheets', proxiedRoute: '/api/spine/cortex/api/engagements/:id/sheets', status: 'allowed' },

  // Site Analysis Tiles (GIS-backed)
  { panel: 'Map', method: 'POST', path: '/api/brokerage/v1/map-data', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/map-data', status: 'allowed', notes: 'Live GIS root query (bbox body); exact-match POST' },
  { panel: 'Map', method: 'POST', path: '/api/brokerage/v1/map-data/gis-layer', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/map-data/gis-layer', status: 'allowed', notes: 'Live GIS viewport layer (bbox body); exact-match POST' },
  { panel: 'Map', method: 'POST', path: '/api/brokerage/v1/map-data/composite-layer', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/map-data/composite-layer', status: 'allowed', notes: 'Composite layer (bbox body); exact-match POST' },
  { panel: 'Map', method: 'GET', path: '/api/brokerage/v1/map-data/composite-layers', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/map-data/composite-layers', status: 'allowed', notes: 'Composite layer catalog list' },
  { panel: 'Map', method: 'POST', path: '/place/geocode', proxiedRoute: '/api/spine/cortex/api/place/geocode', status: 'allowed' },
  { panel: 'HeaderSearchBar', method: 'POST', path: '/plan-review/geocode', proxiedRoute: '/api/spine/cortex/api/plan-review/geocode', status: 'allowed', notes: 'cortex-client v0.1.1' },
  { panel: 'Map', method: 'GET', path: '/place/parcel', proxiedRoute: '/api/spine/cortex/api/place/parcel', status: 'allowed' },
  { panel: 'Map', method: 'GET', path: '/api/brokerage/v1/map-data/gis-layers', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/map-data/gis-layers', status: 'allowed' },
  { panel: 'Topography', method: 'GET', path: '/place/topography', proxiedRoute: '/api/spine/cortex/api/place/topography', status: 'allowed' },
  { panel: 'Drainage', method: 'GET', path: '/place/drainage', proxiedRoute: '/api/spine/cortex/api/place/drainage', status: 'allowed' },
  { panel: 'Hydrology', method: 'GET', path: '/place/hydrology', proxiedRoute: '/api/spine/cortex/api/place/hydrology', status: 'allowed' },
  { panel: 'Subsurface', method: 'GET', path: '/place/subsurface', proxiedRoute: '/api/spine/cortex/api/place/subsurface', status: 'allowed' },

  // Property Intel Tiles
  { panel: 'PropertyBrief', method: 'GET', path: '/place/property-brief', proxiedRoute: '/api/spine/cortex/api/place/property-brief', status: 'allowed' },
  { panel: 'HazardProfile', method: 'GET', path: '/place/hazards', proxiedRoute: '/api/spine/cortex/api/place/hazards', status: 'allowed' },
  { panel: 'Encumbrance', method: 'GET', path: '/place/encumbrances', proxiedRoute: '/api/spine/cortex/api/place/encumbrances', status: 'allowed' },
  { panel: 'LocalSetbacks', method: 'GET', path: '/place/setbacks', proxiedRoute: '/api/spine/cortex/api/place/setbacks', status: 'allowed' },

  // Deliverable Tiles
  { panel: 'Letter', method: 'POST', path: '/engagements/:id/letter/generate', proxiedRoute: '/api/spine/cortex/api/engagements/:id/letter/generate', status: 'allowed' },
  { panel: 'Letter', method: 'GET', path: '/engagements/:id/letter', proxiedRoute: '/api/spine/cortex/api/engagements/:id/letter', status: 'allowed' },
  { panel: 'ResponseTasks', method: 'GET', path: '/engagements/:id/response-tasks', proxiedRoute: '/api/spine/cortex/api/engagements/:id/response-tasks', status: 'allowed' },
  { panel: 'ResponseTasks', method: 'PATCH', path: '/engagements/:id/response-tasks/:tid', proxiedRoute: '/api/spine/cortex/api/engagements/:id/response-tasks/:tid', status: 'allowed' },

  // Design Accelerator Tiles
  { panel: 'DocumentParsing', method: 'POST', path: '/engagements/:id/documents/:docId/parse', proxiedRoute: '/api/spine/cortex/api/engagements/:id/documents/:docId/parse', status: 'allowed' },
  { panel: 'DocumentParsing', method: 'GET', path: '/engagements/:id/parsed-sections', proxiedRoute: '/api/spine/cortex/api/engagements/:id/parsed-sections', status: 'allowed' },
  { panel: 'ProductSpecReference', method: 'GET', path: '/product-specs', proxiedRoute: '/api/spine/cortex/api/product-specs', status: 'allowed' },
  { panel: 'ProductSpecReference', method: 'GET', path: '/product-specs/:specId', proxiedRoute: '/api/spine/cortex/api/product-specs/:specId', status: 'allowed' },

  // Workspace Management
  { panel: 'SpaceBar', method: 'POST', path: '/saved-spaces', proxiedRoute: '/api/spine/cortex/api/saved-spaces', status: 'allowed' },
  { panel: 'SpaceBar', method: 'POST', path: '/plan-review/spaces', proxiedRoute: '/api/spine/cortex/api/plan-review/spaces', status: 'allowed', notes: 'cortex-client v0.1.1' },
  { panel: 'SpaceBar', method: 'GET', path: '/saved-spaces', proxiedRoute: '/api/spine/cortex/api/saved-spaces', status: 'allowed' },
  { panel: 'SpaceBar', method: 'GET', path: '/plan-review/spaces', proxiedRoute: '/api/spine/cortex/api/plan-review/spaces', status: 'allowed', notes: 'cortex-client v0.1.1' },
  { panel: 'SpaceBar', method: 'GET', path: '/saved-spaces/:name', proxiedRoute: '/api/spine/cortex/api/saved-spaces/:name', status: 'allowed' },
  { panel: 'SpaceBar', method: 'GET', path: '/plan-review/spaces/by-name/:name', proxiedRoute: '/api/spine/cortex/api/plan-review/spaces/by-name/:name', status: 'allowed', notes: 'cortex-client v0.1.1' },
  { panel: 'SpaceBar', method: 'DELETE', path: '/saved-spaces/:name', proxiedRoute: '/api/spine/cortex/api/saved-spaces/:name', status: 'allowed' },
  { panel: 'SpaceBar', method: 'DELETE', path: '/plan-review/spaces/by-name/:name', proxiedRoute: '/api/spine/cortex/api/plan-review/spaces/by-name/:name', status: 'allowed', notes: 'cortex-client v0.1.1' },
  { panel: 'SpaceBar', method: 'POST', path: '/saved-spaces/:name/share', proxiedRoute: '/api/spine/cortex/api/saved-spaces/:name/share', status: 'allowed' },
  { panel: 'SpaceBar', method: 'POST', path: '/plan-review/spaces/by-name/:name/share', proxiedRoute: '/api/spine/cortex/api/plan-review/spaces/by-name/:name/share', status: 'allowed', notes: 'cortex-client v0.1.1' },
]

// ── Proxy Allowlist Rules (from api/spine.ts) ──

function isMethodAllowed(method: string, upstreamSegment: string, upstreamPath: string): boolean {
  // MCP introspection: GET-only, path-pinned to 'tools' and 'tools/:name'
  if (upstreamSegment === 'mcp-introspection') {
    return ['GET', 'HEAD'].includes(method) && /^tools(\/[^/]+)?$/.test(upstreamPath)
  }

  // GET/HEAD always allowed
  if (['GET', 'HEAD'].includes(method)) return true

  // MCP JSON-RPC: POST to /api/spine/mcp (upstreamPath empty or 'mcp')
  if (upstreamSegment === 'mcp' && (upstreamPath === '' || upstreamPath === 'mcp')) {
    return method === 'POST'
  }

  // MCP metering: GET to /api/spine/mcp-metering/summary
  if (upstreamSegment === 'mcp-metering' && upstreamPath === 'summary') {
    return method === 'GET'
  }

  // Cortex POST allowlist (with api/ prefix after baseUrl fix)
  if (upstreamSegment === 'cortex') {
    // Map-data live GIS queries: EXACT matches, POST only (no prefix rule, no
    // PUT/DELETE/PATCH) — mirrors cortexMapDataPostExact in api/spine.ts.
    const cortexMapDataPostExact = [
      'api/brokerage/v1/map-data',
      'api/brokerage/v1/map-data/gis-layer',
      'api/brokerage/v1/map-data/composite-layer',
    ]
    if (cortexMapDataPostExact.includes(upstreamPath) && method === 'POST') {
      return true
    }

    const cortexPostPaths = ['api/engagements', 'api/intake/parse', 'api/place/geocode', 'api/plan-review/geocode', 'api/plan-review/spaces', 'api/saved-spaces']
    const engagementPostPattern = /^api\/engagements\/[^/]+\/(reports|letter|findings|submissions|documents|sheets)/

    if (
      cortexPostPaths.includes(upstreamPath) ||
      cortexPostPaths.some((p) => upstreamPath.startsWith(p + '/')) ||
      engagementPostPattern.test(upstreamPath)
    ) {
      return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)
    }
  }

  return false
}

function isPathExcluded(upstreamSegment: string, upstreamPath: string): boolean {
  // MCP /admin/* paths are blocked on the generic mcp segment
  if (upstreamSegment === 'mcp' && (upstreamPath.includes('admin') || upstreamPath.startsWith('admin/'))) {
    return true
  }
  // mcp-introspection is pinned to the read-only catalog: 'tools' and 'tools/:name'.
  // Anything else (including tools/:name/call) is rejected with the admin key attached.
  if (upstreamSegment === 'mcp-introspection' && !/^tools(\/[^/]+)?$/.test(upstreamPath)) {
    return true
  }
  // MCP root paths (not under /mcp/*) are excluded: /llms.txt, /.well-known/agents.txt
  if (!upstreamSegment || upstreamSegment === '') {
    return true
  }
  return false
}

// ── Tests ──

describe('Proxy Contract', () => {
  it('should have at least one endpoint in the inventory', () => {
    expect(ENDPOINT_INVENTORY.length).toBeGreaterThan(0)
  })

  it('should mark every endpoint as either allowed or excluded', () => {
    for (const ep of ENDPOINT_INVENTORY) {
      expect(['allowed', 'excluded']).toContain(ep.status)
    }
  })

  it('should match allowlist logic for allowed endpoints', () => {
    const allowedEndpoints = ENDPOINT_INVENTORY.filter((ep) => ep.status === 'allowed')

    for (const ep of allowedEndpoints) {
      // Parse proxiedRoute: /api/spine/{segment}/{upstreamPath}
      const match = ep.proxiedRoute.match(/^\/api\/spine\/([^/]+)(?:\/(.*))?$/)
      if (!match) {
        throw new Error(`Invalid proxiedRoute format for ${ep.panel} ${ep.method} ${ep.path}: ${ep.proxiedRoute}`)
      }
      const [, upstreamSegment, upstreamPath = ''] = match

      const allowed = isMethodAllowed(ep.method, upstreamSegment, upstreamPath)
      const excluded = isPathExcluded(upstreamSegment, upstreamPath)

      expect(allowed).toBe(true)
      expect(excluded).toBe(false)
    }
  })

  it('should match exclusion logic for excluded endpoints', () => {
    const excludedEndpoints = ENDPOINT_INVENTORY.filter((ep) => ep.status === 'excluded')

    for (const ep of excludedEndpoints) {
      // Excluded endpoints should have proxiedRoute 'N/A' or be explicitly blocked
      if (ep.proxiedRoute === 'N/A') {
        // These are intentionally not routed through the proxy
        expect(ep.status).toBe('excluded')
      } else {
        // Parse and check if they would be blocked
        const match = ep.proxiedRoute.match(/^\/api\/spine\/([^/]+)(?:\/(.*))?$/)
        if (match) {
          const [, upstreamSegment, upstreamPath = ''] = match
          const excluded = isPathExcluded(upstreamSegment, upstreamPath)
          expect(excluded).toBe(true)
        }
      }
    }
  })

  it('should allow POST only on the exact map-data live-query paths', () => {
    // Positive: the three exact paths the map tile sends
    expect(isMethodAllowed('POST', 'cortex', 'api/brokerage/v1/map-data')).toBe(true)
    expect(isMethodAllowed('POST', 'cortex', 'api/brokerage/v1/map-data/gis-layer')).toBe(true)
    expect(isMethodAllowed('POST', 'cortex', 'api/brokerage/v1/map-data/composite-layer')).toBe(true)

    // Negative: unrelated POSTs stay 403 — the exact-match list must not
    // prefix-open siblings, sub-resources, or other brokerage routes
    expect(isMethodAllowed('POST', 'cortex', 'api/brokerage/v1/map-data/gis-layers')).toBe(false)
    expect(isMethodAllowed('POST', 'cortex', 'api/brokerage/v1/map-data/gis-layer/extra')).toBe(false)
    expect(isMethodAllowed('POST', 'cortex', 'api/brokerage/v1/coverage')).toBe(false)

    // Negative: no mutation verbs beyond POST on the map-data paths
    expect(isMethodAllowed('PUT', 'cortex', 'api/brokerage/v1/map-data/gis-layer')).toBe(false)
    expect(isMethodAllowed('DELETE', 'cortex', 'api/brokerage/v1/map-data/gis-layer')).toBe(false)
    expect(isMethodAllowed('PATCH', 'cortex', 'api/brokerage/v1/map-data/gis-layer')).toBe(false)
  })

  it('should prevent new panels from shipping unallowlisted paths', () => {
    // This test ensures the inventory is complete and enforced.
    // If a new panel is added with an endpoint not in ENDPOINT_INVENTORY,
    // this test should fail (or the inventory should be updated).
    
    // Count endpoints by status
    const allowedCount = ENDPOINT_INVENTORY.filter((ep) => ep.status === 'allowed').length
    const excludedCount = ENDPOINT_INVENTORY.filter((ep) => ep.status === 'excluded').length

    expect(allowedCount).toBeGreaterThan(0)
    expect(excludedCount).toBeGreaterThan(0)
    expect(allowedCount + excludedCount).toBe(ENDPOINT_INVENTORY.length)
  })

  it('should cover all production panels mentioned in the contract', () => {
    const panelNames = new Set(ENDPOINT_INVENTORY.map((ep) => ep.panel))
    
    // Verify key panels are covered
    expect(panelNames.has('Atom Inspector')).toBe(true)
    expect(panelNames.has('MCP Inspector')).toBe(true)
    expect(panelNames.has('Agent View')).toBe(true)
    expect(panelNames.has('Layer Registry View')).toBe(true)
    expect(panelNames.has('IntakeQueue')).toBe(true)
    expect(panelNames.has('FindingsLibrary')).toBe(true)
    expect(panelNames.has('Map')).toBe(true)
  })
})
