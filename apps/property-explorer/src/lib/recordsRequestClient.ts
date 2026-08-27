/**
 * Records request client — P-85 item 12.
 *
 * Backend: cortex auth-gated routes through the DEEP proxy:
 *   GET  /api/spine-deep/api/property-explorer/v1/records-request?parcelNodeId=
 *   POST /api/spine-deep/api/property-explorer/v1/records-request
 */

import { CORTEX_DEEP_PROXY_BASE } from "./auth";
import type {
  RecordsInstantGisHit,
  RecordsRunFetchResult,
  RecordsRunPhase,
  RecordsRunView,
  RecordsInstrumentRow,
  RecordsInstrumentType,
  RecordsTypeFilter,
  RecordsVerdictCard,
} from "../workbench/tools/records-request-types";

const RECORDS_PATH = "api/property-explorer/v1/records-request";

export const RECORDS_NOT_WIRED_NOTICE =
  "Records request API is not deployed yet — job routes are not live on this surface.";

export const RECORDS_NOT_REQUESTED_NOTICE =
  "No records request has been started for this parcel.";

type WireJob = {
  jobId?: string;
  jobStatus?: string;
  status?: string;
  createdAt?: string;
  completedAt?: string | null;
  liveInstantGis?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  scopeSearched?: Record<string, unknown> | null;
};

type WireIndexHit = {
  recordingRef?: string | null;
  documentType?: string | null;
  recordingDate?: string | null;
  parties?: string | null;
  detailUrl?: string | null;
};

type WireRecordingBlock = {
  instrumentNumber?: string | null;
  volume?: string | null;
  page?: string | null;
  recordingDate?: string | null;
};

type WireClassifiedInstrument = {
  id?: string;
  instrumentType?: string | null;
  documentKind?: string | null;
  recording?: WireRecordingBlock | null;
  recordingRef?: string | null;
  parties?: string | string[] | null;
  readDepth?: string | null;
  acquisitionMethod?: string | null;
};

type WireGisHit = {
  sourceLayerId?: string;
  sourceLayerName?: string;
  recordingRef?: string | null;
  easementType?: string | null;
  corridorWidthFt?: number | null;
  featureIds?: number[];
};

type WireGisAudit = {
  queriedAt?: string;
  hits?: WireGisHit[];
};

function gisHitTitle(hit: WireGisHit): string {
  const type = hit.easementType?.trim();
  const width =
    typeof hit.corridorWidthFt === "number" && hit.corridorWidthFt > 0
      ? hit.corridorWidthFt
      : null;
  if (type && width != null) {
    return `${type} easement, ${width} ft`;
  }
  if (type) {
    return `${type} easement`;
  }
  return "Easement";
}

function gisHitCitation(hit: WireGisHit, queriedAt?: string): string {
  const layer = hit.sourceLayerName?.trim() || "Public GIS";
  const ref = hit.recordingRef?.trim();
  const datePart = queriedAt ? formatSearchedAt(queriedAt) : null;
  const parts = [layer];
  if (ref) parts.push(`rec. ${ref}`);
  if (datePart) parts.push(datePart);
  return parts.join(" · ");
}

function gisHitMapNote(hit: WireGisHit): string {
  const width =
    typeof hit.corridorWidthFt === "number" && hit.corridorWidthFt > 0
      ? hit.corridorWidthFt
      : null;
  if (width != null) {
    return `${width} ft corridor · drawn on the map now.`;
  }
  return "Drawn on the map now.";
}

/** Map backend `liveInstantGis` audit to acknowledgement rows. */
export function instantGisHitsFromWire(
  liveInstantGis: unknown,
): RecordsInstantGisHit[] {
  if (!liveInstantGis || typeof liveInstantGis !== "object") return [];
  const audit = liveInstantGis as WireGisAudit;
  if (!Array.isArray(audit.hits)) return [];

  const hits: RecordsInstantGisHit[] = [];
  for (let i = 0; i < audit.hits.length; i++) {
    const raw = audit.hits[i];
    if (!raw || typeof raw !== "object") continue;
    const layerName =
      typeof raw.sourceLayerName === "string" ? raw.sourceLayerName.trim() : "";
    if (!layerName) continue;

    hits.push({
      id:
        typeof raw.sourceLayerId === "string" && raw.sourceLayerId.trim()
          ? raw.sourceLayerId.trim()
          : `gis-hit-${i}`,
      title: gisHitTitle(raw),
      citation: gisHitCitation(raw, audit.queriedAt),
      mapNote: gisHitMapNote(raw),
    });
  }
  return hits;
}

function instantGisHitsFromJob(job: WireJob | undefined): RecordsInstantGisHit[] {
  if (!job) return [];
  return instantGisHitsFromWire(job.liveInstantGis);
}

const FILTER_LABELS: Record<RecordsInstrumentType, string> = {
  deed: "Deeds",
  lien: "Liens",
  easement: "Easements",
  plat: "Plats",
  restriction: "Restrictions",
  notice: "Notices",
  other: "Other",
};

type WireListBody = {
  jobs?: WireJob[];
  engagementId?: string | null;
  error?: string;
  message?: string;
};

function deepUrl(query?: string): string {
  const base = `${CORTEX_DEEP_PROXY_BASE}/${RECORDS_PATH}`;
  return query ? `${base}?${query}` : base;
}

function phaseFromJobStatus(status: string | undefined): RecordsRunPhase {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "awaiting-purchase-approval":
      return "paused-fees";
    case "failed":
      return "failed";
    case "needs-human":
      return "paused-fees";
    case "complete":
      return "complete";
    default:
      return "not-requested";
  }
}

function formatSearchedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function instrumentCountFromScope(
  scope: Record<string, unknown> | null | undefined,
): number {
  const instruments = instrumentsFromScope(scope);
  if (instruments.length > 0) return instruments.length;
  if (!scope || typeof scope !== "object") return 0;
  const rc = scope.resultCount;
  return typeof rc === "number" && rc >= 0 ? rc : 0;
}

function classifiedInstrumentsArray(
  scope: Record<string, unknown>,
): unknown[] | null {
  const raw =
    scope.recordedInstruments ?? scope.recorded_instruments ?? scope.instruments;
  return Array.isArray(raw) ? raw : null;
}

function recordingRefFromClassified(raw: WireClassifiedInstrument): string | null {
  const flat = raw.recordingRef?.trim();
  if (flat) return flat;
  const rec = raw.recording;
  if (!rec || typeof rec !== "object") return null;
  const num = rec.instrumentNumber?.trim();
  if (num) return num;
  const vol = rec.volume?.trim();
  const page = rec.page?.trim();
  if (vol && page) return `${vol} P.${page}`;
  if (vol) return vol;
  return null;
}

function partiesLineFromWire(parties: string | string[] | null | undefined): string {
  if (Array.isArray(parties)) {
    const joined = parties.map((p) => p.trim()).filter(Boolean).join("; ");
    return joined || "Parties not extracted yet";
  }
  const line = parties?.trim();
  return line || "Parties not extracted yet";
}

function readDepthFromWire(
  readDepth: string | null | undefined,
  acquisitionMethod: string | null | undefined,
): RecordsInstrumentRow["readDepth"] {
  const d = readDepth?.trim().toLowerCase();
  if (d === "clauses-vision" || d === "plat-clauses") return d;
  if (d === "header-only") return "header-only";
  if (acquisitionMethod?.trim()) return "header-only";
  return "header-only";
}

function acquisitionNoteFromClassified(
  raw: WireClassifiedInstrument,
  readDepth: RecordsInstrumentRow["readDepth"],
): string | undefined {
  const method = raw.acquisitionMethod?.trim();
  if (method) return `Acquired via ${method.replace(/_/g, " ")}`;
  if (readDepth === "clauses-vision" || readDepth === "plat-clauses") {
    return "Clauses read by vision, not verified";
  }
  return "Header facts from county clerk index";
}

/** Classified ADR-020 rows when the classify path has landed on scope. */
export function instrumentsFromClassifiedScope(
  scope: Record<string, unknown> | null | undefined,
): RecordsInstrumentRow[] {
  if (!scope || typeof scope !== "object") return [];
  const rawList = classifiedInstrumentsArray(scope);
  if (!rawList) return [];

  const rows: RecordsInstrumentRow[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== "object") continue;
    const hit = raw as WireClassifiedInstrument;
    const ref = recordingRefFromClassified(hit);
    if (!ref) continue;

    const label =
      hit.documentKind?.trim() ||
      hit.instrumentType?.trim() ||
      "Recorded instrument";
    const readDepth = readDepthFromWire(hit.readDepth, hit.acquisitionMethod);
    rows.push({
      id:
        typeof hit.id === "string" && hit.id.trim()
          ? hit.id.trim()
          : `classified-${i}-${ref}`,
      type: documentTypeToInstrumentType(
        hit.instrumentType ?? hit.documentKind ?? label,
      ),
      label,
      instrumentNumber: ref,
      recordedAt: hit.recording?.recordingDate?.trim() || "—",
      partiesLine: partiesLineFromWire(hit.parties),
      readDepth,
      acquisitionNote: acquisitionNoteFromClassified(hit, readDepth),
    });
  }
  return rows;
}

export function instrumentsFromIndexHits(
  scope: Record<string, unknown> | null | undefined,
): RecordsInstrumentRow[] {
  if (!scope || typeof scope !== "object") return [];
  const rawHits = scope.indexHits;
  if (!Array.isArray(rawHits)) return [];

  const rows: RecordsInstrumentRow[] = [];
  for (let i = 0; i < rawHits.length; i++) {
    const raw = rawHits[i];
    if (!raw || typeof raw !== "object") continue;
    const hit = raw as WireIndexHit;
    if (!isPlausibleIndexHit(hit)) continue;

    const ref = hit.recordingRef!.trim();
    rows.push({
      id: `index-hit-${i}-${ref}`,
      type: documentTypeToInstrumentType(hit.documentType),
      label: hit.documentType?.trim() || "Clerk index hit",
      instrumentNumber: ref,
      recordedAt: hit.recordingDate?.trim() || "—",
      partiesLine: hit.parties?.trim() || "Parties not extracted yet",
      readDepth: "not-acquired",
      acquisitionNote: "Clerk index hit — image not acquired yet",
    });
  }
  return rows;
}

function isPlausibleIndexHit(hit: WireIndexHit): boolean {
  const ref = hit.recordingRef?.trim();
  return !!ref && /[\d-]{5,}/.test(ref) && /\d/.test(ref);
}

export function documentTypeToInstrumentType(
  documentType: string | null | undefined,
): RecordsInstrumentType {
  if (!documentType?.trim()) return "other";
  const u = documentType.toUpperCase();
  if (u.includes("DEED")) return "deed";
  if (u.includes("LIEN") || u.includes("MORTGAGE")) return "lien";
  if (u.includes("EASEMENT")) return "easement";
  if (u.includes("PLAT") || u.includes("MAP")) return "plat";
  if (u.includes("RESTRICT") || u.includes("COVENANT")) return "restriction";
  if (u.includes("NOTICE") || u.includes("LIS PEND")) return "notice";
  return "other";
}

/**
 * Resolve instrument rows from a job scope: prefer classified
 * `recordedInstruments` when present, else honest clerk `indexHits` labels.
 */
export function instrumentsFromScope(
  scope: Record<string, unknown> | null | undefined,
): RecordsInstrumentRow[] {
  const classified = instrumentsFromClassifiedScope(scope);
  if (classified.length > 0) return classified;
  return instrumentsFromIndexHits(scope);
}

export function filtersFromInstruments(
  instruments: RecordsInstrumentRow[],
): RecordsTypeFilter[] {
  const counts = new Map<RecordsInstrumentType, number>();
  for (const row of instruments) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  }
  const filters: RecordsTypeFilter[] = [
    { type: "all", label: "All", count: instruments.length },
  ];
  for (const type of [
    "deed",
    "easement",
    "lien",
    "plat",
    "restriction",
    "notice",
    "other",
  ] as const) {
    const count = counts.get(type) ?? 0;
    if (count > 0) {
      filters.push({ type, label: FILTER_LABELS[type], count });
    }
  }
  return filters;
}

function projectedCostFromScope(
  scope: Record<string, unknown> | null,
): number | null {
  if (!scope) return null;
  const direct = scope.projectedPurchaseCostCents;
  if (typeof direct === "number" && direct >= 0) return direct;
  const acquisition = scope.acquisition;
  if (acquisition && typeof acquisition === "object") {
    const cents = (acquisition as Record<string, unknown>).purchaseCostCents;
    if (typeof cents === "number" && cents >= 0) return cents;
  }
  return null;
}

function formatProjectedCost(cents: number | null | undefined): string | null {
  if (cents == null || cents < 0) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

export { formatProjectedCost };

export function verdictsFromScopeAndJob(args: {
  scope: Record<string, unknown> | null;
  jobStatus: string | undefined;
  errorCode?: string | null;
  errorMessage?: string | null;
  instrumentCount: number;
}): RecordsVerdictCard[] {
  const cards: RecordsVerdictCard[] = [];
  const scope = args.scope;
  const verdictRaw =
    typeof scope?.verdict === "string" ? scope.verdict.trim() : "";
  const absentVerified =
    scope?.absentVerified === true || verdictRaw === "verified-absent";
  const lookupFailed =
    args.jobStatus === "failed" ||
    verdictRaw === "lookup-failed" ||
    args.errorCode === "portal_automated_search_refused";

  if (lookupFailed) {
    cards.push({
      kind: "could-not-search",
      title: "Clerk index search could not be completed",
      body:
        args.errorMessage?.trim() ||
        "The county portal blocked automated search or the run failed before index hits were captured. This is a gap in the search, not a finding about the parcel.",
    });
    return cards;
  }

  if (
    absentVerified ||
    (args.jobStatus === "complete" &&
      args.instrumentCount === 0 &&
      scope?.finishReason !== "header-only")
  ) {
    const scopeNote =
      typeof scope?.scopeSummary === "string"
        ? scope.scopeSummary
        : "We searched the clerk index in the scope recorded on this run and found no instruments tied to this parcel.";
    cards.push({
      kind: "verified-absent",
      title: "No recorded instruments in the searched scope",
      body: scopeNote,
    });
  }

  if (
    args.jobStatus === "needs-human" &&
    args.errorCode !== "awaiting-purchase-approval"
  ) {
    cards.push({
      kind: "could-not-search",
      title: "Human clerk step required",
      body:
        args.errorMessage?.trim() ||
        "The county portal requires a person to finish this search. The run is paused with the instrument list on the run record.",
    });
  }

  return cards;
}

function runFromLatestJob(
  parcelNodeId: string,
  job: WireJob | undefined,
): RecordsRunView | null {
  if (!job) return null;
  const status = job.jobStatus ?? job.status;
  const scope =
    job.scopeSearched && typeof job.scopeSearched === "object"
      ? job.scopeSearched
      : null;
  const instrumentCount = instrumentCountFromScope(scope);
  const instruments = instrumentsFromScope(scope);
  const statusStr = typeof status === "string" ? status : undefined;
  const verdicts = verdictsFromScopeAndJob({
    scope,
    jobStatus: statusStr,
    errorCode: typeof job.errorCode === "string" ? job.errorCode : null,
    errorMessage:
      typeof job.errorMessage === "string" ? job.errorMessage : null,
    instrumentCount:
      instruments.length > 0 ? instruments.length : instrumentCount,
  });
  return {
    phase: phaseFromJobStatus(statusStr),
    parcelNodeId,
    searchedAt: formatSearchedAt(job.completedAt ?? job.createdAt),
    instrumentCount:
      instruments.length > 0 ? instruments.length : instrumentCount,
    filters: filtersFromInstruments(instruments),
    instruments,
    verdicts,
    live: true,
    jobId: typeof job.jobId === "string" ? job.jobId : null,
    errorCode:
      typeof job.errorCode === "string" ? job.errorCode : null,
    errorMessage:
      typeof job.errorMessage === "string" ? job.errorMessage : null,
    projectedPurchaseCostCents: projectedCostFromScope(scope),
    instantGisHits: instantGisHitsFromJob(job),
  };
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Fetch the latest run for a parcel. */
export async function fetchRecordsRun(
  parcelNodeId: string,
  _countyFips?: string,
): Promise<RecordsRunFetchResult> {
  const qs = new URLSearchParams({ parcelNodeId });
  try {
    const res = await fetch(deepUrl(qs.toString()), {
      credentials: "include",
    });
    if (res.status === 404) {
      return {
        wired: false,
        run: null,
        notice: RECORDS_NOT_WIRED_NOTICE,
      };
    }
    if (res.status === 401) {
      return {
        wired: true,
        run: null,
        notice: "Sign in to request county clerk records.",
      };
    }
    if (!res.ok) {
      const body = await parseJson(res);
      const message =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `Records request read failed (${res.status}).`;
      return { wired: true, run: null, notice: message };
    }
    const body = (await res.json()) as WireListBody;
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    const latest = jobs[0];
    const run = runFromLatestJob(parcelNodeId, latest);
    if (!run) {
      return {
        wired: true,
        run: null,
        notice: RECORDS_NOT_REQUESTED_NOTICE,
      };
    }
    return { wired: true, run, notice: null };
  } catch {
    return {
      wired: false,
      run: null,
      notice: RECORDS_NOT_WIRED_NOTICE,
    };
  }
}

/** Start a new clerk-index search. */
export async function requestRecordsRun(
  parcelNodeId: string,
  countyFips?: string,
): Promise<RecordsRunFetchResult> {
  try {
    const res = await fetch(deepUrl(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parcelNodeId,
        ...(countyFips ? { countyFips } : {}),
      }),
    });
    if (res.status === 404) {
      return {
        wired: false,
        run: null,
        notice: RECORDS_NOT_WIRED_NOTICE,
      };
    }
    if (res.status === 401) {
      return {
        wired: true,
        run: null,
        notice: "Sign in to request county clerk records.",
      };
    }
    const body = await parseJson(res);
    if (!res.ok) {
      const message =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `Records request failed (${res.status}).`;
      return { wired: true, run: null, notice: message };
    }
    const jobStatus =
      typeof body.jobStatus === "string"
        ? body.jobStatus
        : typeof body.status === "string"
          ? body.status === "in-progress"
            ? "running"
            : body.status === "accepted"
              ? "queued"
              : body.status
          : "queued";
    const run: RecordsRunView = {
      phase: phaseFromJobStatus(jobStatus),
      parcelNodeId,
      searchedAt: formatSearchedAt(new Date().toISOString()),
      instrumentCount: 0,
      filters: [],
      instruments: [],
      verdicts: [],
      live: true,
      jobId: typeof body.jobId === "string" ? body.jobId : null,
      instantGisHits: instantGisHitsFromWire(body.liveInstantGis),
    };
    return { wired: true, run, notice: null };
  } catch {
    return {
      wired: false,
      run: null,
      notice: RECORDS_NOT_WIRED_NOTICE,
    };
  }
}

function runFromPurchaseDecisionBody(
  parcelNodeId: string,
  body: Record<string, unknown>,
): RecordsRunView | null {
  const jobStatus =
    typeof body.jobStatus === "string"
      ? body.jobStatus
      : typeof body.status === "string"
        ? body.status
        : null;
  if (!jobStatus) return null;
  const scope =
    body.scopeSearched && typeof body.scopeSearched === "object"
      ? (body.scopeSearched as Record<string, unknown>)
      : null;
  const instruments = instrumentsFromScope(scope);
  return {
    phase: phaseFromJobStatus(jobStatus),
    parcelNodeId,
    searchedAt: formatSearchedAt(
      typeof body.completedAt === "string"
        ? body.completedAt
        : new Date().toISOString(),
    ),
    instrumentCount: instruments.length,
    filters: filtersFromInstruments(instruments),
    instruments,
    verdicts: [],
    live: true,
    jobId: typeof body.jobId === "string" ? body.jobId : null,
    errorCode:
      typeof body.errorCode === "string" ? body.errorCode : null,
    errorMessage:
      typeof body.errorMessage === "string" ? body.errorMessage : null,
    projectedPurchaseCostCents: projectedCostFromScope(scope),
  };
}

/** User approves projected county clerk image fees — resumes acquisition. */
export async function approveRecordsPurchase(
  jobId: string,
  parcelNodeId: string,
): Promise<RecordsRunFetchResult> {
  try {
    const res = await fetch(
      `${CORTEX_DEEP_PROXY_BASE}/${RECORDS_PATH}/${encodeURIComponent(jobId)}/approve-purchase`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (res.status === 401) {
      return {
        wired: true,
        run: null,
        notice: "Sign in to approve county clerk fees.",
      };
    }
    const body = await parseJson(res);
    if (!res.ok) {
      const message =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `Approve fees failed (${res.status}).`;
      return { wired: true, run: null, notice: message };
    }
    const run = runFromPurchaseDecisionBody(parcelNodeId, body);
    return { wired: true, run, notice: null };
  } catch {
    return {
      wired: false,
      run: null,
      notice: RECORDS_NOT_WIRED_NOTICE,
    };
  }
}

/** User declines county fees — completes run header-only. */
export async function declineRecordsPurchase(
  jobId: string,
  parcelNodeId: string,
): Promise<RecordsRunFetchResult> {
  try {
    const res = await fetch(
      `${CORTEX_DEEP_PROXY_BASE}/${RECORDS_PATH}/${encodeURIComponent(jobId)}/decline-purchase`,
      {
        method: "POST",
        credentials: "include",
      },
    );
    if (res.status === 401) {
      return {
        wired: true,
        run: null,
        notice: "Sign in to decline county clerk fees.",
      };
    }
    const body = await parseJson(res);
    if (!res.ok) {
      const message =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `Decline fees failed (${res.status}).`;
      return { wired: true, run: null, notice: message };
    }
    const run = runFromPurchaseDecisionBody(parcelNodeId, body);
    return { wired: true, run, notice: null };
  } catch {
    return {
      wired: false,
      run: null,
      notice: RECORDS_NOT_WIRED_NOTICE,
    };
  }
}
