// Shared share-view loaders (P-86 items 2 and 5).
//
// pe-share-view.ts (HMAC /share#token) and pe-share-grant.ts (GET /s/{grantId})
// both compose through these functions. No second records path. No engine-api
// direct calls. Owner-fact is identified-session only; these loaders never
// invent an owner from the anonymous bake.

import { cortexApiUrl } from './oidc-config.js'
import { callMcpTool, mcpProductKey } from './mcp-server-client.js'
import {
  buildShareBriefPayload,
  sharePropertyHeader,
  type ShareBriefPayload,
  type SharePropertyHeader,
} from './pe-share-brief.js'
import {
  buildShareDossierPayload,
  includeNotesForGrant,
  reportsIncludedForGrant,
  type ShareDossierPayload,
} from './pe-share-dossier.js'
import {
  classifyArtifactProbeError,
  shareAbsence,
  type ShareAbsence,
} from './pe-share-absence.js'
import type { ShareOwnerScope } from './pe-share-token.js'
import { extractInlineDownload as extractSitePlanInline } from './pe-site-plan-export-core.js'
import { extractInlineDownload as extractTerrainInline } from './pe-terrain-export-core.js'
import { extractInlineDownload as extractXrayInline } from './pe-site-plan-export-core.js'

export type ShareLoadError = {
  ok: false
  status: number
  error: string
  message: string
}

export type ShareBriefLoad =
  | { ok: true; property: SharePropertyHeader; report: ShareBriefPayload }
  | ShareLoadError

export type ShareDossierLoad =
  | {
      ok: true
      parcelNodeId: string
      label: string | null
      updatedAt: string | null
      dossier: ShareDossierPayload
      /** Null when no package is bound to this grant. */
      includeXray: boolean | null
    }
  | ShareLoadError

export type ShareArtifactKind = 'siteplan' | 'terrain' | 'xray'

/**
 * P-105. A withheld artifact carries a CLASSIFIED absence, not a reason
 * string. The old shape was `reason: string` and it was filled with the raw
 * MCP tool error, which is how a customer-facing body came to contain a
 * literal "(404)" and the sentence "Call refresh_parcel_dossier_export first
 * to build it" — an instruction to a foreign model to invoke a tool it has
 * no access to. The type change is the fix: there is no longer a slot for
 * upstream prose to sit in.
 */
export type ShareArtifactState =
  | { state: 'exported'; kind: ShareArtifactKind }
  | { state: 'withheld'; kind: ShareArtifactKind; absence: ShareAbsence }

export type ShareComposeFetch = typeof fetch
export type ShareComposeMcp = typeof callMcpTool

export async function loadShareBrief(
  parcelNodeId: string,
  fetchImpl: ShareComposeFetch = fetch,
): Promise<ShareBriefLoad> {
  const url = `${cortexApiUrl()}/api/brokerage/v1/place/node/${encodeURIComponent(parcelNodeId)}/facets`
  let upstream: Response
  try {
    upstream = await fetchImpl(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: 'upstream_error',
      message: err instanceof Error ? err.message : String(err),
    }
  }
  if (upstream.status === 404) {
    return {
      ok: false,
      status: 404,
      error: 'baked_snapshot_not_found',
      message: 'No baked facet snapshot exists for this parcel node.',
    }
  }
  if (!upstream.ok) {
    return {
      ok: false,
      status: 502,
      error: 'upstream_error',
      message: `Facet snapshot fetch returned ${upstream.status}.`,
    }
  }
  const body = (await upstream.json().catch(() => null)) as {
    facets?: unknown
    tier2?: unknown
    snapshotAt?: unknown
  } | null
  if (!body || body.facets === undefined) {
    return {
      ok: false,
      status: 502,
      error: 'upstream_error',
      message: 'Facet snapshot response was not readable.',
    }
  }
  const snapshotAt = typeof body.snapshotAt === 'string' ? body.snapshotAt : null
  return {
    ok: true,
    property: sharePropertyHeader(parcelNodeId, body.facets),
    report: buildShareBriefPayload({
      parcelNodeId,
      facets: body.facets,
      tier2: body.tier2 ?? null,
      snapshotAt,
    }),
  }
}

export async function loadShareDossier(
  parcelNodeId: string,
  ownerScope: ShareOwnerScope | null,
  opts: {
    fetchImpl?: ShareComposeFetch
    serviceKey?: string | null
    grantId?: string
  } = {},
): Promise<ShareDossierLoad> {
  if (!ownerScope) {
    return {
      ok: false,
      status: 404,
      error: 'dossier_not_available',
      message: 'This share link does not carry a dossier.',
    }
  }
  const serviceKey =
    opts.serviceKey !== undefined
      ? opts.serviceKey
      : process.env.CORTEX_SERVICE_API_KEY?.trim() ?? null
  if (!serviceKey) {
    return {
      ok: false,
      status: 404,
      error: 'dossier_not_available',
      message: 'Dossier sharing is not configured on this deployment.',
    }
  }
  const qs = new URLSearchParams({
    tenantId: ownerScope.tenantId,
    ownerUserId: ownerScope.ownerUserId,
    parcelNodeId,
  })
  const url = `${cortexApiUrl()}/api/property-explorer/v1/internal/share-dossier?${qs.toString()}`
  const fetchImpl = opts.fetchImpl ?? fetch
  let upstream: Response
  try {
    upstream = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
    })
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: 'upstream_error',
      message: err instanceof Error ? err.message : String(err),
    }
  }
  if (upstream.status === 404) {
    return {
      ok: false,
      status: 404,
      error: 'dossier_not_available',
      message: 'No saved dossier exists for this share.',
    }
  }
  if (!upstream.ok) {
    return {
      ok: false,
      status: 502,
      error: 'upstream_error',
      message: `Dossier fetch returned ${upstream.status}.`,
    }
  }
  const body = (await upstream.json().catch(() => null)) as {
    parcelNodeId?: unknown
    label?: unknown
    updatedAt?: unknown
    snapshot?: unknown
  } | null
  const includeNotes = opts.grantId
    ? includeNotesForGrant(body?.snapshot, opts.grantId)
    : null
  const dossier = body
    ? buildShareDossierPayload(body.snapshot, {
        ...(includeNotes === false ? { includeNotes: false } : {}),
      })
    : null
  if (!dossier) {
    return {
      ok: false,
      status: 404,
      error: 'dossier_not_available',
      message: 'The saved dossier has nothing to share yet.',
    }
  }
  return {
    ok: true,
    parcelNodeId,
    label: typeof body?.label === 'string' ? body.label : null,
    updatedAt: typeof body?.updatedAt === 'string' ? body.updatedAt : null,
    dossier,
    includeXray: opts.grantId
      ? (reportsIncludedForGrant(body?.snapshot, opts.grantId)?.includeXray ??
        null)
      : null,
  }
}

function mcpToolErrorMessage(payload: Record<string, unknown>): string {
  for (const key of ['message', 'reason', 'error', 'raw'] as const) {
    const v = payload[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return 'Download declined.'
}

export async function probeShareArtifact(
  kind: ShareArtifactKind,
  parcelNodeId: string,
  opts: { callTool?: ShareComposeMcp; productKey?: string | null } = {},
): Promise<ShareArtifactState> {
  const productKey =
    opts.productKey !== undefined ? opts.productKey : mcpProductKey()
  if (!productKey) {
    // Nothing was asked, so nothing is known. Unread, never absent.
    return { state: 'withheld', kind, absence: shareAbsence('unread') }
  }
  const callTool = opts.callTool ?? callMcpTool
  const spec =
    kind === 'siteplan'
      ? {
          tool: 'download_parcel_site_plan_export' as const,
          args: { parcel_node_id: parcelNodeId, format: 'pdf-site-plan' },
          extract: extractSitePlanInline,
        }
      : kind === 'terrain'
        ? {
            tool: 'download_parcel_terrain_export' as const,
            args: { parcel_node_id: parcelNodeId, format: 'glb' },
            extract: extractTerrainInline,
          }
        : {
            tool: 'download_parcel_dossier_export' as const,
            args: { parcel_node_id: parcelNodeId },
            extract: extractXrayInline,
          }
  try {
    const payload = await callTool(spec.tool, spec.args)
    if (payload.isError === true) {
      // P-105 item 6. The old line was
      //   `Not exported by the sharer (${mcpToolErrorMessage(payload)}).`
      // which asserted TWO facts at once — that the sharer chose to leave it
      // out, and that it does not exist — from evidence that supports only
      // one of them. A download tool erroring says the artifact is not
      // there. It says nothing at all about the sharer's intent; the only
      // place sharer intent is actually known is the share package's own
      // include flags, and composeShareInstrument reads those separately.
      // So: classify, pick the true one, say only that, and drop the
      // upstream prose entirely rather than parenthesising it.
      return {
        state: 'withheld',
        kind,
        absence: shareAbsence(
          classifyArtifactProbeError(mcpToolErrorMessage(payload)),
        ),
      }
    }
    if (!spec.extract(payload)) {
      // The call succeeded and returned nothing usable. That is a failure to
      // read, not a finding about the parcel.
      return { state: 'withheld', kind, absence: shareAbsence('unread') }
    }
    return { state: 'exported', kind }
  } catch (err) {
    // Transport fault. Deliberately NOT absent-for-parcel: an empty result is
    // not an absence, and only a positive determination writes one.
    void err
    return { state: 'withheld', kind, absence: shareAbsence('unread') }
  }
}
