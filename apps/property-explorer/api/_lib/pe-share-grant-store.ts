// Share-grant persistence seam. Production talks to cortex (LDT Neon).
// Tests inject a memory store. A missing or failing store is a refuse, not a
// hash-only mint.

import { cortexApiUrl } from './oidc-config.js'
import type { ShareGrantRow } from './pe-share-grant.js'
import { isShareGrantId } from './pe-share-grant.js'

export interface ShareGrantStore {
  insert(row: ShareGrantRow): Promise<ShareGrantRow>
  getById(id: string): Promise<ShareGrantRow | null>
  revoke(id: string, revokedAt: string): Promise<ShareGrantRow | null>
}

export function createMemoryShareGrantStore(
  seed: Iterable<ShareGrantRow> = [],
): ShareGrantStore {
  const rows = new Map<string, ShareGrantRow>()
  for (const row of seed) rows.set(row.id, { ...row })
  return {
    async insert(row) {
      if (rows.has(row.id)) throw new Error('grant_id_collision')
      const copy = { ...row }
      rows.set(row.id, copy)
      return copy
    },
    async getById(id) {
      return rows.get(id) ?? null
    },
    async revoke(id, revokedAt) {
      const row = rows.get(id)
      if (!row) return null
      const next = { ...row, revokedAt }
      rows.set(id, next)
      return next
    },
  }
}

function readGrantRow(body: unknown): ShareGrantRow | null {
  if (body === null || typeof body !== 'object') return null
  const rec = body as Record<string, unknown>
  if (
    !isShareGrantId(rec.id) ||
    typeof rec.grantorUserId !== 'string' ||
    typeof rec.grantorTenantId !== 'string' ||
    typeof rec.parcelNodeId !== 'string' ||
    typeof rec.createdAt !== 'string' ||
    typeof rec.expiresAt !== 'string'
  ) {
    return null
  }
  return {
    id: rec.id,
    grantorUserId: rec.grantorUserId,
    grantorTenantId: rec.grantorTenantId,
    parcelNodeId: rec.parcelNodeId,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    revokedAt: typeof rec.revokedAt === 'string' ? rec.revokedAt : null,
  }
}

export function createCortexShareGrantStore(opts: {
  serviceKey: string
  fetchImpl?: typeof fetch
  cortexUrl?: string
}): ShareGrantStore {
  const fetchImpl = opts.fetchImpl ?? fetch
  const base = `${(opts.cortexUrl ?? cortexApiUrl()).replace(/\/$/, '')}/api/property-explorer/v1/internal/share-grants`
  const headers = {
    Authorization: `Bearer ${opts.serviceKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  return {
    async insert(row) {
      const res = await fetchImpl(base, {
        method: 'POST',
        headers,
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error(`grant_insert_${res.status}`)
      const written = readGrantRow(await res.json().catch(() => null))
      if (!written || written.id !== row.id) throw new Error('grant_insert_echo_mismatch')
      return written
    },
    async getById(id) {
      if (!isShareGrantId(id)) return null
      const res = await fetchImpl(`${base}/${encodeURIComponent(id)}`, {
        headers: { Authorization: headers.Authorization, Accept: headers.Accept },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`grant_get_${res.status}`)
      return readGrantRow(await res.json().catch(() => null))
    },
    async revoke(id, revokedAt) {
      if (!isShareGrantId(id)) return null
      const res = await fetchImpl(`${base}/${encodeURIComponent(id)}/revoke`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ revokedAt }),
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`grant_revoke_${res.status}`)
      return readGrantRow(await res.json().catch(() => null))
    },
  }
}

export function productionShareGrantStore(): ShareGrantStore | null {
  const key = process.env.CORTEX_SERVICE_API_KEY?.trim()
  if (!key) return null
  return createCortexShareGrantStore({ serviceKey: key })
}
