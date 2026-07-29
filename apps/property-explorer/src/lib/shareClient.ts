// Share-link client — mints share links via POST /api/pe-share (Workbench W4).
//
// Auth is the export entitlement class: 401 → sign-in, 402 → paywall, 503
// sharing_not_configured → honest unconfigured notice. The minted link
// ({url, expiresAt}) is per-property persisted by the Share tool through the
// chassis store.

export interface MintedShareLink {
  url: string
  expiresAt: string | null
}

export type ShareMintOutcome =
  | { kind: 'ready'; link: MintedShareLink }
  | { kind: 'sign-in' }
  | { kind: 'paywall'; message: string }
  | { kind: 'not-configured'; message: string }
  | { kind: 'message'; text: string }
  | { kind: 'unreachable' }

export const SHARE_PAYWALL_MESSAGE =
  'Sharing a property analysis link is part of the paid tier (same entitlement as exports). Sign in and upgrade to Pro to share.'

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
    if (res.status === 402) {
      return { kind: 'paywall', message: body.message ?? SHARE_PAYWALL_MESSAGE }
    }
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
