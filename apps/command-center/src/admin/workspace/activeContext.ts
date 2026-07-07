// apps/command-center/src/admin/workspace/activeContext.ts
//
// Parse and serialize the reserved hash params for workspace-wide active context
// (addr, apn, eng, j, lat, lng). Read/write from localStorage as backup, ensuring
// the active parcel persists across reloads and is deep-linkable.

import type { ActiveContext } from '@empressaio/tile-shell'

const STORAGE_KEY = 'cc-active-context'

// Reserved context param keys (MUST NOT collide with existing panel params like `id`)
export const CONTEXT_PARAM_KEYS = ['addr', 'apn', 'eng', 'j', 'lat', 'lng'] as const

/**
 * Parse active context from URL hash params.
 * Returns partial ActiveContext with only the fields present in the hash.
 */
export function parseContextFromHash(): Partial<ActiveContext> | null {
  if (typeof window === 'undefined') return null
  
  const hash = window.location.hash || ''
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (!body) return null

  const segments = body.split('&')
  const ctx: Partial<ActiveContext> = {}
  let hasContext = false

  for (const seg of segments) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    const k = decodeURIComponent(seg.slice(0, eq))
    const v = decodeURIComponent(seg.slice(eq + 1))
    
    switch (k) {
      case 'addr':
        ctx.address = v
        hasContext = true
        break
      case 'apn':
        ctx.apn = v
        hasContext = true
        break
      case 'eng':
        ctx.engagementId = v
        hasContext = true
        break
      case 'j':
        ctx.jurisdictionId = v
        hasContext = true
        break
      case 'lat':
        const lat = parseFloat(v)
        if (!isNaN(lat)) {
          ctx.lat = lat
          hasContext = true
        }
        break
      case 'lng':
        const lng = parseFloat(v)
        if (!isNaN(lng)) {
          ctx.lng = lng
          hasContext = true
        }
        break
    }
  }

  return hasContext ? ctx : null
}

/**
 * Serialize active context to hash params.
 * Returns an object of key-value pairs for the reserved context params.
 */
export function serializeContextToHash(ctx: Partial<ActiveContext> | null): Record<string, string> {
  if (!ctx) return {}

  const params: Record<string, string> = {}
  if (ctx.address) params.addr = ctx.address
  if (ctx.apn) params.apn = ctx.apn
  if (ctx.engagementId) params.eng = ctx.engagementId
  if (ctx.jurisdictionId) params.j = ctx.jurisdictionId
  if (ctx.lat !== undefined) params.lat = String(ctx.lat)
  if (ctx.lng !== undefined) params.lng = String(ctx.lng)
  
  return params
}

/**
 * Load active context from localStorage.
 */
export function loadContextFromStorage(): Partial<ActiveContext> | null {
  if (typeof window === 'undefined') return null
  
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Validate that it's a plausible context object
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Partial<ActiveContext>
    }
  } catch {
    // Invalid JSON, ignore
  }
  return null
}

/**
 * Save active context to localStorage.
 */
export function saveContextToStorage(ctx: Partial<ActiveContext> | null): void {
  if (typeof window === 'undefined') return
  
  if (!ctx || Object.keys(ctx).length === 0) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx))
  }
}

/**
 * Update the URL hash with new context params, preserving non-context params.
 */
export function updateHashWithContext(ctx: Partial<ActiveContext> | null): void {
  if (typeof window === 'undefined') return

  const hash = window.location.hash || ''
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  
  // Parse existing hash params
  const segments = body.split('&')
  const existingParams: Record<string, string> = {}
  
  for (const seg of segments) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    const k = decodeURIComponent(seg.slice(0, eq))
    const v = decodeURIComponent(seg.slice(eq + 1))
    // Only keep non-context params
    if (!CONTEXT_PARAM_KEYS.includes(k as any)) {
      existingParams[k] = v
    }
  }

  // Merge with new context params
  const contextParams = serializeContextToHash(ctx)
  const allParams = { ...existingParams, ...contextParams }

  // Rebuild hash
  const newSegments: string[] = []
  for (const [k, v] of Object.entries(allParams)) {
    if (v !== undefined && v !== null && v !== '') {
      newSegments.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
  }

  const newHash = newSegments.length > 0 ? `#${newSegments.join('&')}` : ''
  if (window.location.hash !== newHash) {
    window.location.hash = newHash
  }
}
