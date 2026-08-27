// Grant-scoped share instrument (P-86 items 2, 5, 7).
//
// One instrument, three renderings. HTML / markdown / JSON must agree on
// parcel id, verdicts, and citations. The anonymous bake is a source on the
// share, never presented as the share. Withheld fields are labelled.
// Owner data is never invented from the bake and never appears without
// grantor scope (v1 HMAC has none; GET /s/{grantId} uses the grant row).

import type { ShareBriefPayload } from './pe-share-brief.js'
import type { ShareDossierPayload } from './pe-share-dossier.js'
import type { ShareGrantRow } from './pe-share-grant.js'
import type { ShareOwnerScope } from './pe-share-token.js'
import {
  loadShareBrief,
  loadShareDossier,
  probeShareArtifact,
  type ShareArtifactState,
  type ShareBriefLoad,
  type ShareComposeFetch,
  type ShareComposeMcp,
  type ShareDossierLoad,
} from './pe-share-view-compose.js'

export const SHARE_FRESHNESS_DAYS = 30

export const SHARE_INSTRUMENT_KIND = 'grant-scoped-share-instrument'

export type ShareInstrumentFormat = 'html' | 'markdown' | 'json'

export type ShareVerdict = { id: string; title: string; line: string }

export type ShareOwnerField =
  | { state: 'present'; display: string }
  | { state: 'withheld'; reason: string }

export interface ShareInstrument {
  kind: typeof SHARE_INSTRUMENT_KIND
  grantId: string
  parcelNodeId: string
  createdAt: string
  expiresAt: string
  freshnessLine: string
  property: {
    parcelNodeId: string
    situsAddress: string | null
    countyName: string | null
  }
  verdicts: ShareVerdict[]
  citations: string[]
  brief: ShareBriefPayload | null
  dossier: ShareDossierPayload | null
  artifacts: {
    xray: ShareArtifactState
    sitePlan: ShareArtifactState
    terrain: ShareArtifactState
    owner: ShareOwnerField
  }
  withholdings: string[]
  fidelity: {
    claim: string
    anonymousBakeIsNotTheShare: true
  }
}

export function shareFreshnessLine(createdAt: string, expiresAt: string): string {
  return (
    `This share is bound to ${SHARE_FRESHNESS_DAYS} days from creation. ` +
    `Created ${createdAt}. Expires ${expiresAt}. ` +
    `Pasting this URL into a chat logs the URL.`
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function verdictLineFromSection(
  id: string,
  data: unknown,
): string {
  const rec = asRecord(data)
  if (!rec) return 'Not verified on this share.'
  if (id === 'zoning') {
    return str(rec.district)
      ? `Zoning district ${str(rec.district)}`
      : 'Zoning district not verified on this share.'
  }
  if (id === 'flood') {
    const zone = str(rec.floodZone)
    const status = str(rec.status)
    if (zone && status) return `Flood ${status} (zone ${zone})`
    if (zone) return `Flood zone ${zone}`
    if (status) return `Flood ${status}`
    return 'Flood determination not verified on this share.'
  }
  if (id === 'land-use') {
    return str(rec.description) ?? str(rec.code) ?? 'Land use not verified on this share.'
  }
  if (id === 'setbacks-envelope') {
    const status = str(rec.status)
    const district = str(rec.district)
    if (status && district) return `Envelope ${status} (${district})`
    if (status) return `Envelope ${status}`
    return 'Setbacks and envelope not verified on this share.'
  }
  return 'Not verified on this share.'
}

export function verdictsFromBrief(brief: ShareBriefPayload | null): ShareVerdict[] {
  if (!brief) return []
  return brief.brief.sections.map((section) => ({
    id: section.id,
    title: section.title,
    line: verdictLineFromSection(section.id, section.data),
  }))
}

export function grantorScopeFromRow(row: ShareGrantRow): ShareOwnerScope | null {
  const tenantId = row.grantorTenantId.trim()
  const ownerUserId = row.grantorUserId.trim()
  if (!tenantId || !ownerUserId) return null
  return { tenantId, ownerUserId }
}

const OWNER_NO_SCOPE_REASON =
  'Owner data withheld: this path has no grantor scope. Owner-fact is identified-session only and is never taken from the anonymous bake.'

const OWNER_NO_STORE_REASON =
  'Owner data withheld: owner-fact is identified-session only. This grant carries grantor scope for dossier compose; this plane does not invent a second owner store, and the anonymous bake is owner-stripped.'

export function ownerFieldForGrant(scope: ShareOwnerScope | null): ShareOwnerField {
  if (!scope) {
    return { state: 'withheld', reason: OWNER_NO_SCOPE_REASON }
  }
  return { state: 'withheld', reason: OWNER_NO_STORE_REASON }
}

function withholdingLines(instrument: {
  brief: ShareBriefPayload | null
  dossier: ShareDossierPayload | null
  artifacts: ShareInstrument['artifacts']
}): string[] {
  const lines: string[] = []
  if (!instrument.brief) {
    lines.push('Public-record brief withheld: no baked facet snapshot on this parcel.')
  }
  if (!instrument.dossier) {
    lines.push('Sharer dossier withheld: no grantor-scoped dossier on this share.')
  }
  for (const art of [
    instrument.artifacts.xray,
    instrument.artifacts.sitePlan,
    instrument.artifacts.terrain,
  ]) {
    if (art.state === 'withheld') {
      const label =
        art.kind === 'xray' ? 'X-ray' : art.kind === 'siteplan' ? 'Site plan' : 'Terrain'
      lines.push(`${label} withheld: ${art.reason}`)
    }
  }
  if (instrument.artifacts.owner.state === 'withheld') {
    lines.push(instrument.artifacts.owner.reason)
  }
  return lines
}

export async function composeShareInstrument(opts: {
  grant: ShareGrantRow
  loadBrief?: typeof loadShareBrief
  loadDossier?: typeof loadShareDossier
  probeArtifact?: typeof probeShareArtifact
  fetchImpl?: ShareComposeFetch
  callTool?: ShareComposeMcp
  serviceKey?: string | null
  productKey?: string | null
  ownerOverride?: ShareOwnerField
}): Promise<ShareInstrument> {
  const scope = grantorScopeFromRow(opts.grant)
  const loadBrief = opts.loadBrief ?? loadShareBrief
  const loadDossier = opts.loadDossier ?? loadShareDossier
  const probe = opts.probeArtifact ?? probeShareArtifact

  const [briefLoad, dossierLoad, xray, sitePlan, terrain]: [
    ShareBriefLoad,
    ShareDossierLoad,
    ShareArtifactState,
    ShareArtifactState,
    ShareArtifactState,
  ] = await Promise.all([
    loadBrief(opts.grant.parcelNodeId, opts.fetchImpl),
    loadDossier(opts.grant.parcelNodeId, scope, {
      fetchImpl: opts.fetchImpl,
      serviceKey: opts.serviceKey,
    }),
    probe('xray', opts.grant.parcelNodeId, {
      callTool: opts.callTool,
      productKey: opts.productKey,
    }),
    probe('siteplan', opts.grant.parcelNodeId, {
      callTool: opts.callTool,
      productKey: opts.productKey,
    }),
    probe('terrain', opts.grant.parcelNodeId, {
      callTool: opts.callTool,
      productKey: opts.productKey,
    }),
  ])

  const brief = briefLoad.ok ? briefLoad.report : null
  const property = briefLoad.ok
    ? briefLoad.property
    : {
        parcelNodeId: opts.grant.parcelNodeId,
        situsAddress: null,
        countyName: null,
      }
  const dossier = dossierLoad.ok ? dossierLoad.dossier : null
  const owner = opts.ownerOverride ?? ownerFieldForGrant(scope)
  const artifacts = { xray, sitePlan, terrain, owner }
  const withholdings = withholdingLines({ brief, dossier, artifacts })

  return {
    kind: SHARE_INSTRUMENT_KIND,
    grantId: opts.grant.id,
    parcelNodeId: opts.grant.parcelNodeId,
    createdAt: opts.grant.createdAt,
    expiresAt: opts.grant.expiresAt,
    freshnessLine: shareFreshnessLine(opts.grant.createdAt, opts.grant.expiresAt),
    property,
    verdicts: verdictsFromBrief(brief),
    citations: brief ? [...brief.citations] : [],
    brief,
    dossier,
    artifacts,
    withholdings,
    fidelity: {
      claim:
        'This document is the grant-scoped share instrument. The public-record brief is one source on this share; it is not the share by itself.',
      anonymousBakeIsNotTheShare: true,
    },
  }
}

export function negotiateShareFormat(
  queryFormat: string | undefined,
  accept: string | undefined,
): ShareInstrumentFormat {
  const format = queryFormat?.trim().toLowerCase()
  if (format === 'agent') return 'markdown'
  if (format === 'json') return 'json'
  if (format === 'html') return 'html'
  const acc = accept ?? ''
  if (/\btext\/markdown\b/i.test(acc)) return 'markdown'
  if (/\bapplication\/json\b/i.test(acc)) return 'json'
  return 'html'
}

export function shareInstrumentContentType(format: ShareInstrumentFormat): string {
  if (format === 'markdown') return 'text/markdown; charset=utf-8'
  if (format === 'json') return 'application/json; charset=utf-8'
  return 'text/html; charset=utf-8'
}

export function instrumentAgreement(instrument: ShareInstrument): {
  parcelNodeId: string
  verdicts: ShareVerdict[]
  citations: string[]
} {
  return {
    parcelNodeId: instrument.parcelNodeId,
    verdicts: instrument.verdicts,
    citations: instrument.citations,
  }
}

const AGREEMENT_MARKER = 'share-instrument-agreement'

export function agreementFromRenderedBody(
  format: ShareInstrumentFormat,
  body: string,
): { parcelNodeId: string; verdicts: ShareVerdict[]; citations: string[] } | null {
  if (format === 'json') {
    try {
      const parsed = JSON.parse(body) as ShareInstrument
      if (parsed.kind !== SHARE_INSTRUMENT_KIND) return null
      return instrumentAgreement(parsed)
    } catch {
      return null
    }
  }
  const match = body.match(
    new RegExp(`<!-- ${AGREEMENT_MARKER} ([A-Za-z0-9+/=]+) -->`),
  )
  const b64 = match?.[1]
  if (!b64) return null
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as {
      parcelNodeId: string
      verdicts: ShareVerdict[]
      citations: string[]
    }
  } catch {
    return null
  }
}

function agreementComment(instrument: ShareInstrument): string {
  const payload = Buffer.from(
    JSON.stringify(instrumentAgreement(instrument)),
    'utf8',
  ).toString('base64')
  return `<!-- ${AGREEMENT_MARKER} ${payload} -->`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function artifactLine(state: ShareArtifactState, label: string): string {
  return state.state === 'exported'
    ? `${label}: exported by the sharer.`
    : `${label} withheld: ${state.reason}`
}

export function claimsAnonymousBakeIsTheShare(body: string): boolean {
  const lower = body.toLowerCase()
  const saysThisIsTheShare = /this is the share/.test(lower)
  if (!saysThisIsTheShare) return false
  const hasGrantFidelity =
    /grant-scoped share instrument/.test(lower) &&
    /not the share by itself/.test(lower)
  return !hasGrantFidelity
}

export function renderShareInstrumentJson(instrument: ShareInstrument): string {
  return `${JSON.stringify(instrument, null, 2)}\n`
}

export function renderShareInstrumentMarkdown(instrument: ShareInstrument): string {
  const title = instrument.property.situsAddress ?? `Parcel ${instrument.parcelNodeId}`
  const lines = [
    agreementComment(instrument),
    `# ${title}`,
    '',
    instrument.fidelity.claim,
    '',
    instrument.freshnessLine,
    '',
    `Parcel: ${instrument.parcelNodeId}`,
    instrument.property.countyName
      ? `County: ${instrument.property.countyName}`
      : null,
    `Grant: ${instrument.grantId}`,
    '',
    '## Verdicts',
    ...instrument.verdicts.map((v) => `- ${v.title}: ${v.line}`),
    instrument.verdicts.length === 0
      ? '- No verified facts to headline. See withholdings.'
      : null,
    '',
    '## Citations',
    ...instrument.citations.map((c) => `- ${c}`),
    instrument.citations.length === 0 ? '- No citations on this share.' : null,
    '',
    '## Artifacts',
    `- ${artifactLine(instrument.artifacts.xray, 'X-ray')}`,
    `- ${artifactLine(instrument.artifacts.sitePlan, 'Site plan')}`,
    `- ${artifactLine(instrument.artifacts.terrain, 'Terrain')}`,
    `- ${
      instrument.artifacts.owner.state === 'present'
        ? `Owner: ${instrument.artifacts.owner.display}`
        : instrument.artifacts.owner.reason
    }`,
    '',
    '## Withholdings',
    ...instrument.withholdings.map((w) => `- ${w}`),
    instrument.withholdings.length === 0 ? '- None labelled.' : null,
    '',
    instrument.dossier
      ? `## Sharer dossier\nSaved ${instrument.dossier.savedAt ?? 'undated'}.${
          instrument.dossier.notes?.trim()
            ? `\nNotes: ${instrument.dossier.notes}`
            : ''
        }`
      : '## Sharer dossier\nWithheld: no grantor-scoped dossier on this share.',
    '',
    `[Open live view of this property](/share?g=${instrument.grantId})`,
    '',
  ]
  return `${lines.filter((line) => line !== null).join('\n')}\n`
}

export function renderShareInstrumentHtml(instrument: ShareInstrument): string {
  const title = escapeHtml(
    instrument.property.situsAddress ?? `Parcel ${instrument.parcelNodeId}`,
  )
  const verdicts = instrument.verdicts
    .map(
      (v) =>
        `<li data-verdict-id="${escapeHtml(v.id)}"><strong>${escapeHtml(v.title)}:</strong> ${escapeHtml(v.line)}</li>`,
    )
    .join('')
  const citations = instrument.citations
    .map((c) => `<li><a href="${escapeHtml(c)}">${escapeHtml(c)}</a></li>`)
    .join('')
  const withholdings = instrument.withholdings
    .map((w) => `<li>${escapeHtml(w)}</li>`)
    .join('')
  const owner =
    instrument.artifacts.owner.state === 'present'
      ? escapeHtml(`Owner: ${instrument.artifacts.owner.display}`)
      : escapeHtml(instrument.artifacts.owner.reason)
  const liveView = `/share?g=${encodeURIComponent(instrument.grantId)}`
  const notes = instrument.dossier?.notes?.trim()
    ? `<section data-testid="share-dossier-notes"><h2>Notes from the sharer</h2><p>${escapeHtml(instrument.dossier.notes)}</p></section>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title} · Smart Site share</title>
</head>
<body>
${agreementComment(instrument)}
<main>
  <p data-testid="share-live-view"><a href="${escapeHtml(liveView)}">Open live view of this property</a></p>
  <p>${escapeHtml(instrument.fidelity.claim)}</p>
  <p data-testid="share-freshness">${escapeHtml(instrument.freshnessLine)}</p>
  <h1>${title}</h1>
  <p>Parcel ${escapeHtml(instrument.parcelNodeId)}${
    instrument.property.countyName
      ? ` · ${escapeHtml(instrument.property.countyName)} County`
      : ''
  }</p>
  ${notes}
  <h2>Verdicts</h2>
  <ul data-testid="share-verdicts">${verdicts || '<li>No verified facts to headline. See withholdings.</li>'}</ul>
  <h2>Citations</h2>
  <ul data-testid="share-citations">${citations || '<li>No citations on this share.</li>'}</ul>
  <h2>Artifacts</h2>
  <ul>
    <li>${escapeHtml(artifactLine(instrument.artifacts.xray, 'X-ray'))}</li>
    <li>${escapeHtml(artifactLine(instrument.artifacts.sitePlan, 'Site plan'))}</li>
    <li>${escapeHtml(artifactLine(instrument.artifacts.terrain, 'Terrain'))}</li>
    <li>${owner}</li>
  </ul>
  <h2>Withholdings</h2>
  <ul data-testid="share-withholdings">${withholdings || '<li>None labelled.</li>'}</ul>
</main>
</body>
</html>
`
}

export function renderShareInstrument(
  instrument: ShareInstrument,
  format: ShareInstrumentFormat,
): string {
  if (format === 'json') return renderShareInstrumentJson(instrument)
  if (format === 'markdown') return renderShareInstrumentMarkdown(instrument)
  return renderShareInstrumentHtml(instrument)
}
