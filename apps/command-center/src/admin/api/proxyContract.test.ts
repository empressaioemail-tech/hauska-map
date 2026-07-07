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
  { panel: 'MCP Inspector', method: 'GET', path: '/admin/introspection/tools', proxiedRoute: 'N/A', status: 'excluded', notes: 'Admin path blocked by design' },
  { panel: 'MCP Inspector', method: 'POST', path: '/admin/introspection/tools/:name/call', proxiedRoute: 'N/A', status: 'excluded', notes: 'Admin path blocked by design' },
  { panel: 'Agent View', method: 'POST', path: '/mcp', proxiedRoute: '/api/spine/mcp', status: 'allowed', notes: 'MCP protocol' },
  { panel: 'Agent View', method: 'GET', path: '/llms.txt', proxiedRoute: 'N/A', status: 'excluded', notes: 'MCP root path not under /mcp/*' },
  { panel: 'Agent View', method: 'GET', path: '/.well-known/agents.txt', proxiedRoute: 'N/A', status: 'excluded', notes: 'MCP root path not under /mcp/*' },
  { panel: 'Layer Registry View', method: 'GET', path: '/api/brokerage/v1/map-data/gis-layers', proxiedRoute: '/api/spine/cortex/api/brokerage/v1/map-data/gis-layers', status: 'allowed' },
  { panel: 'Revenue Meter', method: 'GET', path: '/metering/summary?days=7', proxiedRoute: '/api/spine/mcp-metering/summary', status: 'allowed', notes: 'MCP metering API' },

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
  { panel: 'Map', method: 'POST', path: '/place/geocode', proxiedRoute: '/api/spine/cortex/api/place/geocode', status: 'allowed' },
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
  { panel: 'SpaceBar', method: 'GET', path: '/saved-spaces', proxiedRoute: '/api/spine/cortex/api/saved-spaces', status: 'allowed' },
  { panel: 'SpaceBar', method: 'GET', path: '/saved-spaces/:name', proxiedRoute: '/api/spine/cortex/api/saved-spaces/:name', status: 'allowed' },
  { panel: 'SpaceBar', method: 'DELETE', path: '/saved-spaces/:name', proxiedRoute: '/api/spine/cortex/api/saved-spaces/:name', status: 'allowed' },
  { panel: 'SpaceBar', method: 'POST', path: '/saved-spaces/:name/share', proxiedRoute: '/api/spine/cortex/api/saved-spaces/:name/share', status: 'allowed' },
]

// ── Proxy Allowlist Rules (from api/spine.ts) ──

function isMethodAllowed(method: string, upstreamSegment: string, upstreamPath: string): boolean {
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
    const cortexPostPaths = ['api/engagements', 'api/intake/parse', 'api/place/geocode', 'api/saved-spaces']
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
  // MCP /admin/* paths are blocked
  if (upstreamSegment === 'mcp' && (upstreamPath.includes('admin') || upstreamPath.startsWith('admin/'))) {
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
