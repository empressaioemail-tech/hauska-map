// panelHash.ts — the Command Center hash format, with NO module imports.
//
// `useActivePanel.tsx` imports PanelRegistry, which imports every panel Component,
// which pulls @hauska/map-renderer's stylesheet into anything that touches it. That is
// fine for the shell and fatal for a leaf panel that only needs to WRITE a hash: a
// single import of the hook module dragged the whole registry into a unit test and the
// suite failed on `Unknown file extension ".css"`. The same reason PanelRegistry.contract.ts
// exists.
//
// So the hash format lives here, alone, and `useActivePanel` re-exports it. ONE
// implementation, two import paths — never two implementations that can drift
// (DEV_PROCESS 2.4: when one rule has two implementations, the divergence IS the bug).

export const PANEL_HASH_PREFIX = 'panel='

/** Build a canonical hash string for a panel + optional params. */
export function buildPanelHash(panelId: string, params?: Record<string, string>): string {
  let hash = `#${PANEL_HASH_PREFIX}${panelId}`
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        hash += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`
      }
    }
  }
  return hash
}

/**
 * Read one param off the current hash WITHOUT importing PanelRegistry.
 *
 * `useActivePanel` already parses the hash, but importing that hook drags the whole
 * panel registry (and map-renderer's stylesheet) into any leaf that only wants to know
 * which subtab it is on. The parse below is the same format, restricted to reading a
 * single key, so a panel can be sub-addressable from a URL without that cost.
 */
export function readPanelHashParam(key: string, hash?: string): string | null {
  const raw = hash ?? (typeof window === 'undefined' ? '' : window.location.hash || '')
  const body = raw.startsWith('#') ? raw.slice(1) : raw
  if (!body) return null
  for (const seg of body.split('&').slice(1)) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    if (decodeURIComponent(seg.slice(0, eq)) === key) return decodeURIComponent(seg.slice(eq + 1))
  }
  return null
}

/**
 * Write one param onto the current hash, preserving the panel id and every other
 * param. Returns the next hash string; the caller assigns it, so this stays testable
 * without a DOM.
 */
export function withPanelHashParam(hash: string, key: string, value: string | null): string {
  const body = (hash.startsWith('#') ? hash.slice(1) : hash) || ''
  const segments = body ? body.split('&') : []
  const head = segments[0] ?? ''
  const kept: string[] = []
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    if (decodeURIComponent(seg.slice(0, eq)) === key) continue
    kept.push(seg)
  }
  if (value != null && value !== '') kept.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  return `#${[head, ...kept].filter(Boolean).join('&')}`
}
