// W5.2 — click a compare slot open in My properties.
//
// Compare stays a reading surface: the pair lives under COMPARE_GLOBAL_STATE_KEY
// and this helper must not clear it. Opening My properties collapses compare
// because the rail is a scalar openToolId.

import type { WorkbenchHostActions } from "../types";
import { requestOpenSavedProperty } from "./properties-pending-open";

export type CompareOpenOutcome =
  | { opened: true; parcelNodeId: string }
  | { opened: false; reason: "no-parcel" | "no-open-tool" };

/**
 * Open `parcelNodeId` in My properties and fly the map. Refuses when the
 * parcel id is empty or the host cannot switch tools — do not claim the
 * property opened if the dock cannot leave compare.
 */
export function openCompareSlotInMyProperties(
  parcelNodeId: string,
  host: Pick<WorkbenchHostActions, "openTool" | "openProperty">,
): CompareOpenOutcome {
  const id = parcelNodeId.trim();
  if (!id) return { opened: false, reason: "no-parcel" };
  if (!host.openTool) return { opened: false, reason: "no-open-tool" };
  requestOpenSavedProperty(id);
  host.openTool("properties");
  host.openProperty?.(id);
  return { opened: true, parcelNodeId: id };
}
