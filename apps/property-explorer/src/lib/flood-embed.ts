// apps/property-explorer/src/lib/flood-embed.ts
//
// G-129 — the SmartCity Dashboards mount detects itself from the URL alone,
// the same way every other deep-link concern in this app already does
// (App.tsx's cold-open skip, the share funnel token). No new routing layer
// and no prop threading through ExplorerMap/Workbench/ReportsTool: any
// component that needs to know reads this directly.

export const FLOOD_DRAINAGE_EMBED_PARAM = "flood-drainage";

/**
 * True when this load is the SmartCity Dashboards flood-drainage mount
 * (`?embed=flood-drainage&parcelNodeId=...`). ExplorerMap uses this to
 * auto-open straight to the Flood & Drainage report; FloodDrainageSection
 * uses it to tolerate a slow first run (requestFloodDrainageRefreshWithPoll
 * in floodDrainageClient.ts) instead of surfacing the 55s BFF abort as a
 * dead end.
 */
export function isFloodDrainageEmbedRequest(search: string): boolean {
  return new URLSearchParams(search).get("embed") === FLOOD_DRAINAGE_EMBED_PARAM;
}
