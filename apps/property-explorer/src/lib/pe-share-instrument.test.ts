/**
 * P-86 items 2, 5, 7 — grant-scoped share instrument.
 * A check observed only passing is not a check: each named case has a violation.
 */

import { describe, expect, it } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handlePeShareGrant } from '../../api/pe-share-grant.js'
import { createMemoryShareGrantStore } from '../../api/_lib/pe-share-grant-store.js'
import type { ShareGrantRow } from '../../api/_lib/pe-share-grant.js'
import type { ShareBriefPayload } from '../../api/_lib/pe-share-brief.js'
import type { ShareDossierPayload } from '../../api/_lib/pe-share-dossier.js'
import {
  agreementFromRenderedBody,
  claimsAnonymousBakeIsTheShare,
  composeShareInstrument,
  instrumentAgreement,
  negotiateShareFormat,
  renderShareInstrument,
  SHARE_FRESHNESS_DAYS,
  shareFreshnessLine,
  type ShareInstrument,
} from '../../api/_lib/pe-share-instrument.js'

const GRANT: ShareGrantRow = {
  id: '2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f',
  grantorUserId: 'user-1',
  grantorTenantId: 'tenant-a',
  parcelNodeId: '48021:34137',
  createdAt: '2026-08-27T00:00:00.000Z',
  expiresAt: '2026-09-26T00:00:00.000Z',
  revokedAt: null,
}

const BRIEF: ShareBriefPayload = {
  runId: 'pe-r1-test',
  reportFamily: 'R1',
  mode: 'baked-facet-intel-v1',
  parcelNodeId: '48021:34137',
  brief: {
    sections: [
      {
        id: 'zoning',
        title: 'Zoning',
        data: { district: 'P-2' },
        citations: ['https://example.test/zoning'],
      },
      {
        id: 'setbacks-envelope',
        title: 'Setbacks and buildable envelope',
        data: { status: 'ok', district: 'P-2' },
        citations: ['https://example.test/envelope'],
      },
      {
        id: 'flood',
        title: 'Flood',
        data: { status: 'in-sfha', floodZone: 'AE' },
        citations: [],
      },
      {
        id: 'land-use',
        title: 'Land use',
        data: { description: 'Single family residence' },
        citations: [],
      },
    ],
    disclosure: [],
  },
  citations: ['https://example.test/zoning', 'https://example.test/envelope'],
  bakedAt: '2026-07-21T09:00:00.000Z',
  source: 'baked-snapshot',
}

const DOSSIER: ShareDossierPayload = {
  address: '801 Pine St',
  savedAt: '2026-08-20T00:00:00.000Z',
  drawings: null,
  chatSummary: {
    summary: 'Studio notes',
    savedAt: '2026-08-20T00:00:00.000Z',
    disclaimer: null,
  },
  notes: 'Gold share notes',
}

function fixtureCompose(overrides: Partial<ShareInstrument> = {}): ShareInstrument {
  return {
    kind: 'grant-scoped-share-instrument',
    grantId: GRANT.id,
    parcelNodeId: GRANT.parcelNodeId,
    createdAt: GRANT.createdAt,
    expiresAt: GRANT.expiresAt,
    freshnessLine: shareFreshnessLine(GRANT.createdAt, GRANT.expiresAt),
    property: {
      parcelNodeId: GRANT.parcelNodeId,
      situsAddress: '801 Pine St, Bastrop, TX',
      countyName: 'Bastrop',
    },
    verdicts: [
      { id: 'zoning', title: 'Zoning', line: 'Zoning district P-2' },
      { id: 'flood', title: 'Flood', line: 'Flood in-sfha (zone AE)' },
    ],
    citations: ['https://example.test/zoning'],
    brief: BRIEF,
    dossier: DOSSIER,
    artifacts: {
      xray: { state: 'exported', kind: 'xray' },
      sitePlan: { state: 'exported', kind: 'siteplan' },
      terrain: { state: 'exported', kind: 'terrain' },
      owner: {
        state: 'withheld',
        reason:
          'Owner data withheld: owner-fact is identified-session only. This grant carries grantor scope for dossier compose; this plane does not invent a second owner store, and the anonymous bake is owner-stripped.',
      },
    },
    withholdings: [
      'Owner data withheld: owner-fact is identified-session only. This grant carries grantor scope for dossier compose; this plane does not invent a second owner store, and the anonymous bake is owner-stripped.',
    ],
    fidelity: {
      claim:
        'This document is the grant-scoped share instrument. The public-record brief is one source on this share; it is not the share by itself.',
      anonymousBakeIsNotTheShare: true,
    },
    ...overrides,
  }
}

function mockRes(): {
  rec: {
    headers: Record<string, string>
    statusCode: number
    body: unknown
    ended: boolean
  }
  res: VercelResponse
} {
  const rec = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
    ended: false,
  }
  const res = {
    setHeader(k: string, v: string) {
      rec.headers[k] = v
      return res
    },
    status(n: number) {
      rec.statusCode = n
      return res
    },
    json(b: unknown) {
      rec.body = b
      return res
    },
    send(b: unknown) {
      rec.body = b
      return res
    },
    end() {
      rec.ended = true
      return res
    },
  }
  return { rec, res: res as unknown as VercelResponse }
}

function mockReq(opts: {
  method?: string
  grantId?: string
  format?: string
  accept?: string
}): VercelRequest {
  return {
    method: opts.method ?? 'GET',
    query: {
      grantId: opts.grantId ?? GRANT.id,
      ...(opts.format ? { format: opts.format } : {}),
    },
    headers: opts.accept ? { accept: opts.accept } : {},
  } as unknown as VercelRequest
}

describe('negotiateShareFormat (item 2)', () => {
  it('defaults to HTML for a browser Accept', () => {
    expect(negotiateShareFormat(undefined, 'text/html,application/xhtml+xml')).toBe(
      'html',
    )
  })
  it('markdown when Accept includes text/markdown or format=agent', () => {
    expect(negotiateShareFormat(undefined, 'text/markdown')).toBe('markdown')
    expect(negotiateShareFormat('agent', 'text/html')).toBe('markdown')
  })
  it('JSON when Accept includes application/json or format=json', () => {
    expect(negotiateShareFormat(undefined, 'application/json')).toBe('json')
    expect(negotiateShareFormat('json', 'text/html')).toBe('json')
  })
})

describe('three Accept/format probes agree (item 2)', () => {
  it('HTML, markdown, and JSON bodies agree on parcel id, verdicts, citations', async () => {
    const instrument = await composeShareInstrument({
      grant: GRANT,
      loadBrief: async () => ({
        ok: true,
        property: {
          parcelNodeId: GRANT.parcelNodeId,
          situsAddress: '801 Pine St, Bastrop, TX',
          countyName: 'Bastrop',
        },
        report: BRIEF,
      }),
      loadDossier: async () => ({
        ok: true,
        parcelNodeId: GRANT.parcelNodeId,
        label: 'Gold',
        updatedAt: '2026-08-20T00:00:00.000Z',
        dossier: DOSSIER,
      }),
      probeArtifact: async (kind) => ({ state: 'exported', kind }),
    })
    const html = renderShareInstrument(instrument, 'html')
    const md = renderShareInstrument(instrument, 'markdown')
    const json = renderShareInstrument(instrument, 'json')
    const expected = instrumentAgreement(instrument)
    expect(expected.parcelNodeId).toBe('48021:34137')
    expect(expected.verdicts.length).toBeGreaterThan(0)
    expect(expected.citations).toContain('https://example.test/zoning')
    expect(agreementFromRenderedBody('html', html)).toEqual(expected)
    expect(agreementFromRenderedBody('markdown', md)).toEqual(expected)
    expect(agreementFromRenderedBody('json', json)).toEqual(expected)
  })

  it('agreement checker fails when one of the three bodies changes parcel id (violation)', () => {
    const instrument = fixtureCompose()
    const html = renderShareInstrument(instrument, 'html')
    const md = renderShareInstrument(instrument, 'markdown')
    const diverged = renderShareInstrument(
      { ...instrument, parcelNodeId: '48055:99999' },
      'json',
    )
    expect(agreementFromRenderedBody('html', html)).toEqual(
      agreementFromRenderedBody('markdown', md),
    )
    expect(agreementFromRenderedBody('json', diverged)).not.toEqual(
      agreementFromRenderedBody('html', html),
    )
  })
})

describe('locked fidelity (item 5)', () => {
  it('labels withholdings and does not present the anonymous bake as the share', async () => {
    const instrument = await composeShareInstrument({
      grant: GRANT,
      loadBrief: async () => ({
        ok: true,
        property: {
          parcelNodeId: GRANT.parcelNodeId,
          situsAddress: null,
          countyName: null,
        },
        report: BRIEF,
      }),
      loadDossier: async () => ({
        ok: false,
        status: 404,
        error: 'dossier_not_available',
        message: 'No saved dossier exists for this share.',
      }),
      probeArtifact: async (kind) => ({
        state: 'withheld',
        kind,
        reason: 'Not exported by the sharer.',
      }),
    })
    const html = renderShareInstrument(instrument, 'html')
    const md = renderShareInstrument(instrument, 'markdown')
    const json = renderShareInstrument(instrument, 'json')
    expect(instrument.brief?.source).toBe('baked-snapshot')
    expect(instrument.fidelity.anonymousBakeIsNotTheShare).toBe(true)
    expect(instrument.withholdings.some((w) => /dossier/i.test(w))).toBe(true)
    expect(instrument.withholdings.some((w) => /X-ray/i.test(w))).toBe(true)
    expect(instrument.withholdings.some((w) => /Owner data withheld/i.test(w))).toBe(
      true,
    )
    expect(claimsAnonymousBakeIsTheShare(html)).toBe(false)
    expect(claimsAnonymousBakeIsTheShare(md)).toBe(false)
    expect(claimsAnonymousBakeIsTheShare(json)).toBe(false)
    expect(html).toMatch(/grant-scoped share instrument/)
    expect(html).not.toMatch(/this is the share/i)
  })

  it('anonymous-bake-only body with "this is the share" copy fails (violation)', () => {
    const bakeOnly =
      'This is the share.\nparcel 48021:34137\nsource: baked-snapshot\nZoning district P-2'
    expect(claimsAnonymousBakeIsTheShare(bakeOnly)).toBe(true)
  })

  it('owner data never appears without grantor scope (v1 HMAC shape)', async () => {
    const noGrantor: ShareGrantRow = {
      ...GRANT,
      grantorUserId: '',
      grantorTenantId: '',
    }
    const instrument = await composeShareInstrument({
      grant: noGrantor,
      loadBrief: async () => ({
        ok: true,
        property: {
          parcelNodeId: GRANT.parcelNodeId,
          situsAddress: null,
          countyName: null,
        },
        report: BRIEF,
      }),
      loadDossier: async () => ({
        ok: false,
        status: 404,
        error: 'dossier_not_available',
        message: 'This share link does not carry a dossier.',
      }),
      probeArtifact: async (kind) => ({ state: 'withheld', kind, reason: 'n/a' }),
    })
    expect(instrument.artifacts.owner.state).toBe('withheld')
    expect(instrument.artifacts.owner.reason).toMatch(/no grantor scope/)
    expect(JSON.stringify(instrument)).not.toMatch(/ownerName/)
  })
})

describe('GET /s/:grantId handler (items 2, 5, 6 leftovers)', () => {
  it('HMAC in /s/ path is refused (violation of grant-id-only)', async () => {
    const { rec, res } = mockRes()
    await handlePeShareGrant(
      mockReq({ grantId: 'eyJ2IjoxfQ.signature' }),
      res,
      { store: createMemoryShareGrantStore() },
    )
    expect(rec.statusCode).toBe(403)
    expect(rec.body).toMatchObject({ error: 'share_grant_invalid' })
  })

  it('expired vs revoked stay distinct 403s', async () => {
    const store = createMemoryShareGrantStore([
      { ...GRANT, id: '11111111-1111-4111-8111-111111111111', revokedAt: '2026-08-27T01:00:00.000Z' },
      {
        ...GRANT,
        id: '22222222-2222-4222-8222-222222222222',
        expiresAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const revoked = mockRes()
    await handlePeShareGrant(
      mockReq({ grantId: '11111111-1111-4111-8111-111111111111' }),
      revoked.res,
      { store },
    )
    const expired = mockRes()
    await handlePeShareGrant(
      mockReq({ grantId: '22222222-2222-4222-8222-222222222222' }),
      expired.res,
      { store },
    )
    expect(revoked.rec.statusCode).toBe(403)
    expect(expired.rec.statusCode).toBe(403)
    expect((revoked.rec.body as { error: string }).error).toBe('share_grant_revoked')
    expect((expired.rec.body as { error: string }).error).toBe('share_grant_expired')
    expect((revoked.rec.body as { error: string }).error).not.toBe(
      (expired.rec.body as { error: string }).error,
    )
  })

  it('three format probes on one live grant agree', async () => {
    const store = createMemoryShareGrantStore([GRANT])
    const compose = async () => fixtureCompose()
    const html = mockRes()
    await handlePeShareGrant(mockReq({ accept: 'text/html' }), html.res, {
      store,
      compose,
    })
    const md = mockRes()
    await handlePeShareGrant(mockReq({ format: 'agent' }), md.res, { store, compose })
    const json = mockRes()
    await handlePeShareGrant(mockReq({ format: 'json' }), json.res, {
      store,
      compose,
    })
    expect(html.rec.statusCode).toBe(200)
    expect(md.rec.statusCode).toBe(200)
    expect(json.rec.statusCode).toBe(200)
    expect(html.rec.headers['Content-Type']).toMatch(/text\/html/)
    expect(md.rec.headers['Content-Type']).toMatch(/text\/markdown/)
    expect(json.rec.headers['Content-Type']).toMatch(/application\/json/)
    const expected = instrumentAgreement(fixtureCompose())
    expect(agreementFromRenderedBody('html', String(html.rec.body))).toEqual(expected)
    expect(agreementFromRenderedBody('markdown', String(md.rec.body))).toEqual(
      expected,
    )
    expect(agreementFromRenderedBody('json', String(json.rec.body))).toEqual(expected)
  })

  it('HEAD stays headers-only', async () => {
    const store = createMemoryShareGrantStore([GRANT])
    const { rec, res } = mockRes()
    await handlePeShareGrant(mockReq({ method: 'HEAD' }), res, { store })
    expect(rec.statusCode).toBe(200)
    expect(rec.body).toBeUndefined()
    expect(rec.ended).toBe(true)
    expect(rec.headers['Content-Type']).toMatch(/text\/html/)
  })
})

describe('freshness (item 7)', () => {
  it('30-day bound is on HTML, markdown, and JSON', () => {
    const instrument = fixtureCompose()
    const html = renderShareInstrument(instrument, 'html')
    const md = renderShareInstrument(instrument, 'markdown')
    const json = renderShareInstrument(instrument, 'json')
    for (const body of [html, md, json]) {
      expect(body).toMatch(/bound to 30 days/)
      expect(body).not.toMatch(/private to this chat/i)
    }
    expect(SHARE_FRESHNESS_DAYS).toBe(30)
  })
})
