import { describe, expect, it } from 'vitest'
import { renderMcpLoginPage } from './mcp-login-page'

const CRAFTED_ID = `ext<>&"'id`

function expectedEscapedHref(provider: 'google' | 'microsoft', externalAuthId: string): string {
  const q = new URLSearchParams({ external_auth_id: externalAuthId })
  const href = `/api/auth/${provider}/start?${q.toString()}`
  return href
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

describe('renderMcpLoginPage', () => {
  it('escapes a crafted externalAuthId and keeps provider start hrefs', () => {
    const html = renderMcpLoginPage({
      externalAuthId: CRAFTED_ID,
      configured: { google: true, microsoft: true },
    })

    expect(html).not.toContain(CRAFTED_ID)
    expect(html).not.toContain('<>&')
    expect(html).toContain(expectedEscapedHref('google', CRAFTED_ID))
    expect(html).toContain(expectedEscapedHref('microsoft', CRAFTED_ID))
    expect(html).toContain('/api/auth/google/start?external_auth_id=')
    expect(html).toContain('/api/auth/microsoft/start?external_auth_id=')
  })

  it('inlines Stone ground, card, and gold-light tokens with verbatim hex', () => {
    const html = renderMcpLoginPage({
      externalAuthId: CRAFTED_ID,
      configured: { google: true, microsoft: true },
    })

    expect(html).toContain('--ss-void')
    expect(html).toContain('#2A2A2B')
    expect(html).toContain('--ss-ink')
    expect(html).toContain('#323234')
    expect(html).toContain('--ss-gold-lt')
    expect(html).toContain('#F5B95C')
    expect(html).toContain('--ss-ui')
    expect(html).toContain('--ss-fs-label')
    expect(html).toContain('--ss-fs-title')
    expect(html).toContain('--ss-fs-body')
    expect(html).toContain('--ss-r-float')
    expect(html).toContain('--ss-h-control')
    expect(html).toContain('--ss-r-touch')
    expect(html).toContain('--ss-t1')
    expect(html).toContain('--ss-t5')
    expect(html).toContain('--ss-t2')
    expect(html).toContain('--ss-line-14')
    expect(html).toContain('--ss-line-28')
    expect(html).toContain('--ss-sh-focus')
    expect(html).toContain('#131314')
    expect(html).toContain('#E3E3E3')
    expect(html).toContain('#EA4335')
    expect(html).toContain('#f25022')
    expect(html).toContain('#7fba00')
    expect(html).toContain('#00a4ef')
    expect(html).toContain('#ffb900')
  })

  it('does not contain v2 navy, action blue, or the old 24px 80px shadow', () => {
    const html = renderMcpLoginPage({
      externalAuthId: CRAFTED_ID,
      configured: { google: true, microsoft: true },
    })

    expect(html).not.toContain('#3B82F6')
    expect(html).not.toContain('#0b0e14')
    expect(html).not.toContain('#0b0e13')
    expect(html).not.toContain('#141928')
    expect(html).not.toContain('24px 80px')
    expect(html).not.toContain('rgba(59, 130, 246')
    expect(html).not.toContain('--ss-blue')
    expect(html).not.toContain('#86ADDF')
  })

  it('prints the existing notice on Stone tokens when no provider is configured', () => {
    const html = renderMcpLoginPage({
      externalAuthId: 'plain-id',
      configured: { google: false, microsoft: false },
    })

    expect(html).toContain('Sign-in is not configured on this deploy yet.')
    expect(html).toContain('--ss-slate')
    expect(html).toContain('--ss-line-06')
    expect(html).toContain('--ss-raised')
    expect(html).not.toContain('/api/auth/google/start?')
    expect(html).not.toContain('/api/auth/microsoft/start?')
  })

  it('does not load a second kit or name Hauska', () => {
    const html = renderMcpLoginPage({
      externalAuthId: 'plain-id',
      configured: { google: true, microsoft: true },
    })

    expect(html).not.toContain('fonts.googleapis')
    expect(html).not.toContain('Hauska')
    expect(html).not.toContain('--sc-')
    expect(html).not.toContain('#F3F5F1')
    expect(html).not.toContain('Oxygen')
  })
})
