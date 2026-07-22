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

export function authConfigured(): { google: boolean; microsoft: boolean } {
  return {
    google: googleOidcConfig() !== null && !!oidcStateSecret(),
    microsoft: microsoftOidcConfig() !== null && !!oidcStateSecret(),
  }
}

export const PE_SESSION_COOKIE = 'pe_session'
