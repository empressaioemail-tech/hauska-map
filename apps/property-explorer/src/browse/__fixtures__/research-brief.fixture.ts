// Realistic R1 research-brief payload fixtures, mirrored from the server
// contract (cortex api-server routes/propertyExplorer.ts buildR1Brief) and the
// baked facet shapes (Tier1FacetPayload zoning/envelope, Tier2FloodFacet,
// baseFacts.landUse). Values follow the Bastrop wired-city shapes.

import type { ResearchBriefPayload } from "../brief-view-model";

/** Fully-zoned Bastrop-style parcel: all four sections populated. */
export const ZONED_BRIEF: ResearchBriefPayload = {
  runId: "pe-r1-dGVzdA.MjAyNg",
  reportFamily: "R1",
  mode: "baked-facet-intel-v1",
  parcelNodeId: "tx-bastrop-parcel-000123",
  brief: {
    sections: [
      {
        id: "zoning",
        title: "Zoning",
        data: {
          district: "P-2",
          jurisdictionKey: "bastrop-city-tx",
          provenance: {
            sourceUrl:
              "https://services.arcgis.com/abc/arcgis/rest/services/Zoning_Districts/FeatureServer/0",
            codeField: "ZONE_CODE",
            cityKey: "bastrop-city-tx",
            layerName: "Zoning_Districts",
            stampedAt: "2026-07-10T00:00:00.000Z",
          },
        },
        citations: [
          "https://services.arcgis.com/abc/arcgis/rest/services/Zoning_Districts/FeatureServer/0",
        ],
      },
      {
        id: "setbacks-envelope",
        title: "Setbacks and buildable envelope",
        data: {
          status: "ok",
          provisional: false,
          approximate: true,
          confidence: null,
          district: "P-2",
          setbacks: {
            front_ft: 10,
            side_ft: 0,
            rear_ft: 0,
            not_specified: { side: true, rear: true, sideCorner: true },
          },
          parcelAreaSqFt: 8712,
          buildableAreaSqFt: 6100,
          buildableAreaPct: 70,
          maxLotCoveragePct: 60,
          maxHeightFt: 35,
          maxFootprintSqFt: 5227,
          citationUrl:
            "https://library.municode.com/tx/bastrop/codes/code_of_ordinances",
          disclosure:
            "One or more scalar setbacks are not specified in the code (build-to-line governs).",
        },
        citations: [
          "https://library.municode.com/tx/bastrop/codes/code_of_ordinances",
        ],
      },
      {
        id: "flood",
        title: "Flood",
        data: {
          status: "in-sfha",
          floodZone: "AE",
          inSpecialFloodHazardArea: true,
          zoneSubtype: "FLOODWAY",
          baseFloodElevation: 341.2,
          provenance: {
            source: "fema-nfhl",
            adapterKey: "fema:nfhl-flood-zone",
            layer: "flood-hazard-zones",
            vintage: "2026-07-20T04:12:00.000Z",
          },
        },
        citations: [],
      },
      {
        id: "land-use",
        title: "Land use",
        data: {
          code: "A1",
          description: "Single family residence",
          source: "bastrop-cad",
          vintage: "2025-11-02",
        },
        citations: [],
      },
    ],
    disclosure: [
      "One or more scalar setbacks are not specified in the code (build-to-line governs).",
    ],
  },
  citations: [
    "https://services.arcgis.com/abc/arcgis/rest/services/Zoning_Districts/FeatureServer/0",
    "https://library.municode.com/tx/bastrop/codes/code_of_ordinances",
  ],
  bakedAt: "2026-07-21T09:00:00.000Z",
  source: "baked-snapshot",
};

/** Unzoned / no-stamp parcel: honest absences across the board. */
export const UNZONED_BRIEF: ResearchBriefPayload = {
  runId: "pe-r1-dW56b25lZA.dW5kYXRlZA",
  reportFamily: "R1",
  mode: "baked-facet-intel-v1",
  parcelNodeId: "tx-caldwell-parcel-000987",
  brief: {
    sections: [
      { id: "zoning", title: "Zoning", data: null, citations: [] },
      {
        id: "setbacks-envelope",
        title: "Setbacks and buildable envelope",
        data: {
          status: "declined",
          provisional: true,
          approximate: true,
          confidence: null,
          declineReason: "no-zoning-stamp",
          disclosure:
            "No zoning stamp on this parcel - honest absence; envelope via atom path when present.",
        },
        citations: [],
      },
      {
        id: "flood",
        title: "Flood",
        data: {
          status: "unavailable",
          floodZone: null,
          inSpecialFloodHazardArea: null,
          zoneSubtype: null,
          baseFloodElevation: null,
          provenance: {
            source: "fema-nfhl",
            adapterKey: "fema:nfhl-flood-zone",
            layer: "flood-hazard-zones",
            vintage: "2026-07-20T04:12:00.000Z",
            unavailableReason: "FEMA NFHL fetch failed",
          },
        },
        citations: [],
      },
      { id: "land-use", title: "Land use", data: null, citations: [] },
    ],
    disclosure: [
      "No zoning stamp on this parcel - honest absence; envelope via atom path when present.",
    ],
  },
  citations: [],
  bakedAt: null,
  source: "baked-snapshot",
};

/** Payload carrying a section id this client has never seen. */
export const UNKNOWN_SECTION_BRIEF: ResearchBriefPayload = {
  runId: "pe-r1-dW5rbm93bg.MjAyNg",
  reportFamily: "R1",
  mode: "baked-facet-intel-v1",
  parcelNodeId: "tx-bastrop-parcel-000555",
  brief: {
    sections: [
      {
        id: "wildfire-risk",
        title: "Wildfire risk",
        data: {
          score: 3,
          band: "moderate",
          inputs: { fuelModel: "GR2", slopeClass: "low" },
          tags: ["wui", "state-assessed"],
        },
        citations: ["https://example.gov/wildfire-layer"],
      },
      {
        id: "school-district",
        title: "School district",
        data: null,
        citations: [],
      },
    ],
    disclosure: [],
  },
  citations: ["https://example.gov/wildfire-layer"],
  bakedAt: "2026-07-21T09:00:00.000Z",
  source: "baked-snapshot",
};

/** Fixed "now" for deterministic freshness verdicts: 2026-07-28T00:00:00Z. */
export const FIXTURE_NOW_MS = Date.UTC(2026, 6, 28);
