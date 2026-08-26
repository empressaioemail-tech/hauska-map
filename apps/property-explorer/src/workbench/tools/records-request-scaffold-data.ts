// Static scaffold rows mirroring design reference parcel 801 PINE ST (artboard D1).
// Removed when fetchRecordsRun returns a live run.

import type {
  RecordsInstrumentRow,
  RecordsTypeFilter,
  RecordsVerdictCard,
} from "./records-request-types";

export const SCAFFOLD_FILTERS: RecordsTypeFilter[] = [
  { type: "all", label: "All 14", count: 14 },
  { type: "deed", label: "Deeds", count: 4 },
  { type: "lien", label: "Liens", count: 2 },
  { type: "easement", label: "Easements", count: 3 },
  { type: "plat", label: "Plats", count: 1 },
  { type: "restriction", label: "Restrictions", count: 2 },
  { type: "notice", label: "Notices", count: 1 },
  { type: "other", label: "Other", count: 1 },
];

export const SCAFFOLD_INSTRUMENTS: RecordsInstrumentRow[] = [
  {
    id: "2019012345",
    type: "easement",
    label: "Easement",
    instrumentNumber: "2019012345",
    recordedAt: "recorded Mar 14, 2019",
    partiesLine: "Alvarez, R & M → Bluebonnet Electric Cooperative Inc",
    readDepth: "clauses-vision",
    acquisitionNote: "Downloaded from the county portal",
    corridorPlaced: true,
  },
  {
    id: "2021009887",
    type: "deed",
    label: "Deed of trust",
    instrumentNumber: "2021009887",
    recordedAt: "recorded Jul 2, 2021",
    partiesLine: "Alvarez, R & M → Third Coast Bank SSB",
    readDepth: "header-only",
    acquisitionNote: "Purchased · $3.00",
  },
  {
    id: "plat-v812",
    type: "plat",
    label: "Plat",
    instrumentNumber: "V.812 P.339",
    recordedAt: "recorded Sep 8, 2004",
    partiesLine: "Pine Grove Addition, Section Two · Pine Grove Holdings LLC",
    readDepth: "plat-clauses",
    acquisitionNote: "Captured from the results page",
  },
];

export const SCAFFOLD_VERDICTS: RecordsVerdictCard[] = [
  {
    kind: "verified-absent",
    title: "No liens in the index for this parcel",
    body: "We searched the clerk index and it returned no lien instruments tied to this parcel. Scope and capture live on the search record when wired.",
  },
  {
    kind: "could-not-search",
    title: "Plats before 1979 could not be searched",
    body: "Bastrop County keeps plat books before 1979 on microfilm at the courthouse only. This is a gap in the search, not a finding.",
  },
];

/** Artboard B — instant GIS hits shown at request acknowledgement. */
export const SCAFFOLD_ACK_GIS_HITS = [
  {
    id: "easement-rear",
    title: "Utility easement, 10 ft, rear lot line",
    citation: "Bastrop County GIS · easements layer · 2026-06-01",
    mapNote: "Drawn on the map now.",
  },
  {
    id: "row-pine",
    title: "Drainage right of way along Pine St frontage",
    citation: "City of Bastrop open data · ROW · 2025-11-14",
    mapNote: "Drawn on the map now.",
  },
] as const;

/** Artboard B — numbered search scope lines. */
export const SCAFFOLD_SEARCH_SCOPE = {
  steps: [
    "Subdivision, lot and block — Pine Grove Add, Lot 7, Block C",
    "Legal description as printed on the appraisal roll",
    "Parties on the appraisal roll — Alvarez, R & M; Pine Grove Holdings LLC",
    "Cross-references found on any instrument the first three return",
  ],
  footer:
    "Index range 1953 to today. Deeds, deeds of trust and releases, liens, easements and rights of way, plats, covenants and restriction declarations, association notices, affidavits, lis pendens, notices of trustee's sale, powers of attorney, lease memoranda, mineral instruments.",
};

/** Artboard C — one sentence per run phase (scaffold defaults to running). */
export const SCAFFOLD_RUN_STATUS: Record<
  import("./records-request-types").RecordsRunPhase,
  {
    tone: "idle" | "active" | "person" | "warn";
    title: string;
    body: string;
    progress?: number;
    detail?: string;
  }
> = {
  "not-requested": {
    tone: "idle",
    title: "Not requested",
    body: "No clerk index search has been started for this parcel.",
  },
  queued: {
    tone: "idle",
    title: "Queued · position 3",
    body: "The run starts when the two Bastrop County runs ahead of it finish. Nothing has been searched yet.",
  },
  running: {
    tone: "active",
    title: "Reading instruments · 9 of 14",
    body: "The index returned 14 instruments. Nine have been read and their clauses extracted; the rest are queued for reading. Started 11:04, about 25 minutes left.",
    progress: 64,
  },
  "paused-fees": {
    tone: "warn",
    title: "Paused for your approval · $18.00",
    body: "Six instrument images are behind the county's per-page fee. $18.00 buys all six at $3.00 each, charged to your account. The run is otherwise finished; without them, six rows carry header facts and no image.",
    detail:
      "2019012345 Easement · 2021009887 Deed of trust · 2016004410 Restrictions · 2004-0071 Deed · 1998006512 Release · 2022001204 Lien",
  },
  failed: {
    tone: "warn",
    title: "Run failed · clerk portal unavailable",
    body: "The Bastrop County clerk portal did not respond after three attempts. Nothing was charged. Try again or contact support.",
  },
  complete: {
    tone: "idle",
    title: "Run complete · 14 instruments",
    body: "The clerk index search finished Aug 24, 2026. Results are listed below.",
  },
};
