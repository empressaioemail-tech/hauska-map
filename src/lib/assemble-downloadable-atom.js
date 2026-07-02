/**
 * Assemble cc-agent-AC downloadable-atom shape from E2 atom rows + E7 trace payloads.
 * Browser-safe — does not import @hauska/atom-contract/export (Node crypto dep).
 */

import {
  createReadContract,
  createThreeAxisConfidence,
  createWidthedConfidence,
  createConsequenceAxis,
  SAMPLE_READ_CONTRACT,
} from "@hauska/atom-contract/read-contract";
import { isReadContract } from "@hauska/map-renderer";
import { verifyEventChainBrowser } from "./verify-event-chain-browser.js";

export const DOWNLOADABLE_ATOM_EXPORT_VERSION = "1.5.0";

function atomTier(atom) {
  if (atom.tier === "app" || atom.tier === "data") return atom.tier;
  const appTypes = new Set([
    "property-workspace",
    "brief-run",
    "workspace-attachment",
    "workspace-share-edge",
  ]);
  const entityType = atom.entityType || atom.family || atom.type || "";
  return appTypes.has(entityType) ? "app" : "data";
}

function pickIdentity(atom, trace) {
  const t = trace?.atom || trace;
  return {
    entityType: atom.entityType || atom.family || atom.type || t?.entityType || "unknown",
    entityId: atom.entityId || atom.atomDid || atom.atomId || atom.id || atom.did || "unknown",
    contentId:
      atom.contentId ||
      atom.contentHash ||
      atom.editionKey ||
      atom.atomDid ||
      atom.atomId ||
      atom.id ||
      "unknown",
    vdaRef: atom.vdaRef || t?.vdaRef || undefined,
  };
}

function pickAccessPolicy(atom) {
  return atom.accessPolicy || atom.policy || "public-free";
}

function pickContextSummary(atom, trace) {
  if (trace?.contextSummary) return trace.contextSummary;
  if (atom.contextSummary) return atom.contextSummary;
  return {
    headline: atom.title || atom.label || `${pickIdentity(atom).entityType} atom`,
    prose: atom.summary || atom.description || "",
    typedFields: atom.typed || atom.typedFields || {},
    keyMetrics: atom.keyMetrics || [],
    relatedAtoms: atom.relatedAtoms || [],
    provenanceTier: atom.provenanceTier || atom.provenance?.tier || "asserted",
  };
}

function pickReadContract(atom) {
  if (isReadContract(atom.readContract)) return atom.readContract;
  const cal = atom.readContract?.axes?.calibratedConfidence || atom.confidence;
  if (cal?.intervalWidth != null && cal?.estimate != null) {
    return createReadContract({
      axes: createThreeAxisConfidence({
        calibratedConfidence: createWidthedConfidence({
          estimate: cal.estimate,
          n: cal.n ?? 0,
          intervalWidth: cal.intervalWidth,
          provenance: cal.provenance || "asserted",
        }),
        assertedConfidence: createWidthedConfidence({
          estimate: cal.estimate,
          n: cal.n ?? 0,
          intervalWidth: Math.min(1, (cal.intervalWidth ?? 0.25) + 0.1),
          provenance: "asserted",
        }),
        consequence: createConsequenceAxis({
          derivation: {
            source: "asce7-risk-category",
            asce7RiskCategory: atom.riskCategory || atom.consequence?.derivation?.asce7RiskCategory || "II",
          },
          stratum: atom.consequence?.stratum || "routine",
          assertedAt: new Date().toISOString(),
        }),
      }),
      assembledAt: new Date().toISOString(),
    });
  }
  return SAMPLE_READ_CONTRACT;
}

function edgeToRef(edge) {
  return {
    kind: "atom",
    entityType: edge.entityType || edge.atom?.entityType || "unknown",
    entityId:
      edge.entityId ||
      edge.atomDid ||
      edge.targetAtomDid ||
      edge.crossReferenceDid ||
      edge.atom?.entityId ||
      edge.atom?.atomDid ||
      "unknown",
    displayLabel: edge.label || edge.title || edge.atom?.title,
  };
}

function pickCompositionReferences(atom, trace) {
  if (atom.compositionReferences?.length) return atom.compositionReferences;
  const edges = [
    ...(trace?.outbound || []),
    ...(trace?.inbound || []),
    ...(atom.outbound || []),
    ...(atom.inbound || []),
    ...(atom.composes || []),
  ];
  return edges.map(edgeToRef);
}

function pickCitations(atom, trace) {
  if (atom.citations?.length && atom.citations[0]?.citationDid) return atom.citations;
  const raw = trace?.citations || atom.citations || [];
  return raw.map((c) => ({
    citationDid: c.citationDid || c.did || c.atomDid || c.id || String(c),
    label: c.label || c.title,
    sourceCitation: c.sourceCitation || c.citation,
    citedAtom: c.citedAtom ? edgeToRef(c.citedAtom) : c.atom ? edgeToRef(c) : undefined,
  }));
}

function pickSignedEventChain(atom, trace) {
  const events =
    trace?.signedHistory?.events ||
    trace?.signedEventChain ||
    trace?.events ||
    atom.signedEventChain ||
    atom.signedHistory?.events ||
    atom.history?.events ||
    [];
  return Array.isArray(events) ? events : [];
}

export function isDownloadableAtomWire(value) {
  if (!value || typeof value !== "object") return false;
  return (
    value.exportVersion === DOWNLOADABLE_ATOM_EXPORT_VERSION &&
    value.identity &&
    value.readContract &&
    typeof value.exportedAt === "string"
  );
}

/**
 * @param {object} atom — E2 atom row
 * @param {object} [trace] — E7 trace payload (optional)
 * @returns {Promise<{ ok: boolean, export?: object, errors?: object[], source: string }>}
 */
export async function assembleDownloadableAtom(atom, trace = null) {
  if (!atom) {
    return { ok: false, errors: [{ path: "atom", message: "No atom" }], source: "local" };
  }

  if (isDownloadableAtomWire(atom)) {
    return { ok: true, export: atom, source: "wire" };
  }

  const tier = atomTier(atom);
  const signedEventChain = tier === "data" ? pickSignedEventChain(atom, trace) : [];
  const verifyChain =
    trace?.verifyChain ||
    atom.verifyChain ||
    (signedEventChain.length ? await verifyEventChainBrowser(signedEventChain) : { ok: true, eventCount: 0, checkedEvents: 0, errors: [] });

  const exp = {
    exportVersion: DOWNLOADABLE_ATOM_EXPORT_VERSION,
    identity: pickIdentity(atom, trace),
    accessPolicy: pickAccessPolicy(atom),
    contextSummary: pickContextSummary(atom, trace),
    readContract: pickReadContract(atom),
    compositionReferences: pickCompositionReferences(atom, trace),
    citations: pickCitations(atom, trace),
    signedEventChain,
    verifyChain,
    exportedAt: new Date().toISOString(),
  };

  if (!isReadContract(exp.readContract)) {
    return { ok: false, errors: [{ path: "readContract", message: "Invalid read-contract" }], source: "local" };
  }

  return { ok: true, export: exp, source: "assembled" };
}
