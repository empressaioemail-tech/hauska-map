import { cortexApiUrl } from './oidc-config.js'

export type PeEntitlementTier = 'free' | 'paid'

/**
 * P-104. THE STUDIO ANSWER, AS THE SERVER COMPUTED IT — three states, never
 * two, because "the server said no" and "the server did not say" are
 * different facts and only one of them is a payment problem.
 *
 *   true  — this account holds Studio or Team (or dev role, which the server
 *           maps to team). Serve the Studio deliverables.
 *   false — the server looked and this account does not hold Studio. A $49
 *           Solo subscriber is `tier: 'paid'` and lands here.
 *   null  — the `/entitlement` body carried no `studioGranted` key at all, so
 *           this BFF is talking to a cortex-api older than P-104. UNMEASURED.
 *           Refuse, and say THAT, rather than showing a paying Studio
 *           customer a paywall for what is a deploy-order problem.
 *
 * The predicate itself is NOT re-implemented here. Three copies of
 * `subscriptionTierGrantsStudio` already exist (api-server `peEntitlement.ts`,
 * `smartsite-mcp/entitlement.ts`, and the client `entitlementClient.ts`); a
 * fourth in the BFF is the defect, not the fix. The BFF consumes the answer.
 */
export type PeStudioGrant = boolean | null

export type PeEntitlementResult =
  | { ok: true; tier: PeEntitlementTier; studioGranted: PeStudioGrant }
  | { ok: false; status: 401 | 402 | 503; message?: string }

/**
 * Reads `studioGranted` off an `/entitlement` body. A non-boolean — key
 * absent, null, or any other shape — is UNMEASURED, never a defaulted false.
 */
export function parseStudioGranted(value: unknown): PeStudioGrant {
  return typeof value === 'boolean' ? value : null
}

/**
 * Full entitlement snapshot (R1 pinned contract, LOCK 2026-07-29). Unlike
 * fetchPeEntitlement (which maps free → 402 for the Studio exports), this
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
  /** P-104 — the server's computed Studio answer. See {@link PeStudioGrant}. */
  studioGranted: PeStudioGrant
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
      studioGranted?: unknown
      tenantId?: string
      userId?: string
      property?: { unlocked?: boolean }
    }
    return {
      ok: true,
      authenticated: body.authenticated === true,
      tier: body.tier === 'paid' ? 'paid' : 'free',
      studioGranted: parseStudioGranted(body.studioGranted),
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
      entitlement?: { tier?: PeEntitlementTier; studioGranted?: unknown }
      tier?: PeEntitlementTier
      studioGranted?: unknown
    }
    const tier = body.entitlement?.tier ?? body.tier ?? 'free'
    // P-104: read the Studio answer from whichever envelope carried the tier,
    // so a nested body cannot silently degrade to UNMEASURED while its tier
    // reads fine.
    const studioGranted = parseStudioGranted(
      body.entitlement !== undefined ? body.entitlement.studioGranted : body.studioGranted,
    )
    if (tier !== 'paid') {
      return { ok: false, status: 402, message: 'Pro entitlement required.' }
    }
    return { ok: true, tier: 'paid', studioGranted }
  } catch (err) {
    return {
      ok: false,
      status: 503,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
