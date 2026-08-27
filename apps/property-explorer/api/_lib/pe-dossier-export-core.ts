// Shared dossier-export BFF logic (testable) — engine #174 / MCP dossier
// tools wiring, FOLDED into the existing pe-site-plan-export function via
// `kind=dossier` (Vercel 11/12 function cap: no new serverless function).
//
// The dossier is ONE hand-to-client PDF the ENGINE assembles: Standard-styled
// cover with the caller-supplied verdict (verbatim, labeled), cited brief
// facts, the AI chat summary (labeled, with disclaimer), owner notes, and the
// parcel's site-plan sheets appended. The BFF only ASSEMBLES and FORWARDS the
// caller-supplied content — missing pieces are honestly omitted and the
// engine renders their absence honestly; nothing is fabricated here.
//
// GATE (the R1 line): dossier export requires PROPERTY entitlement — paid
// tier OR the single-property unlock for this parcel (unlike the Pro-only
// site-plan/terrain exports). Same session cookie, same dev bypass.

import { isValidParcelNodeId } from './parcel-node-id.js'
import { extractInlineDownload } from './pe-site-plan-export-core.js'
import type { SitePlanExportInlineDownload } from './pe-site-plan-export-core.js'

export const DOSSIER_EXPORT_FORMAT = 'pdf-dossier' as const

// Caps mirror the engine's dossierRefreshBody zod caps (parcel-terrain.ts,
// engine #174) so an over-cap field is trimmed here instead of failing the
// whole request with a 400 at the engine.
export const DOSSIER_VERDICT_MAX_CHARS = 400
export const DOSSIER_NOTES_MAX_CHARS = 4_000
export const DOSSIER_SUMMARY_MAX_CHARS = 12_000
export const DOSSIER_DISCLAIMER_MAX_CHARS = 600
export const DOSSIER_BRIEF_MAX_SECTIONS = 16
export const DOSSIER_BRIEF_MAX_FACTS_PER_SECTION = 60

export interface DossierBriefFact {
  label: string
  value?: string
  source?: string
  vintage?: string
}

export interface DossierBriefSection {
  id: string
  title: string
  facts: DossierBriefFact[]
}

export interface DossierChatSummary {
  summary: string
  savedAt: string
  disclaimer?: string
}

/** The engine-facing dossier content (forwarded verbatim after cap-trim). */
export interface DossierExportRequestContent {
  address?: string
  countyName?: string
  verdictLine?: string
  brief?: { sections: DossierBriefSection[] }
  chatSummary?: DossierChatSummary
  notes?: string
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function capStr(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  if (!trimmed) return undefined
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function sanitizeBrief(
  value: unknown,
): { sections: DossierBriefSection[] } | undefined {
  const rec = asRecord(value)
  if (!rec || !Array.isArray(rec.sections)) return undefined
  const sections: DossierBriefSection[] = []
  for (const raw of rec.sections) {
    if (sections.length >= DOSSIER_BRIEF_MAX_SECTIONS) break
    const s = asRecord(raw)
    if (!s) continue
    const id = capStr(s.id, 64)
    const title = capStr(s.title, 160)
    if (!id || !title || !Array.isArray(s.facts)) continue
    const facts: DossierBriefFact[] = []
    for (const rawFact of s.facts) {
      if (facts.length >= DOSSIER_BRIEF_MAX_FACTS_PER_SECTION) break
      const f = asRecord(rawFact)
      if (!f) continue
      const label = capStr(f.label, 160)
      if (!label) continue
      const fact: DossierBriefFact = { label }
      const factValue = capStr(f.value, 400)
      if (factValue) fact.value = factValue
      const source = capStr(f.source, 240)
      if (source) fact.source = source
      const vintage = capStr(f.vintage, 80)
      if (vintage) fact.vintage = vintage
      facts.push(fact)
    }
    if (facts.length === 0) continue
    sections.push({ id, title, facts })
  }
  return sections.length > 0 ? { sections } : undefined
}

function sanitizeChatSummary(value: unknown): DossierChatSummary | undefined {
  const rec = asRecord(value)
  if (!rec) return undefined
  const summary = capStr(rec.summary, DOSSIER_SUMMARY_MAX_CHARS)
  const savedAt = capStr(rec.savedAt, 64)
  if (!summary || !savedAt) return undefined
  const out: DossierChatSummary = { summary, savedAt }
  const disclaimer = capStr(rec.disclaimer, DOSSIER_DISCLAIMER_MAX_CHARS)
  if (disclaimer) out.disclaimer = disclaimer
  return out
}

/**
 * Parse + cap-trim the dossier refresh body.
 *
 * Three-way blank (W4.P0):
 *   1. World-fact values (a flood cell, living area) may be absent inside a
 *      carried brief — those stay on the request so the engine can name the
 *      miss on the page.
 *   2. User content (owner notes, saved AI summary) is omitted silently when
 *      absent. Never default a "your notes: unavailable" row here.
 *   3. Pipeline output (verdict, brief facts) is NOT defaulted here. The
 *      caller MUST run refuseHollowXrayExport before any MCP/engine hop.
 */
export function parseDossierExportContent(
  body: Record<string, unknown> | null | undefined,
): DossierExportRequestContent {
  const rec = body ?? {}
  const out: DossierExportRequestContent = {}
  const address = capStr(rec.address, 200)
  if (address) out.address = address
  const countyName = capStr(rec.countyName, 120)
  if (countyName) out.countyName = countyName
  const verdictLine = capStr(rec.verdictLine, DOSSIER_VERDICT_MAX_CHARS)
  if (verdictLine) out.verdictLine = verdictLine
  const brief = sanitizeBrief(rec.brief)
  if (brief) out.brief = brief
  const chatSummary = sanitizeChatSummary(rec.chatSummary)
  if (chatSummary) out.chatSummary = chatSummary
  const notes = capStr(rec.notes, DOSSIER_NOTES_MAX_CHARS)
  if (notes) out.notes = notes
  return out
}

export const XRAY_PIPELINE_ABSENT_ERROR = 'pipeline_output_absent' as const

export const XRAY_PIPELINE_ABSENT_MESSAGE =
  'X-ray cannot be generated: the verdict and cited brief facts were not produced. Open the property brief and try again. A hollow report will not be downloaded.'

/** Same sentence as VERDICT_UNRESOLVED.line in sheet-verdict.ts. A meaning-shaped test binds the two. */
export const XRAY_VERDICT_PLACEHOLDER =
  'This property has not resolved a fact sheet yet.'

export type HollowXrayRefuse = {
  ok: false
  error: typeof XRAY_PIPELINE_ABSENT_ERROR
  message: string
  missing: Array<'verdict' | 'brief_facts'>
}

/**
 * Fail-closed gate for X-ray export. Pipeline output (verdict line + at least
 * one brief fact) must be present or the export is refused — no MCP call, no
 * PDF bytes.
 *
 * An honest miss is a claim about the world and it earns trust. A pipeline
 * error styled as an honest miss is an error message wearing the trust
 * device as a costume, and it destroys the credibility of the real misses.
 *
 * User-content absence (notes, chat summary) is not a refuse. Those rows are
 * omitted from the request, never rendered as UNAVAILABLE by this gate.
 */
export function refuseHollowXrayExport(
  content: DossierExportRequestContent,
): { ok: true } | HollowXrayRefuse {
  const missing: Array<'verdict' | 'brief_facts'> = []
  if (!content.verdictLine || content.verdictLine === XRAY_VERDICT_PLACEHOLDER) {
    missing.push('verdict')
  }
  const factCount = (content.brief?.sections ?? []).reduce(
    (n, section) => n + section.facts.length,
    0,
  )
  if (factCount === 0) missing.push('brief_facts')
  if (missing.length === 0) return { ok: true }
  return {
    ok: false,
    error: XRAY_PIPELINE_ABSENT_ERROR,
    message: XRAY_PIPELINE_ABSENT_MESSAGE,
    missing,
  }
}

// ---------------------------------------------------------------------------
// Auth — PROPERTY entitlement (the R1 line): paid tier OR the per-property
// unlock clears the gate; dev bypass honored (session still required).
// ---------------------------------------------------------------------------

export type DossierExportAuthResult =
  | { ok: true; devBypass?: boolean }
  | { ok: false; status: 401 | 402 | 503; error: string; message?: string }

export function resolveDossierExportAuth(input: {
  sessionToken: string | null
  entitlement:
    | {
        ok: true
        tier: 'free' | 'paid'
        propertyUnlocked: boolean | null
      }
    | { ok: false; status: 401 | 503; message?: string }
  devBypass?: boolean
}): DossierExportAuthResult {
  if (!input.sessionToken) {
    return {
      ok: false,
      status: 401,
      error: 'authentication_required',
      message: 'Sign in to export the property dossier.',
    }
  }
  if (input.devBypass) {
    return { ok: true, devBypass: true }
  }
  if (!input.entitlement.ok) {
    return {
      ok: false,
      status: input.entitlement.status,
      error:
        input.entitlement.status === 401
          ? 'authentication_required'
          : 'entitlement_unavailable',
      message: input.entitlement.message,
    }
  }
  if (input.entitlement.tier !== 'paid' && input.entitlement.propertyUnlocked !== true) {
    return {
      ok: false,
      status: 402,
      error: 'payment_required',
      message: 'Unlock this property (or Pro) to export its dossier PDF.',
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Response mapping.
// ---------------------------------------------------------------------------

export function buildDossierDownloadPath(parcelNodeId: string): string {
  const qs = new URLSearchParams({
    parcelNodeId,
    kind: 'dossier',
    action: 'download',
  })
  return `/api/pe-site-plan-export?${qs.toString()}`
}

export function dossierFilename(parcelNodeId: string): string {
  return `${parcelNodeId.replace(':', '_')}_smart_site_xray.pdf`
}

export interface DossierExportBffResponse {
  ok: true
  parcelNodeId: string
  format: typeof DOSSIER_EXPORT_FORMAT
  downloadUrl: string
  /** Present when MCP inlined the PDF bytes (under 256 KiB). Prefer over downloadUrl. */
  inlineDownload?: SitePlanExportInlineDownload
  pageCount?: number
  dossierPageCount?: number
  /** Honesty flags — passed through verbatim from the engine, never hidden. */
  sitePlanAppended?: boolean
  sitePlanUnavailableReason?: string
  verdictIncluded?: boolean
  briefSectionCount?: number
  briefFactCount?: number
  chatSummaryIncluded?: boolean
  notesIncluded?: boolean
  setbackDegenerate?: boolean
  setbackHonestAbsence?: boolean
  streetHonestAbsence?: boolean
  zoningHonestAbsence?: boolean
  floodZoneHonestUnavailable?: boolean
}

function optBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function optNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function mapMcpDossierPayload(
  payload: Record<string, unknown>,
  requestParcelNodeId: string,
): DossierExportBffResponse | { ok: false; message: string } {
  if (payload.isError === true) {
    const msg =
      (typeof payload.message === 'string' && payload.message) ||
      (typeof payload.error === 'string' && payload.error) ||
      'MCP dossier tool returned isError.'
    return { ok: false, message: msg }
  }
  const dataBlock = asRecord(payload.data)
  const atom = asRecord(dataBlock?.atom ?? payload.atom)
  const parcelNodeId =
    (typeof dataBlock?.parcelNodeId === 'string' && dataBlock.parcelNodeId) ||
    (typeof payload.parcelNodeId === 'string' && payload.parcelNodeId) ||
    (typeof atom?.parcelNodeId === 'string' && atom.parcelNodeId) ||
    requestParcelNodeId

  if (!isValidParcelNodeId(parcelNodeId)) {
    return { ok: false, message: 'MCP dossier response missing parcelNodeId.' }
  }

  const flags = (dataBlock ?? payload) as Record<string, unknown>
  const inlineDownload = extractInlineDownload(payload)

  return {
    ok: true,
    parcelNodeId,
    format: DOSSIER_EXPORT_FORMAT,
    downloadUrl: buildDossierDownloadPath(parcelNodeId),
    ...(inlineDownload ? { inlineDownload } : {}),
    pageCount: optNum(flags.pageCount),
    dossierPageCount: optNum(flags.dossierPageCount),
    sitePlanAppended: optBool(flags.sitePlanAppended),
    sitePlanUnavailableReason:
      typeof flags.sitePlanUnavailableReason === 'string'
        ? flags.sitePlanUnavailableReason
        : undefined,
    verdictIncluded: optBool(flags.verdictIncluded),
    briefSectionCount: optNum(flags.briefSectionCount),
    briefFactCount: optNum(flags.briefFactCount),
    chatSummaryIncluded: optBool(flags.chatSummaryIncluded),
    notesIncluded: optBool(flags.notesIncluded),
    setbackDegenerate: optBool(flags.setbackDegenerate),
    setbackHonestAbsence: optBool(flags.setbackHonestAbsence),
    streetHonestAbsence: optBool(flags.streetHonestAbsence),
    zoningHonestAbsence: optBool(flags.zoningHonestAbsence),
    floodZoneHonestUnavailable: optBool(flags.floodZoneHonestUnavailable),
  }
}
