// apps/property-explorer/src/coldopen/sample-parcels.ts
//
// The three real parcels the cold-open sample links resolve to (P-247). Each
// id was picked live against this app's own coverage (Travis, Bastrop, Hays)
// so the three read genuinely differently: the Austin lot is inside city
// limits with a zoned district and a resolved setback table; the Bastrop and
// Hays parcels are unincorporated, where the county does not zone at all —
// a real, differently-shaped absence, not a stand-in for the same case.
//
// Deliberately no address, APN, or coordinate is hardcoded here. Every value
// the sample report shows — address, APN, zoning, setbacks, flood, the map
// center — comes back live through factSheetResolver.resolve(parcelNodeId),
// the app's one read path (lib/fact-sheet-resolver.ts). A snapshot pasted in
// at build time would drift from the record the moment it changes upstream.

export type SampleParcelKey = "austin" | "bastrop" | "hays";

export interface SampleParcel {
  key: SampleParcelKey;
  /** The sample-link copy, verbatim from the design handoff. */
  linkLabel: string;
  parcelNodeId: string;
}

export const SAMPLE_PARCELS: readonly SampleParcel[] = [
  { key: "austin", linkLabel: "An Austin infill lot", parcelNodeId: "48453:939221" },
  { key: "bastrop", linkLabel: "A Bastrop tract", parcelNodeId: "48021:10101" },
  { key: "hays", linkLabel: "A Hays corridor lot", parcelNodeId: "48209:103421" },
] as const;

/** "See a real parcel report" opens this one — the CTA opens the example
 *  parcel, per the design brief; the three sample links preselect their own. */
export const DEFAULT_SAMPLE_PARCEL_KEY: SampleParcelKey = "austin";

export function sampleParcel(key: SampleParcelKey): SampleParcel {
  const found = SAMPLE_PARCELS.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown sample parcel key: ${key}`);
  return found;
}
