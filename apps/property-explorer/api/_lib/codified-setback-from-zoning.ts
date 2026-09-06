/**
 * Codified setback table lookup for PE atom-chain adapt (Travis / Central TX).
 *
 * Mirrors hauska-engine `resolveCodifiedSetbacksForStamp` without pulling in
 * engine-core or adapters — JSON tables are vendored under setback-tables/.
 * Extend SETBACK_TABLES when a new stamped jurisdiction ships a codified table.
 */

import austinTx from "./setback-tables/austin-tx.json" with { type: "json" };
import pflugervilleTx from "./setback-tables/pflugerville-tx.json" with { type: "json" };
import elginDevelopmentCode from "./setback-tables/elgin-development-code.json" with { type: "json" };
import sanAntonioTx from "./setback-tables/san-antonio-tx.json" with { type: "json" };

export type CodifiedSetbackScalars = {
  front_ft: number;
  side_ft: number;
  rear_ft: number;
  side_interior_ft?: number;
  side_corner_ft?: number;
};

type AdapterDistrict = {
  district_name: string;
  front_ft: number;
  rear_ft: number;
  side_ft: number;
  side_corner_ft: number;
};

type AdapterSetbackTable = {
  districts: AdapterDistrict[];
};

/** Bastrop city — scalars come from layer 23 only, not ordinance chart. */
const PER_PARCEL_RECORD_ONLY_SETBACK_KEYS = new Set([
  "bastrop-city-tx",
  "bastrop-tx",
  "bastrop-development-code",
  "bastrop-per-parcel-record",
]);

const SETBACK_TABLES: Readonly<Record<string, AdapterSetbackTable>> = {
  "austin-tx": austinTx as AdapterSetbackTable,
  "pflugerville-tx": pflugervilleTx as AdapterSetbackTable,
  "elgin-development-code": elginDevelopmentCode as AdapterSetbackTable,
  "san-antonio-tx": sanAntonioTx as AdapterSetbackTable,
};

function normalizeCityKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  return t.length > 0 ? t : null;
}

/** Exported so callers (e.g. the PE facets BFF) can decide whether to fetch a live per-parcel record before resolving. */
export function jurisdictionRequiresPerParcelSetbackRecord(
  jurisdictionKey: string | null | undefined,
): boolean {
  const key = normalizeCityKey(jurisdictionKey);
  return key != null && PER_PARCEL_RECORD_ONLY_SETBACK_KEYS.has(key);
}

function requiresPerParcelSetbackRecord(jurisdictionKey: string): boolean {
  return PER_PARCEL_RECORD_ONLY_SETBACK_KEYS.has(jurisdictionKey);
}

function leadingDistrictToken(districtName: string): string {
  return (districtName.trim().split(/\s+/)[0] ?? "").toUpperCase();
}

function findDistrictRow(
  table: AdapterSetbackTable,
  districtCode: string,
): AdapterDistrict | null {
  const wanted = districtCode.trim().toUpperCase();
  return (
    table.districts.find(
      (d) => leadingDistrictToken(d.district_name) === wanted,
    ) ?? null
  );
}

/**
 * Resolve codified table scalars for a stamped jurisdiction + district.
 * Returns null when no table, per-parcel-only jurisdiction (and no live
 * record supplied), or no row match.
 *
 * `perParcelRecord` mirrors hauska-engine's `getSetbackTableForZoning`
 * optional `bastropPerParcelRecord` param: a per-parcel-only jurisdiction
 * (e.g. bastrop-city-tx) has no static table row to serve, but a caller
 * that already fetched the live layer-23 record can pass its scalars here
 * to serve them instead of hard-declining.
 */
export function resolveCodifiedSetbacksForStamp(
  jurisdictionKey: string | null | undefined,
  district: string | null | undefined,
  perParcelRecord?: CodifiedSetbackScalars | null,
): CodifiedSetbackScalars | null {
  const cityKey = normalizeCityKey(jurisdictionKey);
  const districtCode =
    typeof district === "string" && district.trim() ? district.trim() : null;
  if (!cityKey || !districtCode) return null;
  if (requiresPerParcelSetbackRecord(cityKey)) return perParcelRecord ?? null;

  const table = SETBACK_TABLES[cityKey];
  if (!table) return null;

  const row = findDistrictRow(table, districtCode);
  if (!row) return null;

  if (
    typeof row.front_ft !== "number" ||
    typeof row.side_ft !== "number" ||
    typeof row.rear_ft !== "number"
  ) {
    return null;
  }

  return {
    front_ft: row.front_ft,
    side_ft: row.side_ft,
    rear_ft: row.rear_ft,
    ...(typeof row.side_corner_ft === "number"
      ? { side_corner_ft: row.side_corner_ft }
      : {}),
  };
}
