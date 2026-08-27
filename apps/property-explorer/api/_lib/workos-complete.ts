// WorkOS AuthKit Standalone Connect — external auth completion (P-87).
//
// Vercel env: WORKOS_API_KEY — WorkOS secret API key (sk_…). Required when
// WorkOS redirects MCP clients to /api/auth/mcp-login and the OIDC callback
// must POST https://api.workos.com/authkit/oauth2/complete before returning
// control to AuthKit. Set in Vercel project env for smartsite.cloud deploys.

const WORKOS_COMPLETE_URL = 'https://api.workos.com/authkit/oauth2/complete'

function trimEnv(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v && v.length > 0 ? v : undefined
}

export function workosApiKey(): string | undefined {
  return trimEnv('WORKOS_API_KEY')
}

export function splitDisplayName(displayName: string | undefined): {
  firstName?: string
  lastName?: string
} {
  const trimmed = displayName?.trim()
  if (!trimmed) return {}
  const space = trimmed.indexOf(' ')
  if (space <= 0) return { firstName: trimmed }
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim() || undefined,
  }
}

export interface WorkOsCompleteUser {
  id: string
  email: string | null
  displayName: string
}

export interface WorkOsCompleteResult {
  redirectUri: string
}

export async function completeWorkOsExternalAuth(
  params: {
    externalAuthId: string
    user: WorkOsCompleteUser
  },
  fetchImpl: typeof fetch = fetch,
): Promise<WorkOsCompleteResult> {
  const apiKey = workosApiKey()
  if (!apiKey) {
    throw new Error('WORKOS_API_KEY not configured')
  }
  const email = params.user.email?.trim()
  if (!email) {
    throw new Error('user email required for WorkOS completion')
  }
  const { firstName, lastName } = splitDisplayName(params.user.displayName)
  const body: Record<string, unknown> = {
    external_auth_id: params.externalAuthId,
    user: {
      id: params.user.id,
      email,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
    },
  }
  const res = await fetchImpl(WORKOS_COMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WorkOS complete failed: ${res.status} ${text}`)
  }
  const payload = (await res.json()) as { redirect_uri?: string }
  const redirectUri = payload.redirect_uri?.trim()
  if (!redirectUri) {
    throw new Error('WorkOS complete response missing redirect_uri')
  }
  return { redirectUri }
}

/** Alias for auth.ts import consistency. */
export const completeWorkosExternalAuth = completeWorkOsExternalAuth
