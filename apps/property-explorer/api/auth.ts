// Property Explorer OIDC BFF — Google + Microsoft PKCE (no Clerk, no Auth.js).
//
// Routes (via vercel rewrite /api/auth/(.*) -> /api/auth?upath=$1):
//   GET  /api/auth/status
//   GET  /api/auth/google/start
//   GET  /api/auth/google/callback
//   GET  /api/auth/microsoft/start
//   GET  /api/auth/microsoft/callback
//   GET  /api/auth/session
//   POST /api/auth/logout
//
// WDLL items 12, 13, 16 — honest degrade when secrets missing.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  authConfigured,
  deployOrigin,
  oidcStateSecret,
  providerConfig,
  redirectUri,
  type OidcProvider,
} from './_lib/oidc-config.js'
import {
  generatePkcePair,
  oidcStateCookieName,
  oidcStateCookieOpts,
  sealOidcState,
  unsealPayload,
} from './_lib/pkce.js'
import {
  clearPeSessionCookie,
  isProduction,
  readPeSessionCookie,
  setPeSessionCookie,
} from './_lib/session-cookie.js'
import {
  exchangeCodeForTokens,
  exchangeSessionWithCortex,
  fetchIdTokenClaims,
  fetchMicrosoftProfile,
} from './_lib/cortex-exchange.js'

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie ?? ''
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function notConfigured(res: VercelResponse, provider: OidcProvider): void {
  res.status(503).json({
    error: 'sign_in_not_configured',
    message: `${provider} OIDC is not configured on this deploy. Missing client credentials or OIDC_STATE_SECRET.`,
    provider,
  })
}

function handleStatus(_req: VercelRequest, res: VercelResponse): void {
  const cfg = authConfigured()
  res.status(200).json({
    configured: cfg,
    anyProvider: cfg.google || cfg.microsoft,
    message:
      cfg.google || cfg.microsoft
        ? 'Sign-in available for configured providers.'
        : 'Sign-in not configured — browse anonymously.',
  })
}

function handleStart(req: VercelRequest, res: VercelResponse, provider: OidcProvider): void {
  if (!oidcStateSecret()) {
    notConfigured(res, provider)
    return
  }
  const cfg = providerConfig(provider)
  if (!cfg) {
    notConfigured(res, provider)
    return
  }
  const origin = deployOrigin(req)
  const { verifier, challenge } = generatePkcePair()
  const sealed = sealOidcState({
    provider,
    verifier,
    createdAt: Date.now(),
  })
  if (!sealed) {
    notConfigured(res, provider)
    return
  }
  const secure = isProduction()
  const opts = oidcStateCookieOpts(secure)
  const parts = [
    `${oidcStateCookieName()}=${encodeURIComponent(sealed)}`,
    `Path=${opts.path}`,
    'HttpOnly',
    `SameSite=${opts.sameSite === 'lax' ? 'Lax' : opts.sameSite}`,
    `Max-Age=${Math.floor(opts.maxAge / 1000)}`,
  ]
  if (opts.secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    redirect_uri: redirectUri(provider, origin),
    state: sealed,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(cfg.extraAuthorizeParams ?? {}),
  })
  res.redirect(302, `${cfg.authorizeUrl}?${params.toString()}`)
}

async function handleCallback(
  req: VercelRequest,
  res: VercelResponse,
  provider: OidcProvider,
): Promise<void> {
  const error = typeof req.query.error === 'string' ? req.query.error : null
  if (error) {
    res.redirect(302, `/?auth_error=${encodeURIComponent(error)}`)
    return
  }
  const code = typeof req.query.code === 'string' ? req.query.code : null
  const stateParam = typeof req.query.state === 'string' ? req.query.state : null
  if (!code) {
    res.status(400).json({ error: 'missing_code' })
    return
  }
  const cookies = parseCookies(req)
  const sealed = cookies[oidcStateCookieName()] ?? stateParam
  if (!sealed) {
    res.status(400).json({ error: 'missing_oidc_state' })
    return
  }
  const pending = unsealPayload(sealed)
  if (!pending || pending.provider !== provider) {
    res.status(400).json({ error: 'invalid_oidc_state' })
    return
  }
  const cfg = providerConfig(provider)
  if (!cfg) {
    notConfigured(res, provider)
    return
  }
  const origin = deployOrigin(req)
  try {
    const tokens = await exchangeCodeForTokens(cfg, {
      code,
      redirectUri: redirectUri(provider, origin),
      verifier: pending.verifier,
    })
    let subject: string
    let email: string | undefined
    let displayName: string | undefined

    if (provider === 'google') {
      if (!tokens.id_token) throw new Error('missing id_token')
      const claims = await fetchIdTokenClaims(tokens.id_token)
      subject = claims.sub
      email = claims.email
      displayName = claims.name
    } else {
      if (!tokens.access_token) throw new Error('missing access_token')
      const profile = await fetchMicrosoftProfile(tokens.access_token)
      subject = profile.id
      email = profile.mail ?? profile.userPrincipalName
      displayName = profile.displayName
    }

    const session = await exchangeSessionWithCortex({
      provider,
      subject,
      email,
      displayName,
    })
    // Set cookie + Location explicitly so Set-Cookie survives the redirect
    // (res.redirect alone has dropped cookies on some Vercel runtimes).
    const secure = isProduction()
    setPeSessionCookie(res, session.token, secure)
    const clearOidc = `${oidcStateCookieName()}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`
    const existing = res.getHeader('Set-Cookie')
    if (typeof existing === 'string') {
      res.setHeader('Set-Cookie', [existing, clearOidc])
    } else if (Array.isArray(existing)) {
      res.setHeader('Set-Cookie', [...existing, clearOidc])
    } else {
      res.setHeader('Set-Cookie', clearOidc)
    }
    res.statusCode = 302
    res.setHeader('Location', '/?signed_in=1')
    res.end()
  } catch (err) {
    res.status(502).json({
      error: 'auth_callback_failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function handleSession(req: VercelRequest, res: VercelResponse): void {
  const token = readPeSessionCookie(req.headers.cookie)
  if (!token) {
    res.status(200).json({ authenticated: false })
    return
  }
  // Token is minted by Cortex; BFF stores opaque HMAC token only.
  res.status(200).json({ authenticated: true, hasSession: true })
}

function handleLogout(_req: VercelRequest, res: VercelResponse): void {
  clearPeSessionCookie(res)
  res.status(200).json({ ok: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { upath } = req.query
  const upathStr = Array.isArray(upath) ? upath.join('/') : upath ?? ''
  const parts = upathStr.split('/').filter(Boolean)
  const method = req.method ?? 'GET'

  if (parts.length === 0 || parts[0] === 'status') {
    if (method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }
    handleStatus(req, res)
    return
  }

  if (parts[0] === 'session' && method === 'GET') {
    handleSession(req, res)
    return
  }

  if (parts[0] === 'logout' && method === 'POST') {
    handleLogout(req, res)
    return
  }

  const provider = parts[0]
  const action = parts[1]
  if (provider !== 'google' && provider !== 'microsoft') {
    res.status(404).json({ error: 'not_found' })
    return
  }

  if (action === 'start' && method === 'GET') {
    handleStart(req, res, provider)
    return
  }

  if (action === 'callback' && method === 'GET') {
    await handleCallback(req, res, provider)
    return
  }

  res.status(404).json({ error: 'not_found' })
}
