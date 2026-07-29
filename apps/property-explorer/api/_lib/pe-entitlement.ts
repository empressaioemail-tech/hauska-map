import { cortexApiUrl } from './oidc-config.js'

export type PeEntitlementTier = 'free' | 'paid'

export type PeEntitlementResult =
  | { ok: true; tier: PeEntitlementTier }
  | { ok: false; status: 401 | 402 | 503; message?: string }

/**
 * Full entitlement snapshot (R1 pinned contract, LOCK 2026-07-29). Unlike
 * fetchPeEntitlement (which maps free → 402 for the Pro-only exports), this
 * returns the raw snapshot the dossier/share paths need:
 *   - tenantId + userId — the sharer's OWNER SCOPE (embedded in v2 share
 *     tokens so the share view can fetch the sharer's saved dossier);
 *   - property.unlocked — the per-property entitlement (the R1 line: paid
 *     tier OR a $-property unlock both clear the dossier export gate).
 */
export interface PeEntitlementDetail {
  ok: true
  authenticated: boolean
  tier: PeEntitlementTier
  tenantId: string | null
  userId: string | null
  /** Present when parcelNodeId was passed and the user is authenticated. */
  propertyUnlocked: boolean | null
}

export type PeEntitlementDetailResult =
  | PeEntitlementDetail
  | { ok: false; status: 401 | 503; message?: string }

export async function fetchPeEntitlementDetail(
  sessionToken: string,
  parcelNodeId?: string,
): Promise<PeEntitlementDetailResult> {
  const qs = parcelNodeId
    ? `?parcelNodeId=${encodeURIComponent(parcelNodeId)}`
    : ''
  const url = `${cortexApiUrl()}/api/property-explorer/v1/entitlement${qs}`
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Accept: 'application/json',
      },
    })
    if (res.status === 401) {
      return { ok: false, status: 401, message: 'Session expired or invalid.' }
    }
    if (!res.ok) {
      return {
        ok: false,
        status: 503,
        message: `Entitlement check failed (${res.status}).`,
      }
    }
    const body = (await res.json().catch(() => ({}))) as {
      authenticated?: boolean
      tier?: PeEntitlementTier
      tenantId?: string
      userId?: string
      property?: { unlocked?: boolean }
    }
    return {
      ok: true,
      authenticated: body.authenticated === true,
      tier: body.tier === 'paid' ? 'paid' : 'free',
      tenantId: typeof body.tenantId === 'string' && body.tenantId ? body.tenantId : null,
      userId: typeof body.userId === 'string' && body.userId ? body.userId : null,
      propertyUnlocked:
        typeof body.property?.unlocked === 'boolean' ? body.property.unlocked : null,
    }
  } catch (err) {
    return {
      ok: false,
      status: 503,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function fetchPeEntitlement(sessionToken: string): Promise<PeEntitlementResult> {
  const url = `${cortexApiUrl()}/api/property-explorer/v1/entitlement`
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Accept: 'application/json',
      },
    })
    if (res.status === 401) {
      return { ok: false, status: 401, message: 'Session expired or invalid.' }
    }
    if (res.status === 402) {
      return { ok: false, status: 402, message: 'Pro entitlement required.' }
    }
    if (!res.ok) {
      return {
        ok: false,
        status: 503,
        message: `Entitlement check failed (${res.status}).`,
      }
    }
    const body = (await res.json()) as {
      entitlement?: { tier?: PeEntitlementTier }
      tier?: PeEntitlementTier
    }
    const tier = body.entitlement?.tier ?? body.tier ?? 'free'
    if (tier !== 'paid') {
      return { ok: false, status: 402, message: 'Pro entitlement required.' }
    }
    return { ok: true, tier: 'paid' }
  } catch (err) {
    return {
      ok: false,
      status: 503,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
