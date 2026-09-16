// apps/property-explorer/src/coldopen/report-rows.ts
//
// Pure mappers from a sealed ParcelFactSheet (the app's ONE read path, see
// lib/fact-sheet-resolver.ts) to the row view-models the state-2 sample
// report renders. No fetching, no React — every row here is either a real
// present value with its citation or an honest `absent` row. A field the
// sheet's own type does not model (e.g. floodway flag, mean grade) is left
// out entirely rather than rendered as a fabricated absence: the design
// brief's illustrative table is not a contract for what this read path
// carries, and inventing a row for a concept the record does not track
// would be worse than omitting it.

import type {
  BuildableEnvelope,
  Fact,
  FloodDetermination,
  ParcelFactSheet,
  Provenance,
  SetbackAxis,
} from "@empressaio/parcel-fact-sheet";

export interface RowCitation {
  text: string;
  href: string | null;
}

export interface FactRowView {
  label: string;
  state: "present" | "absent";
  value?: string;
  citation?: RowCitation | null;
  /** Shown under the row when present, e.g. "approximate, not survey grade." */
  note?: string | null;
}

/** The atom's own section-number label wins; falls back to the source label.
 *  citationsDegraded (no sourceUrl) renders as plain text, never a dead link. */
export function citationFor(provenance: Provenance): RowCitation {
  const label = provenance.atomDids[0]?.label ?? provenance.sourceLabel;
  return { text: label, href: provenance.sourceUrl };
}

function presentRow(
  label: string,
  value: string,
  provenance: Provenance,
  note?: string | null,
): FactRowView {
  return { label, state: "present", value, citation: citationFor(provenance), note: note ?? null };
}

function absentRow(label: string): FactRowView {
  return { label, state: "absent" };
}

function setbackAxisRow(label: string, axis: SetbackAxis): FactRowView {
  if (axis.distance === null) return absentRow(label);
  return presentRow(label, `${axis.distance.value} ${axis.distance.unit}`, axis.provenance);
}

/** X-ray tab: zoning district, each governed setback axis, buildable envelope. */
export function xrayRows(sheet: ParcelFactSheet): FactRowView[] {
  const rows: FactRowView[] = [];

  rows.push(
    sheet.zoning.state === "present"
      ? presentRow("Zoning district", sheet.zoning.value.code, sheet.zoning.provenance)
      : absentRow("Zoning district"),
  );

  if (sheet.setbacks.state === "present") {
    const s = sheet.setbacks.value;
    rows.push(setbackAxisRow("Front setback", s.front));
    rows.push(setbackAxisRow("Side setback", s.side));
    rows.push(setbackAxisRow("Rear setback", s.rear));
    if (s.cornerSide !== null) rows.push(setbackAxisRow("Corner side setback", s.cornerSide));
  } else {
    rows.push(absentRow("Setbacks"));
  }

  rows.push(envelopeRow(sheet.envelope));

  return rows;
}

function envelopeRow(envelope: BuildableEnvelope): FactRowView {
  if (envelope.kind !== "derived") return absentRow("Buildable envelope");
  const areaPct =
    envelope.areaPctOfLot !== null ? ` (${Math.round(envelope.areaPctOfLot * 100)}% of lot)` : "";
  return presentRow(
    "Buildable envelope",
    `${envelope.area.value.toLocaleString("en-US")} ${envelope.area.unit}${areaPct}`,
    envelope.provenance,
    envelope.approximate ? "approximate, not survey grade." : null,
  );
}

/** Flood & Drainage tab: the determination as a whole, then its sub-fields. */
export function floodRows(sheet: ParcelFactSheet): FactRowView[] {
  const flood: Fact<FloodDetermination> = sheet.flood;
  if (flood.state !== "present") return [absentRow("Flood zone")];

  const { value, provenance } = flood;
  const rows: FactRowView[] = [];

  rows.push(
    value.primaryZone
      ? presentRow("Flood zone", value.primaryZone, provenance)
      : absentRow("Flood zone"),
  );

  rows.push(
    value.baseFloodElevation
      ? presentRow(
          "Base flood elevation",
          `${value.baseFloodElevation.value} ${value.baseFloodElevation.unit}`,
          provenance,
        )
      : absentRow("Base flood elevation"),
  );

  rows.push(presentRow("Special flood hazard area (SFHA)", value.inSfha ? "Yes" : "No", provenance));

  const primary = value.zones.find((z) => z.zone === value.primaryZone) ?? value.zones[0] ?? null;
  // The row's label names the zone whenever the zone itself is known, present
  // or absent share alike — a row must not change what it claims to measure
  // depending on whether the measurement came back.
  const shareLabel = primary ? `Share of parcel in zone ${primary.zone}` : "Share of parcel in flood zone";
  rows.push(
    primary && primary.areaShare !== null
      ? presentRow(shareLabel, `${Math.round(primary.areaShare * 100)}%`, provenance)
      : absentRow(shareLabel),
  );

  return rows;
}

/** Terrain tab: elevation range and contour interval. This app's resolver
 *  does not derive site conditions today (`site` is always the honest-absent
 *  shape — see fact-sheet-resolver.ts), so every sample parcel renders these
 *  as reported absent until that read path exists. Not a per-parcel gap. */
export function terrainRows(sheet: ParcelFactSheet): FactRowView[] {
  const { site } = sheet;
  const rows: FactRowView[] = [];

  if (site.elevationRange) {
    const { min, max } = site.elevationRange;
    rows.push({ label: "High point", state: "present", value: `${max.value} ${max.unit}` });
    rows.push({ label: "Low point", state: "present", value: `${min.value} ${min.unit}` });
  } else {
    rows.push(absentRow("High point"));
    rows.push(absentRow("Low point"));
  }

  rows.push(
    site.contourInterval
      ? {
          label: "Contour interval",
          state: "present",
          value: `${site.contourInterval.value} ${site.contourInterval.unit}`,
        }
      : absentRow("Contour interval"),
  );

  return rows;
}
