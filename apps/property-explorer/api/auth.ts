// Property Explorer OIDC BFF — Google + Microsoft PKCE, plus P-112 email
// magic-link (no Clerk, no Auth.js, no WorkOS as a sign-in broker — ruling
// `_decisions/2026-09-04_p112_auth_options_ruling.md`, doc_repo).
//
// Routes (via vercel rewrite /api/auth/(.*) -> /api/auth?upath=$1):
//   GET  /api/auth/status
//   GET  /api/auth/mcp-login          WorkOS External Sign-in URI (P-87)
//   GET  /api/auth/google/start
//   GET  /api/auth/google/callback
//   GET  /api/auth/microsoft/start
//   GET  /api/auth/microsoft/callback
//   POST /api/auth/email/request      P-112 — mint + email a magic link
//   GET  /api/auth/email/verify       P-112 — the link target; signs in
//   GET  /api/auth/session
//   POST /api/auth/logout
//
// Vercel env: WORKOS_API_KEY — WorkOS sk_… key for AuthKit Standalone Connect
// completion (POST api.workos.com/authkit/oauth2/complete) after MCP OIDC.
//
// The email/* routes hold no secrets of their own beyond the same
// PE_SESSION_EXCHANGE_SECRET every provider already needs to reach Cortex —
// they are thin proxies. Cortex owns the token table, the rate limit, the
// Resend call, and the account creation (same upsertPeOidcIdentity/
// completePeSignIn path OAuth uses), so a magic-link account is
// indistinguishable from an OAuth one everywhere downstream.
//
// WDLL items 12, 13, 16 — honest degrade when secrets missing.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  authConfigured,
  oidcRedirectOrigin,
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
  requestMagicLinkEmail,
  verifyMagicLinkToken,
} from './_lib/cortex-exchange.js'
import { completeWorkosExternalAuth } from './_lib/workos-complete.js'
import { renderMcpLoginPage } from './_lib/mcp-login-page.js'

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

function handleStatus(req: VercelRequest, res: VercelResponse): void {
  const cfg = authConfigured()
  const origin = oidcRedirectOrigin(req)
  const anyProvider = cfg.google || cfg.microsoft || cfg.email
  res.status(200).json({
    configured: cfg,
    anyProvider,
    message: anyProvider
      ? 'Sign-in available for configured providers.'
      : 'Sign-in not configured — browse anonymously.',
    redirectUris: {
      google: cfg.google ? redirectUri('google', origin) : null,
      microsoft: cfg.microsoft ? redirectUri('microsoft', origin) : null,
    },
  })
}

function handleMcpLogin(req: VercelRequest, res: VercelResponse): void {
  const externalAuthId =
    typeof req.query.external_auth_id === 'string'
      ? req.query.external_auth_id.trim()
      : ''
  if (!externalAuthId) {
    res.status(400).json({
      error: 'missing_external_auth_id',
      message: 'WorkOS Standalone Connect requires external_auth_id.',
    })
    return
  }
  const html = renderMcpLoginPage({
    externalAuthId,
    configured: authConfigured(),
  })
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html)
}

function applySessionRedirectCookies(
  res: VercelResponse,
  sessionToken: string,
  secure: boolean,
): void {
  setPeSessionCookie(res, sessionToken, secure)
  const clearOidc = `${oidcStateCookieName()}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0`
  const existing = res.getHeader('Set-Cookie')
  if (typeof existing === 'string') {
    res.setHeader('Set-Cookie', [existing, clearOidc])
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, clearOidc])
  } else {
    res.setHeader('Set-Cookie', clearOidc)
  }
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
  const origin = oidcRedirectOrigin(req)
  const externalAuthId =
    typeof req.query.external_auth_id === 'string'
      ? req.query.external_auth_id.trim()
      : undefined
  const { verifier, challenge } = generatePkcePair()
  const sealed = sealOidcState({
    provider,
    verifier,
    createdAt: Date.now(),
    ...(externalAuthId ? { externalAuthId } : {}),
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
  const origin = oidcRedirectOrigin(req)
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

    const secure = isProduction()

    if (pending.externalAuthId) {
      try {
        const { redirectUri: workosRedirectUri } = await completeWorkosExternalAuth({
          externalAuthId: pending.externalAuthId,
          user: {
            id: session.userId,
            email: session.email ?? email ?? null,
            displayName: session.displayName || displayName || '',
          },
        })
        applySessionRedirectCookies(res, session.token, secure)
        res.statusCode = 302
        res.setHeader('Location', workosRedirectUri)
        res.end()
        return
      } catch (err) {
        res.status(502).json({
          error: 'workos_complete_failed',
          message: err instanceof Error ? err.message : String(err),
        })
        return
      }
    }

    // Set cookie + Location explicitly so Set-Cookie survives the redirect
    // (res.redirect alone has dropped cookies on some Vercel runtimes).
    applySessionRedirectCookies(res, session.token, secure)
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

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s)
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function jsonBody(req: VercelRequest): Record<string, unknown> {
  const raw = typeof req.body === 'string' ? safeParse(req.body) : req.body
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

/**
 * P-112 email leg — POST /api/auth/email/request. Proxies to Cortex, which
 * owns the token table, the rate limit, and the Resend call. Never a fake
 * success: a send failure or an unconfigured deploy comes back as an honest
 * non-2xx the caller must show, not a "check your email" message that
 * wasn't true.
 */
async function handleEmailRequest(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = jsonBody(req)
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email) {
    res.status(400).json({ error: 'invalid_input', message: 'email is required' })
    return
  }
  try {
    const result = await requestMagicLinkEmail(email)
    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        message: result.message,
        retryAfterSeconds: result.retryAfterSeconds,
      })
      return
    }
    res.status(200).json({ ok: true, expiresAt: result.expiresAt })
  } catch (err) {
    res.status(502).json({
      error: 'magic_link_request_failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * P-112 email leg — GET /api/auth/email/verify?token=... (the link target
 * the user clicks). Mirrors handleCallback's shape: verify, set the same
 * pe_session cookie an OAuth sign-in sets, redirect signed in. Each
 * rejection reason maps to a distinct `auth_error` so the app can show an
 * honest, specific message instead of one generic failure.
 */
async function handleEmailVerify(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token : null
  if (!token) {
    res.redirect(302, '/?auth_error=email_link_missing_token')
    return
  }
  try {
    const result = await verifyMagicLinkToken(token)
    if (!result.ok) {
      res.redirect(302, `/?auth_error=email_link_${result.error}`)
      return
    }
    const secure = isProduction()
    applySessionRedirectCookies(res, result.token, secure)
    res.statusCode = 302
    res.setHeader('Location', '/?signed_in=1')
    res.end()
  } catch (err) {
    res.status(502).json({
      error: 'magic_link_verify_failed',
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

  if (parts[0] === 'mcp-login' && method === 'GET') {
    handleMcpLogin(req, res)
    return
  }

  if (parts[0] === 'email' && parts[1] === 'request' && method === 'POST') {
    await handleEmailRequest(req, res)
    return
  }

  if (parts[0] === 'email' && parts[1] === 'verify' && method === 'GET') {
    await handleEmailVerify(req, res)
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
