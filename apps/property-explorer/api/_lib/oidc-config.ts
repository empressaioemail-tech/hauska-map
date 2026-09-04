// Shared OIDC + session config for Property Explorer BFF routes.

export type OidcProvider = 'google' | 'microsoft'

export interface OidcProviderConfig {
  provider: OidcProvider
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  extraAuthorizeParams?: Record<string, string>
}

function trimEnv(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v && v.length > 0 ? v : undefined
}

export function oidcStateSecret(): string | undefined {
  return trimEnv('OIDC_STATE_SECRET')
}

export function peSessionExchangeSecret(): string | undefined {
  return trimEnv('PE_SESSION_EXCHANGE_SECRET') ?? trimEnv('SESSION_SECRET')
}

export function cortexApiUrl(): string {
  return (
    trimEnv('CORTEX_API_URL') ??
    'https://cortex-api-tds7av26va-uc.a.run.app'
  ).replace(/\/$/, '')
}

export function deployOrigin(req: { headers: Record<string, string | string[] | undefined> }): string {
  const protoHeader = req.headers['x-forwarded-proto']
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader ?? 'https'
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader ?? 'localhost'
  return `${proto}://${host}`
}

/**
 * Canonical origin for OAuth redirect_uri construction. When set
 * (PE_OIDC_REDIRECT_ORIGIN), every provider uses this host. Production
 * normally leaves this unset so redirect_uri follows the request host
 * (smartsite.cloud apex). Must match an Authorized redirect URI exactly.
 */
export function oidcRedirectOrigin(req: {
  headers: Record<string, string | string[] | undefined>
}): string {
  const pinned = trimEnv('PE_OIDC_REDIRECT_ORIGIN')
  if (pinned) return pinned.replace(/\/$/, '')
  return deployOrigin(req)
}

export function redirectUri(provider: OidcProvider, origin: string): string {
  return `${origin}/api/auth/${provider}/callback`
}

export function googleOidcConfig(): OidcProviderConfig | null {
  const clientId = trimEnv('GOOGLE_OIDC_CLIENT_ID')
  const clientSecret = trimEnv('GOOGLE_OIDC_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null
  return {
    provider: 'google',
    clientId,
    clientSecret,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['openid', 'email', 'profile'],
    extraAuthorizeParams: { access_type: 'online', prompt: 'select_account' },
  }
}

export function microsoftOidcConfig(): OidcProviderConfig | null {
  const clientId = trimEnv('MICROSOFT_OIDC_CLIENT_ID')
  const clientSecret = trimEnv('MICROSOFT_OIDC_CLIENT_SECRET')
  const tenant = trimEnv('MICROSOFT_OIDC_TENANT_ID') ?? 'common'
  if (!clientId || !clientSecret) return null
  return {
    provider: 'microsoft',
    clientId,
    clientSecret,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scopes: ['openid', 'email', 'profile', 'User.Read'],
  }
}

export function providerConfig(provider: OidcProvider): OidcProviderConfig | null {
  return provider === 'google' ? googleOidcConfig() : microsoftOidcConfig()
}

export function authConfigured(): {
  google: boolean
  microsoft: boolean
  email: boolean
} {
  return {
    google: googleOidcConfig() !== null && !!oidcStateSecret(),
    microsoft: microsoftOidcConfig() !== null && !!oidcStateSecret(),
    // Email (magic link, P-112) has no OIDC state/PKCE dance — its only BFF
    // precondition is the same secret every provider already needs to reach
    // Cortex's session-exchange family (peSessionExchangeSecret()). The
    // deeper precondition (Cortex's own RESEND_API_KEY) lives in a
    // different deploy/secret store this process cannot read, so it is not
    // mirrored into a second env var here — that would drift the moment one
    // side changed without the other (exactly the "capability reports as
    // missing" failure mode P-112's own scoping doc flags for Microsoft).
    // Instead Cortex enforces that precondition authoritatively at request
    // time and returns an honest "not configured" error the BFF passes
    // through — see handleEmailRequest in ../auth.ts.
    email: !!peSessionExchangeSecret(),
  }
}

export const PE_SESSION_COOKIE = 'pe_session'
