// api/_lib/pe-property-atoms.ts
//
// Property Explorer inspect-card facets BFF (anti-zombie cut, Master WDLL 3.7):
//   GET /api/spine/property-atoms/:parcelNodeId/facets
//
// PROPERTY_ATOM_PATH=1 → atom-chain only for envelope/zoning product truth.
// When the atom-chain is empty/unusable, optionally merge cortex baseFacts /
// landUse / flood (landUse may remain on cortex temporarily) but NEVER serve
// cortex envelope as product truth — honest atom_path_pending instead.
// Flag unset/0 → cortex-only rollback (envelope still stripped on that path
// for product honesty once dual-serve retires; rollback keeps prior behavior
// for emergency only via ATOM_PATH_CORTEX_ENVELOPE_ROLLBACK=1).
//
// Bearer key stays server-side (never exposed to the browser).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  adaptAtomChainToBakedFacets,
  apnFromNodeId,
  atomChainIsUsable,
  floodHazardFactFromCortexRoot,
  hasLiveAtomChainSetbackRule,
  isPropertyAtomPathEnabled,
  jurisdictionKeyFromSourceAdapter,
  landUseFactFromCortexRoot,
  attachBuildablePctFromKnownLotArea,
  mergeBakedBaseFacts,
  pipelineFactFromCortexRoot,
  specialDistrictFactFromCortexRoot,
  wellFactFromCortexRoot,
  buildingFootprintFactFromCortexRoot,
  boundaryEdgeFactFromCortexRoot,
  ownerFactFromCortexRoot,
  parsePropertyAtomsPath,
  type PeBakedFacetsResponse,
  type PropertyAtomChain,
  shouldSkipColdDerive,
} from "./atom-chain-to-facets.js";
import {
  reconcileImperviousFigures,
  disclosureWithImperviousGoverning,
} from "./impervious-governing-figure.js";
import {
  composeRecordPatch,
  composeZoningSetbackOverride,
  classifyRecordFetchFailure,
  composeRecordUnavailablePatch,
  latestParseableDate,
  type ParcelRecordResponse,
  type ZoningSetbackOverride,
} from "./pe-record-to-facets.js";
import {
  disclosureWithCitationVintage,
  setbackCitationVintageRow,
} from "./setback-citation-vintage.js";
import {
  jurisdictionRequiresPerParcelSetbackRecord,
  type CodifiedSetbackScalars,
} from "./codified-setback-from-zoning.js";
import { fetchBastropPerParcelSetback } from "./pe-bastrop-per-parcel-setback.js";
import {
  echoRequestedParcelNodeId,
  parcelGrammarAlias,
} from "./parcel-node-id.js";
import { readPeSessionCookie } from "./session-cookie.js";

export { parsePropertyAtomsPath, isPropertyAtomPathEnabled, shouldSkipColdDerive };

const DEFAULT_RETRIEVAL =
  "https://hauska-retrieval-api-h7gvu7rgcq-uc.a.run.app";
const DEFAULT_CORTEX = "https://cortex-api-tds7av26va-uc.a.run.app";

/**
 * Per-attempt bound on ONE upstream fetch (retrieval / cortex, both Cloud Run
 * with possible min-instances 0). Without it a single hung cold-start socket
 * consumes the entire function maxDuration, the retry loop below never gets
 * its second attempt, and the client sees a platform 504 instead of a
 * retried-and-recovered read. A timed-out attempt surfaces as an abort
 * reason, which the transient matcher already classifies as retryable.
 * Env-overridable for tests and emergency tuning.
 */
const DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS = 10_000;

function upstreamFetchTimeoutMs(): number {
  const raw = Number(process.env.PE_UPSTREAM_FETCH_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_UPSTREAM_FETCH_TIMEOUT_MS;
}

export type PeReadPathHeader =
  | "atom-chain"
  | "atom-chain-warm"
  | "atom-pending"
  | "cortex"
  | "cortex-fallback"
  | "record"
  | "record-unavailable";

function retrievalConfig(): { baseUrl: string; key: string | undefined } {
  const baseUrl = (
    process.env.HAUSKA_RETRIEVAL_API_URL?.trim() ||
    process.env.RETRIEVAL_API_URL?.trim() ||
    DEFAULT_RETRIEVAL
  ).replace(/\/$/, "");
  const key =
    process.env.HAUSKA_RETRIEVAL_API_KEY?.trim() ||
    process.env.RETRIEVAL_API_KEY?.trim();
  return { baseUrl, key };
}

function cortexConfig(): { baseUrl: string; key: string | undefined } {
  const baseUrl = (
    process.env.CORTEX_API_URL?.trim() || DEFAULT_CORTEX
  ).replace(/\/$/, "");
  const key = process.env.CORTEX_SERVICE_API_KEY?.trim();
  return { baseUrl, key };
}

/**
 * Identified inspect forwards the existing pe_session cookie as Bearer.
 * Service key / X-Hauska-Key is never identified. Cookie absent → service
 * key (anonymous ownerFact refusal is correct). Do not invent Clerk/Stripe.
 */
export function cortexInspectAuthorization(
  sessionBearer: string | null | undefined,
  serviceKey: string | undefined,
):
  | { authorization: string; usedSession: boolean }
  | { missing: "CORTEX_SERVICE_API_KEY" } {
  const session = sessionBearer?.trim();
  if (session) {
    return { authorization: `Bearer ${session}`, usedSession: true };
  }
  const key = serviceKey?.trim();
  if (!key) return { missing: "CORTEX_SERVICE_API_KEY" };
  return { authorization: `Bearer ${key}`, usedSession: false };
}

function cortexEnvelopeRollbackEnabled(): boolean {
  return process.env.ATOM_PATH_CORTEX_ENVELOPE_ROLLBACK?.trim() === "1";
}

async function fetchCortexFacets(
  parcelNodeId: string,
  sessionBearer?: string | null,
): Promise<{ status: number; body: string; contentType: string | null }> {
  const { baseUrl, key } = cortexConfig();
  const auth = cortexInspectAuthorization(sessionBearer, key);
  if ("missing" in auth) {
    return {
      status: 503,
      body: JSON.stringify({
        error: "proxy not configured",
        missing: auth.missing,
      }),
      contentType: "application/json",
    };
  }
  const url = `${baseUrl}/api/brokerage/v1/place/node/${encodeURIComponent(
    parcelNodeId,
  )}/facets`;
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: auth.authorization,
      Accept: "application/json",
    },
    // Throws TimeoutError on expiry — callers already treat a thrown cortex
    // fetch as a failed/unusable cortex read (honest degrade, never invented).
    signal: AbortSignal.timeout(upstreamFetchTimeoutMs()),
  });
  const text = await upstream.text();
  return {
    status: upstream.status,
    body: text,
    contentType: upstream.headers.get("content-type"),
  };
}

function cortexFloodFactMissing(body: string): boolean {
  try {
    return floodHazardFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexLandUseFactMissing(body: string): boolean {
  try {
    return landUseFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexSpecialDistrictFactMissing(body: string): boolean {
  try {
    return specialDistrictFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexPipelineFactMissing(body: string): boolean {
  try {
    return pipelineFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexWellFactMissing(body: string): boolean {
  try {
    return wellFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

function cortexBuildingFootprintFactMissing(body: string): boolean {
  try {
    return (
      buildingFootprintFactFromCortexRoot(JSON.parse(body) as unknown) ===
      undefined
    );
  } catch {
    return true;
  }
}

function cortexBoundaryEdgeFactMissing(body: string): boolean {
  try {
    return (
      boundaryEdgeFactFromCortexRoot(JSON.parse(body) as unknown) === undefined
    );
  } catch {
    return true;
  }
}

function cortexOwnerFactMissing(body: string): boolean {
  try {
    return ownerFactFromCortexRoot(JSON.parse(body) as unknown) === undefined;
  } catch {
    return true;
  }
}

/** Missing flood / land-use / special-district / pipeline / well / footprint / boundary / owner — same retry as each field alone. */
function cortexNeedsRootFactAlias(body: string): boolean {
  return (
    cortexFloodFactMissing(body) ||
    cortexLandUseFactMissing(body) ||
    cortexSpecialDistrictFactMissing(body) ||
    cortexPipelineFactMissing(body) ||
    cortexWellFactMissing(body) ||
    cortexBuildingFootprintFactMissing(body) ||
    cortexBoundaryEdgeFactMissing(body) ||
    cortexOwnerFactMissing(body)
  );
}

function aliasFillsRootFactGap(
  primary: { status: number; body: string },
  aliasedBody: string,
): boolean {
  if (primary.status === 404) {
    return (
      !cortexFloodFactMissing(aliasedBody) ||
      !cortexLandUseFactMissing(aliasedBody) ||
      !cortexSpecialDistrictFactMissing(aliasedBody) ||
      !cortexPipelineFactMissing(aliasedBody) ||
      !cortexWellFactMissing(aliasedBody) ||
      !cortexBuildingFootprintFactMissing(aliasedBody) ||
      !cortexBoundaryEdgeFactMissing(aliasedBody) ||
      !cortexOwnerFactMissing(aliasedBody)
    );
  }
  const floodGain =
    cortexFloodFactMissing(primary.body) && !cortexFloodFactMissing(aliasedBody);
  const landGain =
    cortexLandUseFactMissing(primary.body) && !cortexLandUseFactMissing(aliasedBody);
  const sdGain =
    cortexSpecialDistrictFactMissing(primary.body) &&
    !cortexSpecialDistrictFactMissing(aliasedBody);
  const pipelineGain =
    cortexPipelineFactMissing(primary.body) &&
    !cortexPipelineFactMissing(aliasedBody);
  const wellGain =
    cortexWellFactMissing(primary.body) && !cortexWellFactMissing(aliasedBody);
  const footprintGain =
    cortexBuildingFootprintFactMissing(primary.body) &&
    !cortexBuildingFootprintFactMissing(aliasedBody);
  const boundaryGain =
    cortexBoundaryEdgeFactMissing(primary.body) &&
    !cortexBoundaryEdgeFactMissing(aliasedBody);
  const ownerGain =
    cortexOwnerFactMissing(primary.body) && !cortexOwnerFactMissing(aliasedBody);
  return (
    floodGain ||
    landGain ||
    sdGain ||
    pipelineGain ||
    wellGain ||
    footprintGain ||
    boundaryGain ||
    ownerGain
  );
}

/**
 * Same grammar pair as atom-chain. If the requested key's cortex body has no
 * root floodHazardFact, landUseFact, specialDistrictFact, pipelineFact,
 * wellFact, buildingFootprintFact, boundaryEdgeFact, or ownerFact, try the
 * alias. Never reads tier2.flood. Never adopts cad-roll as landUseFact.
 * Never adopts bake / CAD / mud-pid as specialDistrictFact. Never adopts
 * bake / CAD / texas-rrc GIS as pipelineFact. Never adopts bake / CAD /
 * texas-rrc GIS / tx_rrc_well as wellFact. Never adopts bake / CAD / GIS /
 * tx_building_footprint as buildingFootprintFact. Never adopts bake / CAD /
 * GIS / txgio_parcel / parcel ring as boundaryEdgeFact. Never adopts bake /
 * CAD / cad-parcel-roll / GIS owner as ownerFact.
 */
export async function fetchCortexFacetsWithAlias(
  parcelNodeId: string,
  sessionBearer?: string | null,
): Promise<{ status: number; body: string; contentType: string | null }> {
  const primary = await fetchCortexFacets(parcelNodeId, sessionBearer);
  const retryable =
    (primary.status >= 200 &&
      primary.status < 300 &&
      cortexNeedsRootFactAlias(primary.body)) ||
    primary.status === 404;
  if (!retryable) return primary;
  const alias = parcelGrammarAlias(parcelNodeId);
  if (!alias) return primary;
  const aliased = await fetchCortexFacets(alias, sessionBearer);
  if (aliased.status < 200 || aliased.status >= 300) return primary;
  if (!aliasFillsRootFactGap(primary, aliased.body)) return primary;
  return aliased;
}

/** Transient upstream failures — NEVER surface these as honest-absence. */
const TRANSIENT_ATOM_CHAIN =
  /unreachable|ECONNRESET|ETIMEDOUT|fetch failed|HTTP 5\d\d|HTTP 429|aborted|network|invalid JSON/i;
const ATOM_CHAIN_ATTEMPTS = 2;
const ATOM_CHAIN_BACKOFF_MS = [400, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientAtomChainReason(reason: string): boolean {
  return TRANSIENT_ATOM_CHAIN.test(reason);
}

/** Auth/config mismatch — never fall back to cortex snapshot (would lie about envelope). */
export function isRetrievalAuthFailure(reason: string): boolean {
  return /^atom-chain HTTP 401$/i.test(reason.trim());
}

export async function fetchAtomChainOnce(
  parcelNodeId: string,
): Promise<{ ok: true; chain: PropertyAtomChain } | { ok: false; reason: string }> {
  const { baseUrl, key } = retrievalConfig();
  if (!key) {
    return { ok: false, reason: "missing HAUSKA_RETRIEVAL_API_KEY|RETRIEVAL_API_KEY" };
  }
  const url = `${baseUrl}/property-nodes/${encodeURIComponent(parcelNodeId)}/atom-chain`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(upstreamFetchTimeoutMs()),
    });
  } catch (err) {
    // A per-attempt timeout must classify as TRANSIENT so the retry loop
    // runs — "aborted" is in the transient matcher. Name the bound so the
    // reason is diagnosable, never a bare platform string.
    if (err instanceof Error && err.name === "TimeoutError") {
      return {
        ok: false,
        reason: `atom-chain aborted after ${upstreamFetchTimeoutMs()}ms upstream timeout`,
      };
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  if (!upstream.ok) {
    return { ok: false, reason: `atom-chain HTTP ${upstream.status}` };
  }
  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return { ok: false, reason: "atom-chain invalid JSON" };
  }
  const chain = body as PropertyAtomChain;
  if (!atomChainIsUsable(chain)) {
    // Definitive empty — not a cold-start. Caller may serve honest absence.
    return { ok: false, reason: "atom-chain empty" };
  }
  return { ok: true, chain };
}

/**
 * Retry-until-resolved for cold-start / transient retrieval failures.
 * Definitive outcomes (empty chain, missing key, 4xx other than 429) stop early.
 */
export async function fetchAtomChain(
  parcelNodeId: string,
): Promise<{ ok: true; chain: PropertyAtomChain } | { ok: false; reason: string }> {
  let last: { ok: false; reason: string } = { ok: false, reason: "atom-chain unset" };
  for (let i = 0; i < ATOM_CHAIN_ATTEMPTS; i++) {
    const result = await fetchAtomChainOnce(parcelNodeId);
    if (result.ok) return result;
    last = result;
    if (!isTransientAtomChainReason(result.reason)) return result;
    const wait = ATOM_CHAIN_BACKOFF_MS[i] ?? 3_000;
    await sleep(wait);
  }
  return last;
}

/**
 * Lookup alias: requested key first; if definitive-empty, try the other grammar.
 * Does not alias 401 or transients. Caller echoes REQUESTED parcelNodeId.
 */
export async function fetchAtomChainWithAlias(
  parcelNodeId: string,
): Promise<{ ok: true; chain: PropertyAtomChain } | { ok: false; reason: string }> {
  const primary = await fetchAtomChain(parcelNodeId);
  if (primary.ok) return primary;
  if (
    isTransientAtomChainReason(primary.reason) ||
    isRetrievalAuthFailure(primary.reason)
  ) {
    return primary;
  }
  const alias = parcelGrammarAlias(parcelNodeId);
  if (!alias) return primary;
  const aliased = await fetchAtomChain(alias);
  if (aliased.ok) return aliased;
  return primary;
}

/**
 * P152-PANEL (OPS-23 P-152 lane 2 of 2): `GET /property-nodes/:id/record` on
 * the SAME retrieval service, same Bearer key, as `fetchAtomChainOnce`
 * above — the one reader lane 1 built (hauska-engine PR #417/418/419).
 * Best-effort, single attempt: a failed fetch here means the BFF simply
 * does not apply the record-composed override for this response (the
 * existing atom-chain/cortex path already produced an honest answer), never
 * a crash and never a fabricated absence.
 */
export async function fetchParcelRecordOnce(
  parcelNodeId: string,
): Promise<{ ok: true; record: ParcelRecordResponse } | { ok: false; reason: string }> {
  const { baseUrl, key } = retrievalConfig();
  if (!key) {
    return { ok: false, reason: "missing HAUSKA_RETRIEVAL_API_KEY|RETRIEVAL_API_KEY" };
  }
  const url = `${baseUrl}/property-nodes/${encodeURIComponent(parcelNodeId)}/record`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(upstreamFetchTimeoutMs()),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, reason: `record aborted after ${upstreamFetchTimeoutMs()}ms upstream timeout` };
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (!upstream.ok) {
    return { ok: false, reason: `record HTTP ${upstream.status}` };
  }
  let body: unknown;
  try {
    body = await upstream.json();
  } catch {
    return { ok: false, reason: "record invalid JSON" };
  }
  return { ok: true, record: body as ParcelRecordResponse };
}

/**
 * P152-RAILS item 1: apply the zoning/setback override onto `zoning` and
 * `envelope.setbacks` ONLY — never `envelope.status`, `.geojson`,
 * `.buildableAreaSqFt`, `.buildableAreaPct`, or `.summary` (R-2, the figure
 * stays refused/atom-owned). A setback axis override is applied only when
 * `envelope.setbacks` already exists (the atom chain already decided this
 * parcel has a drawable envelope) — this lane does not re-derive the
 * decline/ok decision tree in `adaptAtomChainToBakedFacets`.
 *
 * P-167 wave 5 (OPS-23 R-4): `override.provenance` is included in the guard
 * and the returned shape so a record that serves `zoningProvenance` without
 * also serving `zoningDistrict`/`zoningJurisdictionKey` (the district coming
 * from the atom chain instead) still gets its citation applied, rather than
 * this function bailing out before ever looking at it.
 */
function applyZoningOverride(
  zoning: NonNullable<PeBakedFacetsResponse["facets"]>["zoning"],
  override: ZoningSetbackOverride,
): NonNullable<PeBakedFacetsResponse["facets"]>["zoning"] {
  if (
    override.district === undefined &&
    override.jurisdictionKey === undefined &&
    override.provenance === undefined
  ) {
    return zoning;
  }
  const baseDistrict = zoning?.district;
  const district = override.district ?? baseDistrict;
  if (!district) return zoning; // never invent a district out of nothing
  return {
    district,
    ...((override.jurisdictionKey ?? zoning?.jurisdictionKey)
      ? { jurisdictionKey: override.jurisdictionKey ?? zoning!.jurisdictionKey }
      : {}),
    ...((override.provenance ?? (zoning as { provenance?: string } | null | undefined)?.provenance)
      ? { provenance: override.provenance ?? (zoning as { provenance?: string }).provenance }
      : {}),
  };
}

function applyEnvelopeSetbackOverride(
  envelope: NonNullable<PeBakedFacetsResponse["facets"]>["envelope"],
  override: ZoningSetbackOverride,
): NonNullable<PeBakedFacetsResponse["facets"]>["envelope"] {
  if (!envelope || !envelope.setbacks) return envelope;
  const hasDistrictOverride = override.district !== undefined && override.district !== envelope.district;
  const axes = override.setbackAxisOverrides;
  if (!axes && !hasDistrictOverride) return envelope;
  const dateNote = override.setbackRulesEffectiveDate
    ? ` parcel_record setback rule effective ${override.setbackRulesEffectiveDate}.`
    : "";
  // P-303 (2026-09-17): a record-sourced envelope (`setbackSource:
  // "parcel-record"` — the adapter built its scalars from these same record
  // axes because the chain is in the no-district decline class) has no
  // atom-chain axis left for the note below to describe; saying "other axes
  // remain atom-chain-sourced" there would state the opposite of the truth,
  // and the merge beneath is a no-op on identical cells. The district,
  // citation and effective-date handling still apply.
  const overrideNote =
    axes && envelope.setbackSource !== "parcel-record"
      ? `Reader-composed axis override (parcel_record) applied to one or more setback axes; other axes remain atom-chain-sourced.${dateNote}`
      : "";
  // P-270 (OPS-24 X11). The `citationUrl` below is the only writer of
  // `facets.envelope.citationUrl` in this app, and until this lane it was
  // served with NO statement of its vintage whenever the source carried no
  // readable effective date — so the card printed a citation a reader had to
  // assume was current. `citationVintage` is the conflict row the operator's
  // most-current-wins ruling requires and the note is the one sentence a
  // reader sees; both are null/absent when the date IS readable (the agreeing
  // control) or when there is no citation at all, so an unchanged payload
  // stays byte-identical to what it was before this lane.
  const citationVintage = override.setbackRulesCitationDateRead
    ? setbackCitationVintageRow({
        date: override.setbackRulesCitationDateRead,
        citationUrl: override.setbackRulesCitationUrl,
        sourceLabel: override.setbackRulesSourceLabel,
      })
    : null;
  const baseDisclosure = overrideNote
    ? envelope.disclosure
      ? `${envelope.disclosure} ${overrideNote}`
      : overrideNote
    : (envelope.disclosure ?? null);
  const disclosure = disclosureWithCitationVintage(baseDisclosure, citationVintage);
  // P-270: writing a citation here also means owning that citation's vintage
  // declaration, so the envelope's own row must not survive the spread below
  // when this override REPLACES the citation it described — a stale "vintage
  // unknown" left on a newly dated citation would be a worse lie than no
  // declaration at all. When no citation is written here the envelope's row
  // still describes the envelope's own citation and is carried through.
  const servesCitation = !!override.setbackRulesCitationUrl;
  const inheritedCitationVintage = servesCitation ? undefined : envelope.citationVintage;
  const { citationVintage: _supersededCitationVintage, ...envelopeBase } = envelope;
  return {
    ...envelopeBase,
    ...(hasDistrictOverride ? { district: override.district } : {}),
    setbacks: axes
      ? {
          ...envelope.setbacks,
          ...(axes.front_ft !== undefined ? { front_ft: axes.front_ft } : {}),
          ...(axes.side_ft !== undefined ? { side_ft: axes.side_ft } : {}),
          ...(axes.rear_ft !== undefined ? { rear_ft: axes.rear_ft } : {}),
          ...(axes.side_corner_ft !== undefined ? { side_corner_ft: axes.side_corner_ft } : {}),
        }
      : envelope.setbacks,
    ...(override.setbackRulesCitationUrl ? { citationUrl: override.setbackRulesCitationUrl } : {}),
    ...(citationVintage ?? inheritedCitationVintage
      ? { citationVintage: citationVintage ?? inheritedCitationVintage }
      : {}),
    ...(disclosure !== undefined ? { disclosure } : {}),
  };
}

/**
 * Fetch `/record` and apply its composed patch on top of `payload` (record
 * wins over whatever the atom-chain/cortex path already produced for the
 * SAME field — every other field is untouched). Sets `readPath: "record"`
 * whenever the fetch succeeds, per the P152-PANEL dispatch and its
 * falsifier, regardless of whether any individual field changed value (the
 * reader was genuinely consulted for this response).
 *
 * P152-RAILS item 3: on a FAILED fetch, the outage is declared — every rail
 * this lane's happy-path composer owns is set to a typed refusal carrying
 * the reader's errorClass/HTTP status, and `readPath` becomes
 * "record-unavailable" — never a silent no-op that leaves whatever the
 * cortex merge already produced standing in as if it were current (R-6).
 */
/**
 * F21 (2026-09-13, overseer finding, live-confirmed by the dispatch
 * planner): `cityLimitsFact.queryPoint` — the point-in-polygon subject
 * point cortex stamps onto this fact, carried through from cortex's own
 * response by `withCityLimitsFact` (atom-chain-to-facets.ts) whenever the
 * cortex merge runs, ahead of this function — was disappearing from the
 * panel's response whenever the record path composed (or declared
 * unavailable for) cityLimits, because both branches replace the WHOLE
 * `cityLimitsFact` object with one `composeCityLimits`/
 * `composeRecordUnavailablePatch` built, and neither of those has any way
 * to construct `queryPoint` (it is not part of the retrieval reader's
 * cityLimits cell — confirmed by reading `composeCityLimits`, which reads
 * only `cell.value`/`cell.source`/`cell.vintage`/`cell.basis`). P-151 seeds
 * placement from this field, so losing it silently is exactly the class of
 * regression this lane's own falsifier is supposed to catch and did not,
 * because this lane's own pre/post facets diff (see this lane's close)
 * never compared `cityLimitsFact` field-by-field, only zoning/setbacks.
 * Fixed by carrying `queryPoint` through explicitly from whatever
 * `payload.cityLimitsFact` already held, in both branches below — never
 * invented when absent (an atom-chain-only response that never got a
 * cortex merge has no queryPoint to carry, and none is fabricated here).
 *
 * P-332 (2026-09-18): the SAME wholesale replacement was silently dropping
 * the ETJ determination, and it is fixed at its source rather than here —
 * `payload.cityLimitsFact` is now handed to the record composers as their
 * `priorCityLimits` argument, so one owner (`pe-etj-determination.ts`) decides
 * the served ETJ state in every branch. This helper still owns `queryPoint`
 * alone: it is not part of the retrieval reader's cityLimits cell and has no
 * determination to carry, so the two concerns stay separate rather than
 * growing a second copy of the ETJ rule here.
 */
function withPreservedQueryPoint(
  existing: PeBakedFacetsResponse["cityLimitsFact"],
  composed: PeBakedFacetsResponse["cityLimitsFact"],
): PeBakedFacetsResponse["cityLimitsFact"] {
  if (!composed) return composed;
  if (composed.queryPoint !== undefined) return composed; // composer already set one — never overridden
  if (!existing || existing.queryPoint === undefined) return composed; // nothing to carry through
  return { ...composed, queryPoint: existing.queryPoint };
}

export async function applyRecordPatch(
  payload: PeBakedFacetsResponse,
  parcelNodeId: string,
  /**
   * P-303 (2026-09-17): the same `/record` read the caller already made to
   * hand `recordZoningSetback` to `adaptAtomChainToBakedFacets` — reused here
   * so the panel never pays for two record reads per request (and so the two
   * layers cannot disagree about which record a response was composed from).
   * Omitted by direct callers/tests, which keeps the original fetch-inside
   * behavior byte-for-byte.
   */
  prefetched?: Awaited<ReturnType<typeof fetchParcelRecordOnce>>,
): Promise<PeBakedFacetsResponse> {
  const result = prefetched ?? (await fetchParcelRecordOnce(parcelNodeId));
  const facets = payload.facets;
  const baseFacts = facets.baseFacts ?? {};

  if (!result.ok) {
    const failure = classifyRecordFetchFailure(result.reason);
    // P-332: the pre-existing fact is handed in so an ETJ determination
    // already in hand survives an unrelated city-limits outage.
    const patch = composeRecordUnavailablePatch(failure, payload.cityLimitsFact);
    return {
      ...payload,
      readPath: "record-unavailable",
      cityLimitsFact: withPreservedQueryPoint(payload.cityLimitsFact, patch.cityLimitsFact),
      floodHazardFact: patch.floodHazardFact,
      specialDistrictFact: patch.specialDistrictFact,
      wellFact: patch.wellFact,
      schoolDistrictFact: patch.schoolDistrictFact,
      utilityServiceFact: patch.utilityServiceFact,
      overlayDistrictsFact: patch.overlayDistrictsFact,
      agValuationFact: patch.agValuationFact,
      maxImperviousCoverPctFact: patch.maxImperviousCoverPctFact,
      // acreage/livingAreaSqft/yearBuilt/zoning/envelope have no honest
      // refused shape this module can construct without inventing a
      // LayerAbsenceWire-shaped absence it has no data to back — left as
      // whatever the atom-chain/cortex path already produced. Named, not
      // silently claimed fixed — see this lane's close leave_behind.
    };
  }

  const { patch, railStates } = composeRecordPatch(result.record, payload.cityLimitsFact);
  const { override: zsOverride, railStates: zsRailStates } = composeZoningSetbackOverride(result.record);
  // P-216 (2026-09-15): a setback-axis override is a genuinely newer read
  // than whatever atom-chain `snapshotAt` this payload started with — never
  // let the response wear only the OLDER date once a fresher axis has been
  // folded in (the "hybrid payload wearing one date" defect). `bakedAt`
  // mirrors it for the same reason (the two are meant to describe the same
  // moment; see PeBakedFacetsResponse/PeBakedFacetPayload module docs).
  // Gated on an axis override actually having happened — otherwise this
  // payload is untouched and must not gain a `bakedAt` it never had.
  const snapshotAt = zsOverride.setbackAxisOverrideVintage
    ? latestParseableDate([payload.snapshotAt, zsOverride.setbackAxisOverrideVintage])
    : null;
  return {
    ...payload,
    readPath: "record",
    ...(snapshotAt ? { snapshotAt } : {}),
    recordRailStates: { ...railStates, ...zsRailStates },
    ...(patch.cityLimitsFact ? { cityLimitsFact: withPreservedQueryPoint(payload.cityLimitsFact, patch.cityLimitsFact) } : {}),
    ...(patch.floodHazardFact ? { floodHazardFact: patch.floodHazardFact } : {}),
    ...(patch.specialDistrictFact ? { specialDistrictFact: patch.specialDistrictFact } : {}),
    ...(patch.wellFact ? { wellFact: patch.wellFact } : {}),
    ...(patch.schoolDistrictFact ? { schoolDistrictFact: patch.schoolDistrictFact } : {}),
    ...(patch.utilityServiceFact ? { utilityServiceFact: patch.utilityServiceFact } : {}),
    ...(patch.overlayDistrictsFact ? { overlayDistrictsFact: patch.overlayDistrictsFact } : {}),
    ...(patch.agValuationFact ? { agValuationFact: patch.agValuationFact } : {}),
    ...(patch.maxImperviousCoverPctFact ? { maxImperviousCoverPctFact: patch.maxImperviousCoverPctFact } : {}),
    facets: {
      ...facets,
      ...(snapshotAt ? { bakedAt: snapshotAt } : {}),
      baseFacts: patch.baseFactsAcreage
        ? { ...baseFacts, acreage: patch.baseFactsAcreage }
        : baseFacts,
      livingAreaSqft: patch.livingAreaSqft ?? facets.livingAreaSqft,
      yearBuilt: patch.yearBuilt ?? facets.yearBuilt,
      yearBuiltSource: patch.yearBuiltSource ?? facets.yearBuiltSource,
      zoning: applyZoningOverride(facets.zoning, zsOverride),
      envelope: applyEnvelopeSetbackOverride(facets.envelope, zsOverride),
      facetCoverage: {
        ...facets.facetCoverage,
        acreage: patch.baseFactsAcreage ? true : facets.facetCoverage?.acreage,
      },
    },
  };
}

/**
 * P-341 (OPS-24, ruling 16). One reader for the two impervious-cover figures a
 * payload can carry, applied at the single point every served facets payload
 * passes through so the record path and the atom-chain-only path cannot
 * disagree about the same parcel.
 *
 * The two rails are distinct on purpose and are read as distinct: the setback
 * rule's own `envelope.maxImperviousPct` and the top-level
 * `maxImperviousCoverPctFact.percent`. Where both apply the STRICTER governs
 * as the served figure and BOTH are cited with their own source. Neither
 * figure is deleted, averaged, or replaced by the higher one.
 */
function applyImperviousGoverningFigure(
  payload: PeBakedFacetsResponse,
): PeBakedFacetsResponse {
  const envelope = payload.facets?.envelope;
  const fact = payload.maxImperviousCoverPctFact;
  const factPresent =
    fact?.state === "present" && typeof fact.percent === "number"
      ? fact.percent
      : null;
  const zoningPct =
    typeof envelope?.maxImperviousPct === "number"
      ? envelope.maxImperviousPct
      : null;

  const reconciliation = reconcileImperviousFigures({
    zoningMaxImperviousPct: zoningPct,
    zoningCitationUrl: envelope?.citationUrl ?? null,
    zoningSourceDate: envelope?.sourceDate ?? null,
    watershedPercent: factPresent,
    watershedType:
      typeof fact?.watershedType === "string" ? fact.watershedType : null,
    watershedCitationUrl:
      typeof fact?.crosswalkCitation === "string" ? fact.crosswalkCitation : null,
    watershedSourceVintage:
      typeof fact?.sourceVintage === "string" ? fact.sourceVintage : null,
  });

  // One figure applies (or none): nothing to reconcile, nothing is written,
  // and the payload stays byte-identical to what it was before this lane.
  if (!envelope || reconciliation.sources.length < 2) return payload;

  const disclosure = disclosureWithImperviousGoverning(
    envelope.disclosure,
    reconciliation,
  );
  return {
    ...payload,
    facets: {
      ...payload.facets,
      envelope: {
        ...envelope,
        ...(reconciliation.governing !== null
          ? { maxImperviousPct: reconciliation.governing }
          : {}),
        maxImperviousPctSources: reconciliation.sources,
        ...(disclosure !== undefined ? { disclosure } : {}),
      },
    },
  };
}

/** Strip cortex envelope / tier2.envelope so zombie multiply cannot be product truth. */
export function stripCortexEnvelopeProductTruth(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const root = body as Record<string, unknown>;
  const facets =
    root.facets && typeof root.facets === "object"
      ? {
          ...(root.facets as Record<string, unknown>),
          envelope: {
            status: "declined",
            declineReason: "atom_path_pending",
            approximate: true,
            provisional: true,
            disclosure:
              "Envelope product path is the property atom chain. Cortex multiply path retired (anti-zombie).",
          },
          facetCoverage: {
            ...((root.facets as Record<string, unknown>).facetCoverage as
              | Record<string, unknown>
              | undefined),
            envelope: false,
          },
        }
      : root.facets;
  const tier2 =
    root.tier2 && typeof root.tier2 === "object"
      ? { ...(root.tier2 as Record<string, unknown>), envelope: null }
      : root.tier2;
  return { ...root, facets, tier2, cortexEnvelopeRetired: true };
}

function honestAtomPendingResponse(parcelNodeId: string): PeBakedFacetsResponse {
  const fips = parcelNodeId.split(":")[0];
  const apn = parcelNodeId.split(":")[1];
  return {
    parcelNodeId,
    adapterKey: "property-atom-chain",
    source: "atom-chain",
    snapshotAt: null,
    readPath: "atom-chain",
    facets: {
      parcelNodeId,
      countyFips: fips && /^\d{5}$/.test(fips) ? fips : undefined,
      baseFacts: apn
        ? { apn, landUse: null, acreage: null, situsAddress: null }
        : undefined,
      zoning: null,
      envelope: {
        status: "declined",
        declineReason: "atom_path_pending",
        approximate: true,
        provisional: true,
        disclosure:
          "No property atom chain for this parcel yet — honest decline (not invented).",
      },
      facetCoverage: {
        baseFacts: !!apn,
        landUse: false,
        acreage: false,
        zoning: false,
        envelope: false,
      },
      provenance: {
        parcelSource: "property-atom-chain",
        parcelVintage: null,
        landUseSource: null,
        landUseGateBlocked: false,
      },
    },
  };
}

/**
 * Bastrop city has no static setback table (per-parcel record only). When the
 * atom-chain doesn't already carry a trustworthy live layer-23 rule
 * (hasLiveAtomChainSetbackRule false — e.g. ingest hasn't baked one yet, or
 * it's stale), fetch the live record here so
 * resolveCodifiedSetbacksForStamp can serve it instead of hard-declining.
 * Every other jurisdiction short-circuits before any network call.
 */
export async function bastropPerParcelSetbackIfNeeded(
  parcelNodeId: string,
  chain: PropertyAtomChain,
): Promise<CodifiedSetbackScalars | null> {
  const zf = chain.zoningFact ?? null;
  const zoningSourceAdapter =
    zf && typeof zf.sourceAdapter === "string" ? zf.sourceAdapter : null;
  const jurisdictionKey = jurisdictionKeyFromSourceAdapter(zoningSourceAdapter);
  const district = typeof zf?.district === "string" ? zf.district.trim() : "";
  if (!district || !jurisdictionRequiresPerParcelSetbackRecord(jurisdictionKey)) {
    return null;
  }
  if (hasLiveAtomChainSetbackRule(parcelNodeId, chain.setbackRule ?? null, zoningSourceAdapter)) {
    return null;
  }
  const propId = apnFromNodeId(parcelNodeId);
  if (!propId) return null;
  const result = await fetchBastropPerParcelSetback(propId, { districtCode: district });
  return result.kind === "ok" ? result.scalars : null;
}

export async function handlePropertyAtomsFacets(
  req: VercelRequest,
  res: VercelResponse,
  path: string[],
): Promise<void> {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.status(403).json({ error: "method not allowed" });
    return;
  }

  const parsed = parsePropertyAtomsPath(path);
  if (!parsed) {
    res.status(400).json({ error: "invalid path" });
    return;
  }
  const { parcelNodeId } = parsed;

  const cookieHeader =
    typeof req.headers?.cookie === "string" ? req.headers.cookie : undefined;
  const sessionBearer = readPeSessionCookie(cookieHeader);

  const atomEnabled = isPropertyAtomPathEnabled();

  if (!atomEnabled) {
    try {
      const cortex = await fetchCortexFacetsWithAlias(parcelNodeId, sessionBearer);
      res.setHeader("X-PE-Read-Path", "cortex" satisfies PeReadPathHeader);
      if (cortex.contentType) res.setHeader("Content-Type", cortex.contentType);
      else res.setHeader("Content-Type", "application/json");
      if (cortex.status >= 200 && cortex.status < 300 && !cortexEnvelopeRollbackEnabled()) {
        let parsedBody: unknown = cortex.body;
        try {
          parsedBody = JSON.parse(cortex.body);
        } catch {
          parsedBody = cortex.body;
        }
        const stripped = stripCortexEnvelopeProductTruth(parsedBody);
        res.status(cortex.status).json(
          parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
            ? echoRequestedParcelNodeId(
                stripped as Record<string, unknown>,
                parcelNodeId,
              )
            : stripped,
        );
        return;
      }
      res.status(cortex.status).send(cortex.body);
    } catch (err) {
      res.status(502).json({
        error: "upstream error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // Flag ON: atom-chain is the envelope product path. No cortex envelope fallback.
  //
  // The cortex baked-facets read is kicked off IN PARALLEL: on the atom path
  // its BASE FACTS (land-use / acreage / situs / county name) are merged onto
  // the atom-chain response (map UX cluster item 6 — the card previously said
  // "not verified here" for facts cortex serves for ~100% of Bastrop); on the
  // definitive-empty path it remains the stripped-envelope fallback body. One
  // upstream cortex fetch either way — the client still makes ONE request.
  const cortexPromise: Promise<{
    status: number;
    body: string;
    contentType: string | null;
  }> = fetchCortexFacetsWithAlias(parcelNodeId, sessionBearer).catch((err) => ({
    status: 0,
    body: err instanceof Error ? err.message : String(err),
    contentType: null,
  }));
  const atom = await fetchAtomChainWithAlias(parcelNodeId);
  if (atom.ok) {
    const perParcelSetback = await bastropPerParcelSetbackIfNeeded(
      parcelNodeId,
      atom.chain,
    );
    // P-303 (2026-09-17): ONE record read per request, made BEFORE the
    // adaptation so the adapter can classify a no-district-class chain
    // against the payload's own record-composed zoning stamp and setback
    // axes (the XD-2 Waco case: the chain declines `no-zoning-stamp` while
    // the record stamps `R-1B` + `waco-tx` and serves the table). The same
    // result is handed to `applyRecordPatch` below, so a served response is
    // composed from exactly one record read.
    //
    // Charged only when the chain can serve facets at all — the gate the
    // adapter itself applies first — so the adapt-failed path below (which
    // serves cortex base facts and no envelope) does not pay a record read it
    // cannot use, exactly as it did not before this change. Best-effort,
    // single attempt: a failed read leaves the chain's own answer standing
    // here and is declared as `record-unavailable` below.
    const recordResult = atomChainIsUsable(atom.chain)
      ? await fetchParcelRecordOnce(parcelNodeId)
      : undefined;
    const recordZoningSetback =
      recordResult?.ok === true
        ? composeZoningSetbackOverride(recordResult.record).override
        : null;
    const adapted = adaptAtomChainToBakedFacets(atom.chain, {
      perParcelSetback,
      recordZoningSetback,
    });
    if (adapted) {
      // Merge baked base facts (never zoning/envelope — those stay atom-owned).
      // A failed/unusable cortex read serves the atom response unmerged: base
      // facts then stay honestly absent, never fabricated.
      let payload: PeBakedFacetsResponse = adapted;
      const cortex = await cortexPromise;
      if (cortex.status >= 200 && cortex.status < 300) {
        let parsedBody: unknown = null;
        try {
          parsedBody = JSON.parse(cortex.body);
        } catch {
          parsedBody = null;
        }
        if (parsedBody && typeof parsedBody === "object") {
          payload = mergeBakedBaseFacts(adapted, parsedBody);
        }
      }
      payload = attachBuildablePctFromKnownLotArea(payload);
      payload = echoRequestedParcelNodeId(payload, parcelNodeId);
      // P152-PANEL/P152-RAILS: the one reader wins over atom-chain/cortex for
      // every rail it slates as `record` — applied last so it overrides
      // whatever the merge above already produced for the SAME field. A
      // FAILED /record fetch is now a DECLARED outage (readPath
      // "record-unavailable", typed refusals on the rails this lane owns —
      // P152-RAILS item 3), never a silent no-op (R-6).
      payload = await applyRecordPatch(payload, parcelNodeId, recordResult);
      // P-341 (OPS-24, ruling 16): the stricter of two applicable impervious
      // figures governs and both are cited. Applied LAST so it reads exactly
      // what is about to be served, whichever rail supplied each figure.
      payload = applyImperviousGoverningFigure(payload);
      const readHeader: PeReadPathHeader =
        payload.readPath === "record"
          ? "record"
          : payload.readPath === "record-unavailable"
            ? "record-unavailable"
            : adapted.readPath === "atom-chain-warm"
              ? "atom-chain-warm"
              : "atom-chain";
      res.setHeader("X-PE-Read-Path", readHeader);
      if (shouldSkipColdDerive(atom.chain)) {
        res.setHeader("X-PE-Cold-Derive", "skipped");
      }
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(payload);
      return;
    }
  }

  // BLOCKING: auth failure is a deploy/config defect — never serve cortex snapshot lies.
  if (!atom.ok && isRetrievalAuthFailure(atom.reason)) {
    res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
    res.setHeader("Content-Type", "application/json");
    res.status(503).json({
      error: "retrieval_auth_failed",
      retryable: false,
      message:
        "Property atom chain retrieval returned HTTP 401 — HAUSKA_RETRIEVAL_API_KEY must match retrieval-api RETRIEVAL_API_KEY.",
      atomPathReason: atom.reason,
      parcelNodeId,
    });
    return;
  }

  // BLOCKING: a transient retrieval failure must NOT become "not verified"
  // (honest-absence is a DATA state). Tell the client to keep loading / retry.
  if (!atom.ok && isTransientAtomChainReason(atom.reason)) {
    res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
    res.setHeader("Retry-After", "2");
    res.setHeader("Content-Type", "application/json");
    res.status(503).json({
      error: "upstream_transient",
      retryable: true,
      message: "Property atom chain temporarily unreachable — retrying.",
      atomPathReason: atom.reason,
      parcelNodeId,
    });
    return;
  }

  // Definitive empty / adapt-failed: merge cortex baseFacts only (never envelope).
  try {
    const cortex = await cortexPromise;
    if (cortex.status >= 200 && cortex.status < 300) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(cortex.body);
      } catch {
        parsedBody = null;
      }
      if (parsedBody && typeof parsedBody === "object") {
        const stripped = stripCortexEnvelopeProductTruth(parsedBody) as Record<
          string,
          unknown
        >;
        res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
        res.setHeader("Content-Type", "application/json");
        res.status(200).json({
          ...echoRequestedParcelNodeId(
            stripped,
            parcelNodeId,
          ),
          atomPathReason: atom.ok ? "adapt-failed" : atom.reason,
        });
        return;
      }
    }
  } catch {
    // fall through to honest atom-pending shell
  }

  res.setHeader("X-PE-Read-Path", "atom-pending" satisfies PeReadPathHeader);
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    ...honestAtomPendingResponse(parcelNodeId),
    atomPathReason: atom.ok ? "adapt-failed" : atom.reason,
  });
}
