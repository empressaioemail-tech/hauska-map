import {
  cortexApiUrl,
  peSessionExchangeSecret,
  type OidcProvider,
} from './oidc-config.js'

export interface ExchangeIdentity {
  provider: OidcProvider
  subject: string
  email?: string
  displayName?: string
}

export interface ExchangeResult {
  token: string
  userId: string
  email: string | null
  displayName: string
  entitlement: { tier: 'free' | 'paid' }
}

export async function exchangeSessionWithCortex(
  identity: ExchangeIdentity,
): Promise<ExchangeResult> {
  const secret = peSessionExchangeSecret()
  if (!secret) {
    throw new Error('PE_SESSION_EXCHANGE_SECRET not configured')
  }
  const res = await fetch(`${cortexApiUrl()}/api/auth/session-exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(identity),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`session-exchange failed: ${res.status} ${text}`)
  }
  return (await res.json()) as ExchangeResult
}

export async function fetchIdTokenClaims(
  idToken: string,
): Promise<{ sub: string; email?: string; name?: string }> {
  const parts = idToken.split('.')
  if (parts.length < 2) throw new Error('invalid id_token')
  const payload = JSON.parse(
    Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  ) as { sub?: string; email?: string; name?: string }
  if (!payload.sub) throw new Error('id_token missing sub')
  return { sub: payload.sub, email: payload.email, name: payload.name }
}

export async function exchangeCodeForTokens(
  cfg: {
    tokenUrl: string
    clientId: string
    clientSecret: string
  },
  params: {
    code: string
    redirectUri: string
    verifier: string
  },
): Promise<{ id_token?: string; access_token?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier,
  })
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`token exchange failed: ${res.status} ${text}`)
  }
  return (await res.json()) as { id_token?: string; access_token?: string }
}

export async function fetchMicrosoftProfile(
  accessToken: string,
): Promise<{ id: string; mail?: string; userPrincipalName?: string; displayName?: string }> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`microsoft profile fetch failed: ${res.status}`)
  }
  return (await res.json()) as {
    id: string
    mail?: string
    userPrincipalName?: string
    displayName?: string
  }
}
