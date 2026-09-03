import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchPeEntitlementDetail } from './_lib/pe-entitlement.js'
import { readPeSessionCookie } from './_lib/session-cookie.js'

/**
 * Property Explorer GTM BFF.
 *
 * `consent` and `events` are anonymous-safe: the browser supplies its own
 * install id and this function only attaches the service key.
 *
 * `share-attribution` and `account-activation` (P-100 items 3 and 4) are
 * ACCOUNT-scoped and therefore NOT anonymous-safe. Their subject is a user
 * id, and a user id that arrived from a browser is a claim rather than a
 * fact. So for those two paths this function reads the PE session cookie,
 * resolves the account through the entitlement detail route, and forwards the
 * id under a key only a service caller can set. If the session does not
 * resolve, the request is refused with 401 — never forwarded with whatever
 * the body happened to contain.
 *
 * This is the same trust model `api/pe-share.ts` already uses to resolve a
 * grantor before minting a grant row, and it is why the attribution route on
 * cortex is service-token only.
 */

const ALLOWED = new Set([
  'consent',
  'events',
  'share-attribution',
  'account-activation',
])

/** Paths whose subject is an account and which must never trust the body. */
const SESSION_SCOPED: Record<string, string> = {
  'share-attribution': 'sessionRecipientUserId',
  'account-activation': 'sessionOwnerUserId',
}

/**
 * Keys that assert an identity. Refused here as well as on cortex — a caller
 * that reaches the BFF with one gets the same answer it would get from the
 * route behind it, so the two cannot drift into disagreeing about what the
 * wire allows. The duplication is the divergence risk; a shared test pins
 * both lists to the same set.
 */
export const CLIENT_ASSERTED_IDENTITY_KEYS = [
  'grantorUserId',
  'grantor_user_id',
  'sharerUserId',
  'sharer_user_id',
  'referredBy',
  'referred_by',
  'attributedTo',
  'attributed_to',
  'referrerUserId',
  'referrer_user_id',
  'recipientUserId',
  'recipient_user_id',
  'ownerUserId',
  'owner_user_id',
  'sessionRecipientUserId',
  'sessionOwnerUserId',
]

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s)
    return v !== null && typeof v === 'object'
      ? (v as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * The upstream path for a BFF path. Pure so the mapping is testable: a typo
 * here would 404 silently against cortex and read as "the event did not
 * happen" rather than "the proxy pointed at nothing".
 */
export function cortexPathFor(path: string): string {
  return path === 'consent' || path === 'events'
    ? `property-explorer/${path}`
    : path
}

/** Pure: does this body assert an identity, and which key. */
export function assertedIdentityKey(
  body: Record<string, unknown>,
): string | null {
  for (const k of CLIENT_ASSERTED_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, k)) return k
  }
  return null
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const pathRaw = req.query.path
  const path = (Array.isArray(pathRaw) ? pathRaw[0] : pathRaw)?.trim()
  if (!path || !ALLOWED.has(path)) {
    res.status(400).json({ error: 'invalid path' })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const cortexUrl =
    process.env.CORTEX_API_URL?.trim() ||
    'https://cortex-api-tds7av26va-uc.a.run.app'
  const key = process.env.CORTEX_SERVICE_API_KEY?.trim()
  if (!key) {
    res.status(503).json({
      error: 'proxy not configured',
      missing: 'CORTEX_SERVICE_API_KEY',
    })
    return
  }

  const rawBody = (
    typeof req.body === 'string' ? safeParse(req.body) : req.body
  ) as Record<string, unknown> | null
  let body: Record<string, unknown> = rawBody ?? {}

  const sessionKey = SESSION_SCOPED[path]
  if (sessionKey) {
    const asserted = assertedIdentityKey(body)
    if (asserted) {
      res.status(400).json({
        error: 'client_asserted_identity',
        key: asserted,
        message:
          'Identity is resolved from the session and from the grant row. A body that names one is refused, never ignored.',
      })
      return
    }

    const token = readPeSessionCookie(req.headers.cookie)
    const detail = token ? await fetchPeEntitlementDetail(token) : null
    if (!detail?.ok || !detail.userId) {
      res.status(401).json({
        error: 'authentication_required',
        message: 'Sign in before recording an account-scoped event.',
      })
      return
    }
    body = { ...body, [sessionKey]: detail.userId }
  }

  const target = `${cortexUrl.replace(/\/$/, '')}/api/brokerage/v1/gtm/${cortexPathFor(path)}`

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = await upstream.text()
    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    res.status(upstream.status).send(text)
  } catch (err) {
    res.status(502).json({
      error: 'upstream error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
