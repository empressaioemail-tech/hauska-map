/**
 * Dossier-export BFF core tests — engine #174 / MCP dossier tools wiring,
 * FOLDED into pe-site-plan-export via kind=dossier (no new function).
 * Covers the property-entitlement gate (the R1 line), the cap-trim body
 * parse (verbatim-forward, honest omission), the MCP payload mapping, and
 * the share-view dossier projection (cortex #362).
 */

import { describe, expect, it } from 'vitest'
import {
  buildDossierDownloadPath,
  DOSSIER_BRIEF_MAX_SECTIONS,
  DOSSIER_NOTES_MAX_CHARS,
  DOSSIER_VERDICT_MAX_CHARS,
  dossierFilename,
  mapMcpDossierPayload,
  parseDossierExportContent,
  refuseHollowXrayExport,
  XRAY_VERDICT_PLACEHOLDER,
  XRAY_PIPELINE_ABSENT_ERROR,
  XRAY_PIPELINE_ABSENT_MESSAGE,
  resolveDossierExportAuth,
} from '../../api/_lib/pe-dossier-export-core.js'
import {
  buildShareDossierPayload,
  includeNotesForGrant,
} from '../../api/_lib/pe-share-dossier.js'
import { VERDICT_UNRESOLVED } from './sheet-verdict'

describe('dossier export auth — property entitlement (the R1 line)', () => {
  it('401 without a session', () => {
    const gate = resolveDossierExportAuth({
      sessionToken: null,
      entitlement: { ok: false, status: 401 },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(401)
      expect(gate.error).toBe('authentication_required')
    }
  })

  it('402 for signed-in free tier WITHOUT the property unlock', () => {
    const gate = resolveDossierExportAuth({
      sessionToken: 'session',
      entitlement: { ok: true, tier: 'free', propertyUnlocked: false },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(402)
      expect(gate.error).toBe('payment_required')
    }
  })

  it('allows paid tier', () => {
    expect(
      resolveDossierExportAuth({
        sessionToken: 'session',
        entitlement: { ok: true, tier: 'paid', propertyUnlocked: null },
      }).ok,
    ).toBe(true)
  })

  it('allows the single-property unlock on free tier (unlike site-plan Pro-only)', () => {
    expect(
      resolveDossierExportAuth({
        sessionToken: 'session',
        entitlement: { ok: true, tier: 'free', propertyUnlocked: true },
      }).ok,
    ).toBe(true)
  })

  it('dev bypass clears the gate but still requires a session', () => {
    const withSession = resolveDossierExportAuth({
      sessionToken: 'session',
      entitlement: { ok: false, status: 503 },
      devBypass: true,
    })
    expect(withSession.ok).toBe(true)
    if (withSession.ok) expect(withSession.devBypass).toBe(true)
    expect(
      resolveDossierExportAuth({
        sessionToken: null,
        entitlement: { ok: false, status: 401 },
        devBypass: true,
      }).ok,
    ).toBe(false)
  })

  it('503 entitlement_unavailable maps through honestly (not a paywall)', () => {
    const gate = resolveDossierExportAuth({
      sessionToken: 'session',
      entitlement: { ok: false, status: 503, message: 'upstream down' },
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.status).toBe(503)
      expect(gate.error).toBe('entitlement_unavailable')
    }
  })
})

describe('dossier body parse — cap-trim + honest omission', () => {
  it('forwards a complete body verbatim', () => {
    const content = parseDossierExportContent({
      address: '1127 N Pine St',
      countyName: 'Bastrop',
      verdictLine: 'Buildable · outside mapped flood hazard.',
      brief: {
        sections: [
          {
            id: 'zoning',
            title: 'Zoning',
            facts: [
              { label: 'District', value: 'P-2', source: 'bastrop-city-tx GIS', vintage: '2026-07-10' },
            ],
          },
        ],
      },
      chatSummary: {
        summary: 'AI summary.',
        savedAt: '2026-07-29T00:00:00.000Z',
        disclaimer: 'AI-generated.',
      },
      notes: 'Owner notes.',
    })
    expect(content).toEqual({
      address: '1127 N Pine St',
      countyName: 'Bastrop',
      verdictLine: 'Buildable · outside mapped flood hazard.',
      brief: {
        sections: [
          {
            id: 'zoning',
            title: 'Zoning',
            facts: [
              { label: 'District', value: 'P-2', source: 'bastrop-city-tx GIS', vintage: '2026-07-10' },
            ],
          },
        ],
      },
      chatSummary: {
        summary: 'AI summary.',
        savedAt: '2026-07-29T00:00:00.000Z',
        disclaimer: 'AI-generated.',
      },
      notes: 'Owner notes.',
    })
  })

  it('omits absent/malformed pieces instead of defaulting them', () => {
    expect(parseDossierExportContent({})).toEqual({})
    expect(parseDossierExportContent(undefined)).toEqual({})
    expect(
      parseDossierExportContent({
        verdictLine: '   ',
        brief: { sections: 'nope' },
        chatSummary: { summary: 'x' /* savedAt missing */ },
        notes: 42,
      }),
    ).toEqual({})
  })

  it('trims over-cap fields to the engine caps instead of failing', () => {
    const content = parseDossierExportContent({
      verdictLine: 'v'.repeat(DOSSIER_VERDICT_MAX_CHARS + 100),
      notes: 'n'.repeat(DOSSIER_NOTES_MAX_CHARS + 100),
      brief: {
        sections: Array.from({ length: DOSSIER_BRIEF_MAX_SECTIONS + 4 }, (_, i) => ({
          id: `s${i}`,
          title: `Section ${i}`,
          facts: [{ label: 'L', value: 'V' }],
        })),
      },
    })
    expect(content.verdictLine).toHaveLength(DOSSIER_VERDICT_MAX_CHARS)
    expect(content.notes).toHaveLength(DOSSIER_NOTES_MAX_CHARS)
    expect(content.brief?.sections).toHaveLength(DOSSIER_BRIEF_MAX_SECTIONS)
  })
})

describe('W4.P0 refuseHollowXrayExport — pipeline vs user-content', () => {
  const ready = {
    verdictLine: 'Buildable · outside mapped flood hazard.',
    brief: {
      sections: [
        {
          id: 'zoning',
          title: 'Zoning',
          facts: [{ label: 'District', value: 'P-2' }],
        },
      ],
    },
  }

  it('treats the unresolved fact-sheet placeholder as a missing verdict', () => {
    expect(XRAY_VERDICT_PLACEHOLDER).toBe(VERDICT_UNRESOLVED.line)
    const gate = refuseHollowXrayExport({
      verdictLine: VERDICT_UNRESOLVED.line,
      brief: ready.brief,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.missing).toEqual(['verdict'])
  })

  it('fails closed when verdict is missing (violate: would have emitted UNAVAILABLE)', () => {
    const gate = refuseHollowXrayExport({
      brief: ready.brief,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.error).toBe(XRAY_PIPELINE_ABSENT_ERROR)
      expect(gate.missing).toEqual(['verdict'])
      expect(gate.message).toBe(XRAY_PIPELINE_ABSENT_MESSAGE)
    }
  })

  it('fails closed when brief facts are missing (violate: would have emitted UNAVAILABLE)', () => {
    const gate = refuseHollowXrayExport({
      verdictLine: ready.verdictLine,
    })
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.missing).toEqual(['brief_facts'])
    }
  })

  it('fails closed when both pipeline outputs are missing', () => {
    const parsed = parseDossierExportContent({ parcelNodeId: '48021:34161' })
    const gate = refuseHollowXrayExport(parsed)
    expect(gate.ok).toBe(false)
    if (!gate.ok) {
      expect(gate.missing).toEqual(['verdict', 'brief_facts'])
    }
  })

  it('forwards liveViewUrl (W2.4; violate: dropping the live-view field)', () => {
    const parsed = parseDossierExportContent({
      ...ready,
      liveViewUrl: '/?parcelNodeId=48021%3A34161',
    })
    expect(parsed.liveViewUrl).toBe('/?parcelNodeId=48021%3A34161')
  })

  it('omits owner notes and still clears when verdict + brief exist', () => {
    const parsed = parseDossierExportContent({
      ...ready,
      notes: '   ',
      chatSummary: { summary: 'x' },
    })
    expect(parsed.notes).toBeUndefined()
    expect(parsed.chatSummary).toBeUndefined()
    expect(refuseHollowXrayExport(parsed).ok).toBe(true)
  })

  it('still clears when a carried brief fact has no world value (honest miss stays on the page)', () => {
    const gate = refuseHollowXrayExport({
      verdictLine: ready.verdictLine,
      brief: {
        sections: [
          {
            id: 'building',
            title: 'Building',
            facts: [{ label: 'Living area', source: 'CAD' }],
          },
        ],
      },
    })
    expect(gate.ok).toBe(true)
  })
})

describe('MCP dossier payload mapping', () => {
  const enginePayload = {
    data: {
      parcelNodeId: '48029:105129',
      atom: { parcelNodeId: '48029:105129', accessPolicy: 'public-paid' },
      artifacts: { 'pdf-dossier': { format: 'pdf-dossier', ref: 'gs://x', byteCount: 400000 } },
      pageCount: 6,
      dossierPageCount: 3,
      sitePlanAppended: true,
      verdictIncluded: true,
      briefSectionCount: 2,
      briefFactCount: 9,
      chatSummaryIncluded: true,
      notesIncluded: false,
      setbackHonestAbsence: true,
    },
  }

  it('maps the refresh payload with flags + the folded download path', () => {
    const mapped = mapMcpDossierPayload(enginePayload, '48029:105129')
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.parcelNodeId).toBe('48029:105129')
      expect(mapped.format).toBe('pdf-dossier')
      expect(mapped.downloadUrl).toBe(
        '/api/pe-site-plan-export?parcelNodeId=48029%3A105129&kind=dossier&action=download',
      )
      expect(mapped.pageCount).toBe(6)
      expect(mapped.dossierPageCount).toBe(3)
      expect(mapped.sitePlanAppended).toBe(true)
      expect(mapped.setbackHonestAbsence).toBe(true)
      expect(mapped.notesIncluded).toBe(false)
      expect(mapped.inlineDownload).toBeUndefined()
    }
  })

  it('carries inline bytes when MCP inlined them', () => {
    const mapped = mapMcpDossierPayload(
      {
        data: {
          ...enginePayload.data,
          download: {
            format: 'pdf-dossier',
            contentType: 'application/pdf',
            base64: 'JVBERg==',
            byteCount: 6,
          },
        },
      },
      '48029:105129',
    )
    expect(mapped.ok).toBe(true)
    if (mapped.ok) {
      expect(mapped.inlineDownload?.base64).toBe('JVBERg==')
      expect(mapped.inlineDownload?.contentType).toBe('application/pdf')
    }
  })

  it('maps isError to a failure message', () => {
    const mapped = mapMcpDossierPayload(
      { isError: true, message: 'Engine API rejected dossier export (422)' },
      '48029:105129',
    )
    expect(mapped.ok).toBe(false)
    if (!mapped.ok) expect(mapped.message).toMatch(/422/)
  })

  it('falls back to the request parcel id when the payload omits it', () => {
    const mapped = mapMcpDossierPayload({ data: { atom: {} } }, '48029:105129')
    expect(mapped.ok).toBe(true)
    if (mapped.ok) expect(mapped.parcelNodeId).toBe('48029:105129')
  })

  it('builds the dossier filename', () => {
    expect(dossierFilename('48029:105129')).toBe('48029_105129_smart_site_xray.pdf')
    expect(buildDossierDownloadPath('48029:105129')).toContain('kind=dossier')
  })
})

describe('share-view dossier projection (cortex #362 snapshot)', () => {
  const snapshot = {
    savedAt: '2026-07-28T00:00:00.000Z',
    address: '1127 N Pine St',
    status: 'offer',
    pin: { lat: 30.1, lng: -97.3 },
    drawings: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[-97.3, 30.1], [-97.31, 30.11]] },
          properties: { tool: 'measure' },
        },
      ],
    },
    chatSummary: {
      summary: 'AI summary of the research chat.',
      savedAt: '2026-07-28T00:00:00.000Z',
      turnCount: 8,
      disclaimer: 'AI-generated.',
    },
    chatThread: [
      { role: 'user', content: 'private question' },
      { role: 'assistant', content: 'private answer' },
    ],
    notes: 'Owner notes.',
    exports: [
      { kind: 'site-plan', format: 'pdf-site-plan', savedAt: 'x', downloadPath: '/api/gated' },
    ],
  }

  it('projects ONLY the share-appropriate subset (no thread, no exports, no pin/status)', () => {
    const projected = buildShareDossierPayload(snapshot)
    expect(projected).not.toBeNull()
    expect(projected).toEqual({
      address: '1127 N Pine St',
      savedAt: '2026-07-28T00:00:00.000Z',
      drawings: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[-97.3, 30.1], [-97.31, 30.11]],
            },
            properties: { tool: 'measure' },
          },
        ],
      },
      chatSummary: {
        summary: 'AI summary of the research chat.',
        savedAt: '2026-07-28T00:00:00.000Z',
        disclaimer: 'AI-generated.',
      },
      notes: 'Owner notes.',
    })
    const json = JSON.stringify(projected)
    expect(json).not.toContain('private question')
    expect(json).not.toContain('/api/gated')
    expect(json).not.toContain('"pin"')
    expect(json).not.toContain('"status"')
  })

  it('returns null when nothing share-appropriate exists (share view renders as today)', () => {
    expect(buildShareDossierPayload(null)).toBeNull()
    expect(buildShareDossierPayload({})).toBeNull()
    expect(
      buildShareDossierPayload({ savedAt: 'x', address: 'y', pin: { lat: 1, lng: 2 } }),
    ).toBeNull()
  })

  it('drops malformed drawings instead of throwing', () => {
    const projected = buildShareDossierPayload({
      drawings: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null }] },
      notes: 'still shared',
    })
    expect(projected?.drawings).toBeNull()
    expect(projected?.notes).toBe('still shared')
  })

  it('W3.1 exclude notes omits them (violate: still project notes)', () => {
    const projected = buildShareDossierPayload(
      { notes: 'Owner notes.', address: '104 Main St' },
      { includeNotes: false },
    )
    expect(projected).toBeNull()
    const withDrawings = buildShareDossierPayload(
      {
        notes: 'Owner notes.',
        drawings: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [1, 2] },
              properties: {},
            },
          ],
        },
      },
      { includeNotes: false },
    )
    expect(withDrawings?.notes).toBeNull()
    expect(withDrawings?.drawings).not.toBeNull()
  })

  it('W3.1 reads includeNotes from the grant package; absent package does not invent false', () => {
    const snapshot = {
      notes: 'keep',
      sharePackages: [
        {
          grantId: '2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f',
          includeNotes: false,
        },
      ],
    }
    expect(
      includeNotesForGrant(snapshot, '2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f'),
    ).toBe(false)
    expect(includeNotesForGrant(snapshot, '00000000-0000-0000-0000-000000000000')).toBeNull()
    expect(includeNotesForGrant({ notes: 'keep' }, '2c1a9d4e-7b11-4f0a-9c3d-0a1b2c3d4e5f')).toBeNull()
  })
})
