/**
 * P-66 serve-layer entity-type classification registry loader.
 * Authority: doc_repo `_catalog/instrument_entity_type_classifications.json`
 * (synced copy at `../classifications.json`).
 */
import registryJson from "../classifications.json";

export type ProvenanceClass =
  | "Record"
  | "Observation"
  | "Derivation"
  | "Synthesis";

export type SubjectKind = "extensional" | "intensional";
export type ChainAnchoring = "contemporaneous" | "backfill";

export interface ClassificationRow {
  provenanceClass: ProvenanceClass | null;
  provenanceClassSplit?: Record<
    string,
    { provenanceClass: ProvenanceClass; basis?: string }
  >;
  subjectKind: SubjectKind;
  chainAnchoring: ChainAnchoring;
  serveLayer: string;
  classificationStatus: string;
}

export interface ServeClassification {
  entityType: string;
  provenanceClass: ProvenanceClass | null;
  subjectKind: SubjectKind;
  chainAnchoring: ChainAnchoring;
  serveLayer: string;
  basis?: string | null;
}

export type ServeClassificationFields = Omit<ServeClassification, "basis">;

type RegistryJson = {
  status: string;
  classifications: Record<string, ClassificationRow>;
};

const REGISTRY = registryJson as RegistryJson;

function assertActiveRegistry(): Record<string, ClassificationRow> {
  if (REGISTRY.status !== "active") {
    throw new Error(
      `instrument registry status must be active, got ${REGISTRY.status}`,
    );
  }
  const classifications = REGISTRY.classifications ?? {};
  const keys = Object.keys(classifications);
  if (keys.length !== 21) {
    throw new Error(`expected 21 entity types, got ${keys.length}`);
  }
  for (const [entityType, row] of Object.entries(classifications)) {
    if (row.classificationStatus !== "decided") {
      throw new Error(
        `${entityType} classificationStatus=${row.classificationStatus}`,
      );
    }
  }
  return classifications;
}

let cachedClassifications: Record<string, ClassificationRow> | null = null;

/** Load and validate the synced registry (21 active keys). */
export function getClassifications(): Record<string, ClassificationRow> {
  if (!cachedClassifications) {
    cachedClassifications = assertActiveRegistry();
  }
  return cachedClassifications;
}

export function getClassification(
  entityType: string,
  adapterKey?: string | null,
): ServeClassification | null {
  const row = getClassifications()[entityType];
  if (!row) return null;

  if (entityType === "road-node" && row.provenanceClassSplit) {
    const key =
      adapterKey === "osm-assumed" || adapterKey === "county-authoritative"
        ? adapterKey
        : "osm-assumed";
    const split = row.provenanceClassSplit[key];
    return {
      entityType,
      provenanceClass: split?.provenanceClass ?? null,
      subjectKind: row.subjectKind,
      chainAnchoring: row.chainAnchoring,
      serveLayer: row.serveLayer,
      basis: split?.basis ?? null,
    };
  }

  return {
    entityType,
    provenanceClass: row.provenanceClass,
    subjectKind: row.subjectKind,
    chainAnchoring: row.chainAnchoring,
    serveLayer: row.serveLayer,
  };
}

export function classificationFields(
  entityType: string,
  adapterKey?: string | null,
): ServeClassificationFields | null {
  const row = getClassification(entityType, adapterKey);
  if (!row) return null;
  return {
    entityType: row.entityType,
    provenanceClass: row.provenanceClass,
    subjectKind: row.subjectKind,
    chainAnchoring: row.chainAnchoring,
    serveLayer: row.serveLayer,
  };
}

/** Map cortex/PE fact `source` strings to entity types. */
export const FAMILY_SOURCE_TO_ENTITY_TYPE: Readonly<Record<string, string>> = {
  "land-use-fact": "land-use-fact",
  "owner-fact": "owner-fact",
  "flood-hazard-fact": "flood-hazard-fact",
  "rrc-pipeline-fact": "rrc-pipeline-fact",
  "well-fact": "well-fact",
  "building-footprint": "building-footprint",
  "property-boundary-edge": "property-boundary-edge",
  "special-district-fact": "special-district-fact",
  "structural-fact": "cad-parcel-roll",
};

export function classificationForFactSource(
  source: string,
  adapterKey?: string | null,
): ServeClassification | null {
  const entityType = FAMILY_SOURCE_TO_ENTITY_TYPE[source];
  if (!entityType) return null;
  return getClassification(entityType, adapterKey);
}

export function classificationFieldsForFactSource(
  source: string,
  adapterKey?: string | null,
): ServeClassificationFields | null {
  const row = classificationForFactSource(source, adapterKey);
  if (!row) return null;
  return {
    entityType: row.entityType,
    provenanceClass: row.provenanceClass,
    subjectKind: row.subjectKind,
    chainAnchoring: row.chainAnchoring,
    serveLayer: row.serveLayer,
  };
}

/** Attach registry metadata onto a fact or verdict wire object. */
export function withServeClassification<T extends Record<string, unknown>>(
  value: T,
  entityType: string,
  adapterKey?: string | null,
): T & Partial<ServeClassificationFields> {
  const fields = classificationFields(entityType, adapterKey);
  if (!fields) return value;
  return { ...value, ...fields };
}

export function withServeClassificationForSource<
  T extends Record<string, unknown>,
>(value: T, source: string, adapterKey?: string | null): T & Partial<ServeClassificationFields> {
  const fields = classificationFieldsForFactSource(source, adapterKey);
  if (!fields) return value;
  return { ...value, ...fields };
}

/** Registry-backed fields for layer absence builders. */
export function absenceClassificationForEntityType(
  entityType: string,
  adapterKey?: string | null,
): Pick<
  ServeClassificationFields,
  "provenanceClass" | "subjectKind" | "chainAnchoring" | "serveLayer"
> {
  const row = getClassification(entityType, adapterKey);
  if (!row) {
    throw new Error(`no classification for entity type ${entityType}`);
  }
  return {
    provenanceClass: row.provenanceClass,
    subjectKind: row.subjectKind,
    chainAnchoring: row.chainAnchoring,
    serveLayer: row.serveLayer,
  };
}

/** Enrich layer absence provenance from registry when entity type is known. */
export function enrichLayerAbsenceProvenance<
  T extends {
    provenanceClass?: string;
    subjectKind?: string;
    chainAnchoring?: string;
    serveLayer?: string;
    entityType?: string;
  },
>(wire: T, entityType: string, adapterKey?: string | null): T {
  const fields = classificationFields(entityType, adapterKey);
  if (!fields) return wire;
  return {
    ...wire,
    entityType: fields.entityType,
    provenanceClass: fields.provenanceClass ?? wire.provenanceClass,
    subjectKind: fields.subjectKind,
    chainAnchoring: fields.chainAnchoring,
    serveLayer: fields.serveLayer,
  };
}
