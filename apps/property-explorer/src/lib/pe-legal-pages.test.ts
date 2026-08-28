/**
 * P-88 item 21 / B3 — /privacy and /terms must be real HTML, not the SPA shell.
 * A curl-without-JS reviewer reads the first response body. Vite copies
 * public/*.html into dist/, and vercel.json must rewrite these paths before
 * the SPA catch-all.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PUBLIC = resolve(__dirname, '../../public')
const PRIVACY = readFileSync(resolve(PUBLIC, 'privacy.html'), 'utf8')
const TERMS = readFileSync(resolve(PUBLIC, 'terms.html'), 'utf8')
const VERCEL = readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')

const HOMEPAGE_TITLE = 'Smart Site — Explore your property'
const HOMEPAGE_META = 'Explore Central Texas parcels'

function paragraphCount(html: string): number {
  return (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? []).length
}

function looksLikeLegalPage(html: string, kind: 'privacy' | 'terms'): boolean {
  const titleOk =
    kind === 'privacy'
      ? /<title>[^<]*Privacy[^<]*<\/title>/i.test(html)
      : /<title>[^<]*Terms[^<]*<\/title>/i.test(html)
  return (
    titleOk &&
    paragraphCount(html) >= 1 &&
    !html.includes(HOMEPAGE_TITLE) &&
    !html.includes(HOMEPAGE_META) &&
    !/coming soon/i.test(html)
  )
}

describe('PE legal pages (item 21 B3)', () => {
  it('privacy.html is a real Privacy page, not the homepage shell', () => {
    expect(looksLikeLegalPage(PRIVACY, 'privacy')).toBe(true)
    expect(PRIVACY).toMatch(/<h1>[^<]*Privacy/)
    expect(paragraphCount(PRIVACY)).toBeGreaterThanOrEqual(4)
    expect(PRIVACY).toMatch(/WorkOS AuthKit/)
    expect(PRIVACY).toMatch(/Google/)
    expect(PRIVACY).toMatch(/Microsoft/)
    expect(PRIVACY).toMatch(/Stripe/)
    expect(PRIVACY).toMatch(/public-record/)
    expect(PRIVACY).toMatch(/privileged/)
    expect(PRIVACY).toMatch(/mcp\.smartsite\.cloud/)
    expect(PRIVACY).toMatch(/smartsite\.cloud/)
    expect(PRIVACY).toMatch(/support@empressa\.io/)
    expect(PRIVACY).toMatch(/Empressa/)
    expect(PRIVACY).toMatch(/Legacy Group ATX/)
    expect(PRIVACY).toMatch(/href="\/terms"/)
    expect(PRIVACY).not.toMatch(HOMEPAGE_TITLE)
    expect(PRIVACY).not.toMatch(HOMEPAGE_META)
    expect(PRIVACY).not.toMatch(/coming soon/i)
    expect(PRIVACY).not.toMatch(/\u2014|\u2013/)
  })

  it('terms.html is a real Terms page, not the homepage shell', () => {
    expect(looksLikeLegalPage(TERMS, 'terms')).toBe(true)
    expect(TERMS).toMatch(/<h1>[^<]*Terms/)
    expect(paragraphCount(TERMS)).toBeGreaterThanOrEqual(4)
    expect(TERMS).toMatch(/WorkOS AuthKit/)
    expect(TERMS).toMatch(/Google/)
    expect(TERMS).toMatch(/Microsoft/)
    expect(TERMS).toMatch(/Stripe/)
    expect(TERMS).toMatch(/public-record/)
    expect(TERMS).toMatch(/privileged/)
    expect(TERMS).toMatch(/mcp\.smartsite\.cloud/)
    expect(TERMS).toMatch(/smartsite\.cloud/)
    expect(TERMS).toMatch(/support@empressa\.io/)
    expect(TERMS).toMatch(/Empressa/)
    expect(TERMS).toMatch(/Legacy Group ATX/)
    expect(TERMS).toMatch(/href="\/privacy"/)
    expect(TERMS).not.toMatch(HOMEPAGE_TITLE)
    expect(TERMS).not.toMatch(HOMEPAGE_META)
    expect(TERMS).not.toMatch(/coming soon/i)
    expect(TERMS).not.toMatch(/\u2014|\u2013/)
  })

  it('vercel.json rewrites /privacy and /terms before the SPA catch-all', () => {
    const config = JSON.parse(VERCEL) as {
      rewrites: Array<{ source: string; destination: string }>
    }
    const sources = config.rewrites.map((row) => row.source)
    const privacyIdx = sources.indexOf('/privacy')
    const privacySlashIdx = sources.indexOf('/privacy/')
    const termsIdx = sources.indexOf('/terms')
    const termsSlashIdx = sources.indexOf('/terms/')
    const catchAllIdx = sources.findIndex((source) => source.includes('(?!api/)'))
    expect(privacyIdx).toBeGreaterThanOrEqual(0)
    expect(privacySlashIdx).toBeGreaterThanOrEqual(0)
    expect(termsIdx).toBeGreaterThanOrEqual(0)
    expect(termsSlashIdx).toBeGreaterThanOrEqual(0)
    expect(catchAllIdx).toBeGreaterThan(privacyIdx)
    expect(catchAllIdx).toBeGreaterThan(privacySlashIdx)
    expect(catchAllIdx).toBeGreaterThan(termsIdx)
    expect(catchAllIdx).toBeGreaterThan(termsSlashIdx)
    expect(config.rewrites[privacyIdx]?.destination).toBe('/privacy.html')
    expect(config.rewrites[privacySlashIdx]?.destination).toBe('/privacy.html')
    expect(config.rewrites[termsIdx]?.destination).toBe('/terms.html')
    expect(config.rewrites[termsSlashIdx]?.destination).toBe('/terms.html')
    expect(config.rewrites[catchAllIdx]?.source).toBe('/((?!api/).*)')
    expect(config.rewrites[catchAllIdx]?.destination).toBe('/index.html')
  })

  it('empty or homepage-shell HTML fails the legal-page check (falsifier)', () => {
    const empty = ''
    const shell =
      '<!doctype html><html><head>' +
      `<title>${HOMEPAGE_TITLE}</title>` +
      `<meta name="description" content="${HOMEPAGE_META} on a live map." />` +
      '</head><body><div id="root"></div></body></html>'
    expect(looksLikeLegalPage(empty, 'privacy')).toBe(false)
    expect(looksLikeLegalPage(shell, 'privacy')).toBe(false)
    expect(looksLikeLegalPage(shell, 'terms')).toBe(false)
    expect(looksLikeLegalPage(PRIVACY, 'privacy')).toBe(true)
    expect(looksLikeLegalPage(TERMS, 'terms')).toBe(true)
  })
})
