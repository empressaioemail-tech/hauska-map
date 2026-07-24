import { cortexApiUrl } from './oidc-config.js'

export type PeEntitlementTier = 'free' | 'paid'

export type PeEntitlementResult =
  | { ok: true; tier: PeEntitlementTier }
  | { ok: false; status: 401 | 402 | 503; message?: string }

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
