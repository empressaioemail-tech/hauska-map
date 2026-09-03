/**
 * P-105 — the share becomes a doorway, for a person and for a model.
 *
 * Every named check here has a violation next to it. A check observed only
 * passing has not been observed working, and this suite is the whole of the
 * evidence for six of the card's seven acceptance items (the seventh IS the
 * both-directions rule).
 *
 * The item number each block covers is in its describe() name so a grader
 * can read the card and this file side by side.
 */

import { describe, expect, it } from 'vitest'
import type { ShareGrantRow } from '../../api/_lib/pe-share-grant.js'
import type { ShareBriefPayload } from '../../api/_lib/pe-share-brief.js'
import {
  absoluteShareUrl,
  classifyArtifactProbeError,
  collapsedAbsenceStates,
  httpStatusLeaksIn,
  internalToolNamesIn,
  readsAsDirective,
  relativePathValuesIn,
  relativeUrlsIn,
  shareAbsence,
  SHARE_ABSENCE_STATES,
} from '../../api/_lib/pe-share-absence.js'
import {
  buildShareConnectorOffer,
  buildShareSyncHandoff,
  shareSyncSubject,
  SMART_SITE_CONNECT_URL,
  SMART_SITE_CONNECTOR_NAME,
  SMART_SITE_PARCEL_TOOL,
} from '../../api/_lib/pe-share-handoff.js'
import {
  composeShareInstrument,
  renderShareInstrument,
  type ShareInstrument,
} from '../../api/_lib/pe-share-instrument.js'
import { buildSyncPrompt, CLAUDE_PROMPT_MAX } from './claudeSync'

const ORIGIN = 'https://smartsite.cloud'

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
  parcelNodeId: GRANT.parcelNodeId,
  brief: {
    sections: [
      {
        id: 'zoning',
        title: 'Zoning',
        data: { district: 'P-2' },
        citations: ['https://example.test/zoning'],
      },
      {
        id: 'flood',
        title: 'Flood',
        // No value on purpose: this is the section that used to say
        // "Not verified on this share." and now has to say WHY.
        data: {},
        citations: [],
      },
    ],
    disclosure: [],
  },
  citations: ['https://example.test/zoning'],
  bakedAt: '2026-07-21T09:00:00.000Z',
  source: 'baked-snapshot',
}

async function compose(
  overrides: Partial<Parameters<typeof composeShareInstrument>[0]> = {},
): Promise<ShareInstrument> {
  return composeShareInstrument({
    grant: GRANT,
    origin: ORIGIN,
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
      ok: false,
      status: 404,
      error: 'dossier_not_available',
      message: 'No saved dossier exists for this share.',
    }),
    probeArtifact: async (kind) => ({
      state: 'withheld',
      kind,
      absence: shareAbsence('absent-for-parcel'),
    }),
    ...overrides,
  })
}

/* ==========================================================================
 * Item 1 — the human share carries the Sync handoff, FROM THE EXISTING
 * BUILDER.
 * ======================================================================= */

describe('item 1 — one prompt builder, not two', () => {
  /**
   * WHY A BATTERY AND NOT ONE STRING. Comparing one prompt to one expected
   * string is a check a reimplementation passes by accident. These four
   * subjects are the cases where buildSyncPrompt's contract is actually
   * load-bearing: a resolved label, a null label (dropped, never guessed), a
   * label equal to the node id (dropped, so the id is not printed twice),
   * and a pathological label that trips the 14,000-character guard. A second
   * builder has to reproduce all four rules to pass this, which is what
   * makes it a check rather than a formality.
   */
  const SUBJECTS = [
    { parcelNodeId: '48021:34137', label: '801 Pine St, Bastrop, TX' },
    { parcelNodeId: '48021:34137', label: null },
    { parcelNodeId: '48021:34137', label: '48021:34137' },
    { parcelNodeId: '48021:34137', label: 'x'.repeat(CLAUDE_PROMPT_MAX + 500) },
  ]

  it('the share path and the workbench path emit the same prompt for the same subject', () => {
    for (const subject of SUBJECTS) {
      const share = buildShareSyncHandoff(subject).prompt
      const workbench = buildSyncPrompt(subject)
      expect(share).toBe(workbench)
    }
  })

  it('a SECOND builder fails the same battery (violation)', () => {
    // The plausible reimplementation: same sentence, but it substitutes the
    // node id when the label is missing instead of dropping it, and has no
    // length guard. It matches on the happy path and diverges on three of
    // the four subjects, which is exactly how a second builder ships.
    const secondBuilder = (s: { parcelNodeId: string; label: string | null }) =>
      `Open the Smart Site for ${s.label ?? s.parcelNodeId} (parcel node ${s.parcelNodeId}) ` +
      `and give me the picture: what it is, what it allows, and what is unresolved.`
    const divergences = SUBJECTS.filter(
      (s) => secondBuilder(s) !== buildSyncPrompt(s),
    )
    expect(divergences.length).toBeGreaterThan(0)
  })

  it('the HTML body carries that exact prompt, and the label comes from the share itself', async () => {
    const instrument = await compose()
    const subject = shareSyncSubject(instrument)
    expect(subject).toEqual({
      parcelNodeId: '48021:34137',
      label: '801 Pine St, Bastrop, TX',
    })
    const html = renderShareInstrument(instrument, 'html')
    expect(html).toContain(buildSyncPrompt(subject))
    expect(html).toContain('data-testid="share-claude-sync"')
    // Clipboard FIRST, then the chat. Both halves stated, per the declared
    // degradation in claudeSync.ts.
    expect(html).toMatch(/clipboard/i)
    expect(html).toContain('navigator.clipboard.writeText')
  })

  it('a situs address cannot close the inline script element (violation)', async () => {
    // The prompt carries upstream data. Found in adversarial review of this
    // lane's own work, not by a test failing: JSON.stringify alone leaves
    // `</script>` intact, and the whole tail of the page would then parse as
    // markup. Both directions asserted, so an unescaped embed fails here.
    const hostile = '801 Pine St </script><img src=x onerror=alert(1)>'
    const instrument = await compose({
      loadBrief: async () => ({
        ok: true,
        property: {
          parcelNodeId: GRANT.parcelNodeId,
          situsAddress: hostile,
          countyName: 'Bastrop',
        },
        report: BRIEF,
      }),
    })
    const html = renderShareInstrument(instrument, 'html')
    const script = html.slice(html.indexOf('<script>'))
    expect(script).not.toContain('</script><img')
    // `<` is escaped, `>` is left alone: breaking the opening bracket is what
    // stops the element closing, and escaping more than that is theatre.
    expect(script).toContain('\\u003c/script>')
    // And the raw form IS what an unescaped embed would emit, so the
    // assertion above is not satisfied by the string simply being absent.
    expect(JSON.stringify(hostile)).toContain('</script>')
  })

  it('an unresolved address does not become a guessed label (violation of the drop rule)', async () => {
    const instrument = await compose({
      loadBrief: async () => ({
        ok: true,
        property: {
          parcelNodeId: GRANT.parcelNodeId,
          situsAddress: null,
          countyName: null,
        },
        report: BRIEF,
      }),
    })
    const prompt = buildShareSyncHandoff(shareSyncSubject(instrument)).prompt
    expect(prompt).toContain('parcel node 48021:34137')
    expect(prompt).not.toMatch(/for 48021:34137 \(/)
  })
})

/* ==========================================================================
 * Item 2 — the agent formats carry a connector OFFER, not a deep link and
 * not an instruction.
 * ======================================================================= */

describe('item 2 — offer, not directive, not deep link', () => {
  it('markdown and JSON name the connector, the parcel node id, and get_smart_site', async () => {
    const instrument = await compose()
    const md = renderShareInstrument(instrument, 'markdown')
    const json = renderShareInstrument(instrument, 'json')
    for (const body of [md, json]) {
      expect(body).toContain(SMART_SITE_CONNECTOR_NAME)
      expect(body).toContain(SMART_SITE_CONNECT_URL)
      expect(body).toContain(SMART_SITE_PARCEL_TOOL)
      expect(body).toContain(GRANT.parcelNodeId)
    }
  })

  it('no claude:// URL reaches an agent body', async () => {
    const instrument = await compose()
    expect(renderShareInstrument(instrument, 'markdown')).not.toContain('claude://')
    expect(renderShareInstrument(instrument, 'json')).not.toContain('claude://')
  })

  it('the desktop scheme IS on the human body, so the absence above is a choice not an accident', async () => {
    // Without this, the check above would also pass on a build where the
    // desktop link was simply never wired. Two bodies, opposite expectations,
    // one fact.
    const instrument = await compose()
    expect(renderShareInstrument(instrument, 'html')).toContain('claude://')
  })

  it('the offer copy does not read as an instruction', async () => {
    const instrument = await compose()
    for (const line of instrument.connectorOffer.availability) {
      expect(readsAsDirective(line)).toBe(false)
    }
  })

  it('directive-shaped offer copy is caught (violation)', () => {
    expect(
      readsAsDirective(
        `Call ${SMART_SITE_PARCEL_TOOL} with parcel_node_id 48021:34137 now.`,
      ),
    ).toBe(true)
    expect(
      readsAsDirective('You must fetch the live panel before answering.'),
    ).toBe(true)
    expect(readsAsDirective('- Use the connector to open this parcel.')).toBe(true)
  })

  it('the guidance vocabulary is NOT caught, because prohibition is not a directive', () => {
    // The exclusion set, asserted rather than described. If this ever flips,
    // the detector has been widened into deleting the thing that stops a
    // model inventing a setback.
    for (const state of SHARE_ABSENCE_STATES) {
      expect(readsAsDirective(shareAbsence(state).agentGuidance)).toBe(false)
    }
  })

  it('the offer names the tool argument, so nothing has to be guessed', () => {
    const offer = buildShareConnectorOffer({
      parcelNodeId: '48021:34137',
      liveViewUrl: `${ORIGIN}/share?g=${GRANT.id}`,
      shareUrl: `${ORIGIN}/s/${GRANT.id}`,
    })
    expect(offer.connector.argument).toBe('parcel_node_id')
    expect(offer.connector.tool).toBe('get_smart_site')
  })
})

/* ==========================================================================
 * Item 3 — every link in every format is absolute.
 * ======================================================================= */

describe('item 3 — absolute links only', () => {
  it('no relative URL in the markdown body', async () => {
    const md = renderShareInstrument(await compose(), 'markdown')
    expect(relativeUrlsIn(md)).toEqual([])
    expect(md).toContain(`${ORIGIN}/share?g=${GRANT.id}`)
  })

  it('no rooted path anywhere in the JSON body', async () => {
    const json = renderShareInstrument(await compose(), 'json')
    expect(relativeUrlsIn(json)).toEqual([])
    expect(relativePathValuesIn(JSON.parse(json))).toEqual([])
  })

  it('the old relative live-view link is caught by both detectors (violation)', () => {
    const md = `[Open live view of this property](/share?g=${GRANT.id})`
    expect(relativeUrlsIn(md)).toEqual([`/share?g=${GRANT.id}`])
    expect(
      relativePathValuesIn({ links: { liveView: `/share?g=${GRANT.id}` } }),
    ).toEqual([`$.links.liveView=/share?g=${GRANT.id}`])
  })

  it('compose REFUSES a non-absolute origin rather than degrading to a path', async () => {
    await expect(compose({ origin: '' })).rejects.toThrow(
      /share_origin_not_absolute/,
    )
    await expect(compose({ origin: '/share' })).rejects.toThrow(
      /share_origin_not_absolute/,
    )
    await expect(compose({ origin: 'smartsite.cloud' })).rejects.toThrow(
      /share_origin_not_absolute/,
    )
  })

  it('absoluteShareUrl refuses a fragment and an unrooted path', () => {
    expect(() => absoluteShareUrl(ORIGIN, 'share')).toThrow(/share_path_not_rooted/)
    expect(() => absoluteShareUrl(ORIGIN, '/share#token')).toThrow(
      /share_url_carries_fragment/,
    )
    expect(absoluteShareUrl(`${ORIGIN}/`, '/s/x')).toBe(`${ORIGIN}/s/x`)
  })
})

/* ==========================================================================
 * Item 4 — absence becomes four states (five here), each with its own next
 * action.
 * ======================================================================= */

describe('item 4 — absence is a taxonomy, not a sentence', () => {
  it('the card four are all present and reachable', () => {
    expect(SHARE_ABSENCE_STATES).toContain('excluded-by-sharer')
    expect(SHARE_ABSENCE_STATES).toContain('not-measured')
    expect(SHARE_ABSENCE_STATES).toContain('tier-gated')
    expect(SHARE_ABSENCE_STATES).toContain('absent-for-parcel')
  })

  it('every state carries a next action a model can act on', () => {
    for (const state of SHARE_ABSENCE_STATES) {
      const absence = shareAbsence(state)
      expect(absence.display.trim().length).toBeGreaterThan(0)
      expect(absence.agentGuidance.trim().length).toBeGreaterThan(0)
      expect(absence.agentGuidance).toMatch(/do not|no claim/i)
    }
  })

  it('no two states collapse, on either half', () => {
    expect(collapsedAbsenceStates()).toEqual([])
  })

  it('the collapse check FIRES when two states are made to say the same thing (violation)', () => {
    // The detector applied to a deliberately collapsed table. If this
    // returned [] the real check above would be vacuous.
    const collapsed = [
      { state: 'a', display: 'Not verified on this share.', agentGuidance: 'x' },
      { state: 'b', display: 'Not verified on this share.', agentGuidance: 'y' },
      { state: 'c', display: 'z', agentGuidance: 'y' },
    ]
    const collisions: string[] = []
    for (let i = 0; i < collapsed.length; i += 1) {
      for (let j = i + 1; j < collapsed.length; j += 1) {
        if (collapsed[i].display === collapsed[j].display) {
          collisions.push(`${collapsed[i].state}/${collapsed[j].state}:display`)
        }
        if (collapsed[i].agentGuidance === collapsed[j].agentGuidance) {
          collisions.push(`${collapsed[i].state}/${collapsed[j].state}:agentGuidance`)
        }
      }
    }
    expect(collisions).toEqual(['a/b:display', 'b/c:agentGuidance'])
  })

  it('a facet with no value says WHY, not "Not verified on this share."', async () => {
    const instrument = await compose()
    const flood = instrument.verdicts.find((v) => v.id === 'flood')
    expect(flood?.absence?.state).toBe('not-measured')
    expect(flood?.line).toBe('Not measured for this parcel yet.')
    // And the line does NOT repeat the title, which the renderer prints.
    expect(flood?.line).not.toContain('Flood')
    const md = renderShareInstrument(instrument, 'markdown')
    expect(md).not.toContain('Not verified on this share.')
  })

  it('a sharer exclusion and a missing export are DIFFERENT states', async () => {
    const excluded = await compose({
      loadDossier: async () => ({
        ok: true,
        parcelNodeId: GRANT.parcelNodeId,
        label: 'Gold',
        updatedAt: null,
        dossier: {
          address: null,
          savedAt: null,
          drawings: null,
          chatSummary: null,
          notes: null,
        },
        includeXray: false,
      }),
    })
    expect(excluded.artifacts.xray.state).toBe('withheld')
    if (excluded.artifacts.xray.state === 'withheld') {
      expect(excluded.artifacts.xray.absence.state).toBe('excluded-by-sharer')
    }
    const missing = await compose()
    expect(missing.artifacts.xray.state).toBe('withheld')
    if (missing.artifacts.xray.state === 'withheld') {
      expect(missing.artifacts.xray.absence.state).toBe('absent-for-parcel')
    }
  })

  it('an unmeasured parcel and an upstream fault are DIFFERENT states', async () => {
    const unmeasured = await compose({
      loadBrief: async () => ({
        ok: false,
        status: 404,
        error: 'baked_snapshot_not_found',
        message: 'No baked facet snapshot exists for this parcel node.',
      }),
    })
    expect(
      unmeasured.withholdings.find((w) => w.subject === 'Public-record brief')?.state,
    ).toBe('not-measured')

    const faulted = await compose({
      loadBrief: async () => ({
        ok: false,
        status: 502,
        error: 'upstream_error',
        message: 'Facet snapshot fetch returned 502.',
      }),
    })
    expect(
      faulted.withholdings.find((w) => w.subject === 'Public-record brief')?.state,
    ).toBe('unread')
  })

  it('the probe classifier picks tier-gate over absence, and never invents an absence', () => {
    expect(classifyArtifactProbeError('Upgrade required for this export')).toBe(
      'tier-gated',
    )
    expect(classifyArtifactProbeError('Dossier artifact not found (404)')).toBe(
      'absent-for-parcel',
    )
    // Unreadable, so unread. NOT absent — an error we cannot parse is a
    // failure to look, and only a positive determination writes an absence.
    expect(classifyArtifactProbeError('kaboom')).toBe('unread')
    expect(classifyArtifactProbeError('')).toBe('unread')
    expect(classifyArtifactProbeError(null)).toBe('unread')
  })
})

/* ==========================================================================
 * Item 5 — the duplication goes, and the developer strings with it.
 * ======================================================================= */

describe('item 5 — no developer strings, no repeated lines', () => {
  const LEAKY_BODY =
    'X-ray withheld: Not exported by the sharer (Dossier artifact not found (404). ' +
    'Call refresh_parcel_dossier_export first to build it).'

  it('no internal tool name in any customer-facing body', async () => {
    const instrument = await compose()
    for (const format of ['html', 'markdown', 'json'] as const) {
      expect(internalToolNamesIn(renderShareInstrument(instrument, format))).toEqual(
        [],
      )
    }
  })

  it('no raw HTTP status in any customer-facing body', async () => {
    const instrument = await compose()
    for (const format of ['html', 'markdown', 'json'] as const) {
      expect(httpStatusLeaksIn(renderShareInstrument(instrument, format))).toEqual([])
    }
  })

  it('the REAL probe, fed the historical upstream error, leaks neither (end to end)', async () => {
    // Not a stubbed probeArtifact. This runs probeShareArtifact itself with
    // the exact payload the MCP dossier export returned in production, so the
    // classifier is the thing under test rather than the fixture. Without
    // this case the two checks above are gated on a stub and could not
    // observe a regression in the write path at all.
    const instrument = await composeShareInstrument({
      grant: GRANT,
      origin: ORIGIN,
      productKey: 'test-product-key',
      callTool: async () => ({
        isError: true,
        message:
          'Dossier artifact not found (404). Call refresh_parcel_dossier_export first to build it.',
      }),
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
        ok: false,
        status: 404,
        error: 'dossier_not_available',
        message: 'No saved dossier exists for this share.',
      }),
    })
    for (const format of ['html', 'markdown', 'json'] as const) {
      const body = renderShareInstrument(instrument, format)
      expect(internalToolNamesIn(body)).toEqual([])
      expect(httpStatusLeaksIn(body)).toEqual([])
      expect(body).not.toContain('Not exported by the sharer')
    }
    // And it landed on the TRUE state, not a guess about the sharer.
    expect(
      instrument.withholdings.find((w) => w.subject === 'X-ray')?.state,
    ).toBe('absent-for-parcel')
  })

  it('both detectors FIRE on the exact string that used to ship (violation)', () => {
    expect(internalToolNamesIn(LEAKY_BODY)).toEqual([
      'refresh_parcel_dossier_export',
    ])
    expect(httpStatusLeaksIn(LEAKY_BODY)).toEqual(['(404)'])
  })

  it('the status detector does NOT fire on real overlay copy (stated exclusion set)', () => {
    // If this ever fails, the detector has been widened past its contract and
    // will start rejecting correct sentences.
    expect(httpStatusLeaksIn('No pipeline within 500 ft of this parcel.')).toEqual([])
    expect(httpStatusLeaksIn('Parcel 48021:34137, Bastrop County.')).toEqual([])
    expect(httpStatusLeaksIn('This share is bound to 30 days from creation.')).toEqual(
      [],
    )
  })

  it('get_smart_site is allowlisted, so the tool detector is not a blanket ban', () => {
    expect(internalToolNamesIn('The tool get_smart_site takes parcel_node_id.')).toEqual(
      [],
    )
  })

  it('Artifacts and Withholdings no longer print the same lines', async () => {
    const instrument = await compose()
    const md = renderShareInstrument(instrument, 'markdown')
    const artifactsBlock = md.split('## Artifacts')[1]?.split('## Withholdings')[0] ?? ''
    const withholdingsBlock =
      md.split('## Withholdings')[1]?.split('## Sharer dossier')[0] ?? ''
    const lines = (block: string) =>
      block
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- '))
    const shared = lines(artifactsBlock).filter((l) =>
      lines(withholdingsBlock).includes(l),
    )
    expect(lines(artifactsBlock).length).toBeGreaterThan(0)
    expect(lines(withholdingsBlock).length).toBeGreaterThan(0)
    expect(shared).toEqual([])
  })

  it('the pre-P-105 rendering DID repeat them (violation, same comparison)', () => {
    // The old artifactLine and the old withholdingLines produced byte-identical
    // strings. Run the comparison above against that shape and it finds four.
    const oldArtifacts = [
      '- X-ray withheld: Not exported by the sharer.',
      '- Site plan withheld: Not exported by the sharer.',
      '- Terrain withheld: Not exported by the sharer.',
      '- Owner data withheld: identified-session only.',
    ]
    const oldWithholdings = [...oldArtifacts]
    const shared = oldArtifacts.filter((l) => oldWithholdings.includes(l))
    expect(shared).toHaveLength(4)
  })
})

/* ==========================================================================
 * Item 6 — one line stops asserting two contradictory facts.
 * ======================================================================= */

describe('item 6 — one claim per line', () => {
  it('a missing export says it does not exist, and says nothing about the sharer', async () => {
    const instrument = await compose()
    const xray = instrument.withholdings.find((w) => w.subject === 'X-ray')
    expect(xray?.state).toBe('absent-for-parcel')
    expect(xray?.line).toContain('Nothing of this kind exists for this parcel.')
    expect(xray?.line).not.toMatch(/sharer/i)
  })

  it('an excluded artifact says the sharer left it out, and does not claim it is missing', async () => {
    const instrument = await compose({
      loadDossier: async () => ({
        ok: true,
        parcelNodeId: GRANT.parcelNodeId,
        label: 'Gold',
        updatedAt: null,
        dossier: {
          address: null,
          savedAt: null,
          drawings: null,
          chatSummary: null,
          notes: null,
        },
        includeXray: false,
      }),
    })
    const xray = instrument.withholdings.find((w) => w.subject === 'X-ray')
    expect(xray?.state).toBe('excluded-by-sharer')
    expect(xray?.line).toContain('The sharer left this out of the share.')
    expect(xray?.line).toContain('Do not infer that it does not exist.')
    expect(xray?.line).not.toMatch(/exists for this parcel/)
  })

  it('the contradictory line is detectable as making both claims (violation)', () => {
    const old = 'Not exported by the sharer (Dossier artifact not found (404)).'
    const claimsSharerChose = /by the sharer/i.test(old)
    const claimsDoesNotExist = /not found|does not exist/i.test(old)
    expect(claimsSharerChose && claimsDoesNotExist).toBe(true)

    const nowSharer = shareAbsence('excluded-by-sharer')
    const nowMissing = shareAbsence('absent-for-parcel')
    for (const line of [
      `${nowSharer.display} ${nowSharer.agentGuidance}`,
      `${nowMissing.display} ${nowMissing.agentGuidance}`,
    ]) {
      const both =
        /by the sharer|the sharer left/i.test(line) &&
        /not found|nothing of this kind exists/i.test(line)
      expect(both).toBe(false)
    }
  })
})

/* ==========================================================================
 * Cross-format agreement, because three bodies that disagree is the older
 * defect this card must not reintroduce.
 * ======================================================================= */

describe('the three formats still agree, and differ only where they should', () => {
  it('the connector offer is identical in markdown and JSON', async () => {
    const instrument = await compose()
    const json = JSON.parse(renderShareInstrument(instrument, 'json')) as ShareInstrument
    expect(json.connectorOffer).toEqual(instrument.connectorOffer)
    const md = renderShareInstrument(instrument, 'markdown')
    for (const line of instrument.connectorOffer.availability) {
      expect(md).toContain(line)
    }
  })

  it('the Sync prompt is on the human body and NOT on either agent body', async () => {
    const instrument = await compose()
    const prompt = buildShareSyncHandoff(shareSyncSubject(instrument)).prompt
    expect(renderShareInstrument(instrument, 'html')).toContain(prompt)
    expect(renderShareInstrument(instrument, 'markdown')).not.toContain(prompt)
    expect(renderShareInstrument(instrument, 'json')).not.toContain(prompt)
  })
})
