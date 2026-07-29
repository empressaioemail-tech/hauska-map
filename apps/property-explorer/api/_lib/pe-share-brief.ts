// Share-view R1 brief projection (Workbench W4 SHARE).
//
// WHY THIS EXISTS: cortex's POST /api/property-explorer/v1/research/brief is
// gated on a signed USER session (`requirePeAuthenticated` explicitly rejects
// service callers), so the anonymous share view cannot reach it — and must
// not: a share viewer has no session by design. But the R1 brief is a PURE
// projection of the same owner-free baked facet snapshot the ANONYMOUS facet
// endpoint (GET api/brokerage/v1/place/node/:id/facets → {facets, tier2})
// already serves. This module mirrors cortex `buildR1Brief`
// (legacy-design-tools artifacts/api-server/src/routes/propertyExplorer.ts) so
// the share view serves the exact R1 payload shape the brief tool renders —
// same sections, same runId derivation, same disclosure verbatims.
//
// CONTRACT SOURCE OF TRUTH: cortex buildR1Brief. If that mapping changes,
// change this to match. Drift is bounded by the client's defensive renderer
// (brief-view-model.ts renders unknown sections generically and never
// fabricates provenance).

type JsonRecord = Record<string, unknown>

export interface ShareBriefSection {
  id: 'zoning' | 'setbacks-envelope' | 'flood' | 'land-use'
  title: string
  data: unknown
  citations: string[]
}

export interface ShareBriefPayload {
  runId: string
  reportFamily: 'R1'
  mode: 'baked-facet-intel-v1'
  parcelNodeId: string
  brief: { sections: ShareBriefSection[]; disclosure: string[] }
  citations: string[]
  bakedAt: string | null
  source: 'baked-snapshot'
}

/** The property header block the share page renders above the brief. */
export interface SharePropertyHeader {
  parcelNodeId: string
  situsAddress: string | null
  countyName: string | null
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

/** Mirrors cortex urlsFrom — citation/source URL leaves only. */
function urlsFrom(value: unknown): string[] {
  const urls = new Set<string>()
  const visit = (candidate: unknown, key?: string): void => {
    if (typeof candidate === 'string') {
      if (
        key &&
        /(?:citation|source).*url|url.*(?:citation|source)/i.test(key) &&
        /^https?:\/\//i.test(candidate)
      ) {
        urls.add(candidate)
      }
      return
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item, key))
      return
    }
    const record = asRecord(candidate)
    if (record) {
      Object.entries(record).forEach(([nestedKey, nestedValue]) =>
        visit(nestedValue, nestedKey),
      )
    }
  }
  visit(value)
  return [...urls]
}

/** Mirrors cortex verbatimValues — payload-verbatim disclosure strings. */
function verbatimValues(value: unknown, keys: ReadonlySet<string>): string[] {
  const values = new Set<string>()
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }
    const record = asRecord(candidate)
    if (!record) return
    for (const [key, nested] of Object.entries(record)) {
      if (keys.has(key) && typeof nested === 'string' && nested.trim()) {
        values.add(nested)
      }
      visit(nested)
    }
  }
  visit(value)
  return [...values]
}

/** Mirrors cortex buildR1RunId (base64url parcel + bakedAt). */
export function buildShareR1RunId(parcelNodeId: string, bakedAt: string | null): string {
  return `pe-r1-${Buffer.from(parcelNodeId).toString('base64url')}.${Buffer.from(
    bakedAt ?? 'undated',
  ).toString('base64url')}`
}

/**
 * Build the R1-shaped brief payload from the anonymous facet snapshot
 * response ({facets, tier2, snapshotAt}) — the same inputs cortex's brief
 * route projects from.
 */
export function buildShareBriefPayload(opts: {
  parcelNodeId: string
  facets: unknown
  tier2: unknown
  snapshotAt: string | null
}): ShareBriefPayload {
  const root = asRecord(opts.facets) ?? {}
  const baseFacts = asRecord(root.baseFacts) ?? {}
  const envelope = root.envelope ?? null
  const tier2 = asRecord(opts.tier2)
  const sections: ShareBriefSection[] = [
    {
      id: 'zoning',
      title: 'Zoning',
      data: root.zoning ?? null,
      citations: urlsFrom(root.zoning),
    },
    {
      id: 'setbacks-envelope',
      title: 'Setbacks and buildable envelope',
      data: envelope,
      citations: urlsFrom(envelope),
    },
    {
      id: 'flood',
      title: 'Flood',
      data: tier2?.flood ?? null,
      citations: urlsFrom(tier2?.flood),
    },
    {
      id: 'land-use',
      title: 'Land use',
      data: baseFacts.landUse ?? null,
      citations: urlsFrom(baseFacts.landUse),
    },
  ]
  const disclosure = verbatimValues(
    { facets: opts.facets, tier2: opts.tier2 },
    new Set(['districtNote', 'disclosure', 'emptyReason']),
  )
  const bakedAt =
    typeof root.bakedAt === 'string' ? root.bakedAt : (opts.snapshotAt ?? null)
  return {
    runId: buildShareR1RunId(opts.parcelNodeId, bakedAt),
    reportFamily: 'R1',
    mode: 'baked-facet-intel-v1',
    parcelNodeId: opts.parcelNodeId,
    brief: { sections, disclosure },
    citations: [...new Set(sections.flatMap((section) => section.citations))],
    bakedAt,
    source: 'baked-snapshot',
  }
}

/** Extract the header block (address/county) from the same facet snapshot. */
export function sharePropertyHeader(
  parcelNodeId: string,
  facets: unknown,
): SharePropertyHeader {
  const root = asRecord(facets) ?? {}
  const baseFacts = asRecord(root.baseFacts) ?? {}
  const situs = baseFacts.situsAddress
  const county = root.countyName
  return {
    parcelNodeId,
    situsAddress: typeof situs === 'string' && situs.trim() ? situs : null,
    countyName: typeof county === 'string' && county.trim() ? county : null,
  }
}
