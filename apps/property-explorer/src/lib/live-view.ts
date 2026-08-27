// Live-view href for a parcel. Used on share landings, PDF viewer chrome,
// and the field PE forwards onto Flood / X-ray export requests (W2.4).
// Fail closed: no parcel id → no href. Never invent a parcel.

import { isValidParcelNodeId } from "./parcel-node-id";

export function liveViewHref(opts: {
  parcelNodeId: string | null | undefined;
  grantId?: string | null;
  origin?: string | null;
}): string | null {
  const parcelNodeId = opts.parcelNodeId?.trim() ?? "";
  if (!isValidParcelNodeId(parcelNodeId)) return null;
  const origin = (opts.origin ?? "").replace(/\/$/, "");
  const grantId = opts.grantId?.trim() ?? "";
  if (grantId) {
    const path = `/s/${grantId}`;
    return origin ? `${origin}${path}` : path;
  }
  const path = `/?parcelNodeId=${encodeURIComponent(parcelNodeId)}`;
  return origin ? `${origin}${path}` : path;
}
