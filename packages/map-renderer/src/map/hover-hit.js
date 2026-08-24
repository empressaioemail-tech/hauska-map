/**
 * Hover hit-test — same layer and promote id as click.
 *
 * Peel: hover used to paint live-mesh `hits[0]` (interactive overlay fill at
 * opacity 0 is still hit-testable). Click already queries PMTiles fill. Those
 * were two composers for "this lot." This module is the one remaining pick.
 */

import {
  DEFAULT_PROMOTE_ID,
  PARCEL_TILES_FILL_ID,
  parcelNodeIdFromFeature,
} from "./parcel-tiles.js";

/**
 * Layers hover may query. Same id click / queryParcelAt use.
 * @returns {string[]}
 */
export function hoverQueryLayerIds() {
  return [PARCEL_TILES_FILL_ID];
}

/**
 * Pick the hover feature from queryRenderedFeatures hits.
 *
 * Only a PMTiles fill hit with a resolved promote id wins. Live-mesh / overlay
 * fills are ignored even if they appear first in the hit list (the old
 * composer painted those).
 *
 * @param {object[] | null | undefined} hits
 * @param {string} [promoteId]
 * @returns {{ parcelNodeId: string, feature: object } | null}
 */
export function hoverHitFromRenderedFeatures(hits, promoteId = DEFAULT_PROMOTE_ID) {
  if (!Array.isArray(hits) || hits.length === 0) return null;
  for (const hit of hits) {
    if (!hit || hit.layer?.id !== PARCEL_TILES_FILL_ID) continue;
    const { parcelNodeId } = parcelNodeIdFromFeature(hit, promoteId);
    if (parcelNodeId == null) continue;
    return { parcelNodeId, feature: hit };
  }
  return null;
}
