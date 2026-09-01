// Grant-scoped share instrument (P-86 items 2, 5, 7; P-105 items 1-6).
//
// One instrument, three renderings. HTML / markdown / JSON must agree on
// parcel id, verdicts, and citations. The anonymous bake is a source on the
// share, never presented as the share. Withheld fields are labelled.
// Owner data is never invented from the bake and never appears without
// grantor scope (v1 HMAC has none; GET /s/{grantId} uses the grant row).
//
// P-105 changed three things about the renderings and nothing about the
// fidelity rule:
//
//   1. Every URL is ABSOLUTE. The live-view link was `/share?g={id}`, which
//      a foreign model has no base to resolve. The origin is threaded in
//      from the request and absoluteShareUrl() throws rather than emitting a
//      relative path, because a relative link and a working link look
//      identical from inside the body.
//   2. Absence is FIVE STATES with a next action each, not one sentence.
//      See pe-share-absence.ts for the vocabulary and its source.
//   3. The three formats now differ where they should: HTML carries the
//      Claude Sync handoff (a person can click), markdown and JSON carry a
//      connector OFFER (a model cannot click, and must never be handed an
//      instruction). See pe-share-handoff.ts.
//
// And one thing was deleted: the Artifacts block and the Withholdings block
// used to print the same four lines twice. Artifacts is now state-only and
// Withholdings is the single place each reason is stated.

import {
  absoluteShareUrl,
  shareAbsence,
  type ShareAbsence,
  type ShareAbsenceState,
} from './pe-share-absence.js'
import type { ShareBriefPayload } from './pe-share-brief.js'
import type { ShareDossierPayload } from './pe-share-dossier.js'
import type { ShareGrantRow } from './pe-share-grant.js'
import {
  buildShareConnectorOffer,
  buildShareSyncHandoff,
  renderConnectorOfferMarkdown,
  shareSyncSubject,
  SHARE_SYNC_COPY,
  type ShareConnectorOffer,
} from './pe-share-handoff.js'
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

/**
 * A verdict now carries its absence when there is one, so a model reading
 * the JSON does not have to parse the English of `line` to learn that the
 * facet is unknown rather than negative.
 */
export type ShareVerdict = {
  id: string
  title: string
  line: string
  absence?: ShareAbsence
}

export type ShareOwnerField =
  | { state: 'present'; display: string }
  | { state: 'withheld'; reason: string; absence: ShareAbsence }

/**
 * One withholding, stated ONCE.
 *
 * `line` is the single rendered form, so the markdown body, the HTML body
 * and any consumer of the JSON are reading the same sentence rather than
 * three near-copies. The structured fields are what a model acts on.
 */
export interface ShareWithholding {
  subject: string
  state: ShareAbsenceState
  disposition: ShareAbsence['disposition']
  display: string
  agentGuidance: string
  line: string
}

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
  /** Absolute, both of them. P-105 item 3. */
  links: {
    liveView: string
    share: string
  }
  /** Data plus an offer, for a model. Never a directive. P-105 item 2. */
  connectorOffer: ShareConnectorOffer
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
  withholdings: ShareWithholding[]
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

/**
 * P-105 item 4. Every one of these used to end in the same seven words,
 * "Not verified on this share.", which told a reader nothing about WHY and
 * left a model with no next action. A section that reached the share but
 * carries no value has not been measured for this parcel — that is
 * `not-measured` / disposition `unknown`, and it is a different claim from
 * "there is nothing here", which is what a bare negative sentence implies.
 */
function verdictFromSection(
  id: string,
  title: string,
  data: unknown,
): ShareVerdict {
  // The line does NOT repeat the section title: both renderers print
  // `${title}: ${line}`, and the old copy produced "Flood: Flood
  // determination not verified on this share."
  const unmeasured = (): ShareVerdict => {
    const absence = shareAbsence('not-measured')
    return { id, title, line: absence.display, absence }
  }
  const rec = asRecord(data)
  if (!rec) return unmeasured()
  if (id === 'zoning') {
    const district = str(rec.district)
    return district
      ? { id, title, line: `Zoning district ${district}` }
      : unmeasured()
  }
  if (id === 'flood') {
    const zone = str(rec.floodZone)
    const status = str(rec.status)
    if (zone && status) return { id, title, line: `Flood ${status} (zone ${zone})` }
    if (zone) return { id, title, line: `Flood zone ${zone}` }
    if (status) return { id, title, line: `Flood ${status}` }
    return unmeasured()
  }
  if (id === 'land-use') {
    const value = str(rec.description) ?? str(rec.code)
    return value ? { id, title, line: value } : unmeasured()
  }
  if (id === 'setbacks-envelope') {
    const status = str(rec.status)
    const district = str(rec.district)
    if (status && district) return { id, title, line: `Envelope ${status} (${district})` }
    if (status) return { id, title, line: `Envelope ${status}` }
    return unmeasured()
  }
  return unmeasured()
}

export function verdictsFromBrief(brief: ShareBriefPayload | null): ShareVerdict[] {
  if (!brief) return []
  return brief.brief.sections.map((section) =>
    verdictFromSection(section.id, section.title, section.data),
  )
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
  // Owner-fact is identified-session only on BOTH branches. The share plane
  // does not have it and is not going to invent it, so the honest state is
  // "the check does not run here", never "this parcel has no owner".
  if (!scope) {
    return {
      state: 'withheld',
      reason: OWNER_NO_SCOPE_REASON,
      absence: shareAbsence('unread'),
    }
  }
  return {
    state: 'withheld',
    reason: OWNER_NO_STORE_REASON,
    absence: shareAbsence('unread'),
  }
}

export function artifactSubjectLabel(kind: ShareArtifactState['kind']): string {
  return kind === 'xray' ? 'X-ray' : kind === 'siteplan' ? 'Site plan' : 'Terrain'
}

function withholding(subject: string, absence: ShareAbsence): ShareWithholding {
  return {
    subject,
    state: absence.state,
    disposition: absence.disposition,
    display: absence.display,
    agentGuidance: absence.agentGuidance,
    line: `${subject}: ${absence.display} ${absence.agentGuidance}`,
  }
}

/**
 * P-105 item 5. This list is now the ONE place a reason is stated. The
 * Artifacts block prints a state word and stops, so the four lines that used
 * to appear in both blocks appear once.
 *
 * Owner is the exception to the uniform `line` shape: its two reasons are
 * load-bearing legal-ish copy from P-86 that says exactly why owner-fact is
 * identified-session only, and shortening it to a vocabulary sentence would
 * lose the reason. It keeps its own text and gains the guidance.
 */
function withholdingsFor(instrument: {
  brief: ShareBriefPayload | null
  briefAbsence: ShareAbsence | null
  dossier: ShareDossierPayload | null
  dossierAbsence: ShareAbsence | null
  artifacts: ShareInstrument['artifacts']
}): ShareWithholding[] {
  const out: ShareWithholding[] = []
  if (!instrument.brief) {
    out.push(
      withholding(
        'Public-record brief',
        instrument.briefAbsence ?? shareAbsence('not-measured'),
      ),
    )
  }
  if (!instrument.dossier) {
    out.push(
      withholding(
        'Sharer dossier',
        instrument.dossierAbsence ?? shareAbsence('unread'),
      ),
    )
  }
  for (const art of [
    instrument.artifacts.xray,
    instrument.artifacts.sitePlan,
    instrument.artifacts.terrain,
  ]) {
    if (art.state === 'withheld') {
      out.push(withholding(artifactSubjectLabel(art.kind), art.absence))
    }
  }
  const owner = instrument.artifacts.owner
  if (owner.state === 'withheld') {
    out.push({
      subject: 'Owner',
      state: owner.absence.state,
      disposition: owner.absence.disposition,
      display: owner.reason,
      agentGuidance: owner.absence.agentGuidance,
      line: `${owner.reason} ${owner.absence.agentGuidance}`,
    })
  }
  return out
}

/**
 * P-105 item 4, brief half. `baked_snapshot_not_found` is a real, positive
 * determination that this parcel has not been measured. Anything else — a
 * transport fault, an unreadable body — is a failure to look, and is
 * `unread`. Collapsing the two would turn our own outage into a claim about
 * the parcel.
 */
function briefAbsenceFor(load: ShareBriefLoad): ShareAbsence | null {
  if (load.ok) return null
  return load.error === 'baked_snapshot_not_found'
    ? shareAbsence('not-measured')
    : shareAbsence('unread')
}

/**
 * P-105 item 4, dossier half, and item 6.
 *
 * `no saved dossier exists` and `has nothing to share yet` are positive
 * determinations about the sharer's own dossier: there is none. That is
 * `absent-for-parcel`, and it is NOT `excluded-by-sharer` — the sharer never
 * had one to exclude, and saying they left it out would be the same
 * two-facts-at-once defect item 6 exists to kill.
 *
 * A link that carries no dossier at all, an unconfigured deployment, or an
 * upstream fault are all `unread`: nothing was established.
 */
function dossierAbsenceFor(load: ShareDossierLoad): ShareAbsence | null {
  if (load.ok) return null
  if (load.error !== 'dossier_not_available') return shareAbsence('unread')
  return /no saved dossier|nothing to share/i.test(load.message)
    ? shareAbsence('absent-for-parcel')
    : shareAbsence('unread')
}

export async function composeShareInstrument(opts: {
  grant: ShareGrantRow
  /**
   * Absolute origin this share is being served from, e.g.
   * "https://smartsite.cloud". REQUIRED: every link in every format is
   * absolute (P-105 item 3) and absoluteShareUrl throws rather than falling
   * back to a relative path.
   */
  origin: string
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
      grantId: opts.grant.id,
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
  // The ONE place sharer intent is actually known: the share package's own
  // include flag. Everywhere else, "the sharer left it out" is a guess.
  const xrayForShare: ShareArtifactState =
    dossierLoad.ok && dossierLoad.includeXray === false
      ? {
          state: 'withheld',
          kind: 'xray',
          absence: shareAbsence('excluded-by-sharer'),
        }
      : xray
  const artifacts = { xray: xrayForShare, sitePlan, terrain, owner }
  const withholdings = withholdingsFor({
    brief,
    briefAbsence: briefAbsenceFor(briefLoad),
    dossier,
    dossierAbsence: dossierAbsenceFor(dossierLoad),
    artifacts,
  })

  // Absolute or nothing. absoluteShareUrl throws on a non-absolute origin;
  // the handler turns that into a refusal rather than serving a body whose
  // links a foreign model cannot resolve.
  const links = {
    liveView: absoluteShareUrl(
      opts.origin,
      `/share?g=${encodeURIComponent(opts.grant.id)}`,
    ),
    share: absoluteShareUrl(
      opts.origin,
      `/s/${encodeURIComponent(opts.grant.id)}`,
    ),
  }

  return {
    kind: SHARE_INSTRUMENT_KIND,
    grantId: opts.grant.id,
    parcelNodeId: opts.grant.parcelNodeId,
    createdAt: opts.grant.createdAt,
    expiresAt: opts.grant.expiresAt,
    freshnessLine: shareFreshnessLine(opts.grant.createdAt, opts.grant.expiresAt),
    property,
    links,
    connectorOffer: buildShareConnectorOffer({
      parcelNodeId: opts.grant.parcelNodeId,
      liveViewUrl: links.liveView,
      shareUrl: links.share,
    }),
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

/**
 * JSON for embedding inside a <script> element.
 *
 * JSON.stringify alone is NOT safe here and this is not theoretical: the
 * prompt carries the parcel's situs address, which is upstream data, and a
 * value containing `</script>` would close the element early and everything
 * after it would parse as markup. `<` and `&` are escaped to their \u forms,
 * which are valid JSON string escapes and produce the identical runtime
 * value.
 *
 * U+2028 / U+2029 are deliberately NOT escaped. They were line terminators
 * in JavaScript source before ES2019; every runtime this ships to accepts
 * them inside a string literal, and writing a literal separator character
 * into this file to match one is the kind of invisible byte that survives a
 * checkout badly.
 */
function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/&/g, '\\u0026')
}

/**
 * P-105 item 5. STATE ONLY. This block used to repeat, verbatim, the same
 * four lines the Withholdings block prints, which is why a share body read
 * as if it were stalling for length. The reason now lives in exactly one
 * place, and this block says which of the two states each artifact is in.
 */
function artifactLine(state: ShareArtifactState, label: string): string {
  return state.state === 'exported'
    ? `${label}: exported by the sharer.`
    : `${label}: not on this share. See Withholdings.`
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
        : 'Owner: not on this share. See Withholdings.'
    }`,
    '',
    '## Withholdings',
    ...instrument.withholdings.map((w) => `- ${w.line}`),
    instrument.withholdings.length === 0 ? '- None labelled.' : null,
    '',
    instrument.dossier
      ? `## Sharer dossier\nSaved ${instrument.dossier.savedAt ?? 'undated'}.${
          instrument.dossier.notes?.trim()
            ? `\nNotes: ${instrument.dossier.notes}`
            : ''
        }`
      : '## Sharer dossier\nNot on this share. See Withholdings.',
    '',
    ...renderConnectorOfferMarkdown(instrument.connectorOffer),
    '',
    `[Live view of this property](${instrument.links.liveView})`,
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
    .map((w) => `<li>${escapeHtml(w.line)}</li>`)
    .join('')
  const owner =
    instrument.artifacts.owner.state === 'present'
      ? escapeHtml(`Owner: ${instrument.artifacts.owner.display}`)
      : escapeHtml('Owner: not on this share. See Withholdings.')
  const liveView = instrument.links.liveView
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
  <p data-testid="share-live-view"><a href="${escapeHtml(liveView)}">Live view of this property</a></p>
  <p>${escapeHtml(instrument.fidelity.claim)}</p>
  <p data-testid="share-freshness">${escapeHtml(instrument.freshnessLine)}</p>
  <h1>${title}</h1>
  <p>Parcel ${escapeHtml(instrument.parcelNodeId)}${
    instrument.property.countyName
      ? ` · ${escapeHtml(instrument.property.countyName)} County`
      : ''
  }</p>
${renderShareSyncSection(instrument)}
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

/**
 * P-105 item 1 — the HUMAN handoff, and only here.
 *
 * Clipboard FIRST, then open the chat, exactly as the workbench does it,
 * because Anthropic documents prefill only for the claude:// desktop scheme.
 * The prompt itself comes from buildSyncPrompt via pe-share-handoff.ts: one
 * builder, and the suite proves this path and the workbench path emit the
 * same bytes for the same subject.
 *
 * The prompt is embedded as a JSON string literal in an inline script rather
 * than pulled from the DOM, so escaping is the JSON serializer's problem and
 * not a hand-rolled quote dance. Inline script is permitted by the app's CSP
 * (script-src 'self' 'unsafe-inline', apps/property-explorer/vercel.json).
 *
 * If the script does not run — a text-mode reader, a stricter host — the
 * anchor is still a working link to a new Claude chat and the prompt is
 * still visible in the page. Degraded, and visibly so.
 */
function renderShareSyncSection(instrument: ShareInstrument): string {
  const handoff = buildShareSyncHandoff(shareSyncSubject(instrument))
  return `  <section data-testid="share-claude-sync">
    <h2>${escapeHtml(SHARE_SYNC_COPY.heading)}</h2>
    <p>${escapeHtml(SHARE_SYNC_COPY.lead)}</p>
    <p><a
      id="share-sync-web"
      data-testid="share-sync-web"
      href="${escapeHtml(handoff.webChatUrl)}"
      target="_blank"
      rel="noopener noreferrer"
    >${escapeHtml(SHARE_SYNC_COPY.button)}</a></p>
    <p><a
      data-testid="share-sync-desktop"
      href="${escapeHtml(handoff.desktopChatUrl)}"
    >${escapeHtml(SHARE_SYNC_COPY.desktopButton)}</a></p>
    <p data-testid="share-sync-prompt"><code>${escapeHtml(handoff.prompt)}</code></p>
    <p data-testid="share-sync-notice" hidden>${escapeHtml(SHARE_SYNC_COPY.sent)}</p>
    <p data-testid="share-sync-copy-failed" hidden>${escapeHtml(SHARE_SYNC_COPY.copyFailed)}</p>
    <p data-testid="share-sync-connect">${escapeHtml(SHARE_SYNC_COPY.notConnected)}</p>
  </section>
  <script>
  (function () {
    var prompt = ${scriptSafeJson(handoff.prompt)};
    var link = document.getElementById("share-sync-web");
    if (!link) return;
    link.addEventListener("click", function () {
      var sent = document.querySelector('[data-testid="share-sync-notice"]');
      var failed = document.querySelector('[data-testid="share-sync-copy-failed"]');
      var reveal = function (el) { if (el) el.hidden = false; };
      try {
        navigator.clipboard.writeText(prompt).then(
          function () { reveal(sent); },
          function () { reveal(failed); }
        );
      } catch (e) {
        reveal(failed);
      }
    });
  })();
  </script>`
}

export function renderShareInstrument(
  instrument: ShareInstrument,
  format: ShareInstrumentFormat,
): string {
  if (format === 'json') return renderShareInstrumentJson(instrument)
  if (format === 'markdown') return renderShareInstrumentMarkdown(instrument)
  return renderShareInstrumentHtml(instrument)
}
