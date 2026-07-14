// api/spine.ts
//
// Vercel serverless proxy â€" same-origin gateway for the Command Center. The
// browser NEVER holds service keys; this function attaches auth from
// server-side env vars and routes by the first path segment to upstreams.
// Requests arrive via the vercel.json rewrite
// /api/spine/(.*) -> /api/spine?upath=$1 (the [...path] catch-all did not
// match nested segments on the deployed alias, so routing is query-based):
//   /api/spine/cortex/*              -> CORTEX_API_URL with Authorization: Bearer CORTEX_SERVICE_API_KEY
//   /api/spine/mcp/*                 -> MCP_URL with X-Hauska-Key: MCP_PRODUCT_KEY
//                                       (key optional: unset -> anonymous, resolves to the public product)
//   /api/spine/mcp-metering/*        -> MCP_URL/metering/* with X-Hauska-Key: MCP_PRODUCT_KEY
//                                       (key REQUIRED: /metering/summary needs a platform_internal key)
//   /api/spine/mcp-introspection/*   -> MCP_URL/admin/introspection/* with X-Hauska-Admin-Key: MCP_ADMIN_KEY
//                                       (path-pinned GET-only: 'tools' and 'tools/:name'; the POST
//                                       tools/:name/call probe stays blocked - operator-only)
//   /api/spine/retrieval/*           -> RETRIEVAL_API_URL with Authorization: Bearer RETRIEVAL_API_KEY
//                                       (key required except /health, /healthz, /ready - the retrieval
//                                       API Bearer-gates every other route per its DEPLOY.md)
//
// SECURITY: allowlist methods/paths â€" GET only, plus POST for /api/spine/mcp/mcp
// (JSON-RPC) and explicit cortex POST paths required by workspace tiles. Reject
// /admin/* MCP paths on the generic mcp segment (the introspection segment above is
// the only, path-pinned exception and carries a read-only catalog GET; the admin key
// never rides an operator-supplied path). Missing env var -> 503 with {error, missing}.

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface Upstream {
  baseUrl: string
  headers: Record<string, string>
}

function getUpstream(pathSegments: string[]): { upstream: Upstream | null; error?: string; missing?: string } {
  const [segment, ...rest] = pathSegments

  if (segment === 'cortex') {
    const url = process.env.CORTEX_API_URL?.trim() || 'https://cortex-api-tds7av26va-uc.a.run.app'
    const key = process.env.CORTEX_SERVICE_API_KEY?.trim()
    if (!key) return { upstream: null, error: 'proxy not configured', missing: 'CORTEX_SERVICE_API_KEY' }
    return {
      upstream: {
        baseUrl: url.replace(/\/$/, ''),
        headers: { Authorization: `Bearer ${key}` },
      },
    }
  }

  if (segment === 'mcp' || segment === 'mcp-metering') {
    const url = process.env.MCP_URL?.trim() || 'https://hauska-mcp-server-h7gvu7rgcq-uc.a.run.app'
    const key = process.env.MCP_PRODUCT_KEY?.trim()
    // /metering/summary requires a platform_internal key upstream; anonymous can
    // never succeed there, so a missing key is a config error worth surfacing.
    if (!key && segment === 'mcp-metering') {
      return { upstream: null, error: 'proxy not configured', missing: 'MCP_PRODUCT_KEY' }
    }
    // SECURITY: reject /admin/* paths (for mcp segment only; mcp-metering is allowlisted paths)
    if (segment === 'mcp' && rest.some((p) => p === 'admin' || p.startsWith('admin/'))) {
      return { upstream: null, error: 'forbidden', missing: undefined }
    }
    // mcp-metering segment routes to /metering/* on the MCP upstream
    const pathPrefix = segment === 'mcp-metering' ? 'metering' : ''
    return {
      upstream: {
        baseUrl: url.replace(/\/$/, '') + (pathPrefix ? `/${pathPrefix}` : ''),
        // MCP_PRODUCT_KEY unset -> send no X-Hauska-Key at all: the MCP server
        // resolves the no-header anonymous path to product "public" (a malformed
        // or unknown key would 401), so the console still serves the public
        // catalog on an unconfigured deploy.
        headers: key ? { 'X-Hauska-Key': key } : {},
      },
    }
  }

  if (segment === 'mcp-introspection') {
    const url = process.env.MCP_URL?.trim() || 'https://hauska-mcp-server-h7gvu7rgcq-uc.a.run.app'
    const key = process.env.MCP_ADMIN_KEY?.trim()
    if (!key) return { upstream: null, error: 'proxy not configured', missing: 'MCP_ADMIN_KEY' }
    return {
      upstream: {
        baseUrl: url.replace(/\/$/, '') + '/admin/introspection',
        headers: { 'X-Hauska-Admin-Key': key },
      },
    }
  }

  if (segment === 'retrieval') {
    const url = process.env.RETRIEVAL_API_URL?.trim() || 'https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app'
    const key = process.env.RETRIEVAL_API_KEY?.trim()
    const upstreamPath = rest.join('/')
    const isHealthPath = upstreamPath === 'health' || upstreamPath === 'healthz' || upstreamPath === 'ready'
    // The retrieval API requires Authorization: Bearer <RETRIEVAL_API_KEY> on
    // every route except health probes (its Bearer gate is what keeps the
    // internal data plane off the open internet). Without the env var, only
    // the health paths can succeed - fail the rest loudly instead of letting
    // panels show a bare upstream 401.
    if (!key && !isHealthPath) {
      return { upstream: null, error: 'proxy not configured', missing: 'RETRIEVAL_API_KEY' }
    }
    return {
      upstream: {
        baseUrl: url.replace(/\/$/, ''),
        headers: key && !isHealthPath ? { Authorization: `Bearer ${key}` } : {},
      },
    }
  }

  return { upstream: null, error: 'unknown spine segment', missing: undefined }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { upath } = req.query
  const upathStr = Array.isArray(upath) ? upath.join('/') : upath
  if (!upathStr) {
    res.status(400).json({ error: 'invalid path' })
    return
  }
  const path = upathStr.split('/').filter(Boolean)
  if (path.some((p) => p === '..' || p === '.')) {
    res.status(400).json({ error: 'invalid path' })
    return
  }

  const { upstream, error, missing } = getUpstream(path)
  if (!upstream) {
    if (missing) {
      res.status(503).json({ error, missing })
    } else if (error === 'forbidden') {
      res.status(403).json({ error: 'forbidden' })
    } else {
      res.status(400).json({ error })
    }
    return
  }

  const [_segment, ...rest] = path
  const upstreamPath = rest.join('/')
  const method = req.method || 'GET'

  // SECURITY: allowlist methods/paths — GET only, plus POST for MCP JSON-RPC endpoint
  const allowedMethods = ['GET', 'HEAD']
  // MCP JSON-RPC: allow POST to /api/spine/mcp (upstreamPath empty) or /api/spine/mcp/mcp
  if (path[0] === 'mcp' && (upstreamPath === 'mcp' || upstreamPath === '')) {
    allowedMethods.push('POST')
  }
  // MCP metering: the ONLY reachable path under mcp-metering is exactly
  // 'summary' — anything else (including ../ traversal toward /admin with
  // the key attached) is rejected outright.
  if (path[0] === 'mcp-metering') {
    if (upstreamPath !== 'summary') {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    // days is optional (endpoint defaults to 7); validate only when present
    const { days } = req.query
    if (days !== undefined) {
      const daysNum = Number(days)
      if (!/^\d+$/.test(String(days)) || !Number.isInteger(daysNum) || daysNum < 1 || daysNum > 31) {
        res.status(400).json({ error: 'invalid days parameter (must be integer 1..31)' })
        return
      }
    }
  }
  // MCP admin introspection: read-only catalog ONLY. Reachable paths are
  // exactly 'tools' (list) and 'tools/:name' (detail) via GET - anything else,
  // including the POST tools/:name/call live probe and any traversal toward
  // other /admin/* routes with the admin key attached, is rejected outright.
  if (path[0] === 'mcp-introspection') {
    if (!/^tools(\/[^/]+)?$/.test(upstreamPath)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    // GET/HEAD only (allowedMethods already restricts this; make it explicit
    // that no mutation is ever added for this segment).
  }
  // Cortex POST allowlist: explicit paths required by workspace tiles.
  // After baseUrl fix, upstreamPath arrives as api/engagements..., api/intake/parse, etc.
  // - api/engagements/:id/reports/:type/run → run compliance pass (FindingsLibrary tile)
  // - api/engagements/:id/letter/generate → generate comment letter (future Deliverable tile)
  // - api/engagements/:id/findings/:findingId → patch finding action (FindingsLibrary tile)
  // - api/engagements → create engagement (Intake tile)
  // - api/intake/parse → parse intake content (Intake tile)
  // - api/plan-review/geocode → forward/reverse geocode (cortex-client v0.1.1, HeaderSearchBar)
  // - api/place/geocode → forward/reverse geocode (legacy path, keep for backwards compat)
  // - api/plan-review/spaces → list/create saved spaces (SpaceBar, future server-side persistence)
  // - api/engagements/:id/submissions/:submissionId/compliance → run compliance pass (IntakeQueue tile)
  // - api/engagements/:id/documents/request-upload-url → request GCS signed URL (future Dataroom tile)
  // - api/engagements/:id/documents/complete-upload → complete document upload (future Dataroom tile)
  // - api/engagements/:id/submissions → create submission (IntakeQueue tile)
  // - api/engagements/:id/documents/:docId/ingest → ingest dataroom document (future Dataroom tile)
  // - api/engagements/:id/sheets/extract → extract sheets (SheetExtraction tile)
  // - api/saved-spaces (PUT/DELETE) → save/delete workspace (SpaceBar)
  // - api/saved-spaces/:name/share → share workspace (SpaceBar)
  // - api/brokerage/v1/map-data[/gis-layer|/composite-layer] → live GIS viewport
  //   queries for the Map tile (bbox POST bodies; upstream brokerageMapData
  //   router: POST /, /gis-layer, /composite-layer — GET /gis-layers and
  //   /composite-layers already pass via the GET/HEAD default). EXACT matches,
  //   POST only — deliberately NOT in cortexPostPaths so the startsWith prefix
  //   rule cannot open unlisted map-data sub-resources or mutation verbs.
  if (path[0] === 'cortex') {
    const cortexMapDataPostExact = [
      'api/brokerage/v1/map-data',
      'api/brokerage/v1/map-data/gis-layer',
      'api/brokerage/v1/map-data/composite-layer',
    ]
    if (cortexMapDataPostExact.includes(upstreamPath)) {
      allowedMethods.push('POST')
    }
    const cortexPostPaths = [
      'api/engagements',
      'api/intake/parse',
      'api/plan-review/geocode',
      'api/place/geocode',
      'api/plan-review/spaces',
      'api/saved-spaces',
      // plan-review BFF engagement sub-resources (Dataroom upload-url/complete-upload/ingest,
      // reports/:type/run, compliance-run, letter/generate, sheets/extract, annotations) —
      // same trust level as the api/engagements/** blanket above; upstream still enforces
      // requireServiceTokenOrSession per route.
      'api/plan-review/engagements',
    ]
    // Also allow POST/PUT/DELETE/PATCH to paths matching: api/engagements/:id/(reports|letter|findings|submissions|documents|sheets)/*
    const engagementPostPattern = /^api\/engagements\/[^/]+\/(reports|letter|findings|submissions|documents|sheets)/
    // Findings generation runs on SUBMISSIONS (the gate-fronted findings router):
    // POST api/submissions/:submissionId/findings[/generate|/status] — the
    // IntakeQueue compliance-run path the walkthrough drives.
    const submissionFindingsPattern = /^api\/submissions\/[^/]+\/findings(\/|$)/
    if (
      cortexPostPaths.includes(upstreamPath) ||
      cortexPostPaths.some((p) => upstreamPath.startsWith(p + '/')) ||
      engagementPostPattern.test(upstreamPath) ||
      submissionFindingsPattern.test(upstreamPath)
    ) {
      allowedMethods.push('POST', 'PUT', 'DELETE', 'PATCH')
    }
  }
  if (!allowedMethods.includes(method)) {
    res.status(403).json({ error: 'method not allowed' })
    return
  }

  // forward the original query string (minus the rewrite's upath param)
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'upath') continue
    for (const val of Array.isArray(v) ? v : [v]) {
      if (val !== undefined) qs.append(k, val)
    }
  }
  const qsStr = qs.toString()
  // The MCP JSON-RPC endpoint lives at /mcp upstream; a request to /api/spine/mcp
  // (empty remainder) must target it, not the upstream root ("Cannot POST /").
  const effectivePath = path[0] === 'mcp' && upstreamPath === '' ? 'mcp' : upstreamPath
  const targetUrl = `${upstream.baseUrl}/${effectivePath}${qsStr ? `?${qsStr}` : ''}`
  const headers: Record<string, string> = {
    ...upstream.headers,
    'Content-Type': req.headers['content-type'] || 'application/json',
  }

  // Forward relevant headers
  if (req.headers['accept']) headers['Accept'] = req.headers['accept']
  if (req.headers['mcp-protocol-version']) headers['MCP-Protocol-Version'] = req.headers['mcp-protocol-version']
  if (req.headers['mcp-session-id']) headers['mcp-session-id'] = req.headers['mcp-session-id']
  if (req.headers['x-hauska-dev-product']) headers['X-Hauska-Dev-Product'] = req.headers['x-hauska-dev-product']
  if (req.headers['x-hauska-install-id']) headers['X-Hauska-Install-Id'] = req.headers['x-hauska-install-id']

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (method === 'POST' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const upstreamRes = await fetch(targetUrl, fetchOptions)

    // Forward session headers from upstream
    const sessionId = upstreamRes.headers.get('mcp-session-id')
    if (sessionId) {
      res.setHeader('mcp-session-id', sessionId)
    }

    // Forward content type
    const contentType = upstreamRes.headers.get('content-type')
    if (contentType) {
      res.setHeader('Content-Type', contentType)
    }

    const text = await upstreamRes.text()
    res.status(upstreamRes.status).send(text)
  } catch (err) {
    res.status(502).json({ error: 'upstream error', message: err instanceof Error ? err.message : String(err) })
  }
}
