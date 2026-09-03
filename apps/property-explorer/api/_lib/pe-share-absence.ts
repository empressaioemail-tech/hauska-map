// Share-plane absence vocabulary and customer-copy guards (P-105 items 3-6).
//
// WHY THIS EXISTS. Before P-105 every unavailable thing on a share said one
// of two sentences: "Not verified on this share." for a facet, or
// "Not exported by the sharer (<raw MCP error>)." for an artifact. Both are
// the same defect in different clothes. The first collapses four genuinely
// different states into one word, so a model reading the share cannot tell
// "the sharer left it out" from "nobody has measured this county" and has
// no next action either way. The second asserts two facts at once — that
// the sharer chose not to include it AND that it does not exist — and
// shipped the raw upstream error text, including a literal (404) and an
// instruction to call a tool the recipient has no access to.
//
// THE VOCABULARY IS NOT NEW. The disposition tokens and the shape of the
// guidance sentence are lifted from the Smart Site MCP server, which already
// puts them on the wire for every non-present facet:
//
//   legacy-design-tools artifacts/smartsite-mcp/src/vocabulary.ts
//     VOCABULARY / WIRE_DISPOSITION_DISPLAY_TEXT
//   legacy-design-tools artifacts/smartsite-mcp/src/tool-honesty.ts
//     facetGuidance(): `This facet is ${state} for this parcel on this call.
//                       Do not invent ${topic}.`
//
// read at origin/main 91e39991a3ecdedbf1e703e205ec3b6240477d71 on 2026-09-01.
// A model that has seen a Smart Site tool result in the same conversation
// already holds meanings for `refused`, `unknown`, `absent` and `unread`
// from that server's standing vocabulary block, so a share body that reuses
// them is legible without teaching anything twice.
//
// THIS IS A CROSS-REPO COPY AND IT CAN DRIFT. hauska-map cannot import from
// legacy-design-tools. There is no divergence test available from this side,
// which is a real weakness and is declared rather than papered over: if the
// MCP server renames a disposition token, this file keeps shipping the old
// one and nothing here fails. That is filed as an OPEN on the P-105 close.

/**
 * WHY a thing is not on this share. Five states, not one.
 *
 * The card named four as the minimum (the sharer did not include it; we have
 * not measured this county; it is paid-tier; it does not exist for this
 * parcel). `unread` is the fifth and is the honest answer whenever the share
 * plane could not perform the check at all — a missing product key, a
 * transport fault, a link shape that carries no dossier. Folding those into
 * any of the other four would be inventing a finding out of a failure to
 * look, which is the exact move this vocabulary exists to prevent.
 */
export type ShareAbsenceState =
  /** The sharer had it and deliberately left it out of the package. */
  | 'excluded-by-sharer'
  /** Nobody has measured this for this parcel yet. Not a claim of absence. */
  | 'not-measured'
  /** It exists and this tier does not open it. */
  | 'tier-gated'
  /** We looked and there is no such thing for this parcel. */
  | 'absent-for-parcel'
  /** The check itself did not run on this call. No claim either way. */
  | 'unread'

/**
 * The MCP wire disposition each share state maps onto. Two share states map
 * to `refused` and that is correct: a sharer's exclusion and a tier gate are
 * both a producer declining, and they stay distinguishable by their own
 * state, display sentence and guidance. The mapping exists so a model can
 * fall back on a token it already has a definition for.
 */
export type ShareAbsenceDisposition = 'refused' | 'unknown' | 'absent' | 'unread'

export interface ShareAbsence {
  state: ShareAbsenceState
  /** MCP disposition token. See the module header for its source. */
  disposition: ShareAbsenceDisposition
  /** The sentence a person reads. Never carries an error code or a tool name. */
  display: string
  /**
   * What a model may do next, in the shape tool-honesty.ts uses. Negative
   * guidance ("do not invent") plus the one action that is actually open to
   * the reader's user. Never an instruction to call a tool the reader cannot
   * reach.
   */
  agentGuidance: string
}

/** Refusal code, where one of the MCP server's own codes applies. */
export const SHARE_TIER_REFUSAL_CODE = 'upgrade_required'

const ABSENCE_TABLE: Record<
  ShareAbsenceState,
  { disposition: ShareAbsenceDisposition; display: string; agentGuidance: string }
> = {
  'excluded-by-sharer': {
    disposition: 'refused',
    display: 'The sharer left this out of the share.',
    agentGuidance:
      'Refused on this share because the sharer excluded it. Do not infer that it does not exist. The person who sent the link can reshare with it included.',
  },
  'not-measured': {
    disposition: 'unknown',
    display: 'Not measured for this parcel yet.',
    agentGuidance:
      'Unknown on this share: nothing has been measured for it here, which is not a finding either way. Do not invent a value. Coverage grows county by county, so it may be measurable later.',
  },
  'tier-gated': {
    disposition: 'refused',
    display: 'Included in a paid tier, which this share does not open.',
    agentGuidance:
      'Refused on this share because it sits above the tier this link carries. Do not invent a value. It is available on a Smart Site account with that tier.',
  },
  'absent-for-parcel': {
    disposition: 'absent',
    display: 'Nothing of this kind exists for this parcel.',
    agentGuidance:
      'Reported absent for this parcel: the record was checked and there is nothing to return. Do not present it as pending and do not invent a value.',
  },
  unread: {
    disposition: 'unread',
    display: 'Not checked on this share.',
    agentGuidance:
      'Unread on this call: the check did not run, so no claim is made either way. Do not treat it as absent and do not invent a value.',
  },
}

export function shareAbsence(state: ShareAbsenceState): ShareAbsence {
  const row = ABSENCE_TABLE[state]
  if (!row) {
    // Fail closed. A state with no vocabulary row must not degrade into a
    // generic sentence, because a generic sentence is the thing being fixed.
    throw new Error(`share_absence_state_unknown:${String(state)}`)
  }
  return { state, ...row }
}

export const SHARE_ABSENCE_STATES: readonly ShareAbsenceState[] = [
  'excluded-by-sharer',
  'not-measured',
  'tier-gated',
  'absent-for-parcel',
  'unread',
]

/**
 * A MEANING-shaped check, not a presence-shaped one.
 *
 * A test that renders one absence and greps for its words has a single input
 * and passes on a table where every row is the same sentence. This compares
 * the rows PAIRWISE and names the pair that collapsed, so making any two
 * states say the same thing fails here rather than shipping.
 *
 * Both halves are compared because they can collapse independently: two
 * states can share a display sentence while their guidance differs, and vice
 * versa. Either is a collapse.
 */
export function collapsedAbsenceStates(): string[] {
  const collisions: string[] = []
  const states = SHARE_ABSENCE_STATES
  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      const a = shareAbsence(states[i])
      const b = shareAbsence(states[j])
      if (a.display === b.display) {
        collisions.push(`${a.state}/${b.state}:display`)
      }
      if (a.agentGuidance === b.agentGuidance) {
        collisions.push(`${a.state}/${b.state}:agentGuidance`)
      }
    }
  }
  return collisions
}

/**
 * Classify an MCP tool error into an absence, so no raw upstream string ever
 * reaches a customer body.
 *
 * The classifier reads the upstream message and returns a STATE. The message
 * itself is dropped on the floor — that is the point. It is developer text,
 * it carries HTTP codes and internal tool names, and on the dossier probe it
 * literally said "Call refresh_parcel_dossier_export first to build it",
 * which is an instruction to a foreign model to invoke a tool it has no
 * access to.
 *
 * Unmatched text classifies as `unread`, never as `absent-for-parcel`. An
 * error we cannot read is a failure to look, not a finding.
 */
export function classifyArtifactProbeError(
  message: string | null | undefined,
): ShareAbsenceState {
  const text = (message ?? '').toLowerCase()
  if (!text.trim()) return 'unread'
  if (/upgrade|entitle|paid tier|subscription|not authori[sz]ed|forbidden|403/.test(text)) {
    return 'tier-gated'
  }
  if (
    /not found|no such|does not exist|never (been )?(built|exported|generated)|no artifact|missing|404/.test(
      text,
    )
  ) {
    return 'absent-for-parcel'
  }
  return 'unread'
}

/* -------------------------------------------------------------------------
 * Customer-copy guards.
 *
 * These are the detectors the P-105 tests gate on. Each one states its
 * exclusion set, because an instrument's exclusion set is part of its
 * contract: a guard whose scope is unstated gets widened silently the first
 * time it is inconvenient.
 * ---------------------------------------------------------------------- */

/**
 * Tool names a share body must never print.
 *
 * NOT a blanket ban on tool names. The share deliberately names ONE tool,
 * `get_smart_site`, because that is the whole point of the connector offer:
 * a model that has the connector needs the exact tool that opens this
 * parcel. Every name below is a tool the share RECIPIENT cannot call —
 * either it needs an owner scope the link does not carry, or it triggers
 * compute a viewer is never allowed to trigger. Printing one is how a body
 * ends up instructing a foreign model to invoke something that will fail.
 */
export const INTERNAL_TOOL_NAMES: readonly string[] = [
  'refresh_parcel_dossier_export',
  'download_parcel_dossier_export',
  'download_parcel_site_plan_export',
  'download_parcel_terrain_export',
  'refresh_parcel_site_plan_export',
  'refresh_parcel_terrain_export',
]

/** Names of internal tools found in a customer-facing body. Empty is clean. */
export function internalToolNamesIn(body: string): string[] {
  return INTERNAL_TOOL_NAMES.filter((name) => body.includes(name))
}

/**
 * Raw HTTP status codes leaking into customer copy.
 *
 * EXCLUSION SET, and why it is this narrow. A bare three-digit scan is
 * wrong here and would be a check that fires on correct copy: "No pipeline
 * within 500 ft" is real overlay text, a parcel node id is digits, and a
 * grant UUID is hex. This matches only the three shapes an upstream error
 * string actually takes when it leaks:
 *
 *   1. a parenthesised code, e.g. "(404)"  — the exact P-105 instance
 *   2. "HTTP 404" / "http 502"
 *   3. "status 404" / "returned 502" / "code 503"
 *
 * A leak dressed some fourth way is NOT caught, and that is a stated limit
 * rather than a claim of completeness.
 */
export function httpStatusLeaksIn(body: string): string[] {
  const hits: string[] = []
  const patterns: RegExp[] = [
    /\((?:[1-5]\d{2})\)/g,
    /\bHTTPS?\s+(?:[1-5]\d{2})\b/gi,
    /\b(?:status|statuscode|status code|returned|code)\s+(?:[1-5]\d{2})\b/gi,
  ]
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      hits.push(match[0])
    }
  }
  return hits
}

/**
 * Relative URLs in an agent body (P-105 item 3).
 *
 * A foreign model has no base to resolve `/share?g=...` against, so a
 * relative link is not a degraded link, it is an unusable one. Matches
 * markdown link targets `](...)` and HTML `href="..."` whose target does
 * not start with a scheme.
 *
 * EXCLUSION SET: in-document fragments (`#section`) are not URLs to resolve
 * and are allowed; `mailto:` and `tel:` are schemes and pass.
 */
export function relativeUrlsIn(body: string): string[] {
  const hits: string[] = []
  const targets: string[] = []
  for (const m of body.matchAll(/\]\(([^)\s]+)/g)) targets.push(m[1])
  for (const m of body.matchAll(/\bhref="([^"]+)"/g)) targets.push(m[1])
  for (const m of body.matchAll(/\bhref='([^']+)'/g)) targets.push(m[1])
  for (const target of targets) {
    if (target.startsWith('#')) continue
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    hits.push(target)
  }
  return hits
}

/**
 * Rooted-path strings anywhere in a parsed JSON body (P-105 item 3, JSON leg).
 *
 * relativeUrlsIn() reads link SYNTAX, which JSON does not have — a relative
 * link in the JSON form is a plain string value like "/share?g=...". This
 * walks the parsed value and returns `path -> value` for every string that
 * begins with a single slash.
 *
 * EXCLUSION SET: protocol-relative "//host/x" is NOT flagged (it carries a
 * host, and nothing in this codebase emits one); a bare "/" is flagged.
 * Every rooted path is treated as a defect regardless of the key it sits
 * under, which is deliberate — there is no field on a share instrument where
 * a rooted path is the right value.
 */
export function relativePathValuesIn(value: unknown, at = '$'): string[] {
  if (typeof value === 'string') {
    return /^\/(?!\/)/.test(value) ? [`${at}=${value}`] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => relativePathValuesIn(item, `${at}[${i}]`))
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      relativePathValuesIn(v, `${at}.${k}`),
    )
  }
  return []
}

/**
 * A URL that is safe to print in an agent body: absolute, http(s), no hash.
 *
 * FAILS CLOSED. It throws rather than returning a relative fallback, because
 * a relative fallback is precisely the defect: the previous code emitted
 * `/share?g={id}` whenever it had no origin, and a body that reaches a model
 * with an unusable link looks identical to one with a usable link.
 */
export function absoluteShareUrl(origin: string, pathAndQuery: string): string {
  const trimmed = (origin ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^/\s]+$/i.test(trimmed)) {
    throw new Error(`share_origin_not_absolute:${origin ?? ''}`)
  }
  if (!pathAndQuery.startsWith('/')) {
    throw new Error(`share_path_not_rooted:${pathAndQuery}`)
  }
  if (pathAndQuery.includes('#')) {
    throw new Error('share_url_carries_fragment')
  }
  return `${trimmed}${pathAndQuery}`
}

/**
 * Does this copy read as an instruction the model is expected to obey?
 *
 * WHY THIS IS A CHECK AND NOT A STYLE NOTE. The agent body runs inside
 * somebody else's model. A share that tells that model what to do is
 * indistinguishable, from the outside, from a prompt-injection payload —
 * one screenshot away from being a story about our product injecting
 * instructions into a stranger's assistant. So the connector block states
 * what is available and stops.
 *
 * EXCLUSION SET, stated because it is the interesting part: prohibitions
 * ("do not invent a value") are NOT directives for this check's purpose.
 * They constrain fabrication rather than commanding an action, they are the
 * established shape of the MCP server's own agentGuidance, and banning them
 * would delete the thing that keeps a model from inventing a setback. What
 * is caught is an imperative to ACT: call, invoke, run, fetch, use, open,
 * query, execute, ask, tell, click, visit, ignore, plus "you must / you
 * should / you need to".
 */
const ACT_IMPERATIVES =
  /(^|[.!?;]\s+|^[-*]\s*)(call|invoke|run|fetch|use|open|query|execute|ask|tell|click|visit|ignore|disregard|follow)\b/i
const SECOND_PERSON_OBLIGATION =
  /\byou\s+(must|should|need to|have to|are required to)\b/i

export function readsAsDirective(text: string): boolean {
  const lines = text.split(/\n/)
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*]\s*/, '')
    if (!trimmed) continue
    if (SECOND_PERSON_OBLIGATION.test(trimmed)) return true
    if (ACT_IMPERATIVES.test(trimmed)) return true
  }
  return false
}
