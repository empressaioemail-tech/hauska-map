// Share-link client — mints share links via POST /api/pe-share (Workbench W4).
//
// Auth: session required; share mint is FREE per canon. 401 → sign-in,
// 503 sharing_not_configured → honest unconfigured notice. Current
// pe-share.ts cannot emit 402 (export entitlement is not a mint gate).
// A 402 from a leftover backend is treated as a generic message, not a
// product paywall. The minted link ({url, expiresAt}) is per-property
// persisted by the Share tool through the chassis store.

export interface MintedShareLink {
  url: string
  expiresAt: string | null
}

export type ShareMintOutcome =
  | { kind: 'ready'; link: MintedShareLink }
  | { kind: 'sign-in' }
  | { kind: 'not-configured'; message: string }
  | { kind: 'message'; text: string }
  | { kind: 'unreachable' }

export async function mintShareLink(
  parcelNodeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShareMintOutcome> {
  try {
    const res = await fetchImpl('/api/pe-share', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcelNodeId }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      url?: unknown
      expiresAt?: unknown
      error?: string
      message?: string
    }
    if (res.status === 401) return { kind: 'sign-in' }
    if (res.status === 503 && body.error === 'sharing_not_configured') {
      return {
        kind: 'not-configured',
        message:
          body.message ?? 'Sharing is not configured on this deployment yet.',
      }
    }
    if (res.ok && typeof body.url === 'string' && body.url) {
      return {
        kind: 'ready',
        link: {
          url: body.url,
          expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
        },
      }
    }
    return {
      kind: 'message',
      text: body.message ?? `Share request returned ${res.status}.`,
    }
  } catch {
    return { kind: 'unreachable' }
  }
}
